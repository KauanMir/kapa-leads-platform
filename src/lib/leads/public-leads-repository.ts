import "server-only";

import {
  RepositoryError,
  normalizeOrigin,
  type CampaignRecord,
  type InsertLeadResult,
  type NewLead,
  type PublicLeadsDeps,
  type StoredLead,
} from "@/lib/leads/public-leads-handler";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Repository = Pick<
  PublicLeadsDeps,
  "findCampaignByKey" | "isOriginAllowedForAnyCampaign" | "insertLead" | "findLeadBySubmission"
>;

/** Colunas do lead devolvidas à LP: id e o valor ilustrativo definido pelo banco. */
const STORED_LEAD_COLUMNS = "id, illustrative_amount_cents, illustrative_presented_at, illustrative_expires_at";

type StoredLeadRow = {
  id: string;
  illustrative_amount_cents: number | null;
  illustrative_presented_at: string | null;
  illustrative_expires_at: string | null;
};

function toStoredLead(row: StoredLeadRow): StoredLead {
  const { illustrative_amount_cents: amountCents, illustrative_presented_at: presentedAt, illustrative_expires_at: expiresAt } = row;
  return {
    id: row.id,
    // A CHECK do banco garante as três juntas; datas normalizadas para ISO 8601 (UTC).
    illustrative:
      amountCents !== null && presentedAt !== null && expiresAt !== null
        ? { amountCents, presentedAt: new Date(presentedAt).toISOString(), expiresAt: new Date(expiresAt).toISOString() }
        : null,
  };
}

/**
 * Acesso ao banco da API pública (chave secreta, server-only).
 * Erros do Postgres são convertidos em resultados ou em RepositoryError
 * com apenas o código — a mensagem pode conter dados pessoais.
 */
export function createSupabasePublicLeadsRepository(): Repository {
  return {
    async findCampaignByKey(campaignKey): Promise<CampaignRecord | null> {
      const { data, error } = await getSupabaseAdmin()
        .from("campaigns")
        // String única (sem concatenação) para o supabase-js inferir os tipos.
        .select(
          "id, store_id, consent_version, allowed_origins, is_active, stores!inner(is_active), illustrative_min_cents, illustrative_max_cents, illustrative_step_cents, illustrative_validity_hours",
        )
        .eq("campaign_key", campaignKey)
        .maybeSingle();

      if (error) throw new RepositoryError("find_campaign", error.code);
      if (!data) return null;

      return {
        id: data.id,
        storeId: data.store_id,
        consentVersion: data.consent_version,
        allowedOrigins: data.allowed_origins,
        campaignActive: data.is_active,
        storeActive: data.stores.is_active,
        illustrative:
          data.illustrative_min_cents !== null &&
          data.illustrative_max_cents !== null &&
          data.illustrative_step_cents !== null &&
          data.illustrative_validity_hours !== null
            ? {
                minCents: data.illustrative_min_cents,
                maxCents: data.illustrative_max_cents,
                stepCents: data.illustrative_step_cents,
                validityHours: data.illustrative_validity_hours,
              }
            : null,
      };
    },

    async isOriginAllowedForAnyCampaign(origin) {
      const { data, error } = await getSupabaseAdmin()
        .from("campaigns")
        .select("allowed_origins, stores!inner(is_active)")
        .eq("is_active", true)
        .eq("stores.is_active", true);

      if (error) throw new RepositoryError("find_origins", error.code);
      return (data ?? []).some((row) => row.allowed_origins.some((entry) => normalizeOrigin(entry) === origin));
    },

    async insertLead({ campaignId, storeId, payload }: NewLead): Promise<InsertLeadResult> {
      const { lead, tracking } = payload;
      const { data, error } = await getSupabaseAdmin()
        .from("leads")
        .insert({
          campaign_id: campaignId,
          // O trigger do banco sobrescreve com a loja da campanha; aqui também
          // vem da campanha consultada, nunca do cliente.
          store_id: storeId,
          full_name: lead.name,
          cpf: lead.cpf,
          birth_date: lead.birthDate,
          phone: lead.phone,
          email: lead.email,
          form_data: payload.formData,
          consent_version: payload.consent.version,
          client_submission_id: payload.clientSubmissionId,
          utm_source: tracking.utmSource,
          utm_medium: tracking.utmMedium,
          utm_campaign: tracking.utmCampaign,
          utm_content: tracking.utmContent,
          utm_term: tracking.utmTerm,
          page_url: tracking.pageUrl,
          referrer: tracking.referrer,
        })
        .select(STORED_LEAD_COLUMNS)
        .single();

      if (!error) return { status: "created", lead: toStoredLead(data) };

      switch (error.code) {
        case "23505": // UNIQUE (campaign_id, client_submission_id)
          return { status: "duplicate" };
        case "KL001": // campanha inexistente
        case "KL002": // campanha ou loja inativa
          return { status: "campaign_unavailable" };
        case "KL003": // consent_version diferente
          return { status: "consent_mismatch" };
        case "KL005": // CPF com solicitação recente na mesma loja
          return { status: "cpf_cooldown" };
        case "23514": // CHECK
        case "22001": // valor longo demais
        case "22P02": // representação inválida
        case "22007": // data inválida
        case "22008": // data fora do intervalo
          return { status: "rejected" };
        default:
          throw new RepositoryError("insert_lead", error.code);
      }
    },

    async findLeadBySubmission(campaignId, clientSubmissionId) {
      const { data, error } = await getSupabaseAdmin()
        .from("leads")
        .select(STORED_LEAD_COLUMNS)
        .eq("campaign_id", campaignId)
        .eq("client_submission_id", clientSubmissionId)
        .maybeSingle();

      if (error) throw new RepositoryError("find_lead", error.code);
      return data ? toStoredLead(data) : null;
    },
  };
}
