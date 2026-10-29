"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionResult, FormState } from "@/lib/actions/types";
import {
  ConfigError,
  createCampaign,
  createStore,
  createUserAccount,
  type CreateUserResult,
  rotateCampaignKey,
  setMembershipActive,
  setStoreActive,
  updateCampaign,
  upsertMembership,
} from "@/lib/admin/config";
import { campaignInputSchema, createUserSchema, fieldErrors, membershipSchema, storeInputSchema } from "@/lib/admin/schemas";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Ações exclusivas do SUPER_ADMIN. Cada uma revalida a sessão e o papel no
 * banco (requireSuperAdmin) — nunca confia em ids/papéis vindos do navegador
 * sem validação. Escritas usam o cliente da sessão (RLS), exceto as que o
 * GRANT não permite ao usuário (criar usuário, ativar/desativar perfil).
 */

const uuid = z.uuid();

function configErrorMessage(error: unknown, duplicate: string): string {
  if (error instanceof ConfigError) {
    if (error.code === "duplicate") return duplicate;
    if (error.code === "forbidden") return "Sem permissão.";
    if (error.code === "not_found") return "Registro não encontrado.";
    if (error.code === "invalid") return "Dados inválidos.";
  }
  throw error;
}

// ---------------------------------------------------------------------
// Lojas
// ---------------------------------------------------------------------

export async function createStoreAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { db } = await requireSuperAdmin();
  const parsed = storeInputSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    logoUrl: formData.get("logoUrl"),
  });
  if (!parsed.success) return { ok: false, error: "Verifique os campos.", fieldErrors: fieldErrors(parsed.error) };

  try {
    await createStore(db, parsed.data);
  } catch (error) {
    return { ok: false, error: configErrorMessage(error, "Já existe uma loja com este slug."), fieldErrors: {} };
  }
  refresh();
  return { ok: true, message: "Loja criada." };
}

