import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseLeadSearch } from "@/lib/admin/search";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/format/status";
import type { DateRange } from "@/lib/format/period";
import type { Database, Json } from "@/types/database";

/**
 * Consultas e mutações de leads do Admin.
 *
 * Sempre recebem o cliente da SESSÃO do usuário: o RLS decide o que cada
 * um vê/altera. Os filtros só estreitam o resultado — nunca ampliam.
 * A coluna `cpf` nunca é selecionada (o papel authenticated nem tem acesso).
 */

type Db = SupabaseClient<Database>;

export const PAGE_SIZE = 25;

export type LeadFilters = {
  q?: string | null;
  status?: LeadStatus | null;
  campaignId?: string | null;
  storeId?: string | null;
  range?: DateRange;
};

export type LeadListItem = {
  id: string;
  fullName: string;
  phone: string;
  status: LeadStatus;
  createdAt: string;
  utmSource: string | null;
  storeId: string;
  campaignId: string;
  campaignName: string | null;
  storeName: string | null;
};

const LIST_COLUMNS =
  "id, full_name, phone, status, created_at, utm_source, store_id, campaign_id, campaign:campaigns(name, store:stores(name))";

type Filterable<T> = {
  eq(column: string, value: string): T;
  gte(column: string, value: string): T;
  lt(column: string, value: string): T;
  ilike(column: string, pattern: string): T;
};

function applyFilters<T extends Filterable<T>>(query: T, filters: LeadFilters): T {
  let q = query;
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.campaignId) q = q.eq("campaign_id", filters.campaignId);
  if (filters.storeId) q = q.eq("store_id", filters.storeId);
  if (filters.range?.from) q = q.gte("created_at", filters.range.from);
  if (filters.range?.to) q = q.lt("created_at", filters.range.to);

  const search = parseLeadSearch(filters.q);
  if (search?.kind === "phone") q = q.ilike("phone", `%${search.digits}%`);
  if (search?.kind === "name") q = q.ilike("full_name", search.pattern);
  return q;
}

type ListRow = {
  id: string;
  full_name: string;
  phone: string;
  status: LeadStatus;
  created_at: string;
  utm_source: string | null;
  store_id: string;
  campaign_id: string;
  campaign: { name: string; store: { name: string } | null } | null;
};

function toListItem(row: ListRow): LeadListItem {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    status: row.status,
    createdAt: row.created_at,
    utmSource: row.utm_source,
    storeId: row.store_id,
    campaignId: row.campaign_id,
    campaignName: row.campaign?.name ?? null,
    storeName: row.campaign?.store?.name ?? null,
  };
}

