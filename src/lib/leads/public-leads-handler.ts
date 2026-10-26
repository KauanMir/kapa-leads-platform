/**
 * POST/OPTIONS de /api/public/leads, independente de Next.js e do Supabase.
 * As dependências (banco, relógio, log, rate limit) são injetadas, o que
 * permite testar todo o fluxo sem rede.
 *
 * Ordem do POST:
 *   rate limit → Content-Type → tamanho → JSON → campaignKey → campanha
 *   → Origin → honeypot → validação completa → consent_version → INSERT
 *   (o INSERT aplica no banco o bloqueio de CPF por dias úteis e define o
 *   valor ilustrativo da simulação, quando a campanha tem essas regras)
 *
 * Nunca devolve nem registra em log: CPF, telefone, nascimento, formData,
 * store_id, stack trace ou mensagem do Postgres.
 */
import { buildPublicLeadSchema, campaignKeySchema, type PublicLeadPayload } from "@/lib/leads/public-lead-schema";
import { clientIpFromHeaders, type RateLimiter } from "@/lib/leads/rate-limit";

export const MAX_BODY_BYTES = 16 * 1024;
const PREFLIGHT_MAX_AGE_SECONDS = 600;
/** Cache de "origem autorizada em alguma campanha" (preflight e CORS de erros). */
export const ORIGIN_CACHE_TTL_MS = 60_000;
const ORIGIN_CACHE_MAX_ENTRIES = 500;

export type PublicLeadErrorCode =
  | "INVALID_PAYLOAD"
  | "ORIGIN_NOT_ALLOWED"
  | "CAMPAIGN_UNAVAILABLE"
  | "PAYLOAD_TOO_LARGE"
  | "CPF_COOLDOWN"
  | "TOO_MANY_REQUESTS"
  | "INTERNAL_ERROR";

/** Faixa do valor ilustrativo da campanha (null = campanha sem valor ilustrativo). */
export type IllustrativeConfig = {
  minCents: number;
  maxCents: number;
  stepCents: number;
  validityHours: number;
};

export type CampaignRecord = {
  id: string;
  storeId: string;
  consentVersion: string;
  allowedOrigins: string[];
  campaignActive: boolean;
  storeActive: boolean;
  illustrative: IllustrativeConfig | null;
};

/** Valor ilustrativo gravado no lead pelo banco (ISO 8601 nas datas). */
export type StoredIllustrativeValue = {
  amountCents: number;
  presentedAt: string;
  expiresAt: string;
};

export type StoredLead = {
  id: string;
  illustrative: StoredIllustrativeValue | null;
};

export type NewLead = {
  campaignId: string;
  storeId: string;
  payload: PublicLeadPayload;
};

export type InsertLeadResult =
  | { status: "created"; lead: StoredLead }
  | { status: "duplicate" }
  | { status: "campaign_unavailable" }
  | { status: "consent_mismatch" }
  /** CPF com solicitação recente na mesma loja (bloqueio por dias úteis). */
  | { status: "cpf_cooldown" }
  | { status: "rejected" };

export type PublicLeadsLogEntry = {
  requestId: string;
  method: "POST" | "OPTIONS";
  status: number;
  code: PublicLeadErrorCode | "CREATED" | "DUPLICATE" | "HONEYPOT" | "PREFLIGHT_OK";
  durationMs: number;
  campaignId?: string;
  /** Somente o código SQLSTATE/PostgREST, nunca a mensagem. */
  dbCode?: string;
};

export interface PublicLeadsDeps {
  findCampaignByKey(campaignKey: string): Promise<CampaignRecord | null>;
  isOriginAllowedForAnyCampaign(origin: string): Promise<boolean>;
  insertLead(lead: NewLead): Promise<InsertLeadResult>;
  findLeadBySubmission(campaignId: string, clientSubmissionId: string): Promise<StoredLead | null>;
  /** Origens extras aceitas fora de produção (ver PUBLIC_LEADS_DEV_ORIGINS). */
  devOrigins: readonly string[];
  rateLimiter: RateLimiter | null;
  now(): Date;
  newRequestId(): string;
  newFakeLeadId(): string;
  log(entry: PublicLeadsLogEntry): void;
}

