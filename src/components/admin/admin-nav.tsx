"use client";

import { Building2, Inbox, LayoutDashboard, Megaphone, Menu, ShieldCheck, Store, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { BrandMark } from "@/components/ui/icons";

export type NavItem = { href: string; label: string; icon: "dashboard" | "leads" | "store" | "stores" | "campaigns" | "users" | "privacy" };
export type NavSection = { title?: string; items: NavItem[] };

const ICONS = {
  dashboard: LayoutDashboard,
  leads: Inbox,
  store: Store,
  stores: Building2,
  campaigns: Megaphone,
  users: Users,
  privacy: ShieldCheck,
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-6">
      {sections.map((section, index) => (
        <div key={section.title ?? index}>
          {section.title ? (
            <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">{section.title}</p>
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`group flex h-10 items-center gap-3 rounded-lg px-2.5 text-[14px] font-medium transition-colors lg:h-9 ${
                      active ? "bg-accent-soft text-accent" : "text-sidebar-text hover:bg-sidebar-hover hover:text-foreground"
                    }`}
                  >
                    <Icon aria-hidden="true" className={`size-[18px] shrink-0 ${active ? "text-accent" : "text-subtle group-hover:text-foreground-soft"}`} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5 rounded-lg px-1 py-1">
      <BrandMark />
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight text-foreground">KAPA Leads</span>
        <span className="block text-xs text-muted">Painel de leads</span>
      </span>
    </Link>
  );
}

/** Conteúdo do menu (desktop e gaveta do celular). */
function SidebarBody({ sections, context, footer, onNavigate }: { sections: NavSection[]; context: ReactNode; footer: ReactNode; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-4">
        <Brand onNavigate={onNavigate} />
        <div className="mt-4">{context}</div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-5">
        <NavLinks sections={sections} onNavigate={onNavigate} />
      </div>
      <div className="border-t border-sidebar-line p-2.5">{footer}</div>
    </div>
  );
}

/** Menu lateral fixo no desktop. */
export function Sidebar({ sections, context, footer }: { sections: NavSection[]; context: ReactNode; footer: ReactNode }) {
  return (
    <aside className="hidden w-[248px] shrink-0 border-r border-sidebar-line bg-sidebar lg:block">
      <div className="sticky top-0 h-screen">
        <SidebarBody sections={sections} context={context} footer={footer} />
      </div>
    </aside>
  );
}

/**
 * Navegação do celular: barra superior (marca + perfil), barra inferior com os
 * atalhos principais e o botão "Menu", que abre a gaveta com todas as opções.
 */
export function MobileNav({ sections, context, footer, end }: { sections: NavSection[]; context: ReactNode; footer: ReactNode; end: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Atalhos: itens do primeiro grupo (Dashboard, Leads e, para o gerente, Minha loja).
  const shortcuts = sections[0]?.items.slice(0, 3) ?? [];
  const inShortcuts = shortcuts.some((item) => isActive(pathname, item.href));

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-surface/85 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-tight">KAPA Leads</span>
        </Link>
        <div className="ml-auto">{end}</div>
      </header>

      <nav aria-label="Atalhos" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/90 lg:hidden">
        <ul className="mx-auto flex max-w-lg">
          {shortcuts.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-16 flex-col items-center justify-center gap-1 text-[12px] font-medium ${active ? "text-accent" : "text-muted active:text-foreground"}`}
                >
                  <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? "bg-accent-soft" : ""}`}>
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-controls="mobile-nav"
              className={`flex h-16 w-full flex-col items-center justify-center gap-1 text-[12px] font-medium ${!inShortcuts ? "text-accent" : "text-muted active:text-foreground"}`}
            >
              <span className={`flex h-7 w-12 items-center justify-center rounded-full ${!inShortcuts ? "bg-accent-soft" : ""}`}>
                <Menu aria-hidden="true" className="size-5" />
              </span>
              Menu
            </button>
          </li>
        </ul>
      </nav>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" aria-label="Fechar menu" onClick={() => setOpen(false)} />
          <div id="mobile-nav" className="kl-drawer absolute inset-y-0 left-0 w-[300px] max-w-[86%] border-r border-line bg-sidebar shadow-overlay">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-2.5 top-3.5 z-10 inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-sidebar-hover hover:text-foreground"
              autoFocus
            >
              <X aria-hidden="true" className="size-5" />
              <span className="sr-only">Fechar menu</span>
            </button>
            <SidebarBody sections={sections} context={context} footer={footer} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
