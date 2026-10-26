/**
 * Integração da rota POST /api/public/leads com o Supabase REMOTO.
 *
 * Cria lojas/campanhas temporárias (prefixo "api-test-"), envia leads pela
 * rota real e remove tudo ao final. Só roda com ALLOW_REMOTE_API_TESTS=true;
 * sem a variável, aborta antes de qualquer acesso ao banco.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { cooldownEnd } from "./business-days-reference";
import { randomValidCpf } from "./helpers";
import { assertDevSupabase } from "./production-guard";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Sem .env.local: as variáveis podem vir do ambiente.
}

if (process.env.ALLOW_REMOTE_API_TESTS !== "true") {
  throw new Error(
    "Testes remotos da API bloqueados. Eles criam e removem dados reais no Supabase. " +
      "Para executar, defina ALLOW_REMOTE_API_TESTS=true.",
  );
}

// Defesa em profundidade (o globalSetup já confere): nunca rodar fora do Supabase DEV.
assertDevSupabase(process.env);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SECRET_KEY) {
  throw new Error("Variáveis do Supabase ausentes (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY).");
}

// Origens de desenvolvimento não podem interferir nos testes de Origin.
delete process.env.PUBLIC_LEADS_DEV_ORIGINS;

const TEST_PREFIX = "api-test-";
const RUN_ID = `${TEST_PREFIX}${Date.now().toString(36)}`;
const ORIGIN = "https://lp-api-test.example";
const CONSENT_VERSION = "test-v1";
const CPF = "52998224725";

const admin = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type RouteModule = typeof import("@/app/api/public/leads/route");
let route: RouteModule;

let storeId: string;
let keyActive: string;
let keyInactiveCampaign: string;
let keyInactiveStore: string;
let campaignActiveId: string;
let keyFabrica: string;
let keyFabricaOtherStore: string;
let campaignFabricaId: string;

/** Mesmas regras da campanha Fábrica de Aprovação (migration 20261026120000). */
const FABRICA_RULES = {
  cpf_cooldown_business_days: 10,
  illustrative_min_cents: 3_500_000,
  illustrative_max_cents: 8_000_000,
  illustrative_step_cents: 5_000,
  illustrative_validity_hours: 36,
};

const logLines: string[] = [];

function unwrap<R extends { data: unknown; error: { message: string } | null }>(result: R, what: string) {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`${what}: ${result.error?.message ?? "sem dados"}`);
  }
  return result.data as NonNullable<R["data"]>;
}

function body(campaignKey: string, overrides: Record<string, unknown> = {}) {
  return {
    campaignKey,
    clientSubmissionId: randomUUID(),
    lead: {
      name: "Lead Teste API",
      cpf: "529.982.247-25",
      birthDate: "1990-05-20",
      phone: "(11) 98765-4321",
      email: "lead.teste@example.com",
    },
    formData: { downPaymentCents: 1500000, vehicle: "Teste", financing: true },
    tracking: {
      utmSource: "instagram",
      utmMedium: "cpc",
      utmCampaign: "duelo",
      pageUrl: `${ORIGIN}/duelo?utm_source=instagram`,
      referrer: "https://instagram.com/",
    },
    consent: { accepted: true, version: CONSENT_VERSION },
    website: "",
    ...overrides,
  };
}

async function send(payload: unknown, origin: string | null = ORIGIN) {
  const response = await route.POST(
    new Request("http://localhost/api/public/leads", {
      method: "POST",
      headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
      body: JSON.stringify(payload),
    }),
  );
  const text = await response.text();
  return { status: response.status, text, json: JSON.parse(text) as Record<string, unknown>, headers: response.headers };
}

function expectNoPii(text: string) {
  for (const value of [CPF, "529.982.247-25", "11987654321", "98765-4321", "1990-05-20", "Lead Teste API", "lead.teste@example.com"]) {
    expect(text).not.toContain(value);
  }
}

async function countLeads(campaignId: string) {
  const { count, error } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
  if (error) throw new Error(`contar leads: ${error.message}`);
  return count ?? 0;
}

