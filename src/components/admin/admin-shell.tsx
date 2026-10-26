import { Building2, LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { MobileNav, Sidebar, type NavSection } from "@/components/admin/admin-nav";
import { Avatar, initials } from "@/components/ui/avatar";
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
        { href: "/config/lgpd", label: "Pedidos LGPD", icon: "privacy" },
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

/** Loja em que o usuário está (topo do menu). Só informa: o acesso vem dos vínculos. */
function StoreChip({ context }: { context: AdminContext }) {
  const name = storeContext(context);
  const single = !context.isSuperAdmin && context.stores.length === 1;
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-2 shadow-xs">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground text-[12px] font-semibold tracking-tight text-white"
      >
        {single ? initials(name) : <Building2 className="size-4" />}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">Loja</span>
        <span className="block truncate text-[14px] font-semibold text-foreground" title={name}>
          {name}
        </span>
      </span>
    </div>
  );
}

/** Usuário logado + sair (rodapé do menu). */
function UserFooter({ name, role }: { name: string; role: string }) {
  return (
    <div className="flex items-center gap-1">
      <Link href="/perfil" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-sidebar-hover">
        <Avatar name={name} size="sm" />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[14px] font-semibold text-foreground">{name}</span>
          <span className="block truncate text-xs text-muted">{role}</span>
        </span>
      </Link>
      <form action={logout}>
        <button
          type="submit"
          title="Sair"
          className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-sidebar-hover hover:text-foreground"
        >
          <LogOut aria-hidden="true" className="size-[18px]" />
          <span className="sr-only">Sair</span>
        </button>
      </form>
    </div>
  );
}

/** Largura útil do conteúdo: aproveita telas grandes até ~1600 px. */
export const CONTENT_CLASS = "mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8 xl:px-10";

export function AdminShell({ context, children }: { context: AdminContext; children: ReactNode }) {
  const sections = navFor(context);
  const displayName = context.fullName?.trim() || context.email || "Usuário";
  const footer = <UserFooter name={displayName} role={ROLE_LABELS[context.role]} />;
  const store = <StoreChip context={context} />;

  return (
    <div className="flex min-h-screen">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
        Pular para o conteúdo
      </a>
      <Sidebar sections={sections} context={store} footer={footer} />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav
          sections={sections}
          context={store}
          footer={footer}
          end={
            <Link href="/perfil" className="flex rounded-full">
              <Avatar name={displayName} size="sm" />
              <span className="sr-only">Meu perfil</span>
            </Link>
          }
        />

        <main id="conteudo" className={`kl-page flex-1 pb-28 pt-5 sm:pt-6 lg:pb-12 lg:pt-8 ${CONTENT_CLASS}`}>
          {children}
        </main>
      </div>
    </div>
  );
}

export function AdminShellSkeleton() {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-[248px] shrink-0 border-r border-sidebar-line bg-sidebar lg:block" />
      <div className="flex flex-1 flex-col">
        <div className="h-14 border-b border-line bg-surface lg:hidden" />
        <div className={`pt-5 sm:pt-6 lg:pt-8 ${CONTENT_CLASS}`} aria-busy="true" aria-live="polite">
          <span className="sr-only">Carregando…</span>
          <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-sunken" />
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-sunken" />
            ))}
          </div>
          <div className="mt-6 h-64 animate-pulse rounded-xl bg-surface-sunken" />
        </div>
      </div>
    </div>
  );
}
