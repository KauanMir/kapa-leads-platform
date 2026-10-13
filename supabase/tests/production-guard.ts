/**
 * Trava global das suítes remotas (rls, api, admin, e2e): elas CRIAM e
 * APAGAM usuários, lojas e leads. Só podem rodar no Supabase DEV.
 *
 * Falha fechado — aborta antes de qualquer escrita se QUALQUER item falhar:
 *  1. o ref da NEXT_PUBLIC_SUPABASE_URL é lido de forma estrita
 *     (https://<ref>.supabase.co); domínio próprio/proxy/URL estranha = aborta;
 *  2. o ref não é o de produção (PRODUCTION_SUPABASE_REF);
 *  3. o ref está na lista de DEV (DEV_SUPABASE_REFS, versionada no código);
 *  4. E2E_BASE_URL (servidor testado no e2e) é localhost;
 *  5. ao vivo: a chave secreta é aceita PELO PROJETO DESSA URL e o banco tem a
 *     loja-marcador do DEV (supabase/seed-dev.sql), que nunca existe em produção.
 *
 * Ou seja: não basta mudar o nome de uma variável; o projeto é identificado
 * pelo ref e pelo conteúdo do próprio banco. Ver docs/ambientes.md.
 */
import { DEV_MARKER_STORE_SLUG, DEV_SUPABASE_REFS, PRODUCTION_SUPABASE_REF, supabaseProjectRef } from "../../src/lib/supabase/project";

export class RemoteTestsBlocked extends Error {
  constructor(reason: string) {
    super(`Testes remotos BLOQUEADOS: ${reason} Eles criam e apagam dados; só rodam no Supabase DEV (docs/ambientes.md).`);
  }
}

/** Itens 1–4 (sem rede). Lança RemoteTestsBlocked; devolve o ref DEV. */
export function assertDevSupabase(env: Record<string, string | undefined>): string {
  const ref = supabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL);
  if (!ref) {
    throw new RemoteTestsBlocked("NEXT_PUBLIC_SUPABASE_URL ausente ou fora do formato https://<ref>.supabase.co (projeto não identificado).");
  }
  if (ref === PRODUCTION_SUPABASE_REF) {
    throw new RemoteTestsBlocked("NEXT_PUBLIC_SUPABASE_URL aponta para o Supabase de PRODUÇÃO.");
  }
  if (!DEV_SUPABASE_REFS.includes(ref)) {
    throw new RemoteTestsBlocked(`o projeto ${ref} não está em DEV_SUPABASE_REFS (src/lib/supabase/project.ts).`);
  }
  if (env.E2E_BASE_URL) {
    let host = "";
    try {
      host = new URL(env.E2E_BASE_URL).hostname;
    } catch {
      // host vazio → bloqueado abaixo
    }
    if (host !== "localhost" && host !== "127.0.0.1") {
      throw new RemoteTestsBlocked("E2E_BASE_URL precisa ser um servidor local (localhost), iniciado com o .env.local do DEV.");
    }
  }
  return ref;
}

/** Item 5 (ao vivo): a chave é deste projeto e o banco é o DEV (loja-marcador). */
export async function assertDevDatabase(env: Record<string, string | undefined>): Promise<void> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL!.trim().replace(/\/+$/, "");
  const secretKey = env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) throw new RemoteTestsBlocked("SUPABASE_SECRET_KEY ausente.");
  const response = await fetch(`${url}/rest/v1/stores?select=slug&slug=eq.${DEV_MARKER_STORE_SLUG}`, {
    headers: { apikey: secretKey, authorization: `Bearer ${secretKey}` },
  });
  if (!response.ok) {
    throw new RemoteTestsBlocked(`a chave secreta não foi aceita pelo projeto da URL (HTTP ${response.status}).`);
  }
  const rows = (await response.json()) as unknown[];
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new RemoteTestsBlocked(`loja-marcador "${DEV_MARKER_STORE_SLUG}" não encontrada (rode supabase/seed-dev.sql no DEV).`);
  }
}

export default async function setup() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Sem .env.local: as variáveis podem vir do ambiente.
  }
  assertDevSupabase(process.env);
  await assertDevDatabase(process.env);
}
