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
import { readFileSync } from "node:fs";
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
let leadFabrica: string; // da Loja Alfa, campanha com valor ilustrativo e bloqueio de CPF (como a Fábrica de Aprovação)
const cookies: Record<"storeUser" | "colleague" | "manager" | "superAdmin" | "inactive", string> = {
  storeUser: "",
  colleague: "",
  manager: "",
  superAdmin: "",
  inactive: "",
};
const ids = { storeUser: "", colleague: "", manager: "", campaignA: "" };

/** id de uma Server Action no build em execução (manifesto do `next build`). */
function serverActionId(name: string, filename: string): string {
  const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")) as {
    node: Record<string, { exportedName?: string; filename?: string }>;
  };
  const entry = Object.entries(manifest.node).find(([, v]) => v.exportedName === name && v.filename === filename);
  if (!entry) throw new Error(`Server Action ${name} não encontrada no build`);
  return entry[0];
}

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
  const fabricaCampaign = unwrap(
    await admin
      .from("campaigns")
      .insert({
        store_id: storeA,
        slug: "fabrica",
        name: "E2E Fabrica de Aprovacao",
        consent_version: "test-v1",
        form_schema: {
          hasTradeIn: { label: "Possui carro na troca", format: "boolean", order: 1 },
          hasDownPayment: { label: "Possui entrada", format: "boolean", order: 2 },
          hasDriversLicense: { label: "Possui CNH", format: "boolean", order: 3 },
        },
        cpf_cooldown_business_days: 10,
        illustrative_min_cents: 3_500_000,
        illustrative_max_cents: 8_000_000,
        illustrative_step_cents: 5_000,
        illustrative_validity_hours: 36,
      })
      .select("id")
      .single(),
    "campanha fábrica",
  );
  leadFabrica = (await insertLead(fabricaCampaign.id, "Lead Fabrica Alfa", { hasTradeIn: true, hasDownPayment: false, hasDriversLicense: true })).id;
  leadA = await insertLead(campaigns.find((c) => c.slug === "alfa")!.id, "Lead Visivel Alfa", DUELO_FORM_DATA);
  leadB = (await insertLead(campaigns.find((c) => c.slug === "beta")!.id, "Lead Secreto Beta")).id;
  leadOther = (await insertLead(campaigns.find((c) => c.slug === "alfa")!.id, "Lead Do Colega Alfa")).id;
  leadQueue = (await insertLead(campaigns.find((c) => c.slug === "alfa")!.id, "Lead Na Fila Alfa")).id;

  const storeUser = await createTestUser(admin, `${RUN}-user@${TEST_EMAIL_DOMAIN}`, "E2E Vendedor");
  const superAdmin = await createTestUser(admin, `${RUN}-super@${TEST_EMAIL_DOMAIN}`, "E2E Super");
  const inactive = await createTestUser(admin, `${RUN}-inactive@${TEST_EMAIL_DOMAIN}`, "E2E Inativo");
  const colleague = await createTestUser(admin, `${RUN}-colleague@${TEST_EMAIL_DOMAIN}`, "E2E Colega SDR");
  const manager = await createTestUser(admin, `${RUN}-manager@${TEST_EMAIL_DOMAIN}`, "E2E Gerente");
  unwrap(
    await admin
      .from("store_members")
      .insert([
        { store_id: storeA, user_id: storeUser.id, role: "STORE_USER", is_active: true },
        { store_id: storeA, user_id: inactive.id, role: "STORE_USER", is_active: true },
        { store_id: storeA, user_id: colleague.id, role: "STORE_USER", is_active: true },
        { store_id: storeA, user_id: manager.id, role: "STORE_ADMIN", is_active: true },
      ])
      .select("user_id"),
    "vínculos",
  );
  unwrap(await admin.from("profiles").update({ is_super_admin: true }).eq("id", superAdmin.id).select("id"), "super");
  unwrap(await admin.from("leads").update({ assigned_to: colleague.id }).eq("id", leadOther).select("id"), "atribuição");
  unwrap(await admin.from("leads").update({ assigned_to: storeUser.id }).eq("id", leadA.id).select("id"), "atribuição própria");

  Object.assign(ids, { storeUser: storeUser.id, colleague: colleague.id, manager: manager.id, campaignA: campaigns.find((c) => c.slug === "alfa")!.id });

  cookies.storeUser = await sessionCookie(storeUser.email, storeUser.password);
  cookies.colleague = await sessionCookie(colleague.email, colleague.password);
  cookies.manager = await sessionCookie(manager.email, manager.password);
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
    expect(res.html).not.toContain("Valor da simulação — ilustrativo");
  });

  it("valor ilustrativo (Fábrica): o MESMO valor gravado no lead, validade vigente, respostas e sem status bancário", async () => {
    const stored = unwrap(
      await admin.from("leads").select("illustrative_amount_cents, illustrative_expires_at").eq("id", leadFabrica).single(),
      "valor gravado",
    );
    const cents = stored.illustrative_amount_cents!;
    const amount = `R$ ${Math.floor(cents / 100).toLocaleString("pt-BR")},${String(cents % 100).padStart(2, "0")}`;
    const res = await get(`/leads/${leadFabrica}`, cookies.storeUser);
    expect(res.html).toContain("Valor da simulação — ilustrativo");
    expect(res.html.replace(/ /g, " ")).toContain(amount);
    expect(res.html).toContain("E2E Fabrica de Aprovacao");
    expect(res.html).toContain("Validade da simulação");
    expect(res.html).toMatch(/>3[56]:\d\d:\d\d</);
    expect(res.html).toContain("Vigente");
    expect(res.html).toContain('data-state="valid"');
    for (const label of ["Possui carro na troca", "Possui entrada", "Possui CNH"]) expect(res.html).toContain(label);
    expect(res.html).not.toMatch(/crédito liberado|aprovado pelo banco|pré-aprovado/i);
    // Coluna interna do bloqueio nunca vai para a tela.
    expect(res.html).not.toContain("cpf_cooldown_until");
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

  it("Pedidos LGPD (bloqueio de CPF): SDR e gerente não acessam nem veem o menu", async () => {
    for (const cookie of [cookies.storeUser, cookies.manager]) {
      const res = await get("/config/lgpd", cookie);
      expect(renderedNotFound(res.html)).toBe(true);
      expect(res.html).not.toContain("Consultar registros");
      expect((await get("/dashboard", cookie)).html).not.toContain('href="/config/lgpd"');
    }
  });
});

