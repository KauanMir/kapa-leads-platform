/** URL e chave publicável do Supabase (podem ir ao navegador; o acesso é controlado por RLS). */
export function getSupabasePublicEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Supabase public environment is not configured");
  }
  return { url, publishableKey };
}
