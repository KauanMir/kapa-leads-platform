import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

export type StoreMemberRole = Database["public"]["Enums"]["store_member_role"];
export type AdminRole = "SUPER_ADMIN" | StoreMemberRole;

export type AdminStore = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  /** Papel do usuário nesta loja (null para SUPER_ADMIN sem vínculo). */
  role: StoreMemberRole | null;
};

export type AdminContext = {
  userId: string;
  email: string | null;
  fullName: string | null;
  isSuperAdmin: boolean;
  /** Papel mais alto (para exibição). */
  role: AdminRole;
  /** Lojas acessíveis: todas para SUPER_ADMIN; vínculos ativos para os demais. */
  stores: AdminStore[];
};

export type AccessResult =
  | { status: "ok"; context: AdminContext }
  | { status: "inactive" }
  | { status: "no_store" }
  | { status: "no_profile" };

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  is_super_admin: boolean;
  is_active: boolean;
};

type MembershipRow = {
  role: StoreMemberRole;
  is_active: boolean;
  store: { id: string; name: string; slug: string; is_active: boolean } | null;
};

/**
 * Decide o acesso ao Admin a partir do perfil e dos vínculos (função pura).
 * As permissões vêm sempre do banco — nunca de e-mail ou dado do navegador.
 */
export function resolveAccess(
  profile: ProfileRow | null,
  memberships: MembershipRow[],
  allStores: Array<{ id: string; name: string; slug: string; is_active: boolean }>,
): AccessResult {
  if (!profile) return { status: "no_profile" };
  if (!profile.is_active) return { status: "inactive" };

  const activeMemberships = memberships.filter((m) => m.is_active && m.store);
  const roleByStore = new Map(activeMemberships.map((m) => [m.store!.id, m.role]));

  const stores: AdminStore[] = profile.is_super_admin
    ? allStores.map((s) => ({ id: s.id, name: s.name, slug: s.slug, isActive: s.is_active, role: roleByStore.get(s.id) ?? null }))
    : activeMemberships.map((m) => ({
        id: m.store!.id,
        name: m.store!.name,
        slug: m.store!.slug,
        isActive: m.store!.is_active,
        role: m.role,
      }));

  if (!profile.is_super_admin && stores.length === 0) return { status: "no_store" };

  stores.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const role: AdminRole = profile.is_super_admin
    ? "SUPER_ADMIN"
    : stores.some((s) => s.role === "STORE_ADMIN")
      ? "STORE_ADMIN"
      : "STORE_USER";

  return {
    status: "ok",
    context: {
      userId: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      isSuperAdmin: profile.is_super_admin,
      role,
      stores,
    },
  };
}

/** Carrega perfil e vínculos do usuário com o cliente da sessão (RLS). */
export async function loadAdminAccess(db: SupabaseClient<Database>, userId: string): Promise<AccessResult> {
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("id, email, full_name, is_super_admin, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw new Error(`load profile failed (${profileError.code})`);

  const { data: memberships, error: membershipError } = await db
    .from("store_members")
    .select("role, is_active, store:stores(id, name, slug, is_active)")
    .eq("user_id", userId);
  if (membershipError) throw new Error(`load memberships failed (${membershipError.code})`);

  let allStores: Array<{ id: string; name: string; slug: string; is_active: boolean }> = [];
  if (profile?.is_super_admin && profile.is_active) {
    const { data, error } = await db.from("stores").select("id, name, slug, is_active");
    if (error) throw new Error(`load stores failed (${error.code})`);
    allStores = data ?? [];
  }

  return resolveAccess(profile, memberships ?? [], allStores);
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super admin (KAPA)",
  // Operação: STORE_ADMIN = gerente/supervisor; STORE_USER = SDR (papel técnico inalterado no banco).
  STORE_ADMIN: "Gerente (admin da loja)",
  STORE_USER: "SDR",
};

/**
 * Gerente (STORE_ADMIN em alguma loja) ou KAPA: vê a visão da equipe e
 * distribui leads. Os demais são SDRs (STORE_USER). Só decide a TELA — as
 * permissões reais estão no banco (RLS e funções).
 */
export function isStoreManager(context: Pick<AdminContext, "isSuperAdmin" | "stores">): boolean {
  return context.isSuperAdmin || context.stores.some((store) => store.role === "STORE_ADMIN");
}
