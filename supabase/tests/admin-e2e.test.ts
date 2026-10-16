/**
 * Ponta a ponta do Admin: servidor Next rodando (E2E_BASE_URL, padrão
 * http://localhost:3123) + Supabase REMOTO. Gera cookies de sessão reais com
 * @supabase/ssr e confere proxy, guardas e páginas por papel via HTTP.
 *
 * Dados temporários com prefixo "e2e-test-". Só roda com ALLOW_REMOTE_E2E_TESTS=true.
 */
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database";

import { TEST_EMAIL_DOMAIN, cleanupByPrefix, clientOptions, createTestUser, loadRemoteEnv, randomValidCpf, unwrap } from "./helpers";

const env = loadRemoteEnv("ALLOW_REMOTE_E2E_TESTS");
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3123";
const PREFIX = "e2e-test-";
const RUN = `${PREFIX}${Date.now().toString(36)}`;

const admin = createClient<Database>(env.url, env.secretKey, clientOptions);

let leadA: { id: string; cpf: string };
let leadB: string;
let leadOther: string; // da Loja Alfa, atribuído a OUTRO SDR
let leadQueue: string; // da Loja Alfa, sem responsável (fila)
const cookies: Record<"storeUser" | "superAdmin" | "inactive", string> = { storeUser: "", superAdmin: "", inactive: "" };

/** Login com o mesmo cliente SSR do app; devolve o header Cookie resultante. */
async function sessionCookie(email: string, password: string): Promise<string> {
  const jar = new Map<string, string>();
  const client = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value } of list) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn: ${error.message}`);
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

/**
 * A página de "não encontrado" foi RENDERIZADA (h1 em HTML). O texto também
 * existe serializado no payload RSC de toda página, por isso não basta
 * procurar a string.
 */
function renderedNotFound(html: string) {
  return /<h1[^>]*>Não encontrado<\/h1>/.test(html);
}

async function get(path: string, cookie = "") {
  const response = await fetch(`${BASE_URL}${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} });
  return { status: response.status, location: response.headers.get("location"), html: await response.text() };
}

/** form_data como a LP Duelo envia (R$ 70.000, entrada R$ 20.000) com o snapshot da simulação apresentada. */
const DUELO_FORM_DATA = {
  hasTradeIn: false,
  hasDownPayment: true,
  downPaymentCents: 2_000_000,
  desiredVehicleValueCents: 7_000_000,
  simulationFinancedAmountCents: 5_000_000,
  simulationMonthlyRateBps: 190,
  simulation36Cents: 193_028,
  simulation48Cents: 159_710,
  simulation60Cents: 140_378,
  simulationSelectedTerm: 48,
};

async function insertLead(campaignId: string, name: string, formData: Record<string, number | boolean> = {}) {
  const cpf = randomValidCpf();
  const row = unwrap(
    await admin
      .from("leads")
      .insert({
        campaign_id: campaignId,
        store_id: "00000000-0000-0000-0000-000000000000",
        full_name: name,
        cpf,
        birth_date: "1990-05-20",
        phone: "11987651234",
        consent_version: "test-v1",
        client_submission_id: randomUUID(),
        form_data: formData,
      })
      .select("id")
      .single(),
    "lead",
  );
  return { id: row.id, cpf };
}

