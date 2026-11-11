/**
 * Exportação SOMENTE LEITURA de leads para o KAPA CRM (servidor → servidor).
 *
 *   GET /api/integrations/crm/leads?storeId=&afterCreatedAt=&afterId=&limit=
 *   GET /api/integrations/crm/leads/count?storeId=&from=&to=
 *
 * O CRM busca (pull) os leads criados depois de um cursor (created_at, id). Nada muda no
 * caminho de gravação das Landing Pages: esta rota não escreve no banco, não tem efeito
 * colateral e pode ser desligada sem afetar a captação.
 *
 * Regras:
 *  - desligada por padrão (sem configuração → 404, como se não existisse);
 *  - assinatura HMAC obrigatória (signature.ts) e loja precisa estar liberada;
 *  - o cursor é OBRIGATÓRIO: não existe "exportar tudo" (sem sincronização retroativa
 *    acidental; o CRM grava o cursor no momento da ativação);
 *  - só devolve leads com created_at <= agora − SETTLE_SECONDS, para um INSERT ainda não
 *    confirmado não ser pulado pelo cursor;
 *  - dados mínimos: nunca CPF, nascimento, status interno, responsável ou observações.
 *  - logs só com contadores e códigos, nunca dados pessoais.
 */
import { UUID_PATTERN, type CrmExportConfig } from "@/lib/crm-export/config";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from "@/lib/crm-export/signature";
import type { RateLimiter } from "@/lib/leads/rate-limit";

export const EXPORT_PATH = "/api/integrations/crm/leads";
export const COUNT_PATH = "/api/integrations/crm/leads/count";
export const SETTLE_SECONDS = 60;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;
/** Janela máxima de uma contagem (reconciliação), em dias. */
export const MAX_COUNT_WINDOW_DAYS = 31;

/** Timestamp do Postgres/PostgREST (com fuso) ou ISO 8601 com Z. */
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

export type ExportCursor = { createdAt: string; id: string };

/** Linha lida do banco (colunas mínimas). */
export type ExportLeadRow = {
  id: string;
  storeId: string;
  campaignId: string;
  campaignSlug: string;
  campaignName: string;
  formSchema: Record<string, unknown>;
  createdAt: string;
  fullName: string;
  phone: string;
  email: string | null;
  formData: Record<string, unknown>;
  consentVersion: string;
  consentAt: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  pageUrl: string | null;
  referrer: string | null;
  illustrativeAmountCents: number | null;
  illustrativePresentedAt: string | null;
  illustrativeExpiresAt: string | null;
  cpfCooldownUntil: string | null;
};

export type FormLabel = { label: string; format: string | null };

export type ExportLead = {
  id: string;
  storeId: string;
  campaign: { id: string; slug: string; name: string };
  createdAt: string;
  contact: { name: string; phone: string; email: string | null };
  formData: Record<string, unknown>;
  formLabels: Record<string, FormLabel>;
  consent: { version: string; at: string };
  tracking: {
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    utmTerm: string | null;
    pageUrl: string | null;
    referrer: string | null;
  };
  illustrative: { amountCents: number; presentedAt: string; expiresAt: string } | null;
  cpfCooldownUntil: string | null;
};

export type CrmExportLogEntry = {
  requestId: string;
  operation: "list" | "count";
  status: number;
  outcome: string;
  count?: number;
  durationMs: number;
};

export class ExportRepositoryError extends Error {
  constructor(
    readonly operation: string,
    readonly code: string | undefined,
  ) {
    super(`crm export repository error: ${operation}`);
  }
}

export type CrmExportDeps = {
  config: CrmExportConfig;
  listLeads(input: { storeId: string; after: ExportCursor; upTo: string; limit: number }): Promise<ExportLeadRow[]>;
  countLeads(input: { storeId: string; from: string; to: string }): Promise<number>;
  rateLimiter: RateLimiter | null;
  now: () => Date;
  newRequestId: () => string;
  log: (entry: CrmExportLogEntry) => void;
};

