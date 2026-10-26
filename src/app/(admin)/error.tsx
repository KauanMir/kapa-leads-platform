"use client";

import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Erro inesperado: mensagem genérica (detalhes ficam só nos logs do servidor). */
export default function AdminError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <Card className="mx-auto mt-6 max-w-md px-6 py-10 text-center sm:mt-12 sm:px-8" role="alert">
      <span aria-hidden="true" className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border border-danger/20 bg-danger-soft text-danger">
        <TriangleAlert className="size-5" />
      </span>
      <h1 className="text-xl font-semibold tracking-tight">Algo deu errado</h1>
      <p className="mt-2 text-muted">Não foi possível carregar esta página. Tente novamente em instantes.</p>
      <Button className="mt-6" onClick={() => retry()}>
        Tentar novamente
      </Button>
    </Card>
  );
}
