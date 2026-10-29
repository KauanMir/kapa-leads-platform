import Link from "next/link";

import type { AssigneeFilter } from "@/lib/admin/filters";

/**
 * Atalhos de fila (um clique). Filtro por um SDR específico fica no formulário.
 * `queueLabel`: a fila sem responsável ("Disponíveis" para o SDR, que só pode
 * assumir leads dela; "Sem responsável" para quem distribui).
 */
export function AssigneeTabs({
  current,
  hrefFor,
  queueLabel = "Sem responsável",
}: {
  current: AssigneeFilter;
  hrefFor: (value: AssigneeFilter) => string;
  queueLabel?: string;
}) {
  const TABS: Array<{ value: AssigneeFilter; label: string }> = [
    { value: "meus", label: "Meus leads" },
    { value: "sem", label: queueLabel },
    { value: "todos", label: "Todos" },
  ];
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