async function cleanupTestData() {
  const { data: stores } = await admin.from("stores").select("id").like("slug", `${TEST_PREFIX}%`);
  const storeIds = (stores ?? []).map((s) => s.id as string);
  if (storeIds.length === 0) return;
  await admin.from("leads").delete().in("store_id", storeIds); // notas/eventos em cascata
  await admin.from("campaigns").delete().in("store_id", storeIds);
  await admin.from("stores").delete().in("id", storeIds);
}

beforeAll(async () => {
  await cleanupTestData();

  const stores = unwrap(
    await admin
      .from("stores")
      .insert([
        { slug: `${RUN_ID}-on`, name: "API Test Loja Ativa", is_active: true },
        { slug: `${RUN_ID}-off`, name: "API Test Loja Inativa", is_active: false },
        { slug: `${RUN_ID}-other`, name: "API Test Outra Loja", is_active: true },
      ])
      .select("id, slug"),
    "criar lojas",
  );
  storeId = stores.find((s) => s.slug.endsWith("-on"))!.id;
  const storeOffId = stores.find((s) => s.slug.endsWith("-off"))!.id;
  const storeOtherId = stores.find((s) => s.slug.endsWith("-other"))!.id;

  const campaigns = unwrap(
    await admin
      .from("campaigns")
      .insert([
        { store_id: storeId, slug: "ativa", name: "API Ativa", consent_version: CONSENT_VERSION, allowed_origins: [ORIGIN], is_active: true },
        { store_id: storeId, slug: "inativa", name: "API Inativa", consent_version: CONSENT_VERSION, allowed_origins: [ORIGIN], is_active: false },
        { store_id: storeOffId, slug: "loja-off", name: "API Loja Off", consent_version: CONSENT_VERSION, allowed_origins: [ORIGIN], is_active: true },
        { store_id: storeId, slug: "fabrica", name: "API Fábrica", consent_version: CONSENT_VERSION, allowed_origins: [ORIGIN], is_active: true, ...FABRICA_RULES },
        { store_id: storeOtherId, slug: "fabrica", name: "API Fábrica Outra Loja", consent_version: CONSENT_VERSION, allowed_origins: [ORIGIN], is_active: true, ...FABRICA_RULES },
      ])
      .select("id, slug, store_id, campaign_key"),
    "criar campanhas",
  );
  const active = campaigns.find((c) => c.slug === "ativa")!;
  campaignActiveId = active.id;
  keyActive = active.campaign_key;
  keyInactiveCampaign = campaigns.find((c) => c.slug === "inativa")!.campaign_key;
  keyInactiveStore = campaigns.find((c) => c.slug === "loja-off")!.campaign_key;
  const fabrica = campaigns.find((c) => c.slug === "fabrica" && c.store_id === storeId)!;
  campaignFabricaId = fabrica.id;
  keyFabrica = fabrica.campaign_key;
  keyFabricaOtherStore = campaigns.find((c) => c.slug === "fabrica" && c.store_id === storeOtherId)!.campaign_key;

  // Captura os logs reais da rota para checar ausência de dados pessoais.
  vi.spyOn(console, "info").mockImplementation((line: unknown) => void logLines.push(String(line)));
  vi.spyOn(console, "error").mockImplementation((line: unknown) => void logLines.push(String(line)));

  route = await import("@/app/api/public/leads/route");
});

afterEach(() => {
  expectNoPii(logLines.join("\n"));
});

afterAll(async () => {
  vi.restoreAllMocks();
  await cleanupTestData();
});