function json(status: number, body: unknown, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    },
  });
}

export function isValidTimestamp(value: string | null): value is string {
  return value !== null && TIMESTAMP_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

/** Só os rótulos dos campos presentes no lead (form_schema da campanha). */
export function labelsFor(formSchema: Record<string, unknown>, formData: Record<string, unknown>): Record<string, FormLabel> {
  const labels: Record<string, FormLabel> = {};
  for (const key of Object.keys(formData)) {
    const entry = formSchema[key];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const { label, format } = entry as { label?: unknown; format?: unknown };
    if (typeof label !== "string" || !label.trim()) continue;
    labels[key] = { label: label.trim().slice(0, 100), format: typeof format === "string" ? format : null };
  }
  return labels;
}

export function toExportLead(row: ExportLeadRow): ExportLead {
  const formData = row.formData && typeof row.formData === "object" && !Array.isArray(row.formData) ? row.formData : {};
  return {
    id: row.id,
    storeId: row.storeId,
    campaign: { id: row.campaignId, slug: row.campaignSlug, name: row.campaignName },
    createdAt: row.createdAt,
    contact: { name: row.fullName, phone: row.phone, email: row.email },
    formData,
    formLabels: labelsFor(row.formSchema ?? {}, formData),
    consent: { version: row.consentVersion, at: row.consentAt },
    tracking: {
      utmSource: row.utmSource,
      utmMedium: row.utmMedium,
      utmCampaign: row.utmCampaign,
      utmContent: row.utmContent,
      utmTerm: row.utmTerm,
      pageUrl: row.pageUrl,
      referrer: row.referrer,
    },
    illustrative:
      row.illustrativeAmountCents !== null && row.illustrativePresentedAt !== null && row.illustrativeExpiresAt !== null
        ? { amountCents: row.illustrativeAmountCents, presentedAt: row.illustrativePresentedAt, expiresAt: row.illustrativeExpiresAt }
        : null,
    cpfCooldownUntil: row.cpfCooldownUntil,
  };
}

export function createCrmExportHandler(deps: CrmExportDeps) {
  type Gate = { ok: true; url: URL; storeId: string } | { ok: false; response: Response; outcome: string };

  function gate(request: Request, requestId: string, operation: "list" | "count"): Gate {
    const notFound = (outcome: string): Gate => ({
      ok: false,
      outcome,
      response: json(404, { success: false, error: "NOT_FOUND", requestId }, requestId),
    });
    if (!deps.config.enabled) return notFound("disabled");

    const url = new URL(request.url);
    const check = verifySignature({
      secrets: deps.config.secrets,
      timestampHeader: request.headers.get(TIMESTAMP_HEADER),
      signatureHeader: request.headers.get(SIGNATURE_HEADER),
      method: request.method,
      pathAndQuery: url.pathname + url.search,
      nowMs: deps.now().getTime(),
    });
    if (!check.ok) {
      return {
        ok: false,
        outcome: `unauthorized_${check.reason}`,
        response: json(401, { success: false, error: "UNAUTHORIZED", requestId }, requestId),
      };
    }

    // Limite da rota depois da assinatura: chamadas sem assinatura não consomem a cota do CRM.
    if (deps.rateLimiter && !deps.rateLimiter.hit(`crm-export:${operation}`, deps.now().getTime())) {
      return { ok: false, outcome: "rate_limited", response: json(429, { success: false, error: "TOO_MANY_REQUESTS", requestId }, requestId) };
    }

    const storeId = (url.searchParams.get("storeId") ?? "").toLowerCase();
    if (!UUID_PATTERN.test(storeId)) {
      return { ok: false, outcome: "invalid_store", response: json(400, { success: false, error: "INVALID_QUERY", requestId, fields: ["storeId"] }, requestId) };
    }
    // Loja não liberada: mesma resposta de loja inexistente.
    if (!deps.config.storeIds.has(storeId)) {
      return { ok: false, outcome: "store_not_allowed", response: json(403, { success: false, error: "STORE_NOT_ALLOWED", requestId }, requestId) };
    }
    return { ok: true, url, storeId };
  }

  async function list(request: Request): Promise<Response> {
    const startedAt = Date.now();
    const requestId = deps.newRequestId();
    const finish = (response: Response, outcome: string, count?: number) => {
      deps.log({ requestId, operation: "list", status: response.status, outcome, count, durationMs: Date.now() - startedAt });
      return response;
    };

    const checked = gate(request, requestId, "list");
    if (!checked.ok) return finish(checked.response, checked.outcome);
    const { url, storeId } = checked;

    const afterCreatedAt = url.searchParams.get("afterCreatedAt");
    const afterId = (url.searchParams.get("afterId") ?? "").toLowerCase();
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw === null ? DEFAULT_LIMIT : Number(limitRaw);
    const fields: string[] = [];
    if (!isValidTimestamp(afterCreatedAt)) fields.push("afterCreatedAt");
    if (!UUID_PATTERN.test(afterId)) fields.push("afterId");
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) fields.push("limit");
    if (fields.length > 0) {
      return finish(json(400, { success: false, error: "INVALID_QUERY", requestId, fields }, requestId), "invalid_query");
    }

    const now = deps.now();
    const upTo = new Date(now.getTime() - SETTLE_SECONDS * 1000).toISOString();

    let rows: ExportLeadRow[];
    try {
      // limit + 1 para saber se há mais páginas sem uma segunda consulta.
      rows = await deps.listLeads({ storeId, after: { createdAt: afterCreatedAt as string, id: afterId }, upTo, limit: limit + 1 });
    } catch {
      return finish(json(500, { success: false, error: "INTERNAL_ERROR", requestId }, requestId), "repository_error");
    }

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    // A loja de cada linha é conferida de novo (defesa em profundidade).
    if (page.some((row) => row.storeId.toLowerCase() !== storeId)) {
      return finish(json(500, { success: false, error: "INTERNAL_ERROR", requestId }, requestId), "store_mismatch");
    }
    const items = page.map(toExportLead);
    const last = page.at(-1);
    return finish(
      json(
        200,
        {
          success: true,
          items,
          nextCursor: last ? { createdAt: last.createdAt, id: last.id } : null,
          hasMore,
          upTo,
          serverTime: now.toISOString(),
        },
        requestId,
      ),
      "ok",
      items.length,
    );
  }

  async function count(request: Request): Promise<Response> {
    const startedAt = Date.now();
    const requestId = deps.newRequestId();
    const finish = (response: Response, outcome: string, total?: number) => {
      deps.log({ requestId, operation: "count", status: response.status, outcome, count: total, durationMs: Date.now() - startedAt });
      return response;
    };

    const checked = gate(request, requestId, "count");
    if (!checked.ok) return finish(checked.response, checked.outcome);
    const { url, storeId } = checked;

    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const fields: string[] = [];
    if (!isValidTimestamp(from)) fields.push("from");
    if (!isValidTimestamp(to)) fields.push("to");
    if (fields.length === 0) {
      const span = Date.parse(to as string) - Date.parse(from as string);
      if (span < 0 || span > MAX_COUNT_WINDOW_DAYS * 86_400_000) fields.push("to");
    }
    if (fields.length > 0) {
      return finish(json(400, { success: false, error: "INVALID_QUERY", requestId, fields }, requestId), "invalid_query");
    }

    try {
      const total = await deps.countLeads({ storeId, from: from as string, to: to as string });
      return finish(json(200, { success: true, count: total, from, to, serverTime: deps.now().toISOString() }, requestId), "ok", total);
    } catch {
      return finish(json(500, { success: false, error: "INTERNAL_ERROR", requestId }, requestId), "repository_error");
    }
  }

  return { list, count };
}
