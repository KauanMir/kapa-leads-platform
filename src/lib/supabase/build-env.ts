/**
 * Checagem das variáveis para o build de produção (next.config.ts).
 * Sem imports com "@/": o next.config não resolve o alias.
 *
 * NEXT_PUBLIC_* são embutidas no build: sem elas o deploy sobe quebrado.
 * SUPABASE_SECRET_KEY é lida em runtime, mas sem ela a API pública e o Admin
 * de configuração falham — melhor travar o deploy.
 */
export function buildEnvErrors(env: Record<string, string | undefined>): string[] {
  const errors: string[] = [];

  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    errors.push("NEXT_PUBLIC_SUPABASE_URL ausente.");
  } else {
    try {
      const { protocol, hostname } = new URL(url);
      const local = hostname === "localhost" || hostname === "127.0.0.1";
      if (protocol !== "https:" && !(protocol === "http:" && local)) errors.push("NEXT_PUBLIC_SUPABASE_URL precisa ser https.");
    } catch {
      errors.push("NEXT_PUBLIC_SUPABASE_URL inválida.");
    }
  }

  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()) errors.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ausente.");
  if (!env.SUPABASE_SECRET_KEY?.trim()) errors.push("SUPABASE_SECRET_KEY ausente.");

  // Uma chave secreta com prefixo NEXT_PUBLIC_ iria para o navegador.
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith("NEXT_PUBLIC_") || !value) continue;
    if (/^sb_secret_/.test(value.trim()) || /SECRET|SERVICE_ROLE/.test(name)) {
      errors.push(`${name} parece uma chave secreta: variáveis NEXT_PUBLIC_* vão para o navegador. Remova-a.`);
    }
  }

  return errors;
}
