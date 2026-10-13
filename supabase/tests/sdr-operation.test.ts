/**
 * Fase 9 — operação SDR, direto no banco (Supabase DEV) com sessões reais:
 * responsável pelo lead (assign_lead), CPF auditado (reveal_lead_cpf),
 * diretório da equipe (store_team) e KPIs (lead_kpis).
 *
 * Dados temporários com prefixo "sdr-test-". Roda junto com `npm run test:rls`
 * (exige ALLOW_REMOTE_RLS_TESTS=true). Nunca imprime CPF, chaves ou senhas.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/types/database";

import { TEST_EMAIL_DOMAIN, cleanupByPrefix, clientOptions, createTestUser, loadRemoteEnv, randomValidCpf, signIn, unwrap } from "./helpers";

const env = loadRemoteEnv("ALLOW_REMOTE_RLS_TESTS");
const PREFIX = "sdr-test-";
const RUN = `${PREFIX}${Date.now().toString(36)}`;

type Db = SupabaseClient<Database>;
const admin = createClient<Database>(env.url, env.secretKey, clientOptions);
const anon = createClient<Database>(env.url, env.publishableKey, clientOptions);

type U = { id: string; db: Db };
const u = {} as Record<"adminA" | "sdr1" | "sdr2" | "sdrB" | "adminB" | "superAdmin" | "inactiveUser" | "inactiveMember", U>;
let storeA: string;
let storeB: string;
let campA: string;
let campB: string;
const leads: Record<string, { id: string; cpf: string }> = {};

async function newLead(campaignId: string, name: string) {
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
        phone: "11987650000",
        consent_version: "test-v1",
        client_submission_id: randomUUID(),
      })
      .select("id")
      .single(),
    "lead",
  );
  return { id: row.id, cpf };
}

const assign = (db: Db, lead: string, to: string | null) => db.rpc("assign_lead", { p_lead_id: lead, p_assignee_id: to as string });
const reveal = (db: Db, lead: string) => db.rpc("reveal_lead_cpf", { p_lead_id: lead });
async function assignedTo(lead: string) {
  return unwrap(await admin.from("leads").select("assigned_to").eq("id", lead).single(), "lead").assigned_to;
}
async function events(lead: string, type: Database["public"]["Enums"]["lead_event_type"]) {
  return unwrap(await admin.from("lead_events").select("type, actor_id, payload").eq("lead_id", lead).eq("type", type).order("id"), "eventos");
}

beforeAll(async () => {
  await cleanupByPrefix(admin, PREFIX);

  const stores = unwrap(
    await admin.from("stores").insert([{ slug: `${RUN}-a`, name: "SDR Loja Alfa" }, { slug: `${RUN}-b`, name: "SDR Loja Beta" }]).select("id, slug"),
    "lojas",
  );
  storeA = stores.find((s) => s.slug.endsWith("-a"))!.id;
  storeB = stores.find((s) => s.slug.endsWith("-b"))!.id;
  const camps = unwrap(
    await admin
      .from("campaigns")
      .insert([
        { store_id: storeA, slug: "alfa", name: "SDR Campanha Alfa", consent_version: "test-v1" },
        { store_id: storeB, slug: "beta", name: "SDR Campanha Beta", consent_version: "test-v1" },
      ])
      .select("id, slug"),
    "campanhas",
  );
  campA = camps.find((c) => c.slug === "alfa")!.id;
  campB = camps.find((c) => c.slug === "beta")!.id;

  const members: Array<[keyof typeof u, string | null, "STORE_ADMIN" | "STORE_USER" | null]> = [
    ["adminA", storeA, "STORE_ADMIN"],
    ["sdr1", storeA, "STORE_USER"],
    ["sdr2", storeA, "STORE_USER"],
    ["sdrB", storeB, "STORE_USER"],
    ["adminB", storeB, "STORE_ADMIN"],
    ["superAdmin", null, null],
    ["inactiveUser", storeA, "STORE_USER"],
    ["inactiveMember", storeA, "STORE_USER"],
  ];
  for (const [key, store, role] of members) {
    const created = await createTestUser(admin, `${RUN}-${key.toLowerCase()}@${TEST_EMAIL_DOMAIN}`, `SDR Teste ${key}`);
    if (store && role) unwrap(await admin.from("store_members").insert({ store_id: store, user_id: created.id, role }).select("user_id"), "vínculo");
    u[key] = { id: created.id, db: (await signIn(env.url, env.publishableKey, created.email, created.password)) as Db };
  }
  unwrap(await admin.from("profiles").update({ is_super_admin: true }).eq("id", u.superAdmin.id).select("id"), "super");
  // Desativados DEPOIS do login: a sessão continua válida, o banco deve barrar.
  unwrap(await admin.from("profiles").update({ is_active: false }).eq("id", u.inactiveUser.id).select("id"), "inativo");
  unwrap(await admin.from("store_members").update({ is_active: false }).eq("user_id", u.inactiveMember.id).select("user_id"), "vínculo inativo");

  for (const name of ["a1", "a2", "a3", "a4", "a5", "a6"]) leads[name] = await newLead(campA, `SDR Lead ${name}`);
  leads.b1 = await newLead(campB, "SDR Lead b1");
});

afterAll(async () => {
  await cleanupByPrefix(admin, PREFIX);
});

describe("atribuição pelo gerente (STORE_ADMIN)", () => {
  it("atribui, reatribui e devolve para a fila, com ASSIGNED no histórico", async () => {
    expect((await assign(u.adminA.db, leads.a1.id, u.sdr1.id)).error).toBeNull();
    expect(await assignedTo(leads.a1.id)).toBe(u.sdr1.id);
    expect((await assign(u.adminA.db, leads.a1.id, u.sdr2.id)).error).toBeNull();
    expect(await assignedTo(leads.a1.id)).toBe(u.sdr2.id);
    expect((await assign(u.adminA.db, leads.a1.id, null)).error).toBeNull();
    expect(await assignedTo(leads.a1.id)).toBeNull();

    const ev = await events(leads.a1.id, "ASSIGNED");
    expect(ev.map((e) => e.payload)).toEqual([
      { from: null, to: u.sdr1.id },
      { from: u.sdr1.id, to: u.sdr2.id },
      { from: u.sdr2.id, to: null },
    ]);
    expect(ev.every((e) => e.actor_id === u.adminA.id)).toBe(true);
  });

  it("repetir o mesmo responsável não gera evento", async () => {
    await assign(u.adminA.db, leads.a6.id, u.sdr1.id);
    expect((await assign(u.adminA.db, leads.a6.id, u.sdr1.id)).error).toBeNull();
    expect(await events(leads.a6.id, "ASSIGNED")).toHaveLength(1);
  });

  it("pode atribuir a si mesmo (gerente também atende)", async () => {
    expect((await assign(u.adminA.db, leads.a5.id, u.adminA.id)).error).toBeNull();
    await assign(u.adminA.db, leads.a5.id, null);
  });

  it("não atribui para usuário de outra loja, inativo ou com vínculo inativo", async () => {
    for (const target of [u.sdrB.id, u.adminB.id, u.superAdmin.id, u.inactiveUser.id, u.inactiveMember.id, randomUUID()]) {
      expect((await assign(u.adminA.db, leads.a2.id, target)).error?.code).toBe("KL013");
    }
    expect(await assignedTo(leads.a2.id)).toBeNull();
  });

  it("não atribui lead de outra loja (responde como inexistente)", async () => {
    expect((await assign(u.adminA.db, leads.b1.id, u.sdr1.id)).error?.code).toBe("KL010");
    expect((await assign(u.adminB.db, leads.a2.id, u.sdrB.id)).error?.code).toBe("KL010");
    expect(await assignedTo(leads.b1.id)).toBeNull();
  });
});

describe("SDR (STORE_USER)", () => {
  it("assume um lead sem responsável para si", async () => {
    expect((await assign(u.sdr1.db, leads.a2.id, u.sdr1.id)).error).toBeNull();
    const [ev] = await events(leads.a2.id, "ASSIGNED");
    expect(ev).toMatchObject({ actor_id: u.sdr1.id, payload: { from: null, to: u.sdr1.id } });
  });

  it("não toma lead de outro SDR, não atribui para outra pessoa e não devolve para a fila", async () => {
    expect((await assign(u.sdr2.db, leads.a2.id, u.sdr2.id)).error?.code).toBe("KL012");
    expect((await assign(u.sdr2.db, leads.a3.id, u.sdr1.id)).error?.code).toBe("KL011");
    expect((await assign(u.sdr1.db, leads.a2.id, null)).error?.code).toBe("KL011");
    expect((await assign(u.sdr1.db, leads.a2.id, u.sdr2.id)).error?.code).toBe("KL011");
    expect(await assignedTo(leads.a2.id)).toBe(u.sdr1.id);
    expect(await assignedTo(leads.a3.id)).toBeNull();
  });

  it("SDR de outra loja não assume lead da Loja A", async () => {
    expect((await assign(u.sdrB.db, leads.a3.id, u.sdrB.id)).error?.code).toBe("KL010");
  });

  it("usuário inativo e vínculo inativo não assumem", async () => {
    expect((await assign(u.inactiveUser.db, leads.a3.id, u.inactiveUser.id)).error?.code).toBe("KL010");
    expect((await assign(u.inactiveMember.db, leads.a3.id, u.inactiveMember.id)).error?.code).toBe("KL010");
    expect(await assignedTo(leads.a3.id)).toBeNull();
  });

  it("dois SDRs assumindo ao mesmo tempo: só um fica com o lead", async () => {
    const [r1, r2] = await Promise.all([assign(u.sdr1.db, leads.a4.id, u.sdr1.id), assign(u.sdr2.db, leads.a4.id, u.sdr2.id)]);
    const errors = [r1.error?.code, r2.error?.code];
    expect(errors.filter((e) => e === undefined)).toHaveLength(1);
    expect(errors).toContain("KL012");
    expect(await events(leads.a4.id, "ASSIGNED")).toHaveLength(1);
  });

  it("manipular a requisição não escapa: UPDATE direto em assigned_to é negado para todos", async () => {
    for (const user of [u.sdr2, u.adminA]) {
      const res = await user.db.from("leads").update({ assigned_to: user.id }).eq("id", leads.a3.id).select("id");
      expect(res.error?.code).toBe("42501");
    }
    expect(await assignedTo(leads.a3.id)).toBeNull();
    expect((await assign(u.sdr1.db, "nao-e-uuid", u.sdr1.id)).error?.code).toBe("22P02");
    expect((await anon.rpc("assign_lead", { p_lead_id: leads.a3.id, p_assignee_id: u.sdr1.id })).error).not.toBeNull();
  });
});

describe("SUPER_ADMIN", () => {
  it("atribui em qualquer loja, só para membros ativos daquela loja", async () => {
    expect((await assign(u.superAdmin.db, leads.b1.id, u.sdrB.id)).error).toBeNull();
    expect((await assign(u.superAdmin.db, leads.b1.id, u.sdr1.id)).error?.code).toBe("KL013");
    expect(await assignedTo(leads.b1.id)).toBe(u.sdrB.id);
  });
});

describe("CPF", () => {
  it("coluna cpf continua inacessível (mascarado por padrão)", async () => {
    const res = await u.sdr1.db.from("leads").select("cpf").eq("id", leads.a1.id);
    expect(res.error).not.toBeNull();
    const masked = unwrap(await u.sdr1.db.from("leads").select("cpf_masked").eq("id", leads.a1.id).single(), "masked");
    expect(masked.cpf_masked?.includes(leads.a1.cpf)).toBe(false);
  });

  it("revelação autorizada (SDR, gerente, KAPA) devolve o CPF e grava CPF_REVEALED sem o CPF", async () => {
    const before = (await events(leads.a1.id, "CPF_REVEALED")).length;
    for (const user of [u.sdr1, u.sdr2, u.adminA, u.superAdmin]) {
      const res = await reveal(user.db, leads.a1.id);
      expect(res.error).toBeNull();
      expect(res.data === leads.a1.cpf).toBe(true); // booleano: falha não imprime o CPF
    }
    const ev = await events(leads.a1.id, "CPF_REVEALED");
    expect(ev).toHaveLength(before + 4);
    expect(ev.slice(-4).map((e) => e.actor_id)).toEqual([u.sdr1.id, u.sdr2.id, u.adminA.id, u.superAdmin.id]);
    expect(ev.every((e) => JSON.stringify(e.payload) === "{}")).toBe(true);
  });

  it("outra loja, inativo, vínculo inativo e anônimo: negado e sem evento", async () => {
    const before = (await events(leads.a1.id, "CPF_REVEALED")).length;
    for (const user of [u.sdrB, u.adminB, u.inactiveUser, u.inactiveMember]) {
      const res = await reveal(user.db, leads.a1.id);
      expect(res.error?.code).toBe("KL010");
      expect(res.data).toBeNull();
    }
    expect((await anon.rpc("reveal_lead_cpf", { p_lead_id: leads.a1.id })).data).toBeNull();
    expect(await events(leads.a1.id, "CPF_REVEALED")).toHaveLength(before);
  });

  it("CPF_REVEALED: gerente e KAPA veem; SDR não", async () => {
    const seen = async (db: Db) => unwrap(await db.from("lead_events").select("type").eq("lead_id", leads.a1.id), "ev").map((e) => e.type);
    expect(await seen(u.adminA.db)).toContain("CPF_REVEALED");
    expect(await seen(u.superAdmin.db)).toContain("CPF_REVEALED");
    const sdrSees = await seen(u.sdr1.db);
    expect(sdrSees).not.toContain("CPF_REVEALED");
    expect(sdrSees).toContain("ASSIGNED");
  });

  it("nenhum evento ou observação contém o CPF", async () => {
    const all = unwrap(await admin.from("lead_events").select("payload").in("lead_id", Object.values(leads).map((l) => l.id)), "todos");
    const text = JSON.stringify(all);
    for (const lead of Object.values(leads)) expect(text.includes(lead.cpf)).toBe(false);
  });
});

describe("equipe (store_team)", () => {
  it("SDR vê nome/papel dos colegas da própria loja, sem e-mail; nada da outra loja", async () => {
    const team = unwrap(await u.sdr1.db.rpc("store_team"), "team");
    expect(new Set(team.map((m) => m.store_id))).toEqual(new Set([storeA]));
    expect(team.map((m) => m.user_id)).toEqual(expect.arrayContaining([u.adminA.id, u.sdr1.id, u.sdr2.id]));
    expect(JSON.stringify(team)).not.toContain("@");
    expect(team.find((m) => m.user_id === u.inactiveMember.id)?.is_active).toBe(false);

    const teamB = unwrap(await u.sdrB.db.rpc("store_team"), "teamB");
    expect(teamB.every((m) => m.store_id === storeB)).toBe(true);
  });

  it("perfis continuam restritos (SDR não lê perfil de colega)", async () => {
    const profiles = unwrap(await u.sdr1.db.from("profiles").select("id"), "perfis");
    expect(profiles.map((p) => p.id)).toEqual([u.sdr1.id]);
  });
});

describe("KPIs (lead_kpis)", () => {
  // Estado: a1 sem resp.; a2 sdr1; a3 sem resp.; a4 sdr1 ou sdr2; a5 sem resp.; a6 sdr1.
  beforeAll(async () => {
    // SDR 1 atende a2: Novo → Contatado → Ganho (primeiro atendimento registrado).
    unwrap(await u.sdr1.db.from("leads").update({ status: "CONTACTED" }).eq("id", leads.a2.id).select("id"), "status");
    unwrap(await u.sdr1.db.from("leads").update({ status: "WON" }).eq("id", leads.a2.id).select("id"), "status");
    unwrap(await u.sdr1.db.from("leads").update({ status: "LOST" }).eq("id", leads.a6.id).select("id"), "status");
  });

  const kpis = async (db: Db, store?: string) => unwrap(await db.rpc("lead_kpis", store ? { p_store_id: store } : {}), "kpis");
  const sum = (rows: Awaited<ReturnType<typeof kpis>>, pred: (r: (typeof rows)[number]) => boolean) =>
    rows.filter(pred).reduce((acc, r) => acc + Number(r.leads), 0);

  it("gerente: contagens da loja inteira, por SDR e status", async () => {
    const rows = await kpis(u.adminA.db, storeA);
    expect(sum(rows, () => true)).toBe(6);
    expect(sum(rows, (r) => r.assigned_to === null)).toBe(3);
    expect(sum(rows, (r) => r.assigned_to === u.sdr1.id && r.status === "WON")).toBe(1);
    expect(sum(rows, (r) => r.assigned_to === u.sdr1.id && r.status === "LOST")).toBe(1);
    const won = rows.find((r) => r.assigned_to === u.sdr1.id && r.status === "WON")!;
    expect(Number(won.first_contact_leads)).toBe(1);
    expect(Number(won.first_contact_seconds)).toBeGreaterThanOrEqual(0);
  });

  it("SDR: só a própria carteira e a fila — nunca a de outro SDR", async () => {
    const rows = await kpis(u.sdr2.db, storeA);
    expect(rows.some((r) => r.assigned_to === u.sdr1.id)).toBe(false);
    expect(rows.every((r) => r.assigned_to === null || r.assigned_to === u.sdr2.id)).toBe(true);
    expect(sum(rows, (r) => r.assigned_to === null)).toBe(3);
  });

  it("outra loja não aparece; anônimo não acessa", async () => {
    expect(await kpis(u.sdrB.db, storeA)).toEqual([]);
    expect(sum(await kpis(u.adminB.db), () => true)).toBe(1);
    expect((await anon.rpc("lead_kpis", {})).error).not.toBeNull();
  });
});
