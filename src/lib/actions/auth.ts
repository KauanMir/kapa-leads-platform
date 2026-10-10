"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import type { FormState } from "@/lib/actions/types";
import { changePasswordSchema, fieldErrors } from "@/lib/admin/schemas";
import { loadAdminAccess } from "@/lib/auth/access";
import { getAdminSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { refresh } from "next/cache";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(1).max(200),
});

export type LoginState = { error: string; email: string } | null;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").slice(0, 254);
  const parsed = loginSchema.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) return { error: "Informe um e-mail válido e a senha.", email };

  const db = await createSupabaseServerClient();
  const { data, error } = await db.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    const invalid = error?.code === "invalid_credentials" || error?.status === 400;
    return {
      error: invalid ? "E-mail ou senha incorretos." : "Não foi possível entrar agora. Tente novamente em instantes.",
      email,
    };
  }

  // Permissão vem do banco: perfil ativo e (para não-KAPA) vínculo ativo.
  const access = await loadAdminAccess(db, data.user.id);
  if (access.status !== "ok") {
    await db.auth.signOut();
    return {
      error:
        access.status === "inactive"
          ? "Usuário inativo. Fale com o administrador da KAPA."
          : "Seu usuário não está vinculado a nenhuma loja ativa.",
      email,
    };
  }

  redirect("/dashboard");
}

export async function logout() {
  const db = await createSupabaseServerClient();
  await db.auth.signOut();
  redirect("/login");
}

const nameSchema = z.object({ fullName: z.string().trim().min(2, "Mínimo de 2 caracteres").max(150, "Máximo de 150 caracteres") });

export async function updateOwnName(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = nameSchema.safeParse({ fullName: formData.get("fullName") });
  if (!parsed.success) return { ok: false, error: "Verifique o nome.", fieldErrors: fieldErrors(parsed.error) };

  const { db, context } = await getAdminSession();
  const { error } = await db.from("profiles").update({ full_name: parsed.data.fullName }).eq("id", context.userId);
  if (error) return { ok: false, error: "Não foi possível salvar o nome." };

  refresh();
  return { ok: true, message: "Nome atualizado." };
}

export async function changeOwnPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = changePasswordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { ok: false, error: "Verifique a nova senha.", fieldErrors: fieldErrors(parsed.error) };

  const { db } = await getAdminSession();
  const { error } = await db.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      ok: false,
      error: error.code === "same_password" ? "A nova senha deve ser diferente da atual." : "Não foi possível alterar a senha.",
    };
  }
  return { ok: true, message: "Senha alterada." };
}
