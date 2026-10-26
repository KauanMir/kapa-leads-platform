import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { LgpdReason } from "@/lib/admin/lgpd-options";
import type { Database } from "@/types/database";

/**
 * Pedidos do titular (LGPD) sobre o registro de bloqueio de CPF (10 dias úteis).
 *
 * Sempre com o cliente da SESSÃO: quem decide é o banco (só SUPER_ADMIN; ver
 * lgpd_cpf_cooldown_lookup / lgpd_release_cpf_cooldown). O CPF chega aqui já
 * normalizado (11 dígitos) e vai só no corpo da chamada ao banco — nunca em
 * URL, log ou auditoria. Erros do banco viram resultados sem mensagem interna.
 */

type Db = SupabaseClient<Database>;

export type CooldownRecord = { storeId: string; storeName: string; blockedUntil: string; active: boolean };

export type LgpdResult<T> = { ok: true; data: T } | { ok: false; reason: "forbidden" | "invalid" | "not_found" };

function failure(code: string | undefined): { ok: false; reason: "forbidden" | "invalid" | "not_found" } {
  if (code === "KL011" || code === "42501") return { ok: false, reason: "forbidden" };
  if (code === "22023" || code === "22P02") return { ok: false, reason: "invalid" };
  if (code === "KL010") return { ok: false, reason: "not_found" };
  throw new Error(`lgpd operation failed (${code ?? "unknown"})`);
}

/** Lojas em que o CPF tem registro de bloqueio (vigente ou vencido aguardando limpeza). */
export async function lookupCpfCooldowns(db: Db, cpf: string): Promise<LgpdResult<CooldownRecord[]>> {
  const { data, error } = await db.rpc("lgpd_cpf_cooldown_lookup", { p_cpf: cpf });
  if (error) return failure(error.code);
  return {
    ok: true,
    data: (data ?? []).map((row) => ({ storeId: row.store_id, storeName: row.store_name, blockedUntil: row.blocked_until, active: row.active })),
  };
}

/** Elimina o registro de UMA loja (com ou sem lead). true = havia registro. Auditado no banco. */
export async function releaseCpfCooldown(
  db: Db,
  input: { storeId: string; cpf: string; reason: LgpdReason; identityVerified: true },
): Promise<LgpdResult<{ found: boolean }>> {
  const { data, error } = await db.rpc("lgpd_release_cpf_cooldown", {
    p_store_id: input.storeId,
    p_cpf: input.cpf,
    p_reason: input.reason,
    p_identity_verified: input.identityVerified,
  });
  if (error) return failure(error.code);
  return { ok: true, data: { found: data === true } };
}

export type LgpdReleaseRow = {
  id: number;
  createdAt: string;
  storeName: string | null;
  reason: string;
  channel: string;
  recordFound: boolean;
  performedBy: string | null;
};

/** Auditoria (RLS: só SUPER_ADMIN lê). Sem CPF: só loja, motivo, canal, resultado e operador. */
export async function listLgpdReleases(db: Db, limit = 50): Promise<LgpdReleaseRow[]> {
  const { data, error } = await db
    .from("lgpd_cpf_cooldown_releases")
    .select("id, created_at, reason, channel, record_found, store:stores(name), operator:profiles(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`list lgpd releases failed (${error.code})`);
  return (data ?? []).map((row) => {
    const store = row.store as { name: string } | null;
    const operator = row.operator as { full_name: string | null; email: string | null } | null;
    return {
      id: row.id,
      createdAt: row.created_at,
      storeName: store?.name ?? null,
      reason: row.reason,
      channel: row.channel,
      recordFound: row.record_found,
      performedBy: operator?.full_name ?? operator?.email ?? null,
    };
  });
}
