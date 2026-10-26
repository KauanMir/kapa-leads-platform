import Link from "next/link";

import type { AssigneeFilter } from "@/lib/admin/filters";

const TABS: Array<{ value: AssigneeFilter; label: string }> = [
  { value: "meus", label: "Meus leads" },
  { value: "sem", label: "Sem responsável" },
  { value: "todos", label: "Todos" },
];

/** Atalhos de fila (um clique). Filtro por um SDR específico fica no formulário. */
export function AssigneeTabs({ current, hrefFor }: { current: AssigneeFilter; hrefFor: (value: AssigneeFilter) => string }) {
  return (
    <nav aria-label="Filas de leads" className="flex gap-1 overflow-x-auto px-2 sm:gap-2 sm:px-4">
      {TABS.map((tab) => {
        const active = tab.value === current;
        return (
          <Link
            key={tab.value}
            href={hrefFor(tab.value)}
            aria-current={active ? "page" : undefined}
            className={`relative -mb-px flex h-12 flex-1 items-center justify-center whitespace-nowrap border-b-2 px-3 text-[14px] font-semibold transition-colors sm:flex-none ${
              active ? "border-accent text-foreground" : "border-transparent text-muted hover:border-line-strong hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
