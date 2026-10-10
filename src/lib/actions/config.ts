"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionResult, FormState } from "@/lib/actions/types";
import {
  ConfigError,
  createCampaign,
  createStore,
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

/** Cria usuário no Supabase Auth (servidor, chave secreta). A senha não é guardada nem exibida depois. */
export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { db } = await requireSuperAdmin();
  const parsed = createUserSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    storeId: formData.get("storeId") ?? "",
    role: formData.get("role"),
  });
  if (!parsed.success) return { ok: false, error: "Verifique os campos.", fieldErrors: fieldErrors(parsed.error) };
  const input = parsed.data;

  const { data, error } = await getSupabaseAdmin().auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (error || !data.user) {
    const exists = error?.code === "email_exists" || error?.status === 422;
    return {
      ok: false,
      error: exists ? "Já existe um usuário com este e-mail." : "Não foi possível criar o usuário.",
      fieldErrors: exists ? { email: "Em uso" } : {},
    };
  }

  if (input.storeId) {
    try {
      await upsertMembership(db, { userId: data.user.id, storeId: input.storeId, role: input.role });
    } catch {
      redirect(`/config/usuarios?criado=1&vinculo=falhou`);
    }
  }
  redirect("/config/usuarios?criado=1");
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
