import { describe, expect, it } from "vitest";

import {
  MAX_BODY_BYTES,
  RepositoryError,
  createPublicLeadsHandler,
  type CampaignRecord,
  type NewLead,
  type PublicLeadsDeps,
  type PublicLeadsLogEntry,
} from "@/lib/leads/public-leads-handler";
import { FixedWindowRateLimiter } from "@/lib/leads/rate-limit";

const CAMPAIGN_KEY = `camp_pk_${"a".repeat(32)}`;
const ORIGIN = "https://lp.example.com";
const NOW = new Date("2026-10-10T15:00:00Z");
const SUBMISSION_ID = "3f0c9a52-6b0e-4c1e-9d0a-2a8f5c1d7e44";

// Dados pessoais usados nos testes: nenhum deles pode aparecer em respostas/logs.
const PII = ["52998224725", "529.982.247-25", "98765-4321", "11987654321", "1990-05-20", "Maria da Silva", "maria@example.com", "Onix"];

function setup(overrides: Partial<PublicLeadsDeps> = {}, campaignOverrides: Partial<CampaignRecord> = {}) {
  const logs: PublicLeadsLogEntry[] = [];
  const inserted: NewLead[] = [];
  const campaign: CampaignRecord = {
    id: "campaign-1",
    storeId: "store-from-db",
    consentVersion: "2026-10-v1",
    allowedOrigins: [`${ORIGIN}/`],
    campaignActive: true,
    storeActive: true,
    ...campaignOverrides,
  };
  const deps: PublicLeadsDeps = {
    findCampaignByKey: async (key) => (key === CAMPAIGN_KEY ? campaign : null),
    isOriginAllowedForAnyCampaign: async (origin) => origin === ORIGIN,
    insertLead: async (lead) => {
      inserted.push(lead);
      return { status: "created", leadId: "lead-1" };
    },
    findLeadIdBySubmission: async () => "lead-existing",
    devOrigins: [],
    rateLimiter: null,
    now: () => NOW,
    newRequestId: () => "req-1",
    newFakeLeadId: () => "fake-lead-id",
    log: (entry) => logs.push(entry),
    ...overrides,
  };
  return { handler: createPublicLeadsHandler(deps), logs, inserted };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    campaignKey: CAMPAIGN_KEY,
    clientSubmissionId: SUBMISSION_ID,
    lead: {
      name: "Maria da Silva",
      cpf: "529.982.247-25",
      birthDate: "1990-05-20",
      phone: "(11) 98765-4321",
      email: "maria@example.com",
    },
    formData: { downPaymentCents: 1500000, vehicle: "Onix", financing: true },
    tracking: { utmSource: "instagram", pageUrl: `${ORIGIN}/duelo?utm_source=instagram` },
    consent: { accepted: true, version: "2026-10-v1" },
    website: "",
    ...overrides,
  };
}

function withLead(lead: Record<string, unknown>) {
  return validBody({ lead: { ...validBody().lead, ...lead } });
}

