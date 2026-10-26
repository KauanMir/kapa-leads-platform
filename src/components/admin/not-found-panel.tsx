import { SearchX } from "lucide-react";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * "Não encontrado / sem acesso". Renderizado diretamente pelas páginas (em
 * vez de notFound()) para aparecer já no HTML do servidor, mesmo durante o
 * streaming. Não diferencia "não existe" de "sem permissão" de propósito.
 */
export function NotFoundPanel() {
  return (
    <Card className="mx-auto mt-6 max-w-md px-6 py-10 text-center sm:mt-12 sm:px-8">
      <span aria-hidden="true" className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border border-line bg-surface-muted text-muted">
        <SearchX className="size-5" />
      </span>
      <h1 className="text-xl font-semibold tracking-tight">Não encontrado</h1>
      <p className="mt-2 text-muted">A página não existe ou você não tem acesso a ela.</p>
      <Link href="/dashboard" className={buttonClasses({ className: "mt-6" })}>
        Ir para o dashboard
      </Link>
    </Card>
  );
}