/** Erro de infraestrutura que carrega apenas um código (sem mensagem do banco). */
export class RepositoryError extends Error {
  constructor(
    readonly operation: string,
    readonly dbCode: string | undefined,
  ) {
    super(`repository operation failed: ${operation}`);
    this.name = "RepositoryError";
  }
}

// ---------------------------------------------------------------------
// Origin
// ---------------------------------------------------------------------

/** Normaliza para scheme://host[:porta]. null para valores inválidos (inclui "null"). */
export function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function originInList(origin: string, list: readonly string[]): boolean {
  return list.some((entry) => normalizeOrigin(entry) === origin);
}

// ---------------------------------------------------------------------
// Respostas
// ---------------------------------------------------------------------

function baseHeaders(requestId: string, corsOrigin: string | null): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Request-Id": requestId,
    Vary: "Origin",
  });
  if (corsOrigin) {
    headers.set("Access-Control-Allow-Origin", corsOrigin);
    headers.set("Access-Control-Expose-Headers", "X-Request-Id");
  }
  return headers;
}

function jsonResponse(status: number, body: unknown, requestId: string, corsOrigin: string | null): Response {
  const headers = baseHeaders(requestId, corsOrigin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

const STATUS_BY_CODE: Record<PublicLeadErrorCode, number> = {
  INVALID_PAYLOAD: 400,
  ORIGIN_NOT_ALLOWED: 403,
  CAMPAIGN_UNAVAILABLE: 404,
  PAYLOAD_TOO_LARGE: 413,
  CPF_COOLDOWN: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
};

/**
 * Corpo de sucesso (201/200). `simulation` só existe em campanhas com valor
 * ilustrativo: o MESMO valor e a MESMA validade gravados no lead, também num
 * reenvio. `serverTime` deixa a LP corrigir a diferença do relógio do aparelho.
 * `kind` é sempre "ILLUSTRATIVE": não é decisão de crédito.
 */
function successBody(lead: StoredLead, now: Date) {
  return {
    success: true,
    leadId: lead.id,
    ...(lead.illustrative
      ? {
          simulation: {
            kind: "ILLUSTRATIVE" as const,
            amountCents: lead.illustrative.amountCents,
            presentedAt: lead.illustrative.presentedAt,
            expiresAt: lead.illustrative.expiresAt,
            serverTime: now.toISOString(),
          },
        }
      : {}),
  };
}

/** Honeypot: resposta com a mesma forma de um sucesso real, sem nada gravado. */
function fakeIllustrative(config: IllustrativeConfig | null, now: Date): StoredIllustrativeValue | null {
  if (!config) return null;
  const steps = (config.maxCents - config.minCents) / config.stepCents + 1;
  return {
    amountCents: config.minCents + Math.floor(Math.random() * steps) * config.stepCents,
    presentedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + config.validityHours * 3_600_000).toISOString(),
  };
}

// ---------------------------------------------------------------------
// Corpo da requisição com limite de tamanho
// ---------------------------------------------------------------------

type BodyResult = { ok: true; text: string } | { ok: false; reason: "too_large" | "invalid_encoding" };

async function readBodyWithLimit(request: Request, limit: number): Promise<BodyResult> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return { ok: false, reason: "too_large" };
  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, reason: "too_large" };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: "invalid_encoding" };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Caminhos dos campos inválidos (sem valores). */
function issuePaths(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>): string[] {
  const paths = issues.map((issue) => issue.path.map(String).join(".") || "(root)");
  return [...new Set(paths)].slice(0, 20);
}

// ---------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------