describe("POST /api/public/leads (Supabase remoto)", () => {
  it("cria o lead com dados normalizados e loja vinda da campanha", async () => {
    const payload = body(keyActive, { storeId: "00000000-0000-0000-0000-000000000000" });
    const res = await send(payload);

    expect(res.status).toBe(201);
    expect(Object.keys(res.json).sort()).toEqual(["leadId", "success"]);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expectNoPii(res.text);

    const lead = unwrap(
      await admin
        .from("leads")
        .select("store_id, campaign_id, cpf, phone, email, status, consent_at, consent_version, form_data, utm_source, utm_campaign, page_url, referrer")
        .eq("id", res.json.leadId as string)
        .single(),
      "lead criado",
    );
    expect(lead).toMatchObject({
      store_id: storeId,
      campaign_id: campaignActiveId,
      cpf: CPF,
      phone: "11987654321",
      email: "lead.teste@example.com",
      status: "NEW",
      consent_version: CONSENT_VERSION,
      form_data: { downPaymentCents: 1500000, vehicle: "Teste", financing: true },
      utm_source: "instagram",
      utm_campaign: "duelo",
      page_url: `${ORIGIN}/duelo?utm_source=instagram`,
      referrer: "https://instagram.com/",
    });
    expect(Date.now() - new Date(lead.consent_at).getTime()).toBeLessThan(5 * 60_000);

    const events = unwrap(
      await admin.from("lead_events").select("type").eq("lead_id", res.json.leadId as string),
      "eventos",
    );
    expect(events.map((e) => e.type)).toEqual(["CREATED"]);
  });

  it("mesmo clientSubmissionId → 200 com o mesmo leadId, sem duplicar", async () => {
    const payload = body(keyActive);
    const first = await send(payload);
    const second = await send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.json.leadId).toBe(first.json.leadId);

    const { count } = await admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("client_submission_id", payload.clientSubmissionId);
    expect(count).toBe(1);
  });

  it("mesmo CPF com outro clientSubmissionId → novo lead", async () => {
    const first = await send(body(keyActive));
    const second = await send(body(keyActive));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.json.leadId).not.toBe(first.json.leadId);
  });

  it("campanha inexistente, inativa ou de loja inativa → 404 genérico", async () => {
    for (const key of [`camp_pk_${"0".repeat(32)}`, keyInactiveCampaign, keyInactiveStore]) {
      const res = await send(body(key));
      expect(res.status).toBe(404);
      expect(res.json.error).toBe("CAMPAIGN_UNAVAILABLE");
    }
  });

  it("Origin não autorizado → 403 e nada é salvo", async () => {
    const before = await countLeads(campaignActiveId);
    const res = await send(body(keyActive), "https://evil.example");
    expect(res.status).toBe(403);
    expect(res.json.error).toBe("ORIGIN_NOT_ALLOWED");
    expect(await countLeads(campaignActiveId)).toBe(before);
  });

  it("consent_version diferente da campanha → 400", async () => {
    const res = await send(body(keyActive, { consent: { accepted: true, version: "2020-01-v0" } }));
    expect(res.status).toBe(400);
    expect(res.json.fields).toEqual(["consent.version"]);
  });

  it("CPF inválido → 400 e nada é salvo", async () => {
    const before = await countLeads(campaignActiveId);
    const res = await send(body(keyActive, { lead: { ...body(keyActive).lead, cpf: "529.982.247-24" } }));
    expect(res.status).toBe(400);
    expect(res.json.fields).toEqual(["lead.cpf"]);
    expect(await countLeads(campaignActiveId)).toBe(before);
  });

  it("honeypot → 201 falso e nada é salvo", async () => {
    const before = await countLeads(campaignActiveId);
    const res = await send(body(keyActive, { website: "https://spam.example" }));
    expect(res.status).toBe(201);
    expect(await countLeads(campaignActiveId)).toBe(before);

    const { data } = await admin.from("leads").select("id").eq("id", res.json.leadId as string);
    expect(data).toEqual([]);
  });

  it("preflight: origem cadastrada → 204, desconhecida → 403", async () => {
    const preflight = (origin: string) =>
      route.OPTIONS(
        new Request("http://localhost/api/public/leads", {
          method: "OPTIONS",
          headers: { origin, "access-control-request-method": "POST" },
        }),
      );
    const allowed = await preflight(ORIGIN);
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect((await preflight("https://evil.example")).status).toBe(403);
  });
});

type Simulation = { kind: string; amountCents: number; presentedAt: string; expiresAt: string; serverTime: string };

/** Corpo com um CPF próprio (cada teste do bloqueio usa o seu). */
function bodyWithCpf(campaignKey: string, cpf: string) {
  const payload = body(campaignKey);
  return { ...payload, lead: { ...payload.lead, cpf }, formData: { hasTradeIn: true, hasDownPayment: false, hasDriversLicense: true } };
}