export async function listLeads(db: Db, filters: LeadFilters, page = 1, pageSize = PAGE_SIZE) {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const fromIndex = (safePage - 1) * pageSize;

  const query = applyFilters(db.from("leads").select(LIST_COLUMNS, { count: "exact" }), filters)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(fromIndex, fromIndex + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`list leads failed (${error.code})`);

  const total = count ?? 0;
  return {
    rows: (data as ListRow[] | null ?? []).map(toListItem),
    total,
    page: safePage,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type DashboardCounts = { total: number } & Record<LeadStatus, number>;

export async function getDashboardCounts(db: Db, filters: Omit<LeadFilters, "status" | "q">): Promise<DashboardCounts> {
  const count = async (status?: LeadStatus) => {
    const { count: value, error } = await applyFilters(
      db.from("leads").select("id", { count: "exact", head: true }),
      { ...filters, status },
    );
    if (error) throw new Error(`count leads failed (${error.code})`);
    return value ?? 0;
  };

  const [total, ...byStatus] = await Promise.all([count(), ...LEAD_STATUSES.map((status) => count(status))]);
  return {
    total,
    ...(Object.fromEntries(LEAD_STATUSES.map((status, i) => [status, byStatus[i]])) as Record<LeadStatus, number>),
  };
}

// ---------------------------------------------------------------------
// Detalhe
// ---------------------------------------------------------------------

const DETAIL_COLUMNS =
  "id, full_name, cpf_masked, birth_date, phone, email, form_data, status, consent_version, consent_at, " +
  "utm_source, utm_medium, utm_campaign, utm_content, utm_term, page_url, referrer, created_at, store_id, " +
  "campaign:campaigns(id, name, form_schema, store:stores(id, name))";

export type LeadDetail = {
  id: string;
  fullName: string;
  cpfMasked: string | null;
  birthDate: string;
  phone: string;
  email: string | null;
  formData: Json;
  status: LeadStatus;
  consentVersion: string;
  consentAt: string;
  tracking: {
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    utmTerm: string | null;
    pageUrl: string | null;
    referrer: string | null;
  };
  createdAt: string;
  storeId: string;
  storeName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  formSchema: Json | null;
};

type DetailRow = {
  id: string;
  full_name: string;
  cpf_masked: string | null;
  birth_date: string;
  phone: string;
  email: string | null;
  form_data: Json;
  status: LeadStatus;
  consent_version: string;
  consent_at: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  page_url: string | null;
  referrer: string | null;
  created_at: string;
  store_id: string;
  campaign: { id: string; name: string; form_schema: Json; store: { id: string; name: string } | null } | null;
};

/** null quando o lead não existe OU não é visível para o usuário (RLS). */
export async function getLeadDetail(db: Db, leadId: string): Promise<LeadDetail | null> {
  const { data, error } = await db.from("leads").select(DETAIL_COLUMNS).eq("id", leadId).maybeSingle();
  if (error) {
    if (error.code === "22P02") return null; // id não é UUID
    throw new Error(`get lead failed (${error.code})`);
  }
  if (!data) return null;
  const row = data as unknown as DetailRow;

  return {
    id: row.id,
    fullName: row.full_name,
    cpfMasked: row.cpf_masked,
    birthDate: row.birth_date,
    phone: row.phone,
    email: row.email,
    formData: row.form_data,
    status: row.status,
    consentVersion: row.consent_version,
    consentAt: row.consent_at,
    tracking: {
      utmSource: row.utm_source,
      utmMedium: row.utm_medium,
      utmCampaign: row.utm_campaign,
      utmContent: row.utm_content,
      utmTerm: row.utm_term,
      pageUrl: row.page_url,
      referrer: row.referrer,
    },
    createdAt: row.created_at,
    storeId: row.store_id,
    storeName: row.campaign?.store?.name ?? null,
    campaignId: row.campaign?.id ?? null,
    campaignName: row.campaign?.name ?? null,
    formSchema: row.campaign?.form_schema ?? null,
  };
}

export type LeadNoteRow = {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  author: { full_name: string | null; email: string | null } | null;
};

export type LeadEventRow = {
  id: number;
  type: Database["public"]["Enums"]["lead_event_type"];
  payload: Json;
  created_at: string;
  actor_id: string | null;
  actor: { full_name: string | null; email: string | null } | null;
};

export async function getLeadHistory(db: Db, leadId: string) {
  const [notes, events] = await Promise.all([
    db
      .from("lead_notes")
      .select("id, body, created_at, author_id, author:profiles(full_name, email)")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true }),
    db
      .from("lead_events")
      .select("id, type, payload, created_at, actor_id, actor:profiles(full_name, email)")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true }),
  ]);
  if (notes.error) throw new Error(`list notes failed (${notes.error.code})`);
  if (events.error) throw new Error(`list events failed (${events.error.code})`);
  return { notes: (notes.data ?? []) as LeadNoteRow[], events: (events.data ?? []) as LeadEventRow[] };
}

// ---------------------------------------------------------------------
// Mutações
// ---------------------------------------------------------------------

/** true se o status foi gravado; false se o lead não é visível/editável (RLS). */
export async function updateLeadStatus(db: Db, leadId: string, status: LeadStatus): Promise<boolean> {
  const { data, error } = await db.from("leads").update({ status }).eq("id", leadId).select("id");
  if (error) {
    if (error.code === "22P02") return false;
    throw new Error(`update status failed (${error.code})`);
  }
  return (data ?? []).length === 1;
}

export const NOTE_MAX_LENGTH = 5000;

export type AddNoteResult = { ok: true; noteId: string } | { ok: false; reason: "invalid" | "forbidden" };

export async function addLeadNote(db: Db, leadId: string, rawBody: string): Promise<AddNoteResult> {
  const body = rawBody.trim();
  if (body.length < 1 || body.length > NOTE_MAX_LENGTH) return { ok: false, reason: "invalid" };

  // store_id e author_id são preenchidos pelo trigger do banco; o usuário só
  // tem INSERT em (lead_id, body). O tipo gerado não sabe disso, daí o cast.
  const note = { lead_id: leadId, body } as Database["public"]["Tables"]["lead_notes"]["Insert"];
  const { data, error } = await db.from("lead_notes").insert(note).select("id").single();
  if (error) {
    // 42501: RLS (lead de outra loja); 23502/23503/22P02: lead inexistente.
    if (["42501", "23502", "23503", "22P02"].includes(error.code)) return { ok: false, reason: "forbidden" };
    throw new Error(`add note failed (${error.code})`);
  }
  return { ok: true, noteId: data.id };
}
