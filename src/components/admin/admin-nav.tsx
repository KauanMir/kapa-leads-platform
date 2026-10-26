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
    <nav aria-label="Menu principal" className="flex flex-col gap-7">
      {sections.map((section, index) => (
        <div key={section.title ?? index}>
          {section.title ? (
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-sidebar-text/70">{section.title}</p>
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
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors ${
                      active ? "bg-white/[0.08] text-white" : "text-sidebar-text hover:bg-sidebar-hover hover:text-white"
                    }`}
                  >
                    {active ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[#5b8cff]" /> : null}
                    <Icon aria-hidden="true" className={`size-[18px] shrink-0 ${active ? "text-[#8fb0ff]" : "text-sidebar-text/80 group-hover:text-white"}`} />
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
    <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-3 rounded-xl px-2 py-1">
      <BrandMark />
      <span className="leading-tight">
        <span className="block text-[15px] font-bold tracking-tight text-white">KAPA Leads</span>
        <span className="block text-xs text-sidebar-text">Painel de leads</span>
      </span>
    </Link>
  );
}

/** Conteúdo do menu (desktop e gaveta do celular). */
function SidebarBody({ sections, context, footer, onNavigate }: { sections: NavSection[]; context: ReactNode; footer: ReactNode; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-5">
        <Brand onNavigate={onNavigate} />
        <div className="mt-5">{context}</div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-6">
        <NavLinks sections={sections} onNavigate={onNavigate} />
      </div>
      <div className="border-t border-sidebar-line p-3">{footer}</div>
    </div>
  );
}

/** Menu lateral fixo (escuro) no desktop. */
export function Sidebar({ sections, context, footer }: { sections: NavSection[]; context: ReactNode; footer: ReactNode }) {
  return (
    <aside className="hidden w-64 shrink-0 bg-sidebar lg:block">
      <div className="sticky top-0 h-screen">
        <SidebarBody sections={sections} context={context} footer={footer} />
      </div>
    </aside>
  );
}

/** Barra superior + gaveta de navegação no celular. */
export function MobileNav({ sections, context, footer, end }: { sections: NavSection[]; context: ReactNode; footer: ReactNode; end: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-sidebar-line bg-sidebar px-3 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="inline-flex size-10 items-center justify-center rounded-xl text-white hover:bg-sidebar-hover"
      >
        <Menu aria-hidden="true" className="size-5" />
        <span className="sr-only">Abrir menu</span>
      </button>
      <Link href="/dashboard" className="flex items-center gap-2">
        <BrandMark className="size-8 text-sm" />
        <span className="text-[15px] font-bold tracking-tight text-white">KAPA Leads</span>
      </Link>
      <div className="ml-auto">{end}</div>

      {open ? (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-[#060a14]/60 backdrop-blur-[2px]" aria-label="Fechar menu" onClick={() => setOpen(false)} />
          <div id="mobile-nav" className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-sidebar shadow-2xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-5 z-10 inline-flex size-10 items-center justify-center rounded-xl text-sidebar-text hover:bg-sidebar-hover hover:text-white"
              autoFocus
            >
              <X aria-hidden="true" className="size-5" />
              <span className="sr-only">Fechar menu</span>
            </button>
            <SidebarBody sections={sections} context={context} footer={footer} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </header>
  );
}
