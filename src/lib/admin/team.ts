import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { StoreMemberRole } from "@/lib/auth/access";
import type { Database } from "@/types/database";

/**
 * Equipe das lojas do usuário (função store_team no banco): só nome, papel e
 * se está ativo — sem e-mail. Usada para mostrar responsáveis/autores e para
 * a lista de SDRs na atribuição.
 */

export type TeamMember = {
  storeId: string;
  userId: string;
  fullName: string;
  role: StoreMemberRole;
  isActive: boolean;
};

export async function getStoreTeam(db: SupabaseClient<Database>): Promise<TeamMember[]> {
  const { data, error } = await db.rpc("store_team");
  if (error) throw new Error(`store team failed (${error.code})`);
  return (data ?? [])
    .map((row) => ({ storeId: row.store_id, userId: row.user_id, fullName: row.full_name, role: row.role, isActive: row.is_active }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"));
}

/** id → nome (um usuário em várias lojas tem o mesmo nome). */
export function teamNames(team: TeamMember[]): Map<string, string> {
  return new Map(team.map((member) => [member.userId, member.fullName]));
}

/** Quem pode ser responsável por leads da loja: membros ativos (SDR primeiro). */
export function assignableMembers(team: TeamMember[], storeId: string): TeamMember[] {
  return team
    .filter((member) => member.storeId === storeId && member.isActive)
    .sort((a, b) => (a.role === b.role ? a.fullName.localeCompare(b.fullName, "pt-BR") : a.role === "STORE_USER" ? -1 : 1));
}

/** Membros distintos (por usuário) para filtros/KPIs; opcionalmente de uma loja. */
export function distinctMembers(team: TeamMember[], storeId?: string | null): TeamMember[] {
  const seen = new Map<string, TeamMember>();
  for (const member of team) {
    if (storeId && member.storeId !== storeId) continue;
    const current = seen.get(member.userId);
    if (!current || (!current.isActive && member.isActive)) seen.set(member.userId, member);
  }
  return [...seen.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"));
}
