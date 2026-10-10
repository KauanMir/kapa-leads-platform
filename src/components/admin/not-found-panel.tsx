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
    <Card className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-xl font-semibold">Não encontrado</h1>
      <p className="mt-2 text-muted">A página não existe ou você não tem acesso a ela.</p>
      <Link href="/dashboard" className={buttonClasses({ className: "mt-6" })}>
        Ir para o dashboard
      </Link>
    </Card>
  );
}
