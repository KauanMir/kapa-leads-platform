import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";

export function Pagination({ page, pageCount, total, hrefFor }: { page: number; pageCount: number; total: number; hrefFor: (page: number) => string }) {
  const disabled = "pointer-events-none opacity-50";
  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
      <p className="text-muted">
        {total === 1 ? "1 lead" : `${total.toLocaleString("pt-BR")} leads`} · página {page} de {pageCount}
      </p>
      <div className="flex gap-2">
        <Link
          href={hrefFor(page - 1)}
          aria-disabled={page <= 1}
          tabIndex={page <= 1 ? -1 : undefined}
          className={buttonClasses({ variant: "secondary", size: "sm", className: page <= 1 ? disabled : "" })}
        >
          Anterior
        </Link>
        <Link
          href={hrefFor(page + 1)}
          aria-disabled={page >= pageCount}
          tabIndex={page >= pageCount ? -1 : undefined}
          className={buttonClasses({ variant: "secondary", size: "sm", className: page >= pageCount ? disabled : "" })}
        >
          Próxima
        </Link>
      </div>
    </nav>
  );
}
