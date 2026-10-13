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
    <nav aria-label="Filas de leads" className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
      {TABS.map((tab) => {
        const active = tab.value === current;
        return (
          <Link
            key={tab.value}
            href={hrefFor(tab.value)}
            aria-current={active ? "page" : undefined}
            className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-center text-sm font-semibold transition-colors ${
              active ? "bg-accent text-white" : "text-muted hover:bg-background hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
