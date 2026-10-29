/**
 * Fase 9 — operação SDR, direto no banco (Supabase DEV) com sessões reais:
 * responsável pelo lead (assign_lead), CPF auditado (reveal_lead_cpf),
 * diretório da equipe (store_team), KPIs (lead_kpis) e exclusão (delete_lead).
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

  for (const name of ["a1", "a2", "a3", "a4", "a5", "a6", "a7"]) leads[name] = await newLead(campA, `SDR Lead ${name}`);
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

describe("exclusividade: um único responsável por lead", () => {
  const race: string[] = [];
  let queueLead: string;
  let transferLead: string;

  beforeAll(async () => {
    for (let i = 0; i < 6; i++) race.push((await newLead(campA, `SDR Corrida ${i}`)).id);
    queueLead = (await newLead(campA, "SDR Fila Disponivel")).id;
    transferLead = (await newLead(campA, "SDR Transferencia")).id;
  });

  // Os blocos seguintes (KPIs, exclusão) contam os leads da Loja A: remove os deste bloco.
  afterAll(async () => {
    unwrap(await admin.from("leads").delete().in("id", [...race, queueLead, transferLead]).select("id"), "limpeza");
  });

  const available = async (db: Db) =>
    unwrap(await db.from("leads").select("id").eq("store_id", storeA).is("assigned_to", null), "fila").map((l) => l.id);

  it("disputas simultâneas (vários leads, cliques repetidos): cada lead fica com UM SDR e gera UM ASSIGNED", async () => {
    const attempts = race.flatMap((lead) => [u.sdr1, u.sdr2, u.sdr1, u.sdr2].map((user) => ({ lead, user })));
    const results = await Promise.all(attempts.map(async ({ lead, user }) => ({ lead, user, error: (await assign(user.db, lead, user.id)).error })));

    for (const lead of race) {
      const owner = await assignedTo(lead);
      expect([u.sdr1.id, u.sdr2.id]).toContain(owner);
      for (const r of results.filter((x) => x.lead === lead)) {
        // Quem não é o dono só pode ter recebido KL012; o dono, sucesso (repetir o clique não muda nada).
        if (r.user.id === owner) expect(r.error).toBeNull();
        else expect(r.error?.code).toBe("KL012");
      }
      const assigned = await events(lead, "ASSIGNED");
      expect(assigned).toHaveLength(1);
      expect(assigned[0]).toMatchObject({ actor_id: owner, payload: { from: null, to: owner } });
    }
  });

  it("lead assumido sai da fila de disponíveis dos demais — e não volta ao recarregar", async () => {
    expect(await available(u.sdr2.db)).toContain(queueLead);
    expect((await assign(u.sdr1.db, queueLead, u.sdr1.id)).error).toBeNull();
    // Cada consulta é uma nova leitura no banco (= atualizar a página).
    for (let i = 0; i < 3; i++) {
      expect(await available(u.sdr2.db)).not.toContain(queueLead);
      expect(await available(u.sdr1.db)).not.toContain(queueLead);
    }
    expect((await assign(u.sdr2.db, queueLead, u.sdr2.id)).error?.code).toBe("KL012");
    expect(await assignedTo(queueLead)).toBe(u.sdr1.id);
  });

  it("transferência só pela gestão, registrando anterior, novo, quem fez e quando; SDR não contorna", async () => {
    expect((await assign(u.sdr1.db, transferLead, u.sdr1.id)).error).toBeNull();
    // SDR não repassa, não devolve e não toma; gerente de outra loja nem enxerga.
    expect((await assign(u.sdr1.db, transferLead, u.sdr2.id)).error?.code).toBe("KL011");
    expect((await assign(u.sdr1.db, transferLead, null)).error?.code).toBe("KL011");
    expect((await assign(u.sdr2.db, transferLead, u.sdr2.id)).error?.code).toBe("KL012");
    expect((await assign(u.adminB.db, transferLead, u.sdrB.id)).error?.code).toBe("KL010");
    expect(await assignedTo(transferLead)).toBe(u.sdr1.id);

    const before = Date.now();
    expect((await assign(u.adminA.db, transferLead, u.sdr2.id)).error).toBeNull();
    const transfer = unwrap(
      await admin.from("lead_events").select("actor_id, payload, created_at").eq("lead_id", transferLead).eq("type", "ASSIGNED").order("id"),
      "eventos",
    );
    expect(transfer).toHaveLength(2);
    expect(transfer[1]).toMatchObject({ actor_id: u.adminA.id, payload: { from: u.sdr1.id, to: u.sdr2.id } });
    expect(Math.abs(new Date(transfer[1].created_at).getTime() - before)).toBeLessThan(60_000);

    // O antigo responsável não retoma; o novo trabalha.
    expect((await assign(u.sdr1.db, transferLead, u.sdr1.id)).error?.code).toBe("KL012");
    expect((await u.sdr1.db.from("leads").update({ status: "CONTACTED" }).eq("id", transferLead).select("id")).data).toEqual([]);
    expect(unwrap(await u.sdr2.db.from("leads").update({ status: "CONTACTED" }).eq("id", transferLead).select("id"), "status")).toHaveLength(1);

    // KAPA também transfere (visão global), com o próprio registro.
    expect((await assign(u.superAdmin.db, transferLead, u.sdr1.id)).error).toBeNull();
    expect((await events(transferLead, "ASSIGNED")).at(-1)).toMatchObject({ actor_id: u.superAdmin.id, payload: { from: u.sdr2.id, to: u.sdr1.id } });
  });

  it("histórico de atribuição não pode ser forjado nem apagado pela API", async () => {
    for (const user of [u.sdr1, u.adminA]) {
      const forged = await user.db.from("lead_events").insert({ lead_id: transferLead, store_id: storeA, type: "ASSIGNED", actor_id: user.id, payload: {} });
      expect(forged.error).not.toBeNull();
      expect((await user.db.from("lead_events").delete().eq("lead_id", transferLead).select("id")).data ?? []).toEqual([]);
    }
    expect(await events(transferLead, "ASSIGNED")).toHaveLength(3);
  });

  it("visão: SUPER_ADMIN vê as duas lojas; gerente e SDR só a própria", async () => {
    const storesSeen = async (db: Db) => new Set(unwrap(await db.from("leads").select("store_id").in("store_id", [storeA, storeB]), "leads").map((l) => l.store_id));
    expect(await storesSeen(u.superAdmin.db)).toEqual(new Set([storeA, storeB]));
    expect(await storesSeen(u.adminA.db)).toEqual(new Set([storeA]));
    expect(await storesSeen(u.sdr2.db)).toEqual(new Set([storeA]));
    expect(await storesSeen(u.sdrB.db)).toEqual(new Set([storeB]));
  });
});

describe("SUPER_ADMIN", () => {
  it("atribui em qualquer loja, só para membros ativos daquela loja", async () => {
    expect((await assign(u.superAdmin.db, leads.b1.id, u.sdrB.id)).error).toBeNull();
    expect((await assign(u.superAdmin.db, leads.b1.id, u.sdr1.id)).error?.code).toBe("KL013");
    expect(await assignedTo(leads.b1.id)).toBe(u.sdrB.id);
  });
});

const setStatus = async (db: Db, lead: string, status: Database["public"]["Enums"]["lead_status"]) => {
  const res = await db.from("leads").update({ status }).eq("id", lead).select("id");
  return res.error ? -1 : (res.data ?? []).length; // RLS: 0 linhas = sem permissão
};
const addNote = async (db: Db, lead: string) => {
  // store_id/author_id vêm do trigger; o usuário só envia lead_id e body.
  const note = { lead_id: lead, body: "Observação de teste SDR." } as Database["public"]["Tables"]["lead_notes"]["Insert"];
  return (await db.from("lead_notes").insert(note).select("id").single()).error === null;
};
const statusOf = async (lead: string) => unwrap(await admin.from("leads").select("status").eq("id", lead).single(), "status").status;
const revealCount = async (lead: string) => (await events(lead, "CPF_REVEALED")).length;
const revealsOk = async (db: Db, lead: { id: string; cpf: string }) => {
  const res = await reveal(db, lead.id);
  return res.error === null && res.data === lead.cpf; // booleano: falha não imprime o CPF
};

describe("responsável tem efeito real (status, observação, CPF)", () => {
  it("lead sem responsável: SDR vê, mas não altera status, não observa e não revela CPF antes de assumir", async () => {
    const seen = unwrap(await u.sdr1.db.from("leads").select("id, assigned_to").eq("id", leads.a7.id), "ver");
    expect(seen).toEqual([{ id: leads.a7.id, assigned_to: null }]);
    expect(await setStatus(u.sdr1.db, leads.a7.id, "CONTACTED")).toBe(0);
    expect(await addNote(u.sdr1.db, leads.a7.id)).toBe(false);
    expect((await reveal(u.sdr1.db, leads.a7.id)).error?.code).toBe("KL011");
    expect(await statusOf(leads.a7.id)).toBe("NEW");
    expect(await revealCount(leads.a7.id)).toBe(0);
  });

  it("depois de assumir, o SDR trabalha normalmente", async () => {
    expect((await assign(u.sdr1.db, leads.a7.id, u.sdr1.id)).error).toBeNull();
    expect(await setStatus(u.sdr1.db, leads.a7.id, "CONTACTED")).toBe(1);
    expect(await addNote(u.sdr1.db, leads.a7.id)).toBe(true);
    expect(await revealsOk(u.sdr1.db, leads.a7)).toBe(true);
    expect(await statusOf(leads.a7.id)).toBe("CONTACTED");
  });

  it("SDR A não trabalha o lead do SDR B (vê o responsável, mas não altera, não observa, não revela, não assume)", async () => {
    const seen = unwrap(await u.sdr2.db.from("leads").select("assigned_to").eq("id", leads.a7.id).single(), "ver");
    expect(seen.assigned_to).toBe(u.sdr1.id);
    const reveals = await revealCount(leads.a7.id);
    expect(await setStatus(u.sdr2.db, leads.a7.id, "WON")).toBe(0);
    expect(await addNote(u.sdr2.db, leads.a7.id)).toBe(false);
    expect((await reveal(u.sdr2.db, leads.a7.id)).error?.code).toBe("KL011");
    expect((await assign(u.sdr2.db, leads.a7.id, u.sdr2.id)).error?.code).toBe("KL012");
    expect((await assign(u.sdr2.db, leads.a7.id, null)).error?.code).toBe("KL011");
    expect(await statusOf(leads.a7.id)).toBe("CONTACTED");
    expect(await assignedTo(leads.a7.id)).toBe(u.sdr1.id);
    expect(await revealCount(leads.a7.id)).toBe(reveals);
  });

  it("gerente opera qualquer lead da loja e reatribui; o novo responsável assume o trabalho", async () => {
    expect(await setStatus(u.adminA.db, leads.a7.id, "IN_PROGRESS")).toBe(1);
    expect(await addNote(u.adminA.db, leads.a7.id)).toBe(true);
    expect(await revealsOk(u.adminA.db, leads.a7)).toBe(true);
    expect((await assign(u.adminA.db, leads.a7.id, u.sdr2.id)).error).toBeNull();

    // SDR B agora faz tudo no próprio lead…
    expect(await setStatus(u.sdr2.db, leads.a7.id, "WON")).toBe(1);
    expect(await addNote(u.sdr2.db, leads.a7.id)).toBe(true);
    expect(await revealsOk(u.sdr2.db, leads.a7)).toBe(true);
    // …e o SDR A perdeu o acesso de trabalho.
    expect(await setStatus(u.sdr1.db, leads.a7.id, "LOST")).toBe(0);
    expect(await addNote(u.sdr1.db, leads.a7.id)).toBe(false);
    expect((await reveal(u.sdr1.db, leads.a7.id)).error?.code).toBe("KL011");
    expect(await statusOf(leads.a7.id)).toBe("WON");
  });

  it("outra loja, usuário inativo e vínculo inativo continuam bloqueados", async () => {
    const reveals = await revealCount(leads.a7.id);
    for (const user of [u.sdrB, u.adminB, u.inactiveUser, u.inactiveMember]) {
      expect(await setStatus(user.db, leads.a7.id, "LOST")).toBe(0);
      expect(await addNote(user.db, leads.a7.id)).toBe(false);
      expect((await reveal(user.db, leads.a7.id)).error?.code).toBe("KL010");
    }
    expect(await statusOf(leads.a7.id)).toBe("WON");
    expect(await revealCount(leads.a7.id)).toBe(reveals);
  });

  it("SUPER_ADMIN continua operando", async () => {
    expect(await setStatus(u.superAdmin.db, leads.a7.id, "WON")).toBe(1);
    expect(await addNote(u.superAdmin.db, leads.a7.id)).toBe(true);
    expect(await revealsOk(u.superAdmin.db, leads.a7)).toBe(true);
  });

  it("linha do tempo: ASSIGNED, STATUS_CHANGED, NOTE_ADDED e CPF_REVEALED com os autores certos", async () => {
    const all = unwrap(await admin.from("lead_events").select("type, actor_id").eq("lead_id", leads.a7.id).order("id"), "ev");
    const who = (id: string | null) =>
      id === u.sdr1.id ? "sdr1" : id === u.sdr2.id ? "sdr2" : id === u.adminA.id ? "gerente" : id === u.superAdmin.id ? "kapa" : "sistema";
    expect(all.map((e) => `${e.type}:${who(e.actor_id)}`)).toEqual([
      "CREATED:sistema",
      "ASSIGNED:sdr1",
      "STATUS_CHANGED:sdr1",
      "NOTE_ADDED:sdr1",
      "CPF_REVEALED:sdr1",
      "STATUS_CHANGED:gerente",
      "NOTE_ADDED:gerente",
      "CPF_REVEALED:gerente",
      "ASSIGNED:gerente",
      "STATUS_CHANGED:sdr2",
      "NOTE_ADDED:sdr2",
      "CPF_REVEALED:sdr2",
      "NOTE_ADDED:kapa",
      "CPF_REVEALED:kapa",
    ]);
  });
});

describe("CPF", () => {
  it("coluna cpf continua inacessível (mascarado por padrão)", async () => {
    const res = await u.sdr1.db.from("leads").select("cpf").eq("id", leads.a1.id);
    expect(res.error).not.toBeNull();
    const masked = unwrap(await u.sdr1.db.from("leads").select("cpf_masked").eq("id", leads.a1.id).single(), "masked");
    expect(masked.cpf_masked?.includes(leads.a1.cpf)).toBe(false);
  });

  it("responsável (SDR), gerente e KAPA revelam; cada revelação grava CPF_REVEALED sem o CPF", async () => {
    // a2 é do sdr1 (assumido acima).
    const before = await revealCount(leads.a2.id);
    for (const user of [u.sdr1, u.adminA, u.superAdmin]) expect(await revealsOk(user.db, leads.a2)).toBe(true);
    const ev = await events(leads.a2.id, "CPF_REVEALED");
    expect(ev).toHaveLength(before + 3);
    expect(ev.slice(-3).map((e) => e.actor_id)).toEqual([u.sdr1.id, u.adminA.id, u.superAdmin.id]);
    expect(ev.every((e) => JSON.stringify(e.payload) === "{}")).toBe(true);
  });

  it("SDR que não é o responsável (lead de outro ou sem responsável): negado e sem evento", async () => {
    const before2 = await revealCount(leads.a2.id);
    const before1 = await revealCount(leads.a1.id);
    expect((await reveal(u.sdr2.db, leads.a2.id)).error?.code).toBe("KL011");
    expect((await reveal(u.sdr1.db, leads.a1.id)).error?.code).toBe("KL011");
    expect(await revealCount(leads.a2.id)).toBe(before2);
    expect(await revealCount(leads.a1.id)).toBe(before1);
  });

  it("outra loja, inativo, vínculo inativo e anônimo: negado e sem evento", async () => {
    const before = await revealCount(leads.a2.id);
    for (const user of [u.sdrB, u.adminB, u.inactiveUser, u.inactiveMember]) {
      const res = await reveal(user.db, leads.a2.id);
      expect(res.error?.code).toBe("KL010");
      expect(res.data).toBeNull();
    }
    expect((await anon.rpc("reveal_lead_cpf", { p_lead_id: leads.a2.id })).data).toBeNull();
    expect(await revealCount(leads.a2.id)).toBe(before);
  });

  it("CPF_REVEALED: gerente e KAPA veem; SDR não", async () => {
    const seen = async (db: Db) => unwrap(await db.from("lead_events").select("type").eq("lead_id", leads.a2.id), "ev").map((e) => e.type);
    expect(await seen(u.adminA.db)).toContain("CPF_REVEALED");
    expect(await seen(u.superAdmin.db)).toContain("CPF_REVEALED");
    const sdrSees = await seen(u.sdr1.db);
    expect(sdrSees).not.toContain("CPF_REVEALED");
    expect(sdrSees).toContain("ASSIGNED");
  });

  it("nenhum evento ou observação contém o CPF", async () => {
    const ids = Object.values(leads).map((l) => l.id);
    const all = unwrap(await admin.from("lead_events").select("payload").in("lead_id", ids), "eventos");
    const notes = unwrap(await admin.from("lead_notes").select("body").in("lead_id", ids), "notas");
    const text = JSON.stringify([all, notes]);
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
  // Estado: a1 sem resp.; a2 sdr1; a3 sem resp.; a4 sdr1 ou sdr2; a5 sem resp.; a6 sdr1; a7 sdr2 (ganho).
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
    expect(sum(rows, () => true)).toBe(7);
    expect(sum(rows, (r) => r.assigned_to === u.sdr2.id && r.status === "WON")).toBe(1);
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

describe("excluir lead (delete_lead)", () => {
  const del = (db: Db, lead: string) => db.rpc("delete_lead", { p_lead_id: lead });
  async function exists(lead: string) {
    return unwrap(await admin.from("leads").select("id").eq("id", lead), "lead").length === 1;
  }
  async function related(lead: string) {
    const notes = unwrap(await admin.from("lead_notes").select("id").eq("lead_id", lead), "notas").length;
    const evs = unwrap(await admin.from("lead_events").select("id").eq("lead_id", lead), "eventos").length;
    return { notes, evs };
  }
  // Lead com responsável, status, observação e CPF revelado (histórico completo).
  async function fullLead(campaignId: string, name: string, worker: U) {
    const lead = await newLead(campaignId, name);
    unwrap(await admin.from("leads").update({ assigned_to: worker.id }).eq("id", lead.id).select("id"), "resp");
    unwrap(await worker.db.from("leads").update({ status: "CONTACTED" }).eq("id", lead.id).select("id"), "status");
    expect(await addNote(worker.db, lead.id)).toBe(true);
    unwrap(await worker.db.rpc("reveal_lead_cpf", { p_lead_id: lead.id }), "cpf");
    return lead.id;
  }

  it("gerente exclui lead da própria loja: lead, observações e histórico saem; loja, campanha, usuários e outros leads ficam", async () => {
    const id = await fullLead(campA, "SDR Lead del-a", u.sdr1);
    expect(await related(id)).toMatchObject({ notes: 1 });
    expect((await related(id)).evs).toBeGreaterThanOrEqual(5); // CREATED, ASSIGNED, STATUS_CHANGED, NOTE_ADDED, CPF_REVEALED
    const othersBefore = unwrap(await admin.from("leads").select("id").eq("store_id", storeA).neq("id", id), "outros").length;

    expect((await del(u.adminA.db, id)).error).toBeNull();

    expect(await exists(id)).toBe(false);
    expect(await related(id)).toEqual({ notes: 0, evs: 0 });
    expect(unwrap(await admin.from("leads").select("id").eq("store_id", storeA), "outros")).toHaveLength(othersBefore);
    expect(unwrap(await admin.from("stores").select("id").in("id", [storeA, storeB]), "lojas")).toHaveLength(2);
    expect(unwrap(await admin.from("campaigns").select("id").in("id", [campA, campB]), "campanhas")).toHaveLength(2);
    expect(unwrap(await admin.from("profiles").select("id").in("id", [u.adminA.id, u.sdr1.id]), "perfis")).toHaveLength(2);
    expect((await del(u.adminA.db, id)).error?.code).toBe("KL010"); // já não existe
  });

  it("gerente de outra loja, SDR (mesmo responsável), usuário inativo e vínculo inativo não excluem", async () => {
    const id = await fullLead(campA, "SDR Lead del-b", u.sdr1);
    const before = await related(id);
    expect((await del(u.adminB.db, id)).error?.code).toBe("KL010");
    expect((await del(u.sdrB.db, id)).error?.code).toBe("KL010");
    expect((await del(u.sdr1.db, id)).error?.code).toBe("KL011");
    expect((await del(u.sdr2.db, id)).error?.code).toBe("KL011");
    expect((await del(u.inactiveUser.db, id)).error?.code).toBe("KL010");
    expect((await del(u.inactiveMember.db, id)).error?.code).toBe("KL010");
    expect((await anon.rpc("delete_lead", { p_lead_id: id })).error).not.toBeNull();
    expect(await exists(id)).toBe(true);
    expect(await related(id)).toEqual(before);
  });

  it("gerente com perfil ou vínculo desativado não exclui", async () => {
    const id = await fullLead(campA, "SDR Lead del-c", u.sdr1);
    try {
      unwrap(await admin.from("store_members").update({ is_active: false }).eq("user_id", u.adminA.id).select("user_id"), "vínculo");
      expect((await del(u.adminA.db, id)).error?.code).toBe("KL010");
      unwrap(await admin.from("store_members").update({ is_active: true }).eq("user_id", u.adminA.id).select("user_id"), "vínculo");
      unwrap(await admin.from("profiles").update({ is_active: false }).eq("id", u.adminA.id).select("id"), "perfil");
      expect((await del(u.adminA.db, id)).error?.code).toBe("KL010");
    } finally {
      await admin.from("store_members").update({ is_active: true }).eq("user_id", u.adminA.id);
      await admin.from("profiles").update({ is_active: true }).eq("id", u.adminA.id);
    }
    expect(await exists(id)).toBe(true);
  });

  it("request manipulado: DELETE direto em leads/observações/histórico é negado para todos; id inválido não passa", async () => {
    const id = await fullLead(campA, "SDR Lead del-d", u.sdr1);
    const before = await related(id);
    for (const user of [u.adminA, u.sdr1, u.superAdmin]) {
      expect((await user.db.from("leads").delete().eq("id", id).select("id")).error?.code).toBe("42501");
      expect((await user.db.from("leads").delete().eq("store_id", storeA)).error?.code).toBe("42501");
      expect((await user.db.from("lead_notes").delete().eq("lead_id", id)).error?.code).toBe("42501");
      expect((await user.db.from("lead_events").delete().eq("lead_id", id)).error?.code).toBe("42501");
    }
    expect((await del(u.adminA.db, "nao-e-uuid")).error?.code).toBe("22P02");
    expect((await del(u.adminA.db, randomUUID())).error?.code).toBe("KL010");
    expect(await exists(id)).toBe(true);
    expect(await related(id)).toEqual(before);
  });

  it("SUPER_ADMIN exclui em qualquer loja", async () => {
    const id = await fullLead(campB, "SDR Lead del-e", u.adminB);
    expect((await del(u.superAdmin.db, id)).error).toBeNull();
    expect(await exists(id)).toBe(false);
    expect(await related(id)).toEqual({ notes: 0, evs: 0 });
  });
});

describe("bloqueio de CPF (10 dias úteis) x exclusão do lead", () => {
  let campRule: string;
  let campRuleB: string;
  const RULES = {
    consent_version: "test-v1",
    cpf_cooldown_business_days: 10,
    illustrative_min_cents: 3_500_000,
    illustrative_max_cents: 8_000_000,
    illustrative_step_cents: 5_000,
    illustrative_validity_hours: 36,
  };

  beforeAll(async () => {
    const rows = unwrap(
      await admin
        .from("campaigns")
        .insert([
          { store_id: storeA, slug: "fabrica", name: "SDR Campanha Fabrica", ...RULES },
          { store_id: storeB, slug: "fabrica", name: "SDR Campanha Fabrica Beta", ...RULES },
        ])
        .select("id, store_id"),
      "campanhas com bloqueio",
    );
    campRule = rows.find((c) => c.store_id === storeA)!.id;
    campRuleB = rows.find((c) => c.store_id === storeB)!.id;
  });

  /** Novo pedido (outro clientSubmissionId) com o CPF; o trigger aplica o bloqueio. */
  const tryLead = (cpf: string, campaignId = campRule) =>
    admin
      .from("leads")
      .insert({
        campaign_id: campaignId,
        store_id: "00000000-0000-0000-0000-000000000000",
        full_name: "SDR Lead bloqueio",
        cpf,
        birth_date: "1990-05-20",
        phone: "11987650000",
        consent_version: "test-v1",
        client_submission_id: randomUUID(),
      })
      .select("id")
      .single();
  /** Exclusão; `release` = opção LGPD, que exige a identidade verificada (por padrão, confirmada junto). */
  const del = (db: Db, lead: string, release?: boolean, identity = release) =>
    db.rpc("delete_lead", {
      p_lead_id: lead,
      ...(release === undefined ? {} : { p_release_cpf_cooldown: release, p_identity_verified: identity }),
    });

  it("exclusão operacional (gerente ou KAPA) NÃO libera o CPF: novo pedido continua bloqueado", async () => {
    for (const who of [u.adminA, u.superAdmin]) {
      const cpf = randomValidCpf();
      const first = await tryLead(cpf);
      expect(first.error).toBeNull();
      expect((await del(who.db, first.data!.id)).error).toBeNull();
      expect(unwrap(await admin.from("leads").select("id").eq("cpf", cpf), "leads do CPF")).toHaveLength(0);
      expect((await tryLead(cpf)).error?.code).toBe("KL005");
    }
  });

  it("gerente não consegue liberar o bloqueio (nem pedindo): KL011 e o lead fica", async () => {
    const cpf = randomValidCpf();
    const first = await tryLead(cpf);
    expect((await del(u.adminA.db, first.data!.id, true)).error?.code).toBe("KL011");
    expect(unwrap(await admin.from("leads").select("id").eq("id", first.data!.id), "lead")).toHaveLength(1);
    for (const user of [u.sdr1, u.adminB]) expect((await del(user.db, first.data!.id, true)).error?.code).toMatch(/KL01[01]/);
    expect((await tryLead(cpf)).error?.code).toBe("KL005");
  });

  it("pedido do titular (LGPD), só KAPA: exclui o lead E o bloqueio; o CPF pode pedir de novo", async () => {
    const cpf = randomValidCpf();
    const first = await tryLead(cpf);
    // Sem confirmar a verificação de identidade: recusado, nada muda.
    expect((await del(u.superAdmin.db, first.data!.id, true, false)).error?.code).toBe("22023");
    expect(unwrap(await admin.from("leads").select("id").eq("id", first.data!.id), "lead")).toHaveLength(1);
    expect((await del(u.superAdmin.db, first.data!.id, true)).error).toBeNull();
    const [audit] = unwrap(
      await admin.from("lgpd_cpf_cooldown_releases").select("store_id, reason, channel, record_found, performed_by").order("id", { ascending: false }).limit(1),
      "auditoria",
    );
    expect(audit).toEqual({ store_id: storeA, reason: "ELIMINACAO", channel: "EXCLUSAO_LEAD", record_found: true, performed_by: u.superAdmin.id });
    expect(unwrap(await admin.from("leads").select("id").eq("cpf", cpf), "leads do CPF")).toHaveLength(0);
    const again = await tryLead(cpf);
    expect(again.error).toBeNull();
    // ... e o novo pedido volta a bloquear.
    expect((await tryLead(cpf)).error?.code).toBe("KL005");
  });

  it("liberar um CPF não libera outro CPF", async () => {
    const [cpf1, cpf2] = [randomValidCpf(), randomValidCpf()];
    const a = await tryLead(cpf1);
    await tryLead(cpf2);
    expect((await del(u.superAdmin.db, a.data!.id, true)).error).toBeNull();
    expect((await tryLead(cpf2)).error?.code).toBe("KL005");
    expect((await tryLead(cpf1)).error).toBeNull();
  });

  it("o registro do bloqueio e a chave ficam fora do alcance da API (anon, usuários e chave secreta)", async () => {
    for (const db of [anon, u.superAdmin.db, admin] as Db[]) {
      const schema = db.schema("private" as "public");
      expect((await schema.from("cpf_cooldowns" as "leads").select("*")).error).not.toBeNull();
      expect((await schema.from("secrets" as "leads").select("*")).error).not.toBeNull();
    }
    // Coluna informativa do lead também não é legível pelo Admin.
    expect((await u.adminA.db.from("leads").select("cpf_cooldown_until").limit(1)).error?.code).toBe("42501");
  });

  describe("Pedidos LGPD no painel (lgpd_cpf_cooldown_lookup / lgpd_release_cpf_cooldown)", () => {
    const lookup = (db: Db, cpf: string) => db.rpc("lgpd_cpf_cooldown_lookup", { p_cpf: cpf });
    const release = (db: Db, storeId: string, cpf: string, reason = "ELIMINACAO", identity = true) =>
      db.rpc("lgpd_release_cpf_cooldown", { p_store_id: storeId, p_cpf: cpf, p_reason: reason, p_identity_verified: identity });
    const lastAudit = async () =>
      unwrap(await admin.from("lgpd_cpf_cooldown_releases").select("*").order("id", { ascending: false }).limit(1), "auditoria")[0];

    it("lead JÁ excluído pela loja: a KAPA encontra o registro e o elimina; o CPF volta a poder pedir", async () => {
      const cpf = randomValidCpf();
      const first = await tryLead(cpf);
      expect((await del(u.adminA.db, first.data!.id)).error).toBeNull(); // exclusão operacional
      expect((await tryLead(cpf)).error?.code).toBe("KL005");

      const found = unwrap(await lookup(u.superAdmin.db, cpf), "consulta");
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ store_id: storeA, store_name: expect.any(String), active: true });
      expect(Object.keys(found[0]).sort()).toEqual(["active", "blocked_until", "store_id", "store_name"]);

      expect(unwrap(await release(u.superAdmin.db, storeA, cpf, "OPOSICAO"), "eliminar")).toBe(true);
      expect(unwrap(await lookup(u.superAdmin.db, cpf), "consulta depois")).toEqual([]);
      expect((await tryLead(cpf)).error).toBeNull();

      const audit = await lastAudit();
      expect(audit).toMatchObject({ store_id: storeA, reason: "OPOSICAO", channel: "PAINEL_LGPD", identity_verified: true, record_found: true, performed_by: u.superAdmin.id });
      // Auditoria mínima: nenhuma coluna com CPF, código do CPF, lead ou nome.
      expect(Object.keys(audit).sort()).toEqual(["channel", "created_at", "id", "identity_verified", "performed_by", "reason", "record_found", "store_id"]);
      expect(JSON.stringify(audit)).not.toContain(cpf);
    });

    it("isolamento: eliminar na loja A não libera a loja B (ex.: RCAR x Vitrine)", async () => {
      const cpf = randomValidCpf();
      await tryLead(cpf, campRule);
      await tryLead(cpf, campRuleB);
      expect(unwrap(await lookup(u.superAdmin.db, cpf), "consulta").map((r) => r.store_id).sort()).toEqual([storeA, storeB].sort());
      expect(unwrap(await release(u.superAdmin.db, storeA, cpf, "USO_INDEVIDO_TERCEIRO"), "eliminar A")).toBe(true);
      expect((await tryLead(cpf, campRule)).error).toBeNull();
      expect((await tryLead(cpf, campRuleB)).error?.code).toBe("KL005");
    });

    it("sem registro: nada é apagado, mas o pedido fica auditado (record_found = false)", async () => {
      const cpf = randomValidCpf();
      expect(unwrap(await lookup(u.superAdmin.db, cpf), "consulta")).toEqual([]);
      expect(unwrap(await release(u.superAdmin.db, storeA, cpf), "eliminar")).toBe(false);
      expect(await lastAudit()).toMatchObject({ store_id: storeA, record_found: false, channel: "PAINEL_LGPD" });
    });

    it("gerente, SDR, usuário inativo e anônimo não consultam nem eliminam; nada muda", async () => {
      const cpf = randomValidCpf();
      await tryLead(cpf);
      for (const user of [u.adminA, u.sdr1, u.adminB, u.inactiveUser]) {
        expect((await lookup(user.db, cpf)).error?.code, "consulta").toMatch(/KL011|42501/);
        expect((await release(user.db, storeA, cpf)).error?.code, "eliminar").toMatch(/KL011|42501/);
      }
      expect((await lookup(anon, cpf)).error).not.toBeNull();
      expect((await release(anon, storeA, cpf)).error).not.toBeNull();
      expect((await tryLead(cpf)).error?.code).toBe("KL005");
    });

    it("entrada inválida é recusada: CPF, motivo, identidade não confirmada e loja inexistente", async () => {
      const cpf = randomValidCpf();
      await tryLead(cpf);
      expect((await lookup(u.superAdmin.db, "529.982.247-25")).error?.code).toBe("22023"); // só normalizado (11 dígitos)
      expect((await lookup(u.superAdmin.db, "52998224724")).error?.code).toBe("22023"); // dígito verificador
      expect((await release(u.superAdmin.db, storeA, cpf, "MARKETING")).error?.code).toBe("22023");
      expect((await release(u.superAdmin.db, storeA, cpf, "ELIMINACAO", false)).error?.code).toBe("22023");
      expect((await release(u.superAdmin.db, randomUUID(), cpf)).error?.code).toBe("KL010");
      expect((await tryLead(cpf)).error?.code).toBe("KL005");
    });

    it("auditoria: só a KAPA lê; ninguém grava pela API", async () => {
      expect(unwrap(await u.superAdmin.db.from("lgpd_cpf_cooldown_releases").select("id").limit(1), "kapa")).toHaveLength(1);
      expect(unwrap(await u.adminA.db.from("lgpd_cpf_cooldown_releases").select("id"), "gerente")).toEqual([]);
      expect((await anon.from("lgpd_cpf_cooldown_releases").select("id")).error).not.toBeNull();
      const forged = { store_id: storeA, reason: "ELIMINACAO", channel: "PAINEL_LGPD", identity_verified: true, record_found: true };
      for (const db of [u.superAdmin.db, u.adminA.db]) {
        expect((await db.from("lgpd_cpf_cooldown_releases").insert(forged)).error?.code).toBe("42501");
      }
    });
  });
});
