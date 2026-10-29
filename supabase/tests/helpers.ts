/**
 * Utilitários dos testes remotos (Supabase real). Nunca imprimem chaves,
 * senhas ou dados pessoais.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomInt, randomUUID } from "node:crypto";

import type { Database } from "@/types/database";

import { assertDevSupabase } from "./production-guard";

export function loadRemoteEnv(flag: string) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Sem .env.local: as variáveis podem vir do ambiente.
  }
  if (process.env[flag] !== "true") {
    throw new Error(`Testes remotos bloqueados. Eles criam e removem dados reais no Supabase. Para executar, defina ${flag}=true.`);
  }
  // Defesa em profundidade (o globalSetup já confere): nunca rodar fora do Supabase DEV.
  assertDevSupabase(process.env);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publishableKey || !secretKey) {
    throw new Error("Variáveis do Supabase ausentes (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY).");
  }
  return { url, publishableKey, secretKey };
}

export const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

export function unwrap<R extends { data: unknown; error: { message: string } | null }>(result: R, what: string): NonNullable<R["data"]> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`${what}: ${result.error?.message ?? "sem dados"}`);
  }
  return result.data as NonNullable<R["data"]>;
}

/** CPF válido aleatório (somente dígitos). */
export function randomValidCpf(): string {
  let base: number[];
  do {
    base = Array.from({ length: 9 }, () => randomInt(10));
  } while (base.every((d) => d === base[0]));
  const check = (digits: number[]) => {
    const sum = digits.reduce((acc, d, i) => acc + d * (digits.length + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d10 = check(base);
  return [...base, d10, check([...base, d10])].join("");
}

export const TEST_EMAIL_DOMAIN = "example.com";

/** Cria usuário confirmado e devolve e-mail/senha (somente em memória). */
export async function createTestUser(admin: SupabaseClient<Database>, email: string, fullName: string) {
  const password = `${randomUUID()}Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  return { id: data.user.id, email, password };
}

export async function signIn(url: string, publishableKey: string, email: string, password: string) {
  const client = createClient<Database>(url, publishableKey, clientOptions);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn: ${error.message}`);
  return client;
}

/** Remove lojas (e dependências) e usuários de teste com o prefixo dado. */
export async function cleanupByPrefix(admin: SupabaseClient<Database>, prefix: string) {
  const { data: stores } = await admin.from("stores").select("id").like("slug", `${prefix}%`);
  const storeIds = (stores ?? []).map((s) => s.id);
  if (storeIds.length > 0) {
    await admin.from("leads").delete().in("store_id", storeIds);
    await admin.from("campaigns").delete().in("store_id", storeIds);
    await admin.from("stores").delete().in("id", storeIds);
  }
  await admin.from("user_creation_audit").delete().like("email", `${prefix}%@${TEST_EMAIL_DOMAIN}`);
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const user of users?.users ?? []) {
    if (user.email?.startsWith(prefix) && user.email.endsWith(`@${TEST_EMAIL_DOMAIN}`)) {
      await admin.auth.admin.deleteUser(user.id);
    }
  }
}
