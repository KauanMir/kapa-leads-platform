"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Erro inesperado: mensagem genérica (detalhes ficam só nos logs do servidor). */
export default function AdminError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <Card className="mx-auto max-w-lg p-8 text-center" role="alert">
      <h1 className="text-xl font-semibold">Algo deu errado</h1>
      <p className="mt-2 text-muted">Não foi possível carregar esta página. Tente novamente em instantes.</p>
      <Button className="mt-6" onClick={() => retry()}>
        Tentar novamente
      </Button>
    </Card>
  );
}
