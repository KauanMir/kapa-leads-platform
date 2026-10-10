import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";

import type { StoreMemberRole } from "@/lib/auth/access";
import type { FormSchema } from "@/lib/format/form-data";
import type { Database, Json } from "@/types/database";

/**
 * Configuração (lojas, campanhas, vínculos) com o cliente da SESSÃO.
 * O RLS só permite escrita ao SUPER_ADMIN; as páginas/ações também checam.
 */

type Db = SupabaseClient<Database>;

export class ConfigError extends Error {
  constructor(readonly code: "duplicate" | "forbidden" | "invalid" | "not_found") {
    super(code);
    this.name = "ConfigError";
  }
}

function fail(operation: string, error: { code: string }): never {
  if (error.code === "23505") throw new ConfigError("duplicate");
  if (error.code === "42501") throw new ConfigError("forbidden");
  if (error.code === "23514" || error.code === "22P02") throw new ConfigError("invalid");
  throw new Error(`${operation} failed (${error.code})`);
}

// ---------------------------------------------------------------------
// Lojas
// ---------------------------------------------------------------------

export type StoreRow = { id: string; name: string; slug: string; logoUrl: string | null; isActive: boolean; createdAt: string; campaignCount: number };

export async function listStores(db: Db): Promise<StoreRow[]> {
  const [stores, campaigns] = await Promise.all([
    db.from("stores").select("id, name, slug, logo_url, is_active, created_at").order("name"),
    db.from("campaigns").select("store_id"),
  ]);
  if (stores.error) fail("list stores", stores.error);
  if (campaigns.error) fail("list campaigns", campaigns.error);

  const counts = new Map<string, number>();
  for (const c of campaigns.data ?? []) counts.set(c.store_id, (counts.get(c.store_id) ?? 0) + 1);

  return (stores.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    logoUrl: s.logo_url,
    isActive: s.is_active,
    createdAt: s.created_at,
    campaignCount: counts.get(s.id) ?? 0,
  }));
}

export async function createStore(db: Db, input: { name: string; slug: string; logoUrl: string | null }) {
  const { error } = await db.from("stores").insert({ name: input.name, slug: input.slug, logo_url: input.logoUrl });
  if (error) fail("create store", error);
}

export async function setStoreActive(db: Db, storeId: string, isActive: boolean) {
  const { data, error } = await db.from("stores").update({ is_active: isActive }).eq("id", storeId).select("id");
  if (error) fail("update store", error);
  if (!data?.length) throw new ConfigError("not_found");
}

// ---------------------------------------------------------------------
// Campanhas
// ---------------------------------------------------------------------

export type CampaignRow = {
  id: string;
  storeId: string;
  storeName: string | null;
  name: string;
  slug: string;
  campaignKey: string;
  consentVersion: string;
  allowedOrigins: string[];
  formSchema: Json;
  isActive: boolean;
  createdAt: string;
};

const CAMPAIGN_COLUMNS =
  "id, store_id, name, slug, campaign_key, consent_version, allowed_origins, form_schema, is_active, created_at, store:stores(name)";

type CampaignDbRow = {
  id: string;
  store_id: string;
  name: string;
  slug: string;
  campaign_key: string;
  consent_version: string;
  allowed_origins: string[];
  form_schema: Json;
  is_active: boolean;
  created_at: string;
  store: { name: string } | null;
};

