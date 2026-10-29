/**
 * Autorização do Admin contra o Supabase REMOTO, usando a camada de dados
 * real (src/lib/admin, src/lib/auth) com clientes logados por papel.
 *
 * Dados temporários com prefixo "adm-test-", removidos ao final.
 * Só roda com ALLOW_REMOTE_ADMIN_TESTS=true.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ConfigError,
  createStore,
  createUserAccount,
  getCampaign,
  getUserCreation,
  listStoreMembers,
  rotateCampaignKey,
  updateCampaign,
} from "@/lib/admin/config";
import { summarizeKpis } from "@/lib/admin/kpis";
import {
  addLeadNote,
  assignLead,
  getDashboardCounts,
  getLeadDetail,
  getLeadHistory,
  getLeadKpis,
  listLeads,
  revealLeadCpf,
  updateLeadStatus,
} from "@/lib/admin/leads";
import { getStoreTeam, teamNames } from "@/lib/admin/team";
import { buildTimeline } from "@/lib/admin/timeline";
import { loadAdminAccess } from "@/lib/auth/access";
import { formatFormData } from "@/lib/format/form-data";
import type { Database } from "@/types/database";

import { TEST_EMAIL_DOMAIN, cleanupByPrefix, clientOptions, createTestUser, loadRemoteEnv, randomValidCpf, signIn, unwrap } from "./helpers";

const env = loadRemoteEnv("ALLOW_REMOTE_ADMIN_TESTS");
const PREFIX = "adm-test-";
const RUN = `${PREFIX}${Date.now().toString(36)}`;
const CONSENT = "test-v1";

const admin = createClient<Database>(env.url, env.secretKey, clientOptions);
type Db = SupabaseClient<Database>;

let storeA: string;
let storeB: string;
let campaignA: string;
let campaignB: string;
let leadA1: { id: string; cpf: string };
let leadA2: string;
let leadB1: string;

const users = {} as Record<"userA" | "adminB" | "superAdmin" | "inactive" | "inactiveMember", { id: string; db: Db }>;

async function insertLead(campaignId: string, name: string, phone: string) {
  const cpf = randomValidCpf();
  const row = unwrap(
    await admin
      .from("leads")
      .insert({
        campaign_id: campaignId,
        store_id: "00000000-0000-0000-0000-000000000000", // sobrescrito pelo trigger
        full_name: name,
        cpf,
        birth_date: "1990-05-20",
        phone,
        consent_version: CONSENT,
        client_submission_id: randomUUID(),
        form_data: { downPaymentCents: 1500000, hasTradeIn: true, tradeYear: 2021 },
        utm_source: "instagram",
      })
      .select("id")
      .single(),
    `lead ${name}`,
  );
  return { id: row.id, cpf };
}

beforeAll(async () => {
  await cleanupByPrefix(admin, PREFIX);

  const stores = unwrap(
    await admin.from("stores").insert([{ slug: `${RUN}-a`, name: "ADM Loja A" }, { slug: `${RUN}-b`, name: "ADM Loja B" }]).select("id, slug"),
    "lojas",
  );
  storeA = stores.find((s) => s.slug.endsWith("-a"))!.id;
  storeB = stores.find((s) => s.slug.endsWith("-b"))!.id;

  const formSchema = {
    downPaymentCents: { label: "Valor da entrada", format: "money" },
    hasTradeIn: { label: "Possui carro na troca", format: "boolean" },
  };
  const campaigns = unwrap(
    await admin
      .from("campaigns")
      .insert([
        { store_id: storeA, slug: "camp-a", name: "ADM Camp A", consent_version: CONSENT, form_schema: formSchema },
        { store_id: storeB, slug: "camp-b", name: "ADM Camp B", consent_version: CONSENT, form_schema: {} },
      ])
      .select("id, slug"),
    "campanhas",
  );
  campaignA = campaigns.find((c) => c.slug === "camp-a")!.id;
  campaignB = campaigns.find((c) => c.slug === "camp-b")!.id;

  leadA1 = await insertLead(campaignA, "Ana Teste Admin", "11987650001");
  leadA2 = (await insertLead(campaignA, "Bruno Teste Admin", "11987650002")).id;
  leadB1 = (await insertLead(campaignB, "Carla Teste Admin", "21987650003")).id;

  const make = async (key: keyof typeof users, name: string) => {
    const user = await createTestUser(admin, `${RUN}-${key.toLowerCase()}@${TEST_EMAIL_DOMAIN}`, name);
    return { ...user, key };
  };
  const created = await Promise.all([
    make("userA", "Usuário A"),
    make("adminB", "Admin B"),
    make("superAdmin", "Super"),
    make("inactive", "Inativo"),
    make("inactiveMember", "Vínculo inativo"),
  ]);
  const id = (key: string) => created.find((c) => c.key === key)!.id;

  unwrap(
    await admin
      .from("store_members")
      .insert([
        { store_id: storeA, user_id: id("userA"), role: "STORE_USER", is_active: true },
        { store_id: storeB, user_id: id("adminB"), role: "STORE_ADMIN", is_active: true },
        { store_id: storeA, user_id: id("inactive"), role: "STORE_ADMIN", is_active: true },
        { store_id: storeA, user_id: id("inactiveMember"), role: "STORE_USER", is_active: false },
      ])
      .select("user_id"),
    "vínculos",
  );
  unwrap(await admin.from("profiles").update({ is_super_admin: true }).eq("id", id("superAdmin")).select("id"), "super");
  unwrap(await admin.from("profiles").update({ is_active: false }).eq("id", id("inactive")).select("id"), "inativo");

  for (const user of created) {
    users[user.key] = { id: user.id, db: await signIn(env.url, env.publishableKey, user.email, user.password) };
  }
});

afterAll(async () => {
  await cleanupByPrefix(admin, PREFIX);
});

// ---------------------------------------------------------------------

describe("acesso ao Admin (perfil e vínculos vêm do banco)", () => {
  it("STORE_USER da Loja A", async () => {
    const access = await loadAdminAccess(users.userA.db, users.userA.id);
    expect(access.status).toBe("ok");
    if (access.status !== "ok") return;
    expect(access.context.role).toBe("STORE_USER");
    expect(access.context.stores.map((s) => s.id)).toEqual([storeA]);
  });

  it("STORE_ADMIN da Loja B", async () => {
    const access = await loadAdminAccess(users.adminB.db, users.adminB.id);
    expect(access.status === "ok" && access.context.role).toBe("STORE_ADMIN");
    expect(access.status === "ok" && access.context.stores.map((s) => s.id)).toEqual([storeB]);
  });

  it("SUPER_ADMIN enxerga todas as lojas", async () => {
    const access = await loadAdminAccess(users.superAdmin.db, users.superAdmin.id);
    expect(access.status === "ok" && access.context.role).toBe("SUPER_ADMIN");
    const ids = access.status === "ok" ? access.context.stores.map((s) => s.id) : [];
    expect(ids).toEqual(expect.arrayContaining([storeA, storeB]));
  });

  it("perfil inativo é bloqueado e não vê leads", async () => {
    expect((await loadAdminAccess(users.inactive.db, users.inactive.id)).status).toBe("inactive");
    expect((await listLeads(users.inactive.db, {})).total).toBe(0);
  });

  it("vínculo inativo não dá acesso à loja", async () => {
    expect((await loadAdminAccess(users.inactiveMember.db, users.inactiveMember.id)).status).toBe("no_store");
    expect((await listLeads(users.inactiveMember.db, {})).total).toBe(0);
  });
});

describe("leads respeitam a loja", () => {
  it("STORE_USER vê somente a Loja A, e filtros não ampliam o acesso", async () => {
    const own = await listLeads(users.userA.db, {});
    expect(own.rows.map((r) => r.id).sort()).toEqual([leadA1.id, leadA2].sort());
    expect(own.rows.every((r) => r.storeId === storeA && r.storeName === "ADM Loja A" && r.campaignName === "ADM Camp A")).toBe(true);

    expect((await listLeads(users.userA.db, { storeId: storeB })).total).toBe(0);
    expect((await listLeads(users.userA.db, { campaignId: campaignB })).total).toBe(0);
    expect((await listLeads(users.userA.db, { q: "Carla" })).total).toBe(0);
    expect((await listLeads(users.userA.db, { q: "21987650003" })).total).toBe(0);
  });

  it("busca e filtro de status funcionam dentro da loja", async () => {
    expect((await listLeads(users.userA.db, { q: "ana teste" })).rows.map((r) => r.id)).toEqual([leadA1.id]);
    expect((await listLeads(users.userA.db, { q: "(11) 98765-0002" })).rows.map((r) => r.id)).toEqual([leadA2]);
    expect((await listLeads(users.userA.db, { status: "WON" })).total).toBe(0);
  });

  it("STORE_ADMIN não enxerga a outra loja", async () => {
    const own = await listLeads(users.adminB.db, {});
    expect(own.rows.map((r) => r.id)).toEqual([leadB1]);
    expect(await getLeadDetail(users.adminB.db, leadA1.id)).toBeNull();
  });

  it("SUPER_ADMIN enxerga todas e pode filtrar por loja", async () => {
    const all = await listLeads(users.superAdmin.db, {});
    expect(all.rows.map((r) => r.id)).toEqual(expect.arrayContaining([leadA1.id, leadA2, leadB1]));
    const onlyB = await listLeads(users.superAdmin.db, { storeId: storeB });
    expect(onlyB.rows.map((r) => r.id)).toEqual([leadB1]);
  });

  it("dashboard conta somente o que o usuário pode ver", async () => {
    const userA = await getDashboardCounts(users.userA.db, {});
    expect(userA).toMatchObject({ total: 2, NEW: 2, CONTACTED: 0, WON: 0 });
    const superA = await getDashboardCounts(users.superAdmin.db, { storeId: storeA });
    expect(superA.total).toBe(2);
    const adminB = await getDashboardCounts(users.adminB.db, { storeId: storeA });
    expect(adminB.total).toBe(0);
  });

  it("paginação limita o tamanho da página", async () => {
    const page = await listLeads(users.userA.db, {}, 1, 1);
    expect(page.rows).toHaveLength(1);
    expect(page.pageCount).toBe(2);
  });
});

describe("detalhe do lead e CPF", () => {
  it("lead de outra loja não é encontrado", async () => {
    expect(await getLeadDetail(users.userA.db, leadB1)).toBeNull();
    expect(await getLeadDetail(users.userA.db, "nao-e-uuid")).toBeNull();
  });

  it("CPF completo não aparece na lista nem no detalhe", async () => {
    const list = await listLeads(users.userA.db, {});
    const detail = await getLeadDetail(users.userA.db, leadA1.id);
    const json = JSON.stringify({ list, detail });
    expect(json.includes(leadA1.cpf)).toBe(false);
    expect(detail?.cpfMasked).toBe(`***.${leadA1.cpf.slice(3, 6)}.${leadA1.cpf.slice(6, 9)}-**`);
    expect(detail).not.toHaveProperty("cpf");
  });

  it("form_data é formatado com o form_schema da campanha", async () => {
    const detail = await getLeadDetail(users.userA.db, leadA1.id);
    const entries = formatFormData(detail?.formData, detail?.formSchema);
    expect(entries.map((e) => [e.label, e.value.replace(/ /g, " ")])).toEqual(
      expect.arrayContaining([
        ["Valor da entrada", "R$ 15.000,00"],
        ["Possui carro na troca", "Sim"],
        ["Trade year", "2021"],
      ]),
    );
  });
});

describe("status e observações", () => {
  it("SDR sem ser o responsável não altera status nem observa; depois de assumir, sim", async () => {
    expect(await updateLeadStatus(users.userA.db, leadA1.id, "CONTACTED")).toBe(false);
    expect(await addLeadNote(users.userA.db, leadA1.id, "antes de assumir")).toEqual({ ok: false, reason: "forbidden" });
    expect(await assignLead(users.userA.db, leadA1.id, users.userA.id)).toEqual({ ok: true });
  });

  it("status pode ser alterado na própria loja (gera STATUS_CHANGED)", async () => {
    expect(await updateLeadStatus(users.userA.db, leadA1.id, "CONTACTED")).toBe(true);
    const { events } = await getLeadHistory(users.userA.db, leadA1.id);
    expect(events.map((e) => e.type)).toEqual(["CREATED", "ASSIGNED", "STATUS_CHANGED"]);
    expect(events[2].actor_id).toBe(users.userA.id);
  });

  it("status de lead de outra loja não pode ser alterado", async () => {
    expect(await updateLeadStatus(users.userA.db, leadB1, "LOST")).toBe(false);
    expect(await updateLeadStatus(users.adminB.db, leadA2, "LOST")).toBe(false);
    const rows = unwrap(await admin.from("leads").select("id, status").in("id", [leadB1, leadA2]), "status");
    expect(rows.every((r) => r.status === "NEW")).toBe(true);
  });

  it("nota pode ser adicionada na própria loja (autor definido pelo banco)", async () => {
    const result = await addLeadNote(users.userA.db, leadA1.id, "  Cliente pediu retorno às 15h.  ");
    expect(result.ok).toBe(true);

    const history = await getLeadHistory(users.userA.db, leadA1.id);
    expect(history.notes).toHaveLength(1);
    expect(history.notes[0]).toMatchObject({ body: "Cliente pediu retorno às 15h.", author_id: users.userA.id });

    const timeline = buildTimeline(history.events, history.notes, users.userA.id);
    expect(timeline.map((i) => i.kind)).toEqual(["created", "assigned", "status", "note"]);
    expect(timeline[3].actor).toBe("Você");
  });

  it("nota não pode ser adicionada em lead de outra loja", async () => {
    expect(await addLeadNote(users.userA.db, leadB1, "invasão")).toEqual({ ok: false, reason: "forbidden" });
    expect(await addLeadNote(users.adminB.db, leadA1.id, "invasão")).toEqual({ ok: false, reason: "forbidden" });
    expect(await addLeadNote(users.userA.db, leadA1.id, "   ")).toEqual({ ok: false, reason: "invalid" });
    const { count } = await admin.from("lead_notes").select("id", { count: "exact", head: true }).eq("lead_id", leadB1);
    expect(count).toBe(0);
  });
});

describe("equipe e configurações", () => {
  it("STORE_ADMIN vê membros só da própria loja", async () => {
    const own = await listStoreMembers(users.adminB.db, [storeB]);
    expect(own.map((m) => m.user_id)).toEqual([users.adminB.id]);
    expect(await listStoreMembers(users.adminB.db, [storeA])).toEqual([]);
  });

  it("usuário de loja não cria loja nem altera campanha", async () => {
    await expect(createStore(users.userA.db, { name: "x", slug: `${RUN}-x`, logoUrl: null })).rejects.toBeInstanceOf(ConfigError);
    await expect(rotateCampaignKey(users.adminB.db, campaignB)).rejects.toMatchObject({ code: "not_found" });
  });

  it("SUPER_ADMIN cria loja; editar campanha não muda a chave; rotação muda", async () => {
    await createStore(users.superAdmin.db, { name: "ADM Loja C", slug: `${RUN}-c`, logoUrl: null });

    const before = await getCampaign(users.superAdmin.db, campaignA);
    await updateCampaign(users.superAdmin.db, campaignA, {
      storeId: storeA,
      name: "ADM Camp A editada",
      slug: "camp-a",
      consentVersion: CONSENT,
      allowedOrigins: ["https://lp-adm-test.example"],
      formSchema: {},
      isActive: true,
    });
    const after = await getCampaign(users.superAdmin.db, campaignA);
    expect(after?.name).toBe("ADM Camp A editada");
    expect(after?.campaignKey).toBe(before?.campaignKey);

    const rotated = await rotateCampaignKey(users.superAdmin.db, campaignA);
    expect(rotated).toMatch(/^camp_pk_[a-z0-9]{32}$/);
    expect(rotated).not.toBe(before?.campaignKey);
  });
});

describe("fluxo de atendimento (vendedor STORE_USER)", () => {
  const statusTrail = (events: { type: string; payload: unknown }[]) =>
    events.filter((e) => e.type === "STATUS_CHANGED").map((e) => (e.payload as { to?: string } | null)?.to);

  it("Novo → Contatado → Em atendimento → Ganho, com observações na linha do tempo", async () => {
    const lead = (await insertLead(campaignA, "Diego Fluxo Ganho", "11987650004")).id;
    const db = users.userA.db;

    expect((await getLeadDetail(db, lead))?.status).toBe("NEW");
    expect(await assignLead(db, lead, users.userA.id)).toEqual({ ok: true });
    expect(await updateLeadStatus(db, lead, "CONTACTED")).toBe(true);
    expect((await addLeadNote(db, lead, "Primeiro contato pelo WhatsApp.")).ok).toBe(true);
    expect(await updateLeadStatus(db, lead, "IN_PROGRESS")).toBe(true);
    expect((await addLeadNote(db, lead, "Cliente vem à loja no sábado.")).ok).toBe(true);
    expect(await updateLeadStatus(db, lead, "WON")).toBe(true);

    expect((await getLeadDetail(db, lead))?.status).toBe("WON");
    const history = await getLeadHistory(db, lead);
    expect(history.events.map((e) => e.type)).toEqual(["CREATED", "ASSIGNED", "STATUS_CHANGED", "NOTE_ADDED", "STATUS_CHANGED", "NOTE_ADDED", "STATUS_CHANGED"]);
    expect(statusTrail(history.events)).toEqual(["CONTACTED", "IN_PROGRESS", "WON"]);
    expect(history.notes.map((n) => n.body)).toEqual(["Primeiro contato pelo WhatsApp.", "Cliente vem à loja no sábado."]);
    expect(history.events.filter((e) => e.type !== "CREATED").every((e) => e.actor_id === users.userA.id)).toBe(true);

    const timeline = buildTimeline(history.events, history.notes, users.userA.id);
    expect(timeline.map((i) => i.kind)).toEqual(["created", "assigned", "status", "note", "status", "note", "status"]);
  });

  it("Novo → Contatado → Perdido, com observação do motivo", async () => {
    const lead = (await insertLead(campaignA, "Elisa Fluxo Perdido", "11987650005")).id;
    const db = users.userA.db;
    expect(await assignLead(db, lead, users.userA.id)).toEqual({ ok: true });

    expect(await updateLeadStatus(db, lead, "CONTACTED")).toBe(true);
    expect((await addLeadNote(db, lead, "Cliente desistiu: comprou em outra loja.")).ok).toBe(true);
    expect(await updateLeadStatus(db, lead, "LOST")).toBe(true);

    const history = await getLeadHistory(db, lead);
    expect(statusTrail(history.events)).toEqual(["CONTACTED", "LOST"]);
    expect(history.events.map((e) => e.type)).toEqual(["CREATED", "ASSIGNED", "STATUS_CHANGED", "NOTE_ADDED", "STATUS_CHANGED"]);

    const counts = await getDashboardCounts(db, {});
    expect(counts).toMatchObject({ WON: 1, LOST: 1 });
  });
});

describe("operação SDR (camada de dados da Fase 9)", () => {
  it("SDR assume lead da fila; filtros Meus leads / Sem responsável", async () => {
    const queueBefore = await listLeads(users.userA.db, { unassigned: true });
    expect(queueBefore.rows.map((r) => r.id)).toContain(leadA2);
    expect(await assignLead(users.userA.db, leadA2, users.userA.id)).toEqual({ ok: true });
    const mine = await listLeads(users.userA.db, { assignedTo: users.userA.id });
    expect(mine.rows.map((r) => r.id)).toEqual(expect.arrayContaining([leadA1.id, leadA2]));
    expect(mine.rows.every((r) => r.assignedTo === users.userA.id)).toBe(true);
    const queue = await listLeads(users.userA.db, { unassigned: true });
    expect(queue.rows.map((r) => r.id)).not.toContain(leadA2);
  });

  it("SDR não atribui para outra pessoa; gerente de outra loja não alcança", async () => {
    expect(await assignLead(users.userA.db, leadA1.id, users.adminB.id)).toEqual({ ok: false, reason: "forbidden" });
    expect(await assignLead(users.adminB.db, leadA1.id, users.adminB.id)).toEqual({ ok: false, reason: "not_found" });
    expect(await assignLead(users.inactiveMember.db, leadA1.id, users.inactiveMember.id)).toEqual({ ok: false, reason: "not_found" });
  });

  it("linha do tempo mostra a atribuição com nome da equipe", async () => {
    const detail = await getLeadDetail(users.userA.db, leadA2);
    expect(detail?.assignedTo).toBe(users.userA.id);
    const history = await getLeadHistory(users.userA.db, leadA2);
    const team = await getStoreTeam(users.userA.db);
    const titles = buildTimeline(history.events, history.notes, users.userA.id, teamNames(team)).map((i) => i.title);
    expect(titles).toContain("Lead assumido por você");
  });

  it("CPF: SDR só no próprio lead; outra loja nunca", async () => {
    expect((await revealLeadCpf(users.userA.db, leadA1.id)) === leadA1.cpf).toBe(true);
    expect(await revealLeadCpf(users.adminB.db, leadA1.id)).toBeNull();
    const queued = (await insertLead(campaignA, "Fila CPF", "11987650006")).id;
    expect(await revealLeadCpf(users.userA.db, queued)).toBeNull();
    // Booleano: uma falha não imprime o CPF.
    expect(/^\d{11}$/.test((await revealLeadCpf(users.superAdmin.db, leadB1)) ?? "")).toBe(true);
  });

  it("KPIs: KAPA filtra por loja; SDR vê só a própria carteira", async () => {
    expect(await assignLead(users.superAdmin.db, leadB1, users.adminB.id)).toEqual({ ok: true });
    const storeBKpis = summarizeKpis(await getLeadKpis(users.superAdmin.db, { storeId: storeB }));
    expect(storeBKpis.total).toBe(1);
    expect(storeBKpis.byAssignee.get(users.adminB.id)?.total).toBe(1);

    const sdr = summarizeKpis(await getLeadKpis(users.userA.db, { storeId: storeA }));
    expect([...sdr.byAssignee.keys()]).toEqual([users.userA.id]);
    const mine = await listLeads(users.userA.db, { storeId: storeA, assignedTo: users.userA.id });
    expect(sdr.byAssignee.get(users.userA.id)?.total).toBe(mine.total);
    expect(sdr.byAssignee.get(users.userA.id)?.byStatus).toMatchObject({ WON: 1, LOST: 1 });
  });
});

describe("Novo usuário: Administrador Geral, Gerente e SDR", () => {
  const email = (label: string) => `${RUN}-novo-${label}@${TEST_EMAIL_DOMAIN}`;
  const input = (label: string, access: "SUPER_ADMIN" | "STORE_ADMIN" | "STORE_USER", storeId: string | null) => ({
    fullName: `Novo ${label}`,
    email: email(label),
    password: `${randomUUID()}Aa1!`,
    access,
    storeId,
  });

  async function authUserIds(address: string) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    return (data?.users ?? []).filter((u) => u.email === address).map((u) => u.id);
  }

  async function state(userId: string) {
    const profile = unwrap(await admin.from("profiles").select("is_super_admin, is_active, full_name").eq("id", userId).single(), "perfil");
    const memberships = unwrap(await admin.from("store_members").select("store_id, role, is_active").eq("user_id", userId), "vínculos");
    const audit = unwrap(await admin.from("user_creation_audit").select("access, store_id, created_by, email").eq("user_id", userId), "auditoria");
    return { profile, memberships, audit };
  }

  it("SUPER_ADMIN cria Administrador Geral: acesso global, sem vínculo, auditado", async () => {
    const data = input("global", "SUPER_ADMIN", null);
    const result = await createUserAccount(users.superAdmin.db, admin, data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const created = await state(result.userId);
    expect(created.profile).toEqual({ is_super_admin: true, is_active: true, full_name: "Novo global" });
    expect(created.memberships).toEqual([]);
    expect(created.audit).toEqual([{ access: "SUPER_ADMIN", store_id: null, created_by: users.superAdmin.id, email: data.email }]);
    expect(await getUserCreation(users.superAdmin.db, result.userId)).toMatchObject({ createdByName: "Super" });

    // Entra com a senha inicial e enxerga todas as lojas — inclusive uma criada depois.
    const db = await signIn(env.url, env.publishableKey, data.email, data.password);
    const later = unwrap(await admin.from("stores").insert({ slug: `${RUN}-futura`, name: "ADM Loja Futura" }).select("id").single(), "loja futura");
    const access = await loadAdminAccess(db, result.userId);
    expect(access.status === "ok" && access.context.role).toBe("SUPER_ADMIN");
    const ids = access.status === "ok" ? access.context.stores.map((s) => s.id) : [];
    expect(ids).toEqual(expect.arrayContaining([storeA, storeB, later.id]));
    expect((await listLeads(db, {})).total).toBeGreaterThanOrEqual(3);
    // É SUPER_ADMIN de verdade no banco: também cria o próximo usuário.
    expect((await createUserAccount(db, admin, input("por-global", "STORE_USER", storeA))).ok).toBe(true);
  });

  it("SUPER_ADMIN continua criando Gerente e SDR, vinculados à loja escolhida", async () => {
    const manager = await createUserAccount(users.superAdmin.db, admin, input("gerente", "STORE_ADMIN", storeA));
    const sdr = await createUserAccount(users.superAdmin.db, admin, input("sdr", "STORE_USER", storeB));
    if (!manager.ok || !sdr.ok) throw new Error("criação falhou");

    const m = await state(manager.userId);
    expect(m.profile.is_super_admin).toBe(false);
    expect(m.memberships).toEqual([{ store_id: storeA, role: "STORE_ADMIN", is_active: true }]);
    expect(m.audit).toEqual([expect.objectContaining({ access: "STORE_ADMIN", store_id: storeA, created_by: users.superAdmin.id })]);

    const s = await state(sdr.userId);
    expect(s.profile.is_super_admin).toBe(false);
    expect(s.memberships).toEqual([{ store_id: storeB, role: "STORE_USER", is_active: true }]);
  });

  it("Gerente e SDR não criam Administrador Geral (nem ninguém); a conta é desfeita", async () => {
    for (const [label, actor] of [["pelo-gerente", users.adminB], ["pelo-sdr", users.userA]] as const) {
      const global = input(label, "SUPER_ADMIN", null);
      expect(await createUserAccount(actor.db, admin, global)).toEqual({ ok: false, reason: "forbidden" });
      expect(await authUserIds(global.email)).toEqual([]);
      const store = input(`${label}-loja`, "STORE_USER", storeB);
      expect(await createUserAccount(actor.db, admin, store)).toEqual({ ok: false, reason: "forbidden" });
      expect(await authUserIds(store.email)).toEqual([]);
    }
  });

  it("via API: Gerente, SDR e anônimo não chamam a função nem se promovem pelo perfil", async () => {
    const target = await createTestUser(admin, email("alvo-api"), "Alvo API");
    for (const actor of [users.adminB, users.userA]) {
      expect((await actor.db.rpc("grant_new_user_access", { p_user_id: target.id, p_access: "SUPER_ADMIN" })).error?.code).toBe("KL011");
      expect((await actor.db.rpc("grant_new_user_access", { p_user_id: actor.id, p_access: "SUPER_ADMIN" })).error?.code).toBe("KL011");
      await actor.db.from("profiles").update({ is_super_admin: true }).eq("id", actor.id);
      await actor.db.from("user_creation_audit").insert({ user_id: actor.id, email: "x@example.com", access: "SUPER_ADMIN" });
      expect(unwrap(await admin.from("profiles").select("is_super_admin").eq("id", actor.id).single(), "perfil").is_super_admin).toBe(false);
      expect(unwrap(await actor.db.from("user_creation_audit").select("id"), "auditoria")).toEqual([]);
    }
    const anon = createClient<Database>(env.url, env.publishableKey, clientOptions);
    expect((await anon.rpc("grant_new_user_access", { p_user_id: target.id, p_access: "SUPER_ADMIN" })).error).not.toBeNull();
    expect(await state(target.id)).toMatchObject({ profile: { is_super_admin: false }, memberships: [], audit: [] });
  });

  it("a função não promove contas existentes, a si mesmo nem repete a concessão", async () => {
    const sa = users.superAdmin.db;
    expect((await sa.rpc("grant_new_user_access", { p_user_id: users.userA.id, p_access: "SUPER_ADMIN" })).error?.code).toBe("KL010");
    expect((await sa.rpc("grant_new_user_access", { p_user_id: users.superAdmin.id, p_access: "SUPER_ADMIN" })).error?.code).toBe("KL010");
    expect((await sa.rpc("grant_new_user_access", { p_user_id: users.inactive.id, p_access: "STORE_USER", p_store_id: storeA })).error?.code).toBe("KL010");

    const fresh = await createUserAccount(sa, admin, input("uma-vez", "STORE_USER", storeA));
    if (!fresh.ok) throw new Error("criação falhou");
    expect((await sa.rpc("grant_new_user_access", { p_user_id: fresh.userId, p_access: "SUPER_ADMIN" })).error?.code).toBe("KL010");
    expect((await state(fresh.userId)).profile.is_super_admin).toBe(false);

    // Combinações inválidas: global com loja, Gerente sem loja, tipo desconhecido.
    const target = await createTestUser(admin, email("combinacoes"), "Combinações");
    expect((await sa.rpc("grant_new_user_access", { p_user_id: target.id, p_access: "SUPER_ADMIN", p_store_id: storeA })).error?.code).toBe("22023");
    expect((await sa.rpc("grant_new_user_access", { p_user_id: target.id, p_access: "STORE_ADMIN" })).error?.code).toBe("22023");
    expect((await sa.rpc("grant_new_user_access", { p_user_id: target.id, p_access: "OWNER", p_store_id: storeA })).error?.code).toBe("22023");
    expect(await state(target.id)).toMatchObject({ profile: { is_super_admin: false }, memberships: [], audit: [] });
  });

  it("e-mail duplicado é recusado sem alterar a conta existente", async () => {
    const existing = await createTestUser(admin, email("duplicado"), "Original");
    const result = await createUserAccount(users.superAdmin.db, admin, { ...input("duplicado", "SUPER_ADMIN", null), fullName: "Outra pessoa" });
    expect(result).toEqual({ ok: false, reason: "duplicate" });
    expect(await authUserIds(existing.email)).toEqual([existing.id]);
    expect(await state(existing.id)).toMatchObject({ profile: { is_super_admin: false, full_name: "Original" }, memberships: [], audit: [] });
  });

  it("falha ao definir o acesso (loja inexistente) não deixa conta pela metade", async () => {
    const data = input("loja-invalida", "STORE_ADMIN", randomUUID());
    expect(await createUserAccount(users.superAdmin.db, admin, data)).toEqual({ ok: false, reason: "invalid" });
    expect(await authUserIds(data.email)).toEqual([]);
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("email", data.email);
    expect(count).toBe(0);
  });

  it("auditoria de criação: só a KAPA lê", async () => {
    expect(unwrap(await users.adminB.db.from("user_creation_audit").select("id"), "gerente")).toEqual([]);
    expect(unwrap(await users.userA.db.from("user_creation_audit").select("id"), "sdr")).toEqual([]);
    const kapa = unwrap(await users.superAdmin.db.from("user_creation_audit").select("id").like("email", `${RUN}-novo-%`), "kapa");
    expect(kapa.length).toBeGreaterThan(0);
  });
});
