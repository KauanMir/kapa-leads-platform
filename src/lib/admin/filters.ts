import type { LeadFilters } from "@/lib/admin/leads";
import { looksLikeCpf } from "@/lib/admin/search";
import { isPeriod, resolvePeriod, type Period } from "@/lib/format/period";
import { isLeadStatus, type LeadStatus } from "@/lib/format/status";

/**
 * Filtros da URL (/leads e /dashboard). Valores inválidos são ignorados.
 * Chaves: q, status, campanha, loja, periodo, de, ate, pagina.
 * CPF nunca é aceito na busca (e a tela impede que vá para a URL).
 */

export type SearchParams = Record<string, string | string[] | undefined>;

export type UrlFilters = {
  q: string;
  status: LeadStatus | null;
  campaignId: string | null;
  storeId: string | null;
  period: Period;
  from: string;
  to: string;
  page: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export function parseUrlFilters(params: SearchParams, defaultPeriod: Period): UrlFilters {
  const q = first(params.q).slice(0, 100);
  const status = first(params.status);
  const campaignId = first(params.campanha);
  const storeId = first(params.loja);
  const period = first(params.periodo);
  const from = first(params.de);
  const to = first(params.ate);
  const page = Number.parseInt(first(params.pagina), 10);

  return {
    q: looksLikeCpf(q) ? "" : q,
    status: isLeadStatus(status) ? status : null,
    campaignId: UUID.test(campaignId) ? campaignId : null,
    storeId: UUID.test(storeId) ? storeId : null,
    period: isPeriod(period) ? period : defaultPeriod,
    from: ISO_DATE.test(from) ? from : "",
    to: ISO_DATE.test(to) ? to : "",
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

export function toLeadFilters(filters: UrlFilters, now: Date): LeadFilters {
  return {
    q: filters.q || null,
    status: filters.status,
    campaignId: filters.campaignId,
    storeId: filters.storeId,
    range: resolvePeriod(filters.period, now, { from: filters.from, to: filters.to }),
  };
}

/** Query string só com valores preenchidos (URL limpa e compartilhável). */
export function filtersToQuery(filters: Partial<UrlFilters>, defaultPeriod: Period): string {
  const params = new URLSearchParams();
  if (filters.q && !looksLikeCpf(filters.q)) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.campaignId) params.set("campanha", filters.campaignId);
  if (filters.storeId) params.set("loja", filters.storeId);
  if (filters.period && filters.period !== defaultPeriod) params.set("periodo", filters.period);
  if (filters.period === "personalizado") {
    if (filters.from) params.set("de", filters.from);
    if (filters.to) params.set("ate", filters.to);
  }
  if (filters.page && filters.page > 1) params.set("pagina", String(filters.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}