function toCampaign(row: CampaignDbRow): CampaignRow {
  return {
    id: row.id,
    storeId: row.store_id,
    storeName: row.store?.name ?? null,
    name: row.name,
    slug: row.slug,
    campaignKey: row.campaign_key,
    consentVersion: row.consent_version,
    allowedOrigins: row.allowed_origins,
    formSchema: row.form_schema,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

/** Campanhas visíveis ao usuário (RLS: lojas do usuário; tudo para SUPER_ADMIN). */
export async function listCampaigns(db: Db): Promise<CampaignRow[]> {
  const { data, error } = await db.from("campaigns").select(CAMPAIGN_COLUMNS).order("created_at", { ascending: false });
  if (error) fail("list campaigns", error);
  return ((data ?? []) as unknown as CampaignDbRow[]).map(toCampaign);
}

export async function getCampaign(db: Db, campaignId: string): Promise<CampaignRow | null> {
  const { data, error } = await db.from("campaigns").select(CAMPAIGN_COLUMNS).eq("id", campaignId).maybeSingle();
  if (error) {
    if (error.code === "22P02") return null;
    fail("get campaign", error);
  }
  return data ? toCampaign(data as unknown as CampaignDbRow) : null;
}

export type CampaignInput = {
  storeId: string;
  name: string;
  slug: string;
  consentVersion: string;
  allowedOrigins: string[];
  formSchema: FormSchema;
  isActive: boolean;
};

function campaignValues(input: CampaignInput) {
  return {
    store_id: input.storeId,
    name: input.name,
    slug: input.slug,
    consent_version: input.consentVersion,
    allowed_origins: input.allowedOrigins,
    form_schema: input.formSchema as Json,
    is_active: input.isActive,
  };
}

/** campaign_key é gerada pelo banco. */
export async function createCampaign(db: Db, input: CampaignInput): Promise<string> {
  const { data, error } = await db.from("campaigns").insert(campaignValues(input)).select("id").single();
  if (error) fail("create campaign", error);
  return data.id;
}

/** Edição NUNCA altera a campaign_key (ver rotateCampaignKey). */
export async function updateCampaign(db: Db, campaignId: string, input: CampaignInput) {
  const { data, error } = await db.from("campaigns").update(campaignValues(input)).eq("id", campaignId).select("id");
  if (error) fail("update campaign", error);
  if (!data?.length) throw new ConfigError("not_found");
}

const KEY_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Mesmo formato do banco: camp_pk_ + 32 caracteres [a-z0-9]. */
export function generateCampaignKey(): string {
  let key = "camp_pk_";
  for (let i = 0; i < 32; i++) key += KEY_ALPHABET[randomInt(KEY_ALPHABET.length)];
  return key;
}

/** Ação explícita de rotação: a LP para de funcionar até receber a nova chave. */
export async function rotateCampaignKey(db: Db, campaignId: string): Promise<string> {
  const campaignKey = generateCampaignKey();
  const { data, error } = await db.from("campaigns").update({ campaign_key: campaignKey }).eq("id", campaignId).select("id");
  if (error) fail("rotate key", error);
  if (!data?.length) throw new ConfigError("not_found");
  return campaignKey;
}

// ---------------------------------------------------------------------
// Usuários e vínculos
// ---------------------------------------------------------------------

export type UserMembership = { storeId: string; storeName: string; role: StoreMemberRole; isActive: boolean };

export type UserRow = {
  id: string;
  email: string | null;
  fullName: string | null;
  isSuperAdmin: boolean;
  isActive: boolean;
  createdAt: string;
  memberships: UserMembership[];
};

export async function listUsers(db: Db): Promise<UserRow[]> {
  const [profiles, memberships] = await Promise.all([
    db.from("profiles").select("id, email, full_name, is_super_admin, is_active, created_at").order("full_name"),
    db.from("store_members").select("user_id, store_id, role, is_active, store:stores(name)"),
  ]);
  if (profiles.error) fail("list profiles", profiles.error);
  if (memberships.error) fail("list memberships", memberships.error);

  const byUser = new Map<string, UserMembership[]>();
  for (const m of memberships.data ?? []) {
    const list = byUser.get(m.user_id) ?? [];
    list.push({ storeId: m.store_id, storeName: m.store?.name ?? "—", role: m.role, isActive: m.is_active });
    byUser.set(m.user_id, list);
  }

  return (profiles.data ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    fullName: p.full_name,
    isSuperAdmin: p.is_super_admin,
    isActive: p.is_active,
    createdAt: p.created_at,
    memberships: (byUser.get(p.id) ?? []).sort((a, b) => a.storeName.localeCompare(b.storeName, "pt-BR")),
  }));
}

/** Cria o vínculo ou, se já existir, atualiza papel e reativa. */
export async function upsertMembership(db: Db, input: { userId: string; storeId: string; role: StoreMemberRole }) {
  // Sem UPSERT: o GRANT de UPDATE cobre só (role, is_active), não as chaves.
  const { error } = await db
    .from("store_members")
    .insert({ user_id: input.userId, store_id: input.storeId, role: input.role, is_active: true });
  if (!error) return;
  if (error.code !== "23505") fail("insert membership", error);

  const { error: updateError } = await db
    .from("store_members")
    .update({ role: input.role, is_active: true })
    .eq("user_id", input.userId)
    .eq("store_id", input.storeId);
  if (updateError) fail("update membership", updateError);
}

export async function setMembershipActive(db: Db, userId: string, storeId: string, isActive: boolean) {
  const { data, error } = await db
    .from("store_members")
    .update({ is_active: isActive })
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .select("user_id");
  if (error) fail("update membership", error);
  if (!data?.length) throw new ConfigError("not_found");
}

/** Membros das lojas do STORE_ADMIN (RLS: perfis e vínculos das lojas que administra). */
export async function listStoreMembers(db: Db, storeIds: string[]) {
  if (storeIds.length === 0) return [];
  const { data, error } = await db
    .from("store_members")
    .select("store_id, user_id, role, is_active, profile:profiles(full_name, email)")
    .in("store_id", storeIds);
  if (error) fail("list members", error);
  return data ?? [];
}