describe("SUPER_ADMIN", () => {
  it("Pedidos LGPD: tela de consulta/eliminação e auditoria, no menu da KAPA", async () => {
    const res = await get("/config/lgpd", cookies.superAdmin);
    expect(renderedNotFound(res.html)).toBe(false);
    expect(res.html).toContain("Pedidos LGPD");
    expect(res.html).toContain("Consultar registros");
    expect(res.html).toContain("Auditoria");
    expect(res.html).toContain('href="/config/lgpd"');
  });

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

describe("Novo usuário: Administrador Geral pelo painel", () => {
  const email = (label: string) => `${RUN}-novo-${label}@${TEST_EMAIL_DOMAIN}`;

  const actionId = (name: string) => serverActionId(name, "src/lib/actions/config.ts");

  /**
   * Chama createUserAction por HTTP como o navegador faria (protocolo do React:
   * argumentos [estado anterior, FormData]) — inclusive com campos manipulados.
   */
  async function postCreateUser(cookie: string, fields: Record<string, string>) {
    // Mesmo formato do encodeReply do React 19: campos "_1_<nome>" e, por último, a raiz "0" com o FormData como "$K1".
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.append(`_1_${key}`, value);
    body.append("0", JSON.stringify([null, "$K1"]));
    const response = await fetch(`${BASE_URL}/config/usuarios/novo`, {
      method: "POST",
      redirect: "manual",
      headers: { cookie, origin: BASE_URL, accept: "text/x-component", "next-action": actionId("createUserAction") },
      body,
    });
    return { status: response.status, redirect: response.headers.get("x-action-redirect") ?? "", text: await response.text() };
  }

  async function account(address: string) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const user = (data?.users ?? []).find((u) => u.email === address);
    if (!user) return null;
    const profile = unwrap(await admin.from("profiles").select("is_super_admin").eq("id", user.id).single(), "perfil");
    const memberships = unwrap(await admin.from("store_members").select("store_id, role").eq("user_id", user.id), "vínculos");
    return { id: user.id, isSuperAdmin: profile.is_super_admin, memberships };
  }

  const fields = (label: string, extra: Record<string, string>) => ({
    fullName: `E2E Novo ${label}`,
    email: email(label),
    password: `${randomUUID()}Aa1!`,
    ...extra,
  });

  it("formulário: tipo de acesso com Administrador Geral, Gerente de Loja e SDR (só para a KAPA)", async () => {
    const page = (await get("/config/usuarios/novo", cookies.superAdmin)).html;
    expect(renderedNotFound(page)).toBe(false);
    for (const text of ["Tipo de acesso", "Administrador Geral", "Gerente de Loja", 'value="SUPER_ADMIN"', 'value="STORE_ADMIN"', 'value="STORE_USER"']) {
      expect(page).toContain(text);
    }
    for (const cookie of [cookies.manager, cookies.storeUser]) {
      const res = await get("/config/usuarios/novo", cookie);
      expect(renderedNotFound(res.html)).toBe(true);
      expect(res.html).not.toContain('value="SUPER_ADMIN"');
    }
  });

  it("SUPER_ADMIN cria Administrador Geral pela Server Action: global, sem loja, auditado", async () => {
    const data = fields("global", { access: "SUPER_ADMIN", storeId: "", confirmGlobal: "on" });
    const res = await postCreateUser(cookies.superAdmin, data);
    expect(res.redirect).toContain("/config/usuarios?criado=global");

    const created = await account(data.email);
    expect(created).toMatchObject({ isSuperAdmin: true, memberships: [] });
    expect((await get("/config/usuarios?criado=global", cookies.superAdmin)).html).toContain("Administrador geral criado, com acesso a todas as lojas.");
    const detail = (await get(`/config/usuarios/${created!.id}`, cookies.superAdmin)).html;
    expect(detail).toContain("Super admin (KAPA)");
    expect(detail).toContain("por E2E Super");

    // Entra e enxerga as duas lojas de teste e as Configurações.
    const cookie = await sessionCookie(data.email, data.password);
    const stores = (await get("/config/lojas", cookie)).html;
    expect(stores).toContain("E2E Loja Alfa");
    expect(stores).toContain("E2E Loja Beta");
    expect((await get("/leads", cookie)).html).toContain("Lead Secreto Beta");
  });

  it("SUPER_ADMIN continua criando Gerente e SDR com a loja escolhida", async () => {
    const stores = unwrap(await admin.from("stores").select("id, slug").like("slug", `${RUN}-%`), "lojas");
    const storeA = stores.find((s) => s.slug.endsWith("-a"))!.id;
    const manager = fields("gerente", { access: "STORE_ADMIN", storeId: storeA });
    expect((await postCreateUser(cookies.superAdmin, manager)).redirect).toContain("/config/usuarios?criado=1");
    expect(await account(manager.email)).toMatchObject({ isSuperAdmin: false, memberships: [{ store_id: storeA, role: "STORE_ADMIN" }] });

    const sdr = fields("sdr", { access: "STORE_USER", storeId: storeA });
    expect((await postCreateUser(cookies.superAdmin, sdr)).redirect).toContain("/config/usuarios?criado=1");
    expect(await account(sdr.email)).toMatchObject({ isSuperAdmin: false, memberships: [{ store_id: storeA, role: "STORE_USER" }] });

    // Gerente/SDR sem loja: recusado, nada criado.
    const noStore = fields("sem-loja", { access: "STORE_USER", storeId: "" });
    const res = await postCreateUser(cookies.superAdmin, noStore);
    expect(res.text).toContain("Selecione a loja");
    expect(await account(noStore.email)).toBeNull();
  });

  it("Gerente e SDR chamando a Server Action manipulada não criam ninguém", async () => {
    for (const [label, cookie] of [["pelo-gerente", cookies.manager], ["pelo-sdr", cookies.storeUser]] as const) {
      const data = fields(label, { access: "SUPER_ADMIN", storeId: "", confirmGlobal: "on" });
      const res = await postCreateUser(cookie, data);
      expect(res.redirect).toBe("");
      expect(await account(data.email)).toBeNull();
    }
  });

  it("sem confirmação do acesso global ou com e-mail repetido: recusado com mensagem clara", async () => {
    const unconfirmed = fields("sem-confirmacao", { access: "SUPER_ADMIN", storeId: "" });
    const res = await postCreateUser(cookies.superAdmin, unconfirmed);
    expect(res.text).toContain("Confirme o acesso global");
    expect(await account(unconfirmed.email)).toBeNull();

    const duplicate = fields("global", { access: "SUPER_ADMIN", storeId: "", confirmGlobal: "on" });
    const before = await account(duplicate.email);
    const again = await postCreateUser(cookies.superAdmin, duplicate);
    expect(again.text).toContain("Já existe um usuário com este e-mail.");
    expect(await account(duplicate.email)).toEqual(before);
  });
});

describe("EXCLUIR LEAD (ação administrativa)", () => {
  const hasDelete = (html: string) => html.includes("EXCLUIR LEAD");

  it("SDR não vê a ação, nem no próprio lead", async () => {
    for (const id of [leadA.id, leadQueue, leadOther]) expect(hasDelete((await get(`/leads/${id}`, cookies.storeUser)).html)).toBe(false);
  });

  it("gerente vê nos leads da própria loja, com a confirmação; lead de outra loja → não encontrado", async () => {
    const res = await get(`/leads/${leadA.id}`, cookies.manager);
    expect(hasDelete(res.html)).toBe(true);
    expect(res.html).toContain("Excluir lead?");
    expect(res.html).toContain("Esta ação é permanente. O lead, observações e histórico relacionados serão removidos.");
    expect(res.html).toContain("Excluir definitivamente");
    // Ações do dia a dia continuam lá.
    expect(res.html).toContain("COPIAR RESUMO");

    const other = await get(`/leads/${leadB}`, cookies.manager);
    expect(renderedNotFound(other.html)).toBe(true);
    expect(hasDelete(other.html)).toBe(false);
  });

  it("SUPER_ADMIN vê em qualquer loja", async () => {
    expect(hasDelete((await get(`/leads/${leadB}`, cookies.superAdmin)).html)).toBe(true);
  });

  it("campanha com bloqueio de CPF: gerente é avisado que o bloqueio continua; só a KAPA vê a opção LGPD", async () => {
    const LGPD = "Pedido de eliminação do titular (LGPD)";
    const manager = (await get(`/leads/${leadFabrica}`, cookies.manager)).html;
    expect(manager).toContain("O bloqueio de 10 dias úteis para novas solicitações deste CPF continua valendo.");
    expect(manager).not.toContain(LGPD);
    expect((await get(`/leads/${leadFabrica}`, cookies.superAdmin)).html).toContain(LGPD);
    // Campanha sem a regra (ex.: Vitrine): nem aviso nem opção.
    const plain = (await get(`/leads/${leadQueue}`, cookies.superAdmin)).html;
    expect(plain).not.toContain("continua valendo");
    expect(plain).not.toContain(LGPD);
  });

  it("/leads mostra o aviso só quando vem da exclusão", async () => {
    expect((await get("/leads?excluido=1", cookies.manager)).html).toContain("Lead excluído com sucesso.");
    expect((await get("/leads", cookies.manager)).html).not.toContain("Lead excluído com sucesso.");
  });
});

describe("Exclusividade do lead pelo painel (Server Actions por HTTP)", () => {
  const TAKEN = "Este contato já foi assumido por outro atendente.";
  let race: string;
  let transfer: string;

  beforeAll(async () => {
    race = (await insertLead(ids.campaignA, "Lead Disputado Alfa")).id;
    transfer = (await insertLead(ids.campaignA, "Lead Transferido Alfa")).id;
  });

  /** Chama uma ação de src/lib/actions/leads.ts como o navegador (argumentos em JSON). */
  async function callLeadAction(cookie: string, name: string, args: unknown[]) {
    const response = await fetch(`${BASE_URL}/leads/${String(args[0])}`, {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie,
        origin: BASE_URL,
        accept: "text/x-component",
        "content-type": "text/plain;charset=UTF-8",
        "next-action": serverActionId(name, "src/lib/actions/leads.ts"),
      },
      body: JSON.stringify(args),
    });
    return response.text();
  }
  const assignedTo = async (lead: string) => unwrap(await admin.from("leads").select("assigned_to").eq("id", lead).single(), "lead").assigned_to;
  const assignedEvents = async (lead: string) =>
    unwrap(await admin.from("lead_events").select("actor_id, payload, created_at").eq("lead_id", lead).eq("type", "ASSIGNED").order("id"), "eventos");

  it("abas do SDR: Meus leads, Disponíveis e Todos; o gerente mantém Sem responsável", async () => {
    expect((await get("/leads?resp=sem", cookies.storeUser)).html).toMatch(/aria-current="page"[^>]*>Disponíveis</);
    expect((await get("/leads?resp=sem", cookies.manager)).html).toMatch(/aria-current="page"[^>]*>Sem responsável</);
  });

  it("dois SDRs clicando ASSUMIR ao mesmo tempo: um assume, o outro recebe a mensagem; um único ASSIGNED", async () => {
    expect((await get("/leads?resp=sem", cookies.colleague)).html).toContain("Lead Disputado Alfa");
    const [a, b] = await Promise.all([
      callLeadAction(cookies.storeUser, "claimLeadAction", [race]),
      callLeadAction(cookies.colleague, "claimLeadAction", [race]),
    ]);
    const owner = await assignedTo(race);
    expect([ids.storeUser, ids.colleague]).toContain(owner);
    const [winner, loser] = owner === ids.storeUser ? [a, b] : [b, a];
    expect(winner).toContain('"ok":true');
    expect(loser).toContain(TAKEN);
    expect(await assignedEvents(race)).toHaveLength(1);

    // Recarregar a página não devolve o lead para a fila de ninguém.
    const loserCookie = owner === ids.storeUser ? cookies.colleague : cookies.storeUser;
    for (const cookie of [cookies.storeUser, cookies.colleague]) {
      expect((await get("/leads?resp=sem", cookie)).html).not.toContain("Lead Disputado Alfa");
    }
    const detail = await get(`/leads/${race}`, loserCookie);
    expect(detail.html).toContain("Este lead está sendo atendido por");
    expect(detail.html).not.toContain("ASSUMIR LEAD");

    // Tela desatualizada: tentar de novo continua recusado.
    expect(await callLeadAction(loserCookie, "claimLeadAction", [race])).toContain(TAKEN);
    expect(await assignedTo(race)).toBe(owner);
  });

  it("SDR com a requisição manipulada não troca, não devolve e não toma o responsável", async () => {
    const owner = (await assignedTo(race))!;
    const [ownerCookie, otherCookie, otherId] =
      owner === ids.storeUser ? [cookies.storeUser, cookies.colleague, ids.colleague] : [cookies.colleague, cookies.storeUser, ids.storeUser];
    expect(await callLeadAction(otherCookie, "assignLeadAction", [race, otherId])).toContain('"ok":false');
    expect(await callLeadAction(ownerCookie, "assignLeadAction", [race, otherId])).toContain('"ok":false');
    expect(await callLeadAction(ownerCookie, "assignLeadAction", [race, ""])).toContain('"ok":false');
    expect(await assignedTo(race)).toBe(owner);
    expect(await assignedEvents(race)).toHaveLength(1);
  });

  it("gerente transfere pelo painel: registra anterior, novo, quem fez e quando", async () => {
    expect(await callLeadAction(cookies.storeUser, "claimLeadAction", [transfer])).toContain('"ok":true');
    expect(await callLeadAction(cookies.manager, "assignLeadAction", [transfer, ids.colleague])).toContain('"ok":true');
    expect(await assignedTo(transfer)).toBe(ids.colleague);
    const [claimed, moved] = await assignedEvents(transfer);
    expect(claimed).toMatchObject({ actor_id: ids.storeUser, payload: { from: null, to: ids.storeUser } });
    expect(moved).toMatchObject({ actor_id: ids.manager, payload: { from: ids.storeUser, to: ids.colleague } });
    expect(Date.now() - new Date(moved.created_at).getTime()).toBeLessThan(120_000);

    const timeline = (await get(`/leads/${transfer}`, cookies.manager)).html;
    expect(timeline).toContain("Responsável alterado: E2E Vendedor → E2E Colega SDR");
    // O antigo responsável perde o lead e não consegue retomá-lo.
    expect(await callLeadAction(cookies.storeUser, "claimLeadAction", [transfer])).toContain(TAKEN);
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
