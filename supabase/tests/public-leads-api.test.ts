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
      ])
      .select("id, slug"),
    "criar lojas",
  );
  storeId = stores.find((s) => s.slug.endsWith("-on"))!.id;
  const storeOffId = stores.find((s) => s.slug.endsWith("-off"))!.id;

  const campaigns = unwrap(
    await admin
      .from("campaigns")
      .insert([
        { store_id: storeId, slug: "ativa", name: "API Ativa", consent_version: CONSENT_VERSION, allowed_origins: [ORIGIN], is_active: true },
        { store_id: storeId, slug: "inativa", name: "API Inativa", consent_version: CONSENT_VERSION, allowed_origins: [ORIGIN], is_active: false },
        { store_id: storeOffId, slug: "loja-off", name: "API Loja Off", consent_version: CONSENT_VERSION, allowed_origins: [ORIGIN], is_active: true },
      ])
      .select("id, slug, campaign_key"),
    "criar campanhas",
  );
  const active = campaigns.find((c) => c.slug === "ativa")!;
  campaignActiveId = active.id;
  keyActive = active.campaign_key;
  keyInactiveCampaign = campaigns.find((c) => c.slug === "inativa")!.campaign_key;
  keyInactiveStore = campaigns.find((c) => c.slug === "loja-off")!.campaign_key;

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