beforeAll(async () => {
  try {
    await fetch(`${BASE_URL}/login`, { redirect: "manual" });
  } catch {
    throw new Error(`Servidor não encontrado em ${BASE_URL}. Rode "npm run build && npx next start -p 3123" antes.`);
  }

  await cleanupByPrefix(admin, PREFIX);
  const stores = unwrap(
    await admin.from("stores").insert([{ slug: `${RUN}-a`, name: "E2E Loja Alfa" }, { slug: `${RUN}-b`, name: "E2E Loja Beta" }]).select("id, slug"),
    "lojas",
  );
  const storeA = stores.find((s) => s.slug.endsWith("-a"))!.id;
  const storeB = stores.find((s) => s.slug.endsWith("-b"))!.id;
  const campaigns = unwrap(
    await admin
      .from("campaigns")
      .insert([
        { store_id: storeA, slug: "alfa", name: "E2E Campanha Alfa", consent_version: "test-v1" },
        { store_id: storeB, slug: "beta", name: "E2E Campanha Beta", consent_version: "test-v1" },
      ])
      .select("id, slug"),
    "campanhas",
  );
  leadA = await insertLead(campaigns.find((c) => c.slug === "alfa")!.id, "Lead Visivel Alfa", DUELO_FORM_DATA);
  leadB = (await insertLead(campaigns.find((c) => c.slug === "beta")!.id, "Lead Secreto Beta")).id;
  leadOther = (await insertLead(campaigns.find((c) => c.slug === "alfa")!.id, "Lead Do Colega Alfa")).id;
  leadQueue = (await insertLead(campaigns.find((c) => c.slug === "alfa")!.id, "Lead Na Fila Alfa")).id;

  const storeUser = await createTestUser(admin, `${RUN}-user@${TEST_EMAIL_DOMAIN}`, "E2E Vendedor");
  const superAdmin = await createTestUser(admin, `${RUN}-super@${TEST_EMAIL_DOMAIN}`, "E2E Super");
  const inactive = await createTestUser(admin, `${RUN}-inactive@${TEST_EMAIL_DOMAIN}`, "E2E Inativo");
  const colleague = await createTestUser(admin, `${RUN}-colleague@${TEST_EMAIL_DOMAIN}`, "E2E Colega SDR");
  unwrap(
    await admin
      .from("store_members")
      .insert([
        { store_id: storeA, user_id: storeUser.id, role: "STORE_USER", is_active: true },
        { store_id: storeA, user_id: inactive.id, role: "STORE_USER", is_active: true },
        { store_id: storeA, user_id: colleague.id, role: "STORE_USER", is_active: true },
      ])
      .select("user_id"),
    "vínculos",
  );
  unwrap(await admin.from("profiles").update({ is_super_admin: true }).eq("id", superAdmin.id).select("id"), "super");
  unwrap(await admin.from("leads").update({ assigned_to: colleague.id }).eq("id", leadOther).select("id"), "atribuição");
  unwrap(await admin.from("leads").update({ assigned_to: storeUser.id }).eq("id", leadA.id).select("id"), "atribuição própria");

  cookies.storeUser = await sessionCookie(storeUser.email, storeUser.password);
  cookies.superAdmin = await sessionCookie(superAdmin.email, superAdmin.password);
  cookies.inactive = await sessionCookie(inactive.email, inactive.password);
  // Desativa depois do login: a sessão continua válida, mas o servidor deve bloquear.
  unwrap(await admin.from("profiles").update({ is_active: false }).eq("id", inactive.id).select("id"), "inativo");
});

afterAll(async () => {
  await cleanupByPrefix(admin, PREFIX);
});

describe("sem login", () => {
  it.each(["/dashboard", "/leads", "/config/lojas", "/perfil"])("%s → /login", async (path) => {
    const res = await get(path);
    expect(res.status).toBe(307);
    expect(res.location).toMatch(/\/login$/);
  });

  it("detalhe de lead → /login", async () => {
    const res = await get(`/leads/${leadA.id}`);
    expect(res.status).toBe(307);
    expect(res.location).toMatch(/\/login$/);
  });

  it("/login abre o formulário", async () => {
    const res = await get("/login");
    expect(res.status).toBe(200);
    expect(res.html).toContain("ENTRAR");
    expect(res.html).not.toMatch(/criar conta/i);
  });
});

