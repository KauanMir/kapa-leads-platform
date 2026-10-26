import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";

export function Pagination({ page, pageCount, total, hrefFor }: { page: number; pageCount: number; total: number; hrefFor: (page: number) => string }) {
  const disabled = "pointer-events-none opacity-45";
  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-muted/70 px-4 py-2.5 text-[13px] sm:px-5">
      <p className="num text-muted">
        <span className="font-semibold text-foreground">{total === 1 ? "1 lead" : `${total.toLocaleString("pt-BR")} leads`}</span>
        {pageCount > 1 ? <> · página {page} de {pageCount}</> : null}
      </p>
      <div className={pageCount > 1 ? "flex gap-2" : "hidden"}>
        <Link
          href={hrefFor(page - 1)}
          aria-disabled={page <= 1}
          tabIndex={page <= 1 ? -1 : undefined}
          className={buttonClasses({ variant: "secondary", size: "sm", className: page <= 1 ? disabled : "" })}
        >
          <ChevronLeft aria-hidden="true" />
          Anterior
        </Link>
        <Link
          href={hrefFor(page + 1)}
          aria-disabled={page >= pageCount}
          tabIndex={page >= pageCount ? -1 : undefined}
          className={buttonClasses({ variant: "secondary", size: "sm", className: page >= pageCount ? disabled : "" })}
        >
          Próxima
          <ChevronRight aria-hidden="true" />
        </Link>
      </div>
    </nav>
  );
}
