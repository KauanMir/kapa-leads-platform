/**
 * Testes de isolamento multi-tenant (RLS) contra o Supabase REMOTO.
 *
 * ATENÇÃO: cria lojas, campanhas, leads e usuários temporários reais no
 * projeto configurado em .env.local e os remove ao final. Por isso só roda
 * com ALLOW_REMOTE_RLS_TESTS=true. Sem a variável, aborta antes de qualquer
 * acesso ao banco.
 *
 * Todos os dados de teste usam o prefixo "rls-test-".
 * Nunca imprimir chaves, CPFs ou outros dados pessoais.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertDevSupabase } from "./production-guard";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Sem .env.local: as variáveis podem vir do ambiente.
}

if (process.env.ALLOW_REMOTE_RLS_TESTS !== "true") {
  throw new Error(
    "Testes remotos de RLS bloqueados. Eles criam e removem dados reais no Supabase. " +
      "Para executar, defina ALLOW_REMOTE_RLS_TESTS=true.",
  );
}

// Defesa em profundidade (o globalSetup já confere): nunca rodar fora do Supabase DEV.
assertDevSupabase(process.env);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !PUBLISHABLE_KEY || !SECRET_KEY) {
  throw new Error(
    "Variáveis do Supabase ausentes (NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY).",
  );
}

const TEST_PREFIX = "rls-test-";
const TEST_EMAIL_DOMAIN = "example.com";
const RUN_ID = `${TEST_PREFIX}${Date.now().toString(36)}`;
const CONSENT_VERSION = "test-v1";

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(SUPABASE_URL, SECRET_KEY, clientOptions);
const anon = createClient(SUPABASE_URL, PUBLISHABLE_KEY, clientOptions);

// Colunas de leads visíveis para usuários (cpf NÃO tem grant).
const LEAD_COLUMNS = "id, store_id, campaign_id, cpf_masked, status";

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/** Gera um CPF válido aleatório (somente dígitos). */
function randomValidCpf(): string {
  let base: number[];
  do {
    base = Array.from({ length: 9 }, () => randomInt(10));
  } while (base.every((d) => d === base[0]));

  const checkDigit = (digits: number[]) => {
    const weightStart = digits.length + 1;
    const sum = digits.reduce((acc, d, i) => acc + d * (weightStart - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const d10 = checkDigit(base);
  const d11 = checkDigit([...base, d10]);
  return [...base, d10, d11].join("");
}

function maskCpf(cpf: string): string {
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`;
}

function unwrap<R extends { data: unknown; error: { message: string } | null }>(
  result: R,
  what: string,
): NonNullable<R["data"]> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`${what}: ${result.error?.message ?? "sem dados"}`);
  }
  return result.data as NonNullable<R["data"]>;
}

function leadInput(campaignId: string, overrides: Record<string, unknown> = {}) {
  return {
    campaign_id: campaignId,
    full_name: "Lead de Teste RLS",
    cpf: randomValidCpf(),
    birth_date: "1990-01-01",
    phone: "11999999999",
    consent_version: CONSENT_VERSION,
    client_submission_id: randomUUID(),
    form_data: { source: "rls-test" },
    ...overrides,
  };
}

async function createTestUser(suffix: string) {
  const email = `${RUN_ID}-${suffix}@${TEST_EMAIL_DOMAIN}`;
  const password = `${randomUUID()}Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `RLS Test ${suffix}` },
  });
  if (error || !data.user) throw new Error(`createUser(${suffix}): ${error?.message}`);

  const client = createClient(SUPABASE_URL!, PUBLISHABLE_KEY!, clientOptions);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`signIn(${suffix}): ${signIn.error.message}`);

  return { id: data.user.id, client };
}

/** Remove todos os dados com prefixo de teste (inclusive de execuções anteriores que falharam). */
async function cleanupTestData() {
  const { data: stores } = await admin.from("stores").select("id").like("slug", `${TEST_PREFIX}%`);
  const storeIds = (stores ?? []).map((s) => s.id as string);

  if (storeIds.length > 0) {
    await admin.from("leads").delete().in("store_id", storeIds); // notas/eventos em cascata
    await admin.from("campaigns").delete().in("store_id", storeIds);
    await admin.from("stores").delete().in("id", storeIds); // store_members em cascata
  }

  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const user of users?.users ?? []) {
    if (user.email?.startsWith(TEST_PREFIX) && user.email.endsWith(`@${TEST_EMAIL_DOMAIN}`)) {
      await admin.auth.admin.deleteUser(user.id); // profiles em cascata
    }
  }
}