async function leadsWithCpf(cpf: string) {
  return unwrap(
    await admin
      .from("leads")
      .select("id, store_id, campaign_id, created_at, illustrative_amount_cents, illustrative_presented_at, illustrative_expires_at, cpf_cooldown_until")
      .eq("cpf", cpf),
    "leads do CPF",
  );
}

describe("Bloqueio de CPF por 10 dias úteis e valor ilustrativo (Supabase remoto)", () => {
  it("201: valor e validade definidos e gravados pelo banco; bloqueio até 00:00 após o 10º dia útil", async () => {
    const cpf = randomValidCpf();
    const res = await send(bodyWithCpf(keyFabrica, cpf));
    expect(res.status).toBe(201);
    const simulation = res.json.simulation as Simulation;
    expect(simulation.kind).toBe("ILLUSTRATIVE");
    expect(Object.keys(res.json).sort()).toEqual(["leadId", "simulation", "success"]);
    expect(res.text).not.toContain(cpf);

    const [lead] = await leadsWithCpf(cpf);
    expect(lead.id).toBe(res.json.leadId);
    // Exatamente o que foi gravado.
    expect(lead.illustrative_amount_cents).toBe(simulation.amountCents);
    expect(new Date(lead.illustrative_presented_at!).toISOString()).toBe(simulation.presentedAt);
    expect(new Date(lead.illustrative_expires_at!).toISOString()).toBe(simulation.expiresAt);
    // Faixa, passo de R$ 50, sem milhar redondo, 36 h corridas a partir do registro.
    expect(simulation.amountCents).toBeGreaterThanOrEqual(3_500_000);
    expect(simulation.amountCents).toBeLessThanOrEqual(8_000_000);
    expect(simulation.amountCents % 5_000).toBe(0);
    expect(simulation.amountCents % 100_000).not.toBe(0);
    expect(Date.parse(simulation.expiresAt) - Date.parse(simulation.presentedAt)).toBe(36 * 3_600_000);
    expect(Date.parse(simulation.presentedAt)).toBe(Date.parse(lead.created_at));
    expect(Math.abs(Date.parse(simulation.serverTime) - Date.now())).toBeLessThan(60_000);
    // Fim do bloqueio = referência independente (dias úteis do DF, horário de Brasília).
    expect(Date.parse(lead.cpf_cooldown_until!)).toBe(cooldownEnd(new Date(lead.created_at), 10).getTime());
  });

  it("lead excluído não libera o CPF: novo pedido e até o reenvio do pedido antigo → 409", async () => {
    const cpf = randomValidCpf();
    const payload = bodyWithCpf(keyFabrica, cpf);
    const first = await send(payload);
    expect(first.status).toBe(201);
    unwrap(await admin.from("leads").delete().eq("id", first.json.leadId as string).select("id"), "excluir lead");
    expect((await send(bodyWithCpf(keyFabrica, cpf))).status).toBe(409);
    expect((await send(payload)).status).toBe(409);
    expect(await leadsWithCpf(cpf)).toHaveLength(0);
  });

  it("reenvio do mesmo pedido → 200 com o MESMO lead, valor e validade (sem bloqueio indevido)", async () => {
    const payload = bodyWithCpf(keyFabrica, randomValidCpf());
    const first = await send(payload);
    const second = await send(payload);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.json.leadId).toBe(first.json.leadId);
    const a = first.json.simulation as Simulation;
    const b = second.json.simulation as Simulation;
    expect([b.amountCents, b.presentedAt, b.expiresAt]).toEqual([a.amountCents, a.presentedAt, a.expiresAt]);
  });

  it("nova solicitação do mesmo CPF na mesma loja → 409 CPF_COOLDOWN, nada é salvo, sem dados na resposta", async () => {
    const cpf = randomValidCpf();
    expect((await send(bodyWithCpf(keyFabrica, cpf))).status).toBe(201);
    // Outro pedido (nova sessão, outro navegador): outro clientSubmissionId, mesmo CPF (com máscara).
    const masked = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
    const res = await send(bodyWithCpf(keyFabrica, masked));
    expect(res.status).toBe(409);
    expect(res.json).toEqual({ success: false, error: "CPF_COOLDOWN", requestId: res.json.requestId });
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(res.text).not.toContain(cpf.slice(3, 9));
    expect(await leadsWithCpf(cpf)).toHaveLength(1);
  });

  it("requisições simultâneas do mesmo CPF (pedidos diferentes) → só UM lead", async () => {
    const cpf = randomValidCpf();
    const results = await Promise.all(Array.from({ length: 6 }, () => send(bodyWithCpf(keyFabrica, cpf))));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409, 409]);
    expect(await leadsWithCpf(cpf)).toHaveLength(1);
  });

  it("o MESMO pedido enviado em paralelo → um 201 e os demais 200 com o mesmo lead", async () => {
    const cpf = randomValidCpf();
    const payload = bodyWithCpf(keyFabrica, cpf);
    const results = await Promise.all(Array.from({ length: 4 }, () => send(payload)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 201]);
    expect(new Set(results.map((r) => r.json.leadId)).size).toBe(1);
    expect(new Set(results.map((r) => (r.json.simulation as Simulation).amountCents)).size).toBe(1);
    expect(await leadsWithCpf(cpf)).toHaveLength(1);
  });

  it("outra loja com a mesma regra não é bloqueada; campanha sem a regra também não", async () => {
    const cpf = randomValidCpf();
    expect((await send(bodyWithCpf(keyFabrica, cpf))).status).toBe(201);
    expect((await send(bodyWithCpf(keyFabricaOtherStore, cpf))).status).toBe(201);
    // Campanha sem regras (ex.: Vitrine) na mesma loja: aceita e sem valor ilustrativo.
    const noRules = await send(bodyWithCpf(keyActive, cpf));
    expect(noRules.status).toBe(201);
    expect(noRules.json.simulation).toBeUndefined();
    const leads = await leadsWithCpf(cpf);
    expect(leads).toHaveLength(3);
    const plain = leads.find((l) => l.id === noRules.json.leadId)!;
    expect([plain.illustrative_amount_cents, plain.illustrative_expires_at, plain.cpf_cooldown_until]).toEqual([null, null, null]);
  });

  it("valor, validade e bloqueio são imutáveis (nem a chave secreta altera)", async () => {
    const cpf = randomValidCpf();
    const res = await send(bodyWithCpf(keyFabrica, cpf));
    for (const change of [{ illustrative_amount_cents: 8_000_000 }, { illustrative_expires_at: new Date().toISOString() }, { cpf_cooldown_until: null }]) {
      const { error } = await admin.from("leads").update(change).eq("id", res.json.leadId as string);
      expect(error?.code).toBe("KL004");
    }
    const [lead] = await leadsWithCpf(cpf);
    expect(lead.illustrative_amount_cents).toBe((res.json.simulation as Simulation).amountCents);
  });

  it("valores enviados no INSERT para essas colunas são ignorados (o banco define)", async () => {
    const { data, error } = await admin
      .from("leads")
      .insert({
        campaign_id: campaignFabricaId,
        store_id: storeId,
        full_name: "Lead Teste API",
        cpf: randomValidCpf(),
        birth_date: "1990-05-20",
        phone: "11987654321",
        consent_version: CONSENT_VERSION,
        client_submission_id: randomUUID(),
        illustrative_amount_cents: 1,
        illustrative_presented_at: "2020-01-01T00:00:00Z",
        illustrative_expires_at: "2099-01-01T00:00:00Z",
        cpf_cooldown_until: "2020-01-01T00:00:00Z",
      })
      .select("illustrative_amount_cents, illustrative_expires_at, cpf_cooldown_until")
      .single();
    expect(error).toBeNull();
    expect(data!.illustrative_amount_cents).toBeGreaterThanOrEqual(3_500_000);
    expect(Date.parse(data!.illustrative_expires_at!)).toBeLessThan(Date.now() + 37 * 3_600_000);
    expect(Date.parse(data!.cpf_cooldown_until!)).toBeGreaterThan(Date.now());
  });
});
