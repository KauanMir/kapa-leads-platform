"use client";

import { Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { deleteLeadAction } from "@/lib/actions/leads";

/**
 * Ação administrativa e destrutiva: só abre a confirmação; quem decide se
 * pode excluir é o banco (delete_lead). Sucesso → a ação leva para /leads.
 */
export function DeleteLead({ leadId }: { leadId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open() {
    setError(null);
    dialogRef.current?.showModal();
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteLeadAction(leadId);
      // Com sucesso a ação redireciona e não há resultado para tratar aqui.
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <>
      <Button variant="danger" size="sm" onClick={open}>
        <Trash2 aria-hidden="true" className="size-4" />
        EXCLUIR LEAD
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby="delete-lead-title"
        aria-describedby="delete-lead-text"
        // Esc não fecha enquanto exclui (evita a impressão de que cancelou).
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-surface p-0 text-foreground shadow-xl ring-1 ring-line backdrop:bg-black/50"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
              <Trash2 className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 id="delete-lead-title" className="text-lg font-semibold">
                Excluir lead?
              </h2>
              <p id="delete-lead-text" className="mt-1.5 text-sm text-muted">
                Esta ação é permanente. O lead, observações e histórico relacionados serão removidos.
              </p>
            </div>
          </div>

          {error ? (
            <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" disabled={pending} onClick={() => dialogRef.current?.close()} autoFocus>
              Cancelar
            </Button>
            <Button variant="dangerSolid" disabled={pending} onClick={confirm}>
              {pending ? "Excluindo…" : "Excluir definitivamente"}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