export function createPublicLeadsHandler(deps: PublicLeadsDeps) {
  /**
   * Origem aceita em dev ou em alguma campanha ativa. A consulta ao banco fica
   * em cache curto (por instância) para que respostas baratas — como 429 em
   * rajada — não virem uma consulta ao banco cada uma. Erros não são cacheados.
   */
  const originCache = new Map<string, { allowed: boolean; at: number }>();

  async function isOriginAllowedAnywhere(origin: string): Promise<boolean> {
    if (originInList(origin, deps.devOrigins)) return true;
    const nowMs = deps.now().getTime();
    const cached = originCache.get(origin);
    if (cached && nowMs - cached.at < ORIGIN_CACHE_TTL_MS) return cached.allowed;
    const allowed = await deps.isOriginAllowedForAnyCampaign(origin);
    if (originCache.size >= ORIGIN_CACHE_MAX_ENTRIES) originCache.clear();
    originCache.set(origin, { allowed, at: nowMs });
    return allowed;
  }

  async function POST(request: Request): Promise<Response> {
    const startedAt = deps.now().getTime();
    const requestId = deps.newRequestId();
    const origin = normalizeOrigin(request.headers.get("origin"));
    let campaignId: string | undefined;
    let corsOrigin: string | null = null;

    const finish = (
      status: number,
      body: unknown,
      code: PublicLeadsLogEntry["code"],
      dbCode?: string,
    ): Response => {
      deps.log({
        requestId,
        method: "POST",
        status,
        code,
        durationMs: deps.now().getTime() - startedAt,
        ...(campaignId ? { campaignId } : {}),
        ...(dbCode ? { dbCode } : {}),
      });
      return jsonResponse(status, body, requestId, corsOrigin);
    };

    /**
     * Respostas emitidas antes da checagem por campanha (429, 400, 413, 404,
     * 500) também levam CORS quando a origem é autorizada em algum lugar
     * (mesmo critério do preflight): assim a LP consegue ler o status em vez
     * de ver um "erro de rede". 403 nunca leva CORS.
     */
    const fail = async (code: PublicLeadErrorCode, extra?: { fields?: string[]; dbCode?: string }) => {
      if (corsOrigin === null && code !== "ORIGIN_NOT_ALLOWED" && origin !== null) {
        try {
          if (await isOriginAllowedAnywhere(origin)) corsOrigin = origin;
        } catch {
          // Banco indisponível: responde sem CORS.
        }
      }
      return finish(
        STATUS_BY_CODE[code],
        { success: false, error: code, requestId, ...(extra?.fields ? { fields: extra.fields } : {}) },
        code,
        extra?.dbCode,
      );
    };

    try {
      // 1. Rate limit (antes de qualquer trabalho caro).
      const ip = clientIpFromHeaders(request.headers);
      if (ip && deps.rateLimiter && !deps.rateLimiter.hit(ip, startedAt)) {
        return fail("TOO_MANY_REQUESTS");
      }

      // 2. Somente application/json.
      const mediaType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (mediaType !== "application/json") return fail("INVALID_PAYLOAD", { fields: ["(content-type)"] });

      // 3. Tamanho.
      const body = await readBodyWithLimit(request, MAX_BODY_BYTES);
      if (!body.ok) return body.reason === "too_large" ? fail("PAYLOAD_TOO_LARGE") : fail("INVALID_PAYLOAD");

      // 4. JSON.
      let json: unknown;
      try {
        json = JSON.parse(body.text);
      } catch {
        return fail("INVALID_PAYLOAD");
      }
      if (!isPlainObject(json)) return fail("INVALID_PAYLOAD");

      // 5. Campanha (a loja vem SEMPRE da campanha, nunca do cliente).
      const key = campaignKeySchema.safeParse(json.campaignKey);
      if (!key.success) return fail("INVALID_PAYLOAD", { fields: ["campaignKey"] });

      const campaign = await deps.findCampaignByKey(key.data);
      if (!campaign || !campaign.campaignActive || !campaign.storeActive) {
        return fail("CAMPAIGN_UNAVAILABLE");
      }
      campaignId = campaign.id;

      // 6. Origin.
      const originAllowed =
        origin !== null &&
        (originInList(origin, campaign.allowedOrigins) || originInList(origin, deps.devOrigins));
      if (!originAllowed) return fail("ORIGIN_NOT_ALLOWED");
      corsOrigin = origin;

      // 7. Honeypot: finge sucesso e não salva nada.
      if (typeof json.website === "string" && json.website.trim() !== "") {
        const now = deps.now();
        const fake = { id: deps.newFakeLeadId(), illustrative: fakeIllustrative(campaign.illustrative, now) };
        return finish(201, successBody(fake, now), "HONEYPOT");
      }

      // 8. Validação completa.
      const parsed = buildPublicLeadSchema(deps.now()).safeParse(json);
      if (!parsed.success) return fail("INVALID_PAYLOAD", { fields: issuePaths(parsed.error.issues) });
      const payload = parsed.data;

      // 9. Consentimento precisa ser da versão vigente da campanha.
      if (payload.consent.version !== campaign.consentVersion) {
        return fail("INVALID_PAYLOAD", { fields: ["consent.version"] });
      }

      // 10. INSERT (idempotente por campaign_id + client_submission_id; o
      //     banco aplica o bloqueio de CPF e define o valor ilustrativo).
      const result = await deps.insertLead({ campaignId: campaign.id, storeId: campaign.storeId, payload });
      switch (result.status) {
        case "created":
          return finish(201, successBody(result.lead, deps.now()), "CREATED");
        case "duplicate": {
          // Reenvio do mesmo pedido: devolve o lead original (mesmo valor e validade).
          const lead = await deps.findLeadBySubmission(campaign.id, payload.clientSubmissionId);
          if (!lead) return fail("INTERNAL_ERROR");
          return finish(200, successBody(lead, deps.now()), "DUPLICATE");
        }
        case "cpf_cooldown":
          return fail("CPF_COOLDOWN");
        case "campaign_unavailable":
          return fail("CAMPAIGN_UNAVAILABLE");
        case "consent_mismatch":
          return fail("INVALID_PAYLOAD", { fields: ["consent.version"] });
        case "rejected":
          return fail("INVALID_PAYLOAD");
      }
    } catch (error) {
      return fail("INTERNAL_ERROR", { dbCode: error instanceof RepositoryError ? error.dbCode : undefined });
    }
  }

  async function OPTIONS(request: Request): Promise<Response> {
    const startedAt = deps.now().getTime();
    const requestId = deps.newRequestId();
    const origin = normalizeOrigin(request.headers.get("origin"));

    const log = (status: number, code: PublicLeadsLogEntry["code"]) =>
      deps.log({ requestId, method: "OPTIONS", status, code, durationMs: deps.now().getTime() - startedAt });

    try {
      // No preflight não há corpo (nem campaignKey): a origem precisa estar
      // autorizada em alguma campanha ativa. O POST revalida por campanha.
      const allowed = origin !== null && (await isOriginAllowedAnywhere(origin));

      if (!allowed) {
        log(403, "ORIGIN_NOT_ALLOWED");
        return jsonResponse(403, { success: false, error: "ORIGIN_NOT_ALLOWED", requestId }, requestId, null);
      }

      const headers = baseHeaders(requestId, origin);
      headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
      headers.set("Access-Control-Max-Age", String(PREFLIGHT_MAX_AGE_SECONDS));
      log(204, "PREFLIGHT_OK");
      return new Response(null, { status: 204, headers });
    } catch {
      log(500, "INTERNAL_ERROR");
      return jsonResponse(500, { success: false, error: "INTERNAL_ERROR", requestId }, requestId, null);
    }
  }

  return { POST, OPTIONS };
}
