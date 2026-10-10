import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoginForm } from "@/app/(auth)/login/login-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Entrar · KAPA Leads" };

const NOTICES: Record<string, string> = {
  inativo: "Usuário inativo. Fale com o administrador da KAPA.",
  "sem-acesso": "Seu usuário não está vinculado a nenhuma loja ativa.",
};

/** Lê a sessão (por requisição): quem já está logado vai direto ao Admin. */
async function LoginContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const db = await createSupabaseServerClient();
  const { data } = await db.auth.getClaims();
  if (data?.claims?.sub) redirect("/dashboard");

  const { erro } = await searchParams;
  const notice = typeof erro === "string" ? (NOTICES[erro] ?? null) : null;
  return <LoginForm notice={notice} />;
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-2xl font-bold tracking-tight">
            KAPA <span className="font-medium text-muted">Leads</span>
          </p>
          <p className="mt-1 text-sm text-muted">Acesse o painel de leads</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-6 shadow-sm sm:p-8">
          <h1 className="mb-6 text-lg font-semibold">Entrar</h1>
          <Suspense fallback={<div className="h-72" aria-busy="true" />}>
            <LoginContent searchParams={props.searchParams} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