describe("STORE_USER (SDR)", () => {
  it("dashboard do SDR: só os próprios números e a fila, sem a equipe", async () => {
    const dashboard = await get("/dashboard", cookies.storeUser);
    expect(dashboard.status).toBe(200);
    expect(dashboard.html).toContain("Meus novos");
    expect(dashboard.html).toContain("Fila sem responsável");
    expect(dashboard.html).not.toContain("Leads recebidos");
    expect(dashboard.html).not.toContain("E2E Colega SDR");
    expect(dashboard.html).not.toContain("Lead Do Colega Alfa");
    expect(dashboard.html).not.toContain("Lead Secreto Beta");
  });

  it("/leads abre em Meus leads; a fila e Todos mostram só a própria loja, sem CPF", async () => {
    const mine = await get("/leads", cookies.storeUser);
    expect(mine.html).toMatch(/aria-current="page"[^>]*>Meus leads</);
    expect(mine.html).toContain("Lead Visivel Alfa");
    expect(mine.html).not.toContain("Lead Na Fila Alfa");
    expect(mine.html).not.toContain("Lead Do Colega Alfa");

    const queue = await get("/leads?resp=sem", cookies.storeUser);
    expect(queue.html).toContain("Lead Na Fila Alfa");
    expect(queue.html).not.toContain("Lead Visivel Alfa");
    expect(queue.html).not.toContain("Lead Do Colega Alfa");

    const all = await get("/leads?resp=todos", cookies.storeUser);
    expect(all.html).toContain("Lead Visivel Alfa");
    expect(all.html).toContain("Lead Na Fila Alfa");
    expect(all.html).toContain("Lead Do Colega Alfa");
    expect(all.html).toContain("Responsável");
    expect(all.html).not.toContain("Lead Secreto Beta");
    expect(all.html.includes(leadA.cpf)).toBe(false);
  });

  it("filtro por loja na URL não amplia o acesso", async () => {
    const res = await get(`/leads?q=Secreto&resp=todos`, cookies.storeUser);
    expect(res.html).not.toContain("Lead Secreto Beta");
  });

  // Marcas das ações de trabalho na página.
  const works = (html: string) => ({
    status: html.includes('id="lead-status"'),
    note: html.includes('id="note-body"'),
    cpf: html.includes("REVELAR CPF"),
    summary: html.includes("COPIAR RESUMO"),
    whatsapp: html.includes("https://wa.me/"),
    claim: html.includes("ASSUMIR LEAD"),
  });

  it("meu lead: operação normal (status, observação, REVELAR CPF, COPIAR RESUMO, WhatsApp) — CPF completo nunca no HTML", async () => {
    const res = await get(`/leads/${leadA.id}`, cookies.storeUser);
    expect(works(res.html)).toEqual({ status: true, note: true, cpf: true, summary: true, whatsapp: true, claim: false });
    expect(res.html).toContain("Lead: Lead Visivel Alfa");
    expect(res.html.includes(leadA.cpf)).toBe(false);
    expect(res.html.includes(`${leadA.cpf.slice(0, 3)}.${leadA.cpf.slice(3, 6)}.${leadA.cpf.slice(6, 9)}-${leadA.cpf.slice(9)}`)).toBe(false);
  });

  it("simulação apresentada: valores salvos, prazo registrado e resumo com as parcelas; sem nomes técnicos", async () => {
    const res = await get(`/leads/${leadA.id}`, cookies.storeUser);
    expect(res.html).toContain("Simulação apresentada");
    expect(res.html).toMatch(/Valor estimado a financiar[\s\S]{0,400}R\$\s50\.000,00/);
    expect(res.html).toContain("1,9% a.m.");
    expect(res.html).toContain("Prazo registrado");
    for (const value of [/R\$\s1\.930,28/, /R\$\s1\.597,10/, /R\$\s1\.403,78/]) expect(res.html).toMatch(value);
    // COPIAR RESUMO (texto vai no HTML do botão)
    expect(res.html).toMatch(/48x: R\$\s1\.597,10/);
    expect(res.html).not.toMatch(/simulation(FinancedAmount|MonthlyRate|SelectedTerm|\d+Cents)/);
  });

  it("lead sem snapshot da simulação (lead antigo): sem o bloco", async () => {
    const res = await get(`/leads/${leadQueue}`, cookies.storeUser);
    expect(renderedNotFound(res.html)).toBe(false);
    expect(res.html).not.toContain("Simulação apresentada");
    expect(res.html).not.toContain("Valor estimado a financiar");
  });

  it("lead sem responsável: só ASSUMIR LEAD", async () => {
    const res = await get(`/leads/${leadQueue}`, cookies.storeUser);
    expect(works(res.html)).toEqual({ status: false, note: false, cpf: false, summary: false, whatsapp: false, claim: true });
    expect(res.html).toContain("Assuma o lead para");
  });

  it("lead de outro SDR: mostra quem atende, sem nenhuma ação de trabalho", async () => {
    const res = await get(`/leads/${leadOther}`, cookies.storeUser);
    expect(res.html).toContain("Este lead está sendo atendido por E2E Colega SDR.");
    expect(works(res.html)).toEqual({ status: false, note: false, cpf: false, summary: false, whatsapp: false, claim: false });
  });

  it("detalhe mostra CPF mascarado e ações de contato", async () => {
    const res = await get(`/leads/${leadA.id}`, cookies.storeUser);
    expect(res.html).toContain("Lead Visivel Alfa");
    expect(res.html).toContain(`***.${leadA.cpf.slice(3, 6)}.${leadA.cpf.slice(6, 9)}-**`);
    expect(res.html.includes(leadA.cpf)).toBe(false);
    expect(res.html).toContain("https://wa.me/5511987651234");
    // Sem botão LIGAR.
    expect(res.html).not.toContain("tel:+55");
    // Controle: página permitida não renderiza o "não encontrado".
    expect(renderedNotFound(res.html)).toBe(false);
  });

  it("lead de outra loja → não encontrado", async () => {
    const res = await get(`/leads/${leadB}`, cookies.storeUser);
    expect(res.html).not.toContain("Lead Secreto Beta");
    expect(renderedNotFound(res.html)).toBe(true);
  });

  it("configurações KAPA → não encontrado", async () => {
    const res = await get("/config/lojas", cookies.storeUser);
    expect(renderedNotFound(res.html)).toBe(true);
    expect(res.html).not.toContain("E2E Loja Beta");
  });
});

