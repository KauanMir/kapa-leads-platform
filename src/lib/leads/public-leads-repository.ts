import "server-only";

import {
  RepositoryError,
  normalizeOrigin,
  type CampaignRecord,
  type InsertLeadResult,
  type NewLead,
  type PublicLeadsDeps,
} from "@/lib/leads/public-leads-handler";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Repository = Pick<
  PublicLeadsDeps,
  "findCampaignByKey" | "isOriginAllowedForAnyCampaign" | "insertLead" | "findLeadIdBySubmission"
>;

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
        .select("id, store_id, consent_version, allowed_origins, is_active, stores!inner(is_active)")
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
        .select("id")
        .single();

      if (!error) return { status: "created", leadId: data.id };

      switch (error.code) {
        case "23505": // UNIQUE (campaign_id, client_submission_id)
          return { status: "duplicate" };
        case "KL001": // campanha inexistente
        case "KL002": // campanha ou loja inativa
          return { status: "campaign_unavailable" };
        case "KL003": // consent_version diferente
          return { status: "consent_mismatch" };
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

    async findLeadIdBySubmission(campaignId, clientSubmissionId) {
      const { data, error } = await getSupabaseAdmin()
        .from("leads")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("client_submission_id", clientSubmissionId)
        .maybeSingle();

      if (error) throw new RepositoryError("find_lead", error.code);
      return data?.id ?? null;
    },
  };
}
