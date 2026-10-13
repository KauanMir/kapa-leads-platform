/**
 * Checagem das variáveis para o build de produção (next.config.ts).
 * Sem imports com "@/": o next.config não resolve o alias.
 *
 * Na Vercel (VERCEL_ENV), o build também confere QUAL Supabase está
 * configurado: Production → só o de produção; Preview/Development → só DEV.
 *
 * NEXT_PUBLIC_* são embutidas no build: sem elas o deploy sobe quebrado.
 * SUPABASE_SECRET_KEY é lida em runtime, mas sem ela a API pública e o Admin
 * de configuração falham — melhor travar o deploy.
 */
import { supabaseProjectKind } from "./project";

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

  // Separação DEV x PRODUÇÃO na Vercel (docs/ambientes.md), decidida pelo ref do projeto.
  if (url) {
    const kind = supabaseProjectKind(url);
    if (env.VERCEL_ENV === "production" && kind !== "production") {
      errors.push("Deploy de PRODUÇÃO precisa usar o Supabase de produção (NEXT_PUBLIC_SUPABASE_URL aponta para outro projeto).");
    }
    if ((env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "development") && kind !== "dev") {
      errors.push(
        kind === "production"
          ? "Deploy de PREVIEW não pode usar o Supabase de PRODUÇÃO. Configure as variáveis do Supabase DEV no ambiente Preview."
          : "Deploy de PREVIEW precisa usar um Supabase DEV conhecido (DEV_SUPABASE_REFS em src/lib/supabase/project.ts).",
      );
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