describe("SUPER_ADMIN", () => {
  it("dashboard com visão da equipe e seletor de responsável no lead", async () => {
    const dashboard = await get("/dashboard", cookies.superAdmin);
    expect(dashboard.html).toContain("Leads recebidos");
    expect(dashboard.html).toContain("Equipe");
    expect(dashboard.html).toContain("E2E Colega SDR");

    const detail = await get(`/leads/${leadA.id}`, cookies.superAdmin);
    expect(detail.html).toContain('aria-label="Responsável pelo lead"');
    expect(detail.html).toContain("E2E Vendedor");
    expect(detail.html).not.toContain("ASSUMIR LEAD");

    // KAPA trabalha qualquer lead, inclusive o de outro SDR.
    const other = await get(`/leads/${leadOther}`, cookies.superAdmin);
    expect(other.html).toContain('id="lead-status"');
    expect(other.html).toContain('id="note-body"');
    expect(other.html).toContain("REVELAR CPF");
  });

  it("vê todas as lojas e leads", async () => {
    const stores = await get("/config/lojas", cookies.superAdmin);
    expect(renderedNotFound(stores.html)).toBe(false);
    expect(stores.html).toContain("E2E Loja Alfa");
    expect(stores.html).toContain("E2E Loja Beta");

    const leads = await get("/leads", cookies.superAdmin);
    expect(leads.html).toContain("Lead Visivel Alfa");
    expect(leads.html).toContain("Lead Secreto Beta");
  });
});

describe("usuário inativo", () => {
  it("sessão válida, mas o servidor bloqueia e encerra a sessão", async () => {
    const res = await get("/dashboard", cookies.inactive);
    expect(res.html).not.toContain("Lead Visivel Alfa");
    expect(res.html).toContain("/auth/sair?motivo=inativo");

    // Controle: usuário ativo não recebe esse redirecionamento.
    const active = await get("/dashboard", cookies.storeUser);
    expect(active.html).not.toContain("/auth/sair?motivo=inativo");
  });
});