// ---------------------------------------------------------------------
// Cenário
// ---------------------------------------------------------------------

type TestUser = { id: string; client: SupabaseClient };

let storeA: string;
let storeB: string;
let campaignA: string;
let campaignAInactive: string;
let campaignB: string;
let leadA1: { id: string; cpf: string };
let leadA2: string;
let leadB: string;
let userA: TestUser; // STORE_USER da Loja A
let userB: TestUser; // STORE_ADMIN da Loja B
let superAdmin: TestUser;

beforeAll(async () => {
  await cleanupTestData();

  const stores = unwrap(
    await admin
      .from("stores")
      .insert([
        { slug: `${RUN_ID}-a`, name: "RLS Test Loja A" },
        { slug: `${RUN_ID}-b`, name: "RLS Test Loja B" },
      ])
      .select("id, slug"),
    "criar lojas",
  );
  storeA = stores.find((s) => s.slug.endsWith("-a"))!.id;
  storeB = stores.find((s) => s.slug.endsWith("-b"))!.id;

  // defaultToNull: false → colunas ausentes em alguma linha usam o DEFAULT do banco (não NULL).
  const campaigns = unwrap(
    await admin
      .from("campaigns")
      .insert(
        [
          { store_id: storeA, slug: "camp-a", name: "RLS Camp A", consent_version: CONSENT_VERSION },
          { store_id: storeA, slug: "camp-a-off", name: "RLS Camp A Off", consent_version: CONSENT_VERSION, is_active: false },
          { store_id: storeB, slug: "camp-b", name: "RLS Camp B", consent_version: CONSENT_VERSION },
        ],
        { defaultToNull: false },
      )
      .select("id, slug"),
    "criar campanhas",
  );
  campaignA = campaigns.find((c) => c.slug === "camp-a")!.id;
  campaignAInactive = campaigns.find((c) => c.slug === "camp-a-off")!.id;
  campaignB = campaigns.find((c) => c.slug === "camp-b")!.id;

  const a1 = leadInput(campaignA);
  leadA1 = { id: unwrap(await admin.from("leads").insert(a1).select("id").single(), "lead A1").id, cpf: a1.cpf };
  leadA2 = unwrap(await admin.from("leads").insert(leadInput(campaignA)).select("id").single(), "lead A2").id;
  leadB = unwrap(await admin.from("leads").insert(leadInput(campaignB)).select("id").single(), "lead B").id;

  userA = await createTestUser("a");
  userB = await createTestUser("b");
  superAdmin = await createTestUser("super");

  unwrap(
    await admin
      .from("store_members")
      .insert([
        { store_id: storeA, user_id: userA.id, role: "STORE_USER" },
        { store_id: storeB, user_id: userB.id, role: "STORE_ADMIN" },
      ])
      .select("store_id"),
    "criar vínculos",
  );
  // Também confirma que o trigger de auth.users criou o profile.
  const promoted = unwrap(
    await admin.from("profiles").update({ is_super_admin: true }).eq("id", superAdmin.id).select("id"),
    "promover super admin",
  );
  if (promoted.length !== 1) throw new Error("profile do super admin não foi criado pelo trigger");
});

afterAll(async () => {
  await cleanupTestData();
});

// ---------------------------------------------------------------------
// Isolamento
// ---------------------------------------------------------------------