export async function setStoreActiveAction(storeId: string, isActive: boolean): Promise<ActionResult> {
  const { db } = await requireSuperAdmin();
  if (!uuid.safeParse(storeId).success) return { ok: false, error: "Loja inválida." };
  try {
    await setStoreActive(db, storeId, isActive);
  } catch (error) {
    return { ok: false, error: configErrorMessage(error, "") };
  }
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------
// Campanhas
// ---------------------------------------------------------------------

function parseCampaign(formData: FormData) {
  return campaignInputSchema.safeParse({
    storeId: formData.get("storeId"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    consentVersion: formData.get("consentVersion"),
    allowedOrigins: formData.get("allowedOrigins") ?? "",
    formSchema: formData.get("formSchema") ?? "",
    isActive: formData.get("isActive"),
  });
}

export async function createCampaignAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { db } = await requireSuperAdmin();
  const parsed = parseCampaign(formData);
  if (!parsed.success) return { ok: false, error: "Verifique os campos.", fieldErrors: fieldErrors(parsed.error) };

  let campaignId: string;
  try {
    campaignId = await createCampaign(db, parsed.data);
  } catch (error) {
    return { ok: false, error: configErrorMessage(error, "Já existe uma campanha com este slug nesta loja.") };
  }
  redirect(`/config/campanhas/${campaignId}?criada=1`);
}

export async function updateCampaignAction(campaignId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { db } = await requireSuperAdmin();
  if (!uuid.safeParse(campaignId).success) return { ok: false, error: "Campanha inválida." };
  const parsed = parseCampaign(formData);
  if (!parsed.success) return { ok: false, error: "Verifique os campos.", fieldErrors: fieldErrors(parsed.error) };

  try {
    await updateCampaign(db, campaignId, parsed.data);
  } catch (error) {
    return { ok: false, error: configErrorMessage(error, "Já existe uma campanha com este slug nesta loja.") };
  }
  refresh();
  return { ok: true, message: "Campanha salva." };
}

export async function rotateCampaignKeyAction(campaignId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { db } = await requireSuperAdmin();
  if (!uuid.safeParse(campaignId).success) return { ok: false, error: "Campanha inválida." };
  if (formData.get("confirm") !== "on") {
    return { ok: false, error: "Confirme que entende o impacto da troca de chave.", fieldErrors: { confirm: "Obrigatório" } };
  }

  try {
    await rotateCampaignKey(db, campaignId);
  } catch (error) {
    return { ok: false, error: configErrorMessage(error, "Tente novamente.") };
  }
  refresh();
  return { ok: true, message: "Nova chave gerada. Atualize a Landing Page." };
}

// ---------------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------------

const CREATE_USER_ERRORS: Record<Exclude<CreateUserResult, { ok: true }>["reason"], FormState> = {
  duplicate: { ok: false, error: "Já existe um usuário com este e-mail.", fieldErrors: { email: "Em uso" } },
  weak_password: { ok: false, error: "Senha fraca. Use uma senha mais longa e menos previsível.", fieldErrors: { password: "Senha fraca" } },
  forbidden: { ok: false, error: "Sem permissão." },
  invalid: { ok: false, error: "Não foi possível definir o acesso. Confira a loja e tente novamente." },
  failed: { ok: false, error: "Não foi possível criar o usuário. Tente novamente." },
  partial: { ok: false, error: "O acesso não foi definido e a conta não pôde ser desfeita. Desative-a em Usuários antes de tentar de novo." },
};

/**
 * Cria Administrador Geral (SUPER_ADMIN), Gerente ou SDR. Só SUPER_ADMIN chega
 * aqui (requireSuperAdmin) e o banco confere de novo ao definir o acesso.
 * A senha não é guardada nem exibida depois.
 */
export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { db } = await requireSuperAdmin();
  const parsed = createUserSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    access: formData.get("access"),
    storeId: formData.get("storeId") ?? "",
    confirmGlobal: formData.get("confirmGlobal"),
  });
  if (!parsed.success) return { ok: false, error: "Verifique os campos.", fieldErrors: fieldErrors(parsed.error) };

  const result = await createUserAccount(db, getSupabaseAdmin(), parsed.data);
  if (!result.ok) return CREATE_USER_ERRORS[result.reason];
  redirect(parsed.data.access === "SUPER_ADMIN" ? "/config/usuarios?criado=global" : "/config/usuarios?criado=1");
}

/** Ativa/desativa o perfil (bloqueia o login e todo acesso via RLS). */
export async function setUserActiveAction(userId: string, isActive: boolean): Promise<ActionResult> {
  const { context } = await requireSuperAdmin();
  if (!uuid.safeParse(userId).success) return { ok: false, error: "Usuário inválido." };
  if (userId === context.userId) return { ok: false, error: "Você não pode desativar o próprio usuário." };

  // is_active não é editável pelo papel authenticated (GRANT); feito no servidor após checar SUPER_ADMIN.
  const { data, error } = await getSupabaseAdmin().from("profiles").update({ is_active: isActive }).eq("id", userId).select("id");
  if (error || !data?.length) return { ok: false, error: "Não foi possível atualizar o usuário." };

  refresh();
  return { ok: true };
}

export async function saveMembershipAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { db } = await requireSuperAdmin();
  const parsed = membershipSchema.safeParse({
    userId: formData.get("userId"),
    storeId: formData.get("storeId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { ok: false, error: "Verifique os campos.", fieldErrors: fieldErrors(parsed.error) };

  try {
    await upsertMembership(db, parsed.data);
  } catch (error) {
    return { ok: false, error: configErrorMessage(error, "Vínculo já existe.") };
  }
  refresh();
  return { ok: true, message: "Vínculo salvo." };
}

export async function setMembershipActiveAction(userId: string, storeId: string, isActive: boolean): Promise<ActionResult> {
  const { db } = await requireSuperAdmin();
  if (!uuid.safeParse(userId).success || !uuid.safeParse(storeId).success) return { ok: false, error: "Dados inválidos." };
  try {
    await setMembershipActive(db, userId, storeId, isActive);
  } catch (error) {
    return { ok: false, error: configErrorMessage(error, "") };
  }
  refresh();
  return { ok: true };
}
