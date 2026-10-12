/** URL e chave publicável do Supabase (podem ir ao navegador; o acesso é controlado por RLS). */
export function getSupabasePublicEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Supabase public environment is not configured");
  }
  return { url, publishableKey };
}

/**
 * Cookies da sessão do Admin. Só o servidor usa o Supabase Auth (não há
 * cliente no navegador), então podem ser HttpOnly; em produção, só HTTPS.
 * O resto (path "/", SameSite=Lax, validade) segue o padrão do @supabase/ssr.
 */
export function sessionCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production" } as const;
}