describe("isolamento entre lojas", () => {
  it("usuário da Loja A vê somente a Loja A", async () => {
    const { client } = userA;

    const stores = unwrap(await client.from("stores").select("id"), "stores");
    expect(stores.map((s) => s.id)).toEqual([storeA]);

    const campaigns = unwrap(await client.from("campaigns").select("id, store_id"), "campaigns");
    expect(campaigns.map((c) => c.id).sort()).toEqual([campaignA, campaignAInactive].sort());

    const leads = unwrap(await client.from("leads").select(LEAD_COLUMNS), "leads");
    expect(leads.map((l) => l.id).sort()).toEqual([leadA1.id, leadA2].sort());

    const events = unwrap(await client.from("lead_events").select("store_id"), "events");
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.store_id === storeA)).toBe(true);
  });

  it("usuário da Loja B não vê a Loja A", async () => {
    const { client } = userB;

    const stores = unwrap(await client.from("stores").select("id"), "stores");
    expect(stores.map((s) => s.id)).toEqual([storeB]);

    const campaigns = unwrap(await client.from("campaigns").select("id"), "campaigns");
    expect(campaigns.map((c) => c.id)).toEqual([campaignB]);

    const leads = unwrap(await client.from("leads").select(LEAD_COLUMNS), "leads");
    expect(leads.map((l) => l.id)).toEqual([leadB]);

    const direct = unwrap(await client.from("leads").select("id").eq("id", leadA1.id), "lead A direto");
    expect(direct).toEqual([]);
  });

  it("SUPER_ADMIN vê todas as lojas", async () => {
    const { client } = superAdmin;

    const stores = unwrap(await client.from("stores").select("id").in("id", [storeA, storeB]), "stores");
    expect(stores).toHaveLength(2);

    const leads = unwrap(
      await client.from("leads").select("id").in("store_id", [storeA, storeB]),
      "leads",
    );
    expect(leads.map((l) => l.id).sort()).toEqual([leadA1.id, leadA2, leadB].sort());
  });

  it("visitante anônimo não acessa nenhuma tabela", async () => {
    for (const table of ["stores", "campaigns", "profiles", "store_members", "leads", "lead_notes", "lead_events"]) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      expect(data ?? [], table).toEqual([]);
      expect(error?.code, table).toBe("42501");
    }
  });

  it("usuário da Loja A não altera lead da Loja B", async () => {
    const result = await userA.client.from("leads").update({ status: "LOST" }).eq("id", leadB).select("id");
    expect(result.data ?? []).toEqual([]);

    const check = unwrap(await admin.from("leads").select("status").eq("id", leadB).single(), "lead B");
    expect(check.status).toBe("NEW");
  });

  it("usuário da Loja A não cria nota em lead da Loja B", async () => {
    const { error } = await userA.client.from("lead_notes").insert({ lead_id: leadB, body: "invasão" });
    expect(error?.code).toBe("42501");
  });

  it("usuários não inserem leads nem criam lojas/campanhas", async () => {
    const lead = await userA.client.from("leads").insert(leadInput(campaignA));
    expect(lead.error?.code).toBe("42501");

    const store = await userB.client.from("stores").insert({ slug: `${RUN_ID}-x`, name: "x" });
    expect(store.error?.code).toBe("42501");

    const campaign = await userB.client
      .from("campaigns")
      .insert({ store_id: storeB, slug: "x", name: "x", consent_version: CONSENT_VERSION });
    expect(campaign.error?.code).toBe("42501");
  });

  it("STORE_ADMIN vê membros só da própria loja; STORE_USER só o próprio vínculo", async () => {
    const membersB = unwrap(await userB.client.from("store_members").select("store_id, user_id"), "membros B");
    expect(membersB.every((m) => m.store_id === storeB)).toBe(true);

    const membersA = unwrap(await userA.client.from("store_members").select("store_id, user_id"), "membros A");
    expect(membersA).toEqual([{ store_id: storeA, user_id: userA.id }]);

    const profilesA = unwrap(await userA.client.from("profiles").select("id"), "perfis A");
    expect(profilesA.map((p) => p.id)).toEqual([userA.id]);
  });
});

// ---------------------------------------------------------------------
// CPF e perfil
// ---------------------------------------------------------------------

describe("proteção do CPF", () => {
  it("usuário não consegue ler o CPF completo", async () => {
    const { error } = await userA.client.from("leads").select("cpf").eq("id", leadA1.id);
    expect(error?.code).toBe("42501");
  });

  it("usuário lê apenas o CPF mascarado", async () => {
    const lead = unwrap(
      await userA.client.from("leads").select("cpf_masked").eq("id", leadA1.id).single(),
      "cpf_masked",
    );
    expect(lead.cpf_masked).toBe(maskCpf(leadA1.cpf));
    expect(lead.cpf_masked).toMatch(/^\*\*\*\.\d{3}\.\d{3}-\*\*$/);
  });
});

