import "server-only";

import { ExportRepositoryError, type CrmExportDeps, type ExportLeadRow } from "@/lib/crm-export/export-handler";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Leitura da exportação para o KAPA CRM (chave secreta, server-only). SOMENTE SELECT.
 * Colunas mínimas: CPF, nascimento, status, responsável e observações nunca são lidos.
 * Erros do Postgres viram ExportRepositoryError só com o código.
 */
const LEAD_COLUMNS =
  "id, store_id, campaign_id, created_at, full_name, phone, email, form_data, consent_version, consent_at, " +
  "utm_source, utm_medium, utm_campaign, utm_content, utm_term, page_url, referrer, " +
  "illustrative_amount_cents, illustrative_presented_at, illustrative_expires_at, cpf_cooldown_until, " +
  "campaigns!inner(slug, name, form_schema)";

type Row = {
  id: string;
  store_id: string;
  campaign_id: string;
  created_at: string;
  full_name: string;
  phone: string;
  email: string | null;
  form_data: unknown;
  consent_version: string;
  consent_at: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  page_url: string | null;
  referrer: string | null;
  illustrative_amount_cents: number | null;
  illustrative_presented_at: string | null;
  illustrative_expires_at: string | null;
  cpf_cooldown_until: string | null;
  campaigns: { slug: string; name: string; form_schema: unknown };
};

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

function toRow(row: Row): ExportLeadRow {
  return {
    id: row.id,
    storeId: row.store_id,
    campaignId: row.campaign_id,
    campaignSlug: row.campaigns.slug,
    campaignName: row.campaigns.name,
    formSchema: asObject(row.campaigns.form_schema),
    createdAt: row.created_at,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    formData: asObject(row.form_data),
    consentVersion: row.consent_version,
    consentAt: row.consent_at,
    utmSource: row.utm_source,
    utmMedium: row.utm_medium,
    utmCampaign: row.utm_campaign,
    utmContent: row.utm_content,
    utmTerm: row.utm_term,
    pageUrl: row.page_url,
    referrer: row.referrer,
    illustrativeAmountCents: row.illustrative_amount_cents,
    illustrativePresentedAt: row.illustrative_presented_at,
    illustrativeExpiresAt: row.illustrative_expires_at,
    cpfCooldownUntil: row.cpf_cooldown_until,
  };
}

/** Valor entre aspas para o filtro or() do PostgREST (timestamps têm ":" e "+"). */
const quoted = (value: string) => `"${value.replace(/["\\]/g, "")}"`;

export function createSupabaseCrmExportRepository(): Pick<CrmExportDeps, "listLeads" | "countLeads"> {
  return {
    async listLeads({ storeId, after, upTo, limit }) {
      const { data, error } = await getSupabaseAdmin()
        .from("leads")
        .select(LEAD_COLUMNS)
        .eq("store_id", storeId)
        // (created_at, id) > cursor, em ordem total.
        .or(`created_at.gt.${quoted(after.createdAt)},and(created_at.eq.${quoted(after.createdAt)},id.gt.${after.id})`)
        .lte("created_at", upTo)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(limit)
        .returns<Row[]>();
      if (error) throw new ExportRepositoryError("list_leads", error.code);
      return (data ?? []).map(toRow);
    },

    async countLeads({ storeId, from, to }) {
      const { count, error } = await getSupabaseAdmin()
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("store_id", storeId)
        .gt("created_at", from)
        .lte("created_at", to);
      if (error) throw new ExportRepositoryError("count_leads", error.code);
      return count ?? 0;
    },
  };
}
