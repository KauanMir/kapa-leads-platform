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

import { ConfigError, createStore, getCampaign, listStoreMembers, rotateCampaignKey, updateCampaign } from "@/lib/admin/config";
import { addLeadNote, getDashboardCounts, getLeadDetail, getLeadHistory, listLeads, updateLeadStatus } from "@/lib/admin/leads";
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
    expect(json).not.toContain(leadA1.cpf);
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
  it("status pode ser alterado na própria loja (gera STATUS_CHANGED)", async () => {
    expect(await updateLeadStatus(users.userA.db, leadA1.id, "CONTACTED")).toBe(true);
    const { events } = await getLeadHistory(users.userA.db, leadA1.id);
    expect(events.map((e) => e.type)).toEqual(["CREATED", "STATUS_CHANGED"]);
    expect(events[1].actor_id).toBe(users.userA.id);
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
    expect(timeline.map((i) => i.kind)).toEqual(["created", "status", "note"]);
    expect(timeline[2].actor).toBe("Você");
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
    expect(await updateLeadStatus(db, lead, "CONTACTED")).toBe(true);
    expect((await addLeadNote(db, lead, "Primeiro contato pelo WhatsApp.")).ok).toBe(true);
    expect(await updateLeadStatus(db, lead, "IN_PROGRESS")).toBe(true);
    expect((await addLeadNote(db, lead, "Cliente vem à loja no sábado.")).ok).toBe(true);
    expect(await updateLeadStatus(db, lead, "WON")).toBe(true);

    expect((await getLeadDetail(db, lead))?.status).toBe("WON");
    const history = await getLeadHistory(db, lead);
    expect(history.events.map((e) => e.type)).toEqual(["CREATED", "STATUS_CHANGED", "NOTE_ADDED", "STATUS_CHANGED", "NOTE_ADDED", "STATUS_CHANGED"]);
    expect(statusTrail(history.events)).toEqual(["CONTACTED", "IN_PROGRESS", "WON"]);
    expect(history.notes.map((n) => n.body)).toEqual(["Primeiro contato pelo WhatsApp.", "Cliente vem à loja no sábado."]);
    expect(history.events.filter((e) => e.type !== "CREATED").every((e) => e.actor_id === users.userA.id)).toBe(true);

    const timeline = buildTimeline(history.events, history.notes, users.userA.id);
    expect(timeline.map((i) => i.kind)).toEqual(["created", "status", "note", "status", "note", "status"]);
  });

  it("Novo → Contatado → Perdido, com observação do motivo", async () => {
    const lead = (await insertLead(campaignA, "Elisa Fluxo Perdido", "11987650005")).id;
    const db = users.userA.db;

    expect(await updateLeadStatus(db, lead, "CONTACTED")).toBe(true);
    expect((await addLeadNote(db, lead, "Cliente desistiu: comprou em outra loja.")).ok).toBe(true);
    expect(await updateLeadStatus(db, lead, "LOST")).toBe(true);

    const history = await getLeadHistory(db, lead);
    expect(statusTrail(history.events)).toEqual(["CONTACTED", "LOST"]);
    expect(history.events.map((e) => e.type)).toEqual(["CREATED", "STATUS_CHANGED", "NOTE_ADDED", "STATUS_CHANGED"]);

    const counts = await getDashboardCounts(db, {});
    expect(counts).toMatchObject({ WON: 1, LOST: 1 });
  });
});
