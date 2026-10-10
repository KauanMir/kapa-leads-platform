"use client";

import { Building2, LayoutDashboard, Megaphone, Menu, Store, Users, X, Inbox } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type NavItem = { href: string; label: string; icon: "dashboard" | "leads" | "store" | "stores" | "campaigns" | "users" };
export type NavSection = { title?: string; items: NavItem[] };

const ICONS = {
  dashboard: LayoutDashboard,
  leads: Inbox,
  store: Store,
  stores: Building2,
  campaigns: Megaphone,
  users: Users,
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
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted">{section.title}</p>
          ) : null}
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-medium transition-colors ${
                      active ? "bg-accent-soft text-accent" : "text-foreground hover:bg-background"
                    }`}
                  >
                    <Icon aria-hidden="true" className="size-5 shrink-0" />
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

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-baseline gap-1.5 px-3">
      <span className="text-lg font-bold tracking-tight">KAPA</span>
      <span className="text-sm font-medium text-muted">Leads</span>
    </Link>
  );
}

/** Menu lateral fixo no desktop. */
export function Sidebar({ sections }: { sections: NavSection[] }) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-line bg-surface lg:block">
      <div className="sticky top-0 flex h-screen flex-col gap-6 overflow-y-auto px-3 py-5">
        <Brand />
        <NavLinks sections={sections} />
      </div>
    </aside>
  );
}

/** Botão + gaveta de navegação no mobile. */
export function MobileNav({ sections }: { sections: NavSection[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="inline-flex size-10 items-center justify-center rounded-lg border border-line-strong bg-surface"
      >
        <Menu aria-hidden="true" className="size-5" />
        <span className="sr-only">Abrir menu</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-foreground/30" aria-label="Fechar menu" onClick={() => setOpen(false)} />
          <div id="mobile-nav" className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col gap-6 bg-surface px-3 py-5 shadow-xl">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-background"
                autoFocus
              >
                <X aria-hidden="true" className="size-5" />
                <span className="sr-only">Fechar menu</span>
              </button>
            </div>
            <NavLinks sections={sections} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
