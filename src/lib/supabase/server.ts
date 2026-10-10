import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

/**
 * Cliente Supabase com a SESSÃO do usuário (cookies) e chave publicável.
 * Todas as consultas passam pelo RLS como `authenticated`.
 *
 * `cache` do React deduplica a criação dentro de UMA requisição (não é
 * cache entre requisições/usuários).
 */
export const createSupabaseServerClient = cache(async () => {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicEnv();

  return createServerClient<Database>(url, publishableKey, {
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
