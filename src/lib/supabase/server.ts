import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";

import { getSupabasePublicEnv, sessionCookieOptions } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

/**
 * Cliente Supabase com a SESSÃO do usuário (cookies) e chave publicável.
 * Todas as consultas passam pelo RLS como `authenticated`.
 *
 * `cache` do React deduplica a criação dentro de UMA requisição (não é
 * cache entre requisições/usuários).
 *
 * `connection()`: validar a sessão compara a expiração do JWT com o relógio
 * (`Date.now()` dentro do supabase-js), então tudo que usa este cliente só
 * roda com uma requisição real — nunca em prerender, nem no estágio
 * "runtime" em que `cookies()` já resolve. Também cobre o `new Date()` que
 * as páginas do Admin leem depois da sessão.
 */
export const createSupabaseServerClient = cache(async () => {
  await connection();
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Em Server Components os cookies são somente leitura; o proxy
          // (src/proxy.ts) já renova a sessão a cada requisição.
        }
      },
    },
  });
});