function post(
  body: unknown,
  { origin = ORIGIN, contentType = "application/json", headers = {} }: { origin?: string | null; contentType?: string; headers?: Record<string, string> } = {},
) {
  return new Request("http://localhost/api/public/leads", {
    method: "POST",
    headers: { ...(origin ? { origin } : {}), "content-type": contentType, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function preflight(origin: string | null) {
  return new Request("http://localhost/api/public/leads", {
    method: "OPTIONS",
    headers: { ...(origin ? { origin } : {}), "access-control-request-method": "POST" },
  });
}

async function read(response: Response) {
  const text = await response.text();
  return { status: response.status, text, json: text ? JSON.parse(text) : null };
}

function expectNoPii(text: string) {
  for (const value of PII) expect(text).not.toContain(value);
}

// ---------------------------------------------------------------------

describe("POST /api/public/leads — sucesso", () => {
  it("cria o lead e responde 201 só com success e leadId", async () => {
    const { handler, inserted, logs } = setup();
    const res = await read(await handler.POST(post(validBody())));

    expect(res.status).toBe(201);
    expect(res.json).toEqual({ success: true, leadId: "lead-1" });
    expectNoPii(res.text);
    expectNoPii(JSON.stringify(logs));
    expect(logs).toEqual([
      { requestId: "req-1", method: "POST", status: 201, code: "CREATED", durationMs: 0, campaignId: "campaign-1" },
    ]);

    expect(inserted).toHaveLength(1);
    expect(inserted[0].campaignId).toBe("campaign-1");
    expect(inserted[0].payload.lead).toMatchObject({ cpf: "52998224725", phone: "11987654321" });
  });

  it("usa a loja da campanha e ignora store_id enviado pelo cliente", async () => {
    const { handler, inserted } = setup();
    await handler.POST(post(validBody({ storeId: "loja-forjada", store_id: "loja-forjada" })));
    expect(inserted[0].storeId).toBe("store-from-db");
    expect(JSON.stringify(inserted[0].payload)).not.toContain("loja-forjada");
  });

  it("devolve CORS para a origem autorizada (normalizada)", async () => {
    const { handler } = setup();
    const response = await handler.POST(post(validBody(), { origin: "https://LP.example.com" }));
    expect(response.status).toBe(201);
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(response.headers.get("vary")).toBe("Origin");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("aceita origem de desenvolvimento quando allowed_origins está vazio", async () => {
    const { handler } = setup({ devOrigins: ["http://localhost:5173"] }, { allowedOrigins: [] });
    const response = await handler.POST(post(validBody(), { origin: "http://localhost:5173" }));
    expect(response.status).toBe(201);
  });
});

describe("POST /api/public/leads — validação", () => {
  const cases: Array<[string, unknown, string]> = [
    ["CPF inválido", withLead({ cpf: "529.982.247-24" }), "lead.cpf"],
    ["CPF repetido", withLead({ cpf: "111.111.111-11" }), "lead.cpf"],
    ["menor de 18", withLead({ birthDate: "2010-01-01" }), "lead.birthDate"],
    ["telefone inválido", withLead({ phone: "(11) 8765-43210" }), "lead.phone"],
    ["DDD inválido", withLead({ phone: "(20) 98765-4321" }), "lead.phone"],
    ["consentimento ausente", validBody({ consent: undefined }), "consent"],
    ["consentimento recusado", validBody({ consent: { accepted: false, version: "2026-10-v1" } }), "consent.accepted"],
    ["consent_version errada", validBody({ consent: { accepted: true, version: "2025-01-v0" } }), "consent.version"],
    ["formData aninhado", validBody({ formData: { nested: { a: 1 } } }), "formData.nested"],
    ["formData com array", validBody({ formData: { list: [1] } }), "formData.list"],
    ["submissionId inválido", validBody({ clientSubmissionId: "abc" }), "clientSubmissionId"],
  ];

  it.each(cases)("%s → 400 INVALID_PAYLOAD", async (_name, body, field) => {
    const { handler, inserted, logs } = setup();
    const res = await read(await handler.POST(post(body)));
    expect(res.status).toBe(400);
    expect(res.json.success).toBe(false);
    expect(res.json.error).toBe("INVALID_PAYLOAD");
    expect(res.json.fields).toContain(field);
    expect(inserted).toHaveLength(0);
    expectNoPii(res.text);
    expectNoPii(JSON.stringify(logs));
  });

  it("rejeita Content-Type diferente de application/json", async () => {
    const { handler } = setup();
    const res = await read(await handler.POST(post(JSON.stringify(validBody()), { contentType: "text/plain" })));
    expect(res.status).toBe(400);
    expect(res.json.error).toBe("INVALID_PAYLOAD");
  });

  it("aceita application/json com charset", async () => {
    const { handler } = setup();
    const response = await handler.POST(post(validBody(), { contentType: "application/json; charset=utf-8" }));
    expect(response.status).toBe(201);
  });

  it("rejeita JSON inválido ou que não seja objeto", async () => {
    const { handler } = setup();
    expect((await handler.POST(post("{nao-json"))).status).toBe(400);
    expect((await handler.POST(post("[1,2]"))).status).toBe(400);
    expect((await handler.POST(post("null"))).status).toBe(400);
  });

  it("payload acima do limite → 413 PAYLOAD_TOO_LARGE", async () => {
    const { handler, inserted } = setup();
    const big = validBody({ formData: { notes: "x".repeat(MAX_BODY_BYTES) } });
    const res = await read(await handler.POST(post(big)));
    expect(res.status).toBe(413);
    expect(res.json.error).toBe("PAYLOAD_TOO_LARGE");
    expect(inserted).toHaveLength(0);
  });
});

describe("POST /api/public/leads — campanha e origem", () => {
  it("campanha inexistente → 404 genérico", async () => {
    const { handler } = setup();
    const res = await read(await handler.POST(post(validBody({ campaignKey: `camp_pk_${"b".repeat(32)}` }))));
    expect(res.status).toBe(404);
    expect(res.json).toEqual({ success: false, error: "CAMPAIGN_UNAVAILABLE", requestId: "req-1" });
  });

  it("campanha inativa → 404 genérico", async () => {
    const { handler } = setup({}, { campaignActive: false });
    expect((await handler.POST(post(validBody()))).status).toBe(404);
  });

  it("loja inativa → 404 genérico", async () => {
    const { handler } = setup({}, { storeActive: false });
    expect((await handler.POST(post(validBody()))).status).toBe(404);
  });

  it("Origin não autorizado → 403 sem CORS", async () => {
    const { handler, inserted } = setup();
    const response = await handler.POST(post(validBody(), { origin: "https://evil.example" }));
    const res = await read(response);
    expect(res.status).toBe(403);
    expect(res.json.error).toBe("ORIGIN_NOT_ALLOWED");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(inserted).toHaveLength(0);
  });

  it("sem Origin ou Origin 'null' → 403", async () => {
    const { handler } = setup();
    expect((await handler.POST(post(validBody(), { origin: null }))).status).toBe(403);
    expect((await handler.POST(post(validBody(), { origin: "null" }))).status).toBe(403);
  });

  it("origem de desenvolvimento não vale se não estiver configurada", async () => {
    const { handler } = setup({}, { allowedOrigins: [] });
    expect((await handler.POST(post(validBody(), { origin: "http://localhost:5173" }))).status).toBe(403);
  });
});

describe("POST /api/public/leads — honeypot e idempotência", () => {
  it("honeypot preenchido finge sucesso e não salva", async () => {
    const { handler, inserted, logs } = setup();
    const response = await handler.POST(post(validBody({ website: "http://spam.example" })));
    const res = await read(response);
    expect(res.status).toBe(201);
    expect(res.json).toEqual({ success: true, leadId: "fake-lead-id" });
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(inserted).toHaveLength(0);
    expect(logs[0].code).toBe("HONEYPOT");
  });

  it("honeypot vale mesmo com dados inválidos (não ensina o bot)", async () => {
    const { handler, inserted } = setup();
    const res = await read(await handler.POST(post({ ...withLead({ cpf: "000" }), website: "x" })));
    expect(res.status).toBe(201);
    expect(inserted).toHaveLength(0);
  });

  it("mesmo clientSubmissionId → 200 com o leadId existente", async () => {
    const { handler, logs } = setup({ insertLead: async () => ({ status: "duplicate" }) });
    const res = await read(await handler.POST(post(validBody())));
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ success: true, leadId: "lead-existing" });
    expect(logs[0].code).toBe("DUPLICATE");
  });

  it("consent_version recusada pelo banco (corrida) → 400", async () => {
    const { handler } = setup({ insertLead: async () => ({ status: "consent_mismatch" }) });
    expect((await handler.POST(post(validBody()))).status).toBe(400);
  });

  it("campanha desativada durante o envio → 404", async () => {
    const { handler } = setup({ insertLead: async () => ({ status: "campaign_unavailable" }) });
    expect((await handler.POST(post(validBody()))).status).toBe(404);
  });
});

describe("POST /api/public/leads — erros internos", () => {
  it("não vaza mensagem do banco nem dados pessoais", async () => {
    const leakyMessage = 'new row violates check constraint, Failing row contains (Maria da Silva, 52998224725, 11987654321)';
    const { handler, logs } = setup({
      insertLead: async () => {
        throw new Error(leakyMessage);
      },
    });
    const res = await read(await handler.POST(post(validBody())));
    expect(res.status).toBe(500);
    expect(res.json).toEqual({ success: false, error: "INTERNAL_ERROR", requestId: "req-1" });
    expect(res.text).not.toContain("violates");
    expectNoPii(res.text);
    expect(JSON.stringify(logs)).not.toContain("violates");
    expectNoPii(JSON.stringify(logs));
  });

  it("registra apenas o código do banco", async () => {
    const { handler, logs } = setup({
      findCampaignByKey: async () => {
        throw new RepositoryError("find_campaign", "PGRST301");
      },
    });
    expect((await handler.POST(post(validBody()))).status).toBe(500);
    expect(logs[0]).toMatchObject({ status: 500, code: "INTERNAL_ERROR", dbCode: "PGRST301" });
  });
});

describe("POST /api/public/leads — rate limit", () => {
  it("bloqueia o mesmo IP acima do limite → 429", async () => {
    const { handler } = setup({ rateLimiter: new FixedWindowRateLimiter({ limit: 2, windowMs: 60_000 }) });
    const headers = { "x-forwarded-for": "203.0.113.7, 10.0.0.1" };
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await handler.POST(post(validBody(), { headers }))).status);
    expect(statuses).toEqual([201, 201, 429]);

    const res = await read(await handler.POST(post(validBody(), { headers })));
    expect(res.json.error).toBe("TOO_MANY_REQUESTS");

    // Outro IP continua liberado.
    expect((await handler.POST(post(validBody(), { headers: { "x-forwarded-for": "203.0.113.8" } }))).status).toBe(201);
  });
});

describe("POST /api/public/leads — CORS consistente nas respostas de erro", () => {
  const ALLOW = "access-control-allow-origin";

  it("429 para origem autorizada leva CORS (a LP lê o status em vez de 'erro de rede')", async () => {
    const { handler } = setup({ rateLimiter: new FixedWindowRateLimiter({ limit: 1, windowMs: 60_000 }) });
    const headers = { "x-forwarded-for": "203.0.113.7" };
    await handler.POST(post(validBody(), { headers }));
    const response = await handler.POST(post(validBody(), { headers }));
    expect(response.status).toBe(429);
    expect(response.headers.get(ALLOW)).toBe(ORIGIN);
    expect(response.headers.get("access-control-expose-headers")).toBe("X-Request-Id");
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it("429 para origem não autorizada continua sem CORS", async () => {
    const { handler } = setup({ rateLimiter: new FixedWindowRateLimiter({ limit: 1, windowMs: 60_000 }) });
    const opts = { origin: "https://evil.example", headers: { "x-forwarded-for": "203.0.113.7" } };
    await handler.POST(post(validBody(), opts));
    const response = await handler.POST(post(validBody(), opts));
    expect(response.status).toBe(429);
    expect(response.headers.get(ALLOW)).toBeNull();
  });

  it("429 para origem de desenvolvimento leva CORS sem consultar o banco", async () => {
    let lookups = 0;
    const { handler } = setup({
      devOrigins: ["http://localhost:3001"],
      isOriginAllowedForAnyCampaign: async () => (lookups++, false),
      rateLimiter: new FixedWindowRateLimiter({ limit: 1, windowMs: 60_000 }),
    });
    const opts = { origin: "http://localhost:3001", headers: { "x-forwarded-for": "203.0.113.7" } };
    expect((await handler.POST(post(validBody(), opts))).status).toBe(201);
    const response = await handler.POST(post(validBody(), opts));
    expect(response.status).toBe(429);
    expect(response.headers.get(ALLOW)).toBe("http://localhost:3001");
    expect(lookups).toBe(0);
  });

  it("rajada de 429: a origem é consultada no banco uma vez só (cache)", async () => {
    let lookups = 0;
    const { handler } = setup({
      isOriginAllowedForAnyCampaign: async (origin) => (lookups++, origin === ORIGIN),
      rateLimiter: new FixedWindowRateLimiter({ limit: 1, windowMs: 60_000 }),
    });
    const headers = { "x-forwarded-for": "203.0.113.7" };
    expect((await handler.POST(post(validBody(), { headers }))).status).toBe(201);
    for (let i = 0; i < 20; i++) {
      const response = await handler.POST(post(validBody(), { headers }));
      expect(response.status).toBe(429);
      expect(response.headers.get(ALLOW)).toBe(ORIGIN);
    }
    expect(lookups).toBe(1);
  });

  it("400 (Content-Type/JSON/campaignKey), 413 e 404 levam CORS para origem autorizada", async () => {
    const { handler } = setup();
    const responses = [
      await handler.POST(post(validBody(), { contentType: "text/plain" })),
      await handler.POST(post("{nao-json")),
      await handler.POST(post(validBody({ campaignKey: "x" }))),
      await handler.POST(post(validBody({ formData: { notes: "x".repeat(MAX_BODY_BYTES) } }))),
      await handler.POST(post(validBody({ campaignKey: `camp_pk_${"b".repeat(32)}` }))),
      await handler.POST(post(withLead({ cpf: "111.111.111-11" }))),
    ];
    expect(responses.map((r) => r.status)).toEqual([400, 400, 400, 413, 404, 400]);
    for (const response of responses) expect(response.headers.get(ALLOW)).toBe(ORIGIN);
  });

  it("origem autorizada em OUTRA campanha recebe 403 sem CORS nesta", async () => {
    const { handler } = setup({}, { allowedOrigins: ["https://outra-lp.example"] });
    const response = await handler.POST(post(validBody()));
    expect(response.status).toBe(403);
    expect(response.headers.get(ALLOW)).toBeNull();
  });

  it("banco indisponível na checagem de origem: responde o erro original, sem CORS", async () => {
    const { handler } = setup({
      isOriginAllowedForAnyCampaign: async () => {
        throw new RepositoryError("origin_lookup", "08006");
      },
      rateLimiter: new FixedWindowRateLimiter({ limit: 1, windowMs: 60_000 }),
    });
    const headers = { "x-forwarded-for": "203.0.113.7" };
    expect((await handler.POST(post(validBody(), { headers }))).status).toBe(201);
    const response = await handler.POST(post(validBody(), { headers }));
    expect(response.status).toBe(429);
    expect(response.headers.get(ALLOW)).toBeNull();
  });
});

describe("OPTIONS /api/public/leads (preflight)", () => {
  it("origem autorizada em alguma campanha → 204 com CORS", async () => {
    const { handler } = setup();
    const response = await handler.OPTIONS(preflight(ORIGIN));
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toBe("Content-Type");
    expect(response.headers.get("access-control-max-age")).toBe("600");
  });

  it("origem desconhecida → 403 sem CORS", async () => {
    const { handler } = setup();
    const response = await handler.OPTIONS(preflight("https://evil.example"));
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("origem de desenvolvimento configurada → 204", async () => {
    const { handler } = setup({ devOrigins: ["http://localhost:5173"], isOriginAllowedForAnyCampaign: async () => false });
    expect((await handler.OPTIONS(preflight("http://localhost:5173"))).status).toBe(204);
  });

  it("sem Origin → 403", async () => {
    const { handler } = setup();
    expect((await handler.OPTIONS(preflight(null))).status).toBe(403);
  });
});
