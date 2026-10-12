/**
 * Trava global das suítes remotas (rls, api, admin, e2e): elas CRIAM e
 * APAGAM usuários, lojas e leads. Nunca podem rodar no Supabase de produção.
 *
 * Para rodar, use um projeto Supabase separado de desenvolvimento/testes
 * (docs/banco-e-seguranca.md). O ref abaixo não é segredo: ele já faz parte
 * da URL pública do Supabase.
 */
export const PRODUCTION_SUPABASE_REFS = ["scjkyzdagwkscuxydgld"];

export function isProductionSupabase(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const ref = new URL(url).hostname.split(".")[0];
    return PRODUCTION_SUPABASE_REFS.includes(ref);
  } catch {
    return false;
  }
}

export default function setup() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Sem .env.local: as variáveis podem vir do ambiente.
  }
  if (isProductionSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    throw new Error(
      "Testes remotos BLOQUEADOS: NEXT_PUBLIC_SUPABASE_URL aponta para o Supabase de PRODUÇÃO. " +
        "Eles criam e apagam dados. Use um projeto Supabase separado de desenvolvimento/testes.",
    );
  }
}
