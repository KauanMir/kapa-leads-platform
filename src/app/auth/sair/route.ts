import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const REASONS = new Set(["inativo", "sem-acesso"]);

/**
 * Encerra a sessão quando o servidor detecta perfil inativo ou sem loja
 * (Server Components não podem apagar cookies). O logout normal é a Server
 * Action `logout`.
 */
export async function GET(request: NextRequest) {
  const db = await createSupabaseServerClient();
  await db.auth.signOut();

  const reason = request.nextUrl.searchParams.get("motivo");
  const target = new URL("/login", request.url);
  if (reason && REASONS.has(reason)) target.searchParams.set("erro", reason);
  return NextResponse.redirect(target);
}
