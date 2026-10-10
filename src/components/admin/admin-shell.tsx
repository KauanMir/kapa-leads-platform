import { LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { MobileNav, Sidebar, type NavSection } from "@/components/admin/admin-nav";
import { logout } from "@/lib/actions/auth";
import { ROLE_LABELS, type AdminContext } from "@/lib/auth/access";

function navFor(context: AdminContext): NavSection[] {
  const sections: NavSection[] = [
    {
      items: [
        { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
        { href: "/leads", label: "Leads", icon: "leads" },
      ],
    },
  ];
  if (!context.isSuperAdmin && context.role === "STORE_ADMIN") {
    sections[0].items.push({ href: "/loja", label: "Minha loja", icon: "store" });
  }
  if (context.isSuperAdmin) {
    sections.push({
      title: "Configurações KAPA",
      items: [
        { href: "/config/lojas", label: "Lojas", icon: "stores" },
        { href: "/config/campanhas", label: "Campanhas", icon: "campaigns" },
        { href: "/config/usuarios", label: "Usuários", icon: "users" },
      ],
    });
  }
  return sections;
}

function storeContext(context: AdminContext): string {
  if (context.isSuperAdmin) return "Todas as lojas";
  if (context.stores.length === 1) return context.stores[0].name;
  return `${context.stores.length} lojas`;
}

export function AdminShell({ context, children }: { context: AdminContext; children: ReactNode }) {
  const sections = navFor(context);
  const displayName = context.fullName?.trim() || context.email || "Usuário";

  return (
    <div className="flex min-h-screen">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
        Pular para o conteúdo
      </a>
      <Sidebar sections={sections} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
          <MobileNav sections={sections} />
          <div className="min-w-0">
            <p className="text-xs text-muted">Contexto</p>
            <p className="truncate text-sm font-semibold">{storeContext(context)}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Link href="/perfil" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-background">
              <UserRound aria-hidden="true" className="size-5 text-muted" />
              <span className="hidden text-right sm:block">
                <span className="block max-w-48 truncate text-sm font-medium">{displayName}</span>
                <span className="block text-xs text-muted">{ROLE_LABELS[context.role]}</span>
              </span>
              <span className="sr-only sm:hidden">Meu perfil</span>
            </Link>
            <form action={logout}>
              <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted hover:bg-background hover:text-foreground">
                <LogOut aria-hidden="true" className="size-4" />
                <span className="hidden sm:inline">Sair</span>
                <span className="sr-only sm:hidden">Sair</span>
              </button>
            </form>
          </div>
        </header>

        <main id="conteudo" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export function AdminShellSkeleton() {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-line bg-surface lg:block" />
      <div className="flex flex-1 flex-col">
        <div className="h-16 border-b border-line bg-surface" />
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" aria-live="polite">
          <span className="sr-only">Carregando…</span>
          <div className="h-8 w-48 animate-pulse rounded-lg bg-line/70" />
          <div className="mt-6 h-64 animate-pulse rounded-xl bg-line/50" />
        </div>
      </div>
    </div>
  );
}
