"use server";

import { refresh } from "next/cache";

import type { FormState } from "@/lib/actions/types";
import { lookupCpfCooldowns, releaseCpfCooldown, type CooldownRecord } from "@/lib/admin/lgpd";
import { fieldErrors, lgpdLookupSchema, lgpdReleaseSchema } from "@/lib/admin/schemas";
import { requireSuperAdmin } from "@/lib/auth/session";

/**
 * Pedidos do titular (LGPD) sobre o registro de bloqueio de CPF — só KAPA
 * (SUPER_ADMIN; o banco confere de novo). O CPF chega no corpo da Server Action,
 * é normalizado aqui e nunca volta na resposta, em URL ou em log.
 */

const DENIED: { ok: false; error: string } = { ok: false, error: "Sem permissão." };

export async function lookupCpfCooldownAction(_prev: FormState<{ records: CooldownRecord[] }>, formData: FormData): Promise<FormState<{ records: CooldownRecord[] }>> {
  const { db } = await requireSuperAdmin();
  const parsed = lgpdLookupSchema.safeParse({ cpf: formData.get("cpf") });
  if (!parsed.success) return { ok: false, error: "Verifique o CPF.", fieldErrors: fieldErrors(parsed.error) };

  const result = await lookupCpfCooldowns(db, parsed.data.cpf);
  if (!result.ok) return result.reason === "forbidden" ? DENIED : { ok: false, error: "CPF inválido." };
  return { ok: true, data: { records: result.data } };
}

export async function releaseCpfCooldownAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { db } = await requireSuperAdmin();
  const parsed = lgpdReleaseSchema.safeParse({
    cpf: formData.get("cpf"),
    storeId: formData.get("storeId"),
    reason: formData.get("reason"),
    identityVerified: formData.get("identityVerified"),
    confirmed: formData.get("confirmed"),
  });
  if (!parsed.success) return { ok: false, error: "Revise os campos.", fieldErrors: fieldErrors(parsed.error) };

  const { cpf, storeId, reason } = parsed.data;
  const result = await releaseCpfCooldown(db, { cpf, storeId, reason, identityVerified: true });
  if (!result.ok) {
    if (result.reason === "forbidden") return DENIED;
    if (result.reason === "not_found") return { ok: false, error: "Loja não encontrada." };
    return { ok: false, error: "Dados inválidos." };
  }
  refresh();
  return {
    ok: true,
    message: result.data.found
      ? "Registro de bloqueio eliminado nesta loja. O pedido foi registrado na auditoria."
      : "Não havia registro de bloqueio deste CPF nesta loja. O pedido foi registrado na auditoria.",
  };
}
