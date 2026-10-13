/**
 * Identificação do projeto Supabase pelo REF (o subdomínio de
 * `https://<ref>.supabase.co`), que não é segredo: já faz parte da URL pública.
 *
 * É a base da separação DEV x PRODUÇÃO (docs/ambientes.md): o build e as
 * suítes remotas decidem pelo ref, nunca só pelo nome de uma variável.
 * Sem imports com "@/": o next.config e o globalSetup do Vitest usam este arquivo.
 */

/** Supabase de PRODUÇÃO. Nunca recebe testes automatizados. */
export const PRODUCTION_SUPABASE_REF = "scjkyzdagwkscuxydgld";

/**
 * Supabase(s) de DESENVOLVIMENTO/TESTES. As suítes remotas só rodam em um ref
 * desta lista (lista vazia = suítes remotas bloqueadas).
 */
export const DEV_SUPABASE_REFS: readonly string[] = [];

/** Loja que só existe no DEV (supabase/seed-dev.sql). As suítes remotas exigem que ela exista. */
export const DEV_MARKER_STORE_SLUG = "vitrine-veiculos-dev";

export type SupabaseProjectKind = "production" | "dev" | "local" | "unknown";

/**
 * Ref do projeto a partir da URL, de forma estrita: só `https://<ref>.supabase.co`
 * (ref = 20 caracteres [a-z0-9], sem caminho/porta/credenciais). Qualquer outra
 * forma (domínio próprio, proxy, URL inválida) devolve null — quem chama deve
 * tratar null como "não identificado" e falhar fechado.
 */
export function supabaseProjectRef(url: string | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.port || parsed.username || parsed.password) return null;
  if (parsed.pathname.replace(/\/+$/, "") !== "" || parsed.search || parsed.hash) return null;
  const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(parsed.hostname);
  return match ? match[1] : null;
}

export function supabaseProjectKind(url: string | undefined): SupabaseProjectKind {
  if (url) {
    try {
      const { protocol, hostname } = new URL(url.trim());
      if (protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1")) return "local";
    } catch {
      return "unknown";
    }
  }
  const ref = supabaseProjectRef(url);
  if (ref === PRODUCTION_SUPABASE_REF) return "production";
  if (ref && DEV_SUPABASE_REFS.includes(ref)) return "dev";
  return "unknown";
}
