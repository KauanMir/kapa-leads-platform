import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { loadAdminAccess, type AdminContext } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Data Access Layer da sessão: lê o usuário (JWT verificado), o perfil e os
 * vínculos no banco. Sem sessão → /login; perfil inativo ou sem loja →
 * encerra a sessão. Deduplicado por requisição com `cache` do React.
 */
export const getAdminContext = cache(async (): Promise<AdminContext> => {
  const db = await createSupabaseServerClient();
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const access = await loadAdminAccess(db, userId);
  switch (access.status) {
    case "ok":
      return access.context;
    case "inactive":
      redirect("/auth/sair?motivo=inativo");
    case "no_store":
      redirect("/auth/sair?motivo=sem-acesso");
    case "no_profile":
      redirect("/auth/sair?motivo=sem-acesso");
  }
});

/** Cliente da sessão + contexto validado. Use em páginas e Server Actions. */
export async function getAdminSession() {
  const context = await getAdminContext();
  const db = await createSupabaseServerClient();
  return { db, context };
}

/** Páginas exclusivas da KAPA: null para quem não é SUPER_ADMIN (a página mostra "não encontrado"). */
export async function getSuperAdminSession() {
  const session = await getAdminSession();
  return session.context.isSuperAdmin ? session : null;
}

/** Server Actions exclusivas da KAPA: quem não é SUPER_ADMIN recebe 404. */
export async function requireSuperAdmin() {
  const session = await getSuperAdminSession();
  if (!session) notFound();
  return session;
}