describe("perfil", () => {
  it("usuário edita o próprio nome", async () => {
    const result = await userA.client.from("profiles").update({ full_name: "Novo Nome" }).eq("id", userA.id).select("id");
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
  });

  it("usuário não se promove a SUPER_ADMIN", async () => {
    const { error } = await userA.client.from("profiles").update({ is_super_admin: true }).eq("id", userA.id);
    expect(error?.code).toBe("42501");

    const profile = unwrap(await admin.from("profiles").select("is_super_admin").eq("id", userA.id).single(), "perfil");
    expect(profile.is_super_admin).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------

describe("eventos do lead", () => {
  it("CREATED é gerado para cada lead", async () => {
    const events = unwrap(
      await admin.from("lead_events").select("lead_id, actor_id").eq("type", "CREATED").in("lead_id", [leadA1.id, leadA2, leadB]),
      "CREATED",
    );
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.actor_id === null)).toBe(true);
  });

  it("STATUS_CHANGED é gerado só quando o status muda", async () => {
    unwrap(
      await userA.client.from("leads").update({ status: "CONTACTED" }).eq("id", leadA1.id).select("id"),
      "mudar status",
    );
    unwrap(
      await userA.client.from("leads").update({ status: "CONTACTED" }).eq("id", leadA1.id).select("id"),
      "repetir status",
    );

    const events = unwrap(
      await admin.from("lead_events").select("actor_id, payload").eq("lead_id", leadA1.id).eq("type", "STATUS_CHANGED"),
      "STATUS_CHANGED",
    );
    expect(events).toEqual([{ actor_id: userA.id, payload: { from: "NEW", to: "CONTACTED" } }]);
  });

  it("NOTE_ADDED é gerado com autor e loja definidos pelo banco", async () => {
    const note = unwrap(
      await userA.client
        .from("lead_notes")
        .insert({ lead_id: leadA1.id, body: "Cliente pediu retorno amanhã." })
        .select("id, author_id, store_id")
        .single(),
      "criar nota",
    );
    expect(note.author_id).toBe(userA.id);
    expect(note.store_id).toBe(storeA);

    const events = unwrap(
      await admin.from("lead_events").select("actor_id, payload").eq("lead_id", leadA1.id).eq("type", "NOTE_ADDED"),
      "NOTE_ADDED",
    );
    expect(events).toEqual([{ actor_id: userA.id, payload: { note_id: note.id } }]);
  });
});

// ---------------------------------------------------------------------
// Integridade do lead (regras aplicadas pelo banco)
// ---------------------------------------------------------------------

describe("integridade do lead", () => {
  it("ignora store_id, consent_at e status enviados", async () => {
    const lead = unwrap(
      await admin
        .from("leads")
        .insert(leadInput(campaignA, { store_id: storeB, consent_at: "2000-01-01T00:00:00Z", status: "WON" }))
        .select("store_id, consent_at, status")
        .single(),
      "lead forjado",
    );
    expect(lead.store_id).toBe(storeA);
    expect(lead.status).toBe("NEW");
    expect(Date.now() - new Date(lead.consent_at).getTime()).toBeLessThan(5 * 60_000);
  });

  it("rejeita consent_version diferente da campanha", async () => {
    const { error } = await admin.from("leads").insert(leadInput(campaignA, { consent_version: "old-v0" }));
    expect(error?.code).toBe("KL003");
  });

  it("rejeita campanha inativa", async () => {
    const { error } = await admin.from("leads").insert(leadInput(campaignAInactive));
    expect(error?.code).toBe("KL002");
  });

  it("rejeita CPF com dígitos verificadores inválidos", async () => {
    const { error } = await admin.from("leads").insert(leadInput(campaignA, { cpf: "12345678900" }));
    expect(error?.code).toBe("23514");
  });

  it("client_submission_id é único por campanha", async () => {
    const submissionId = randomUUID();
    unwrap(
      await admin.from("leads").insert(leadInput(campaignA, { client_submission_id: submissionId })).select("id"),
      "primeiro envio",
    );
    const duplicate = await admin.from("leads").insert(leadInput(campaignA, { client_submission_id: submissionId }));
    expect(duplicate.error?.code).toBe("23505");

    const otherCampaign = await admin.from("leads").insert(leadInput(campaignB, { client_submission_id: submissionId }));
    expect(otherCampaign.error).toBeNull();
  });

  it("permite o mesmo CPF em leads diferentes", async () => {
    const { error } = await admin.from("leads").insert(leadInput(campaignA, { cpf: leadA1.cpf }));
    expect(error).toBeNull();
  });

  it("gera campaign_key no formato camp_pk_", async () => {
    const campaign = unwrap(
      await admin.from("campaigns").select("campaign_key").eq("id", campaignA).single(),
      "campaign_key",
    );
    expect(campaign.campaign_key).toMatch(/^camp_pk_[a-z0-9]{32}$/);
  });
});
