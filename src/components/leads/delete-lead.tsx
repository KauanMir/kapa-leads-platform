"use client";

import { Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { deleteLeadAction } from "@/lib/actions/leads";

/**
 * Ação administrativa e destrutiva: só abre a confirmação; quem decide se
 * pode excluir é o banco (delete_lead). Sucesso → a ação leva para /leads.
 *
 * Campanha com bloqueio de CPF (ex.: Fábrica de Aprovação): excluir o lead NÃO
 * libera o CPF. Só a KAPA (`canReleaseCpfCooldown`), ao atender um pedido de
 * eliminação do titular (LGPD), pode remover o bloqueio junto — o banco confere.
 */
export function DeleteLead({
  leadId,
  cpfCooldownDays = null,
  canReleaseCpfCooldown = false,
}: {
  leadId: string;
  cpfCooldownDays?: number | null;
  canReleaseCpfCooldown?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [releaseCpf, setReleaseCpf] = useState(false);
  const [identityVerified, setIdentityVerified] = useState(false);
  const hasCooldown = cpfCooldownDays !== null;
  const releasing = hasCooldown && canReleaseCpfCooldown && releaseCpf;

  function open() {
    setError(null);
    setReleaseCpf(false);
    setIdentityVerified(false);
    dialogRef.current?.showModal();
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteLeadAction(leadId, releasing, releasing && identityVerified);
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
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-surface p-0 text-foreground shadow-overlay backdrop:bg-foreground/40 backdrop:backdrop-blur-[2px]"
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
                {hasCooldown ? ` O bloqueio de ${cpfCooldownDays} dias úteis para novas solicitações deste CPF continua valendo.` : null}
              </p>
            </div>
          </div>

          {hasCooldown && canReleaseCpfCooldown ? (
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm">
              <input
                type="checkbox"
                name="release-cpf-cooldown"
                checked={releaseCpf}
                disabled={pending}
                onChange={(event) => setReleaseCpf(event.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-danger"
              />
              <span>
                <span className="font-medium">Pedido de eliminação do titular (LGPD)</span>
                <span className="mt-0.5 block text-muted">Remover também o bloqueio do CPF. Use só para atender o titular, nunca para liberar uma nova simulação.</span>
              </span>
            </label>
          ) : null}

          {releasing ? (
            <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-lg border border-danger/25 bg-danger-soft/60 px-4 py-3 text-sm">
              <input
                type="checkbox"
                name="identity-verified"
                checked={identityVerified}
                disabled={pending}
                onChange={(event) => setIdentityVerified(event.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-danger"
              />
              <span className="font-medium">Confirmo que verifiquei a identidade do titular e que o pedido de eliminação é legítimo.</span>
            </label>
          ) : null}

          {error ? (
            <p role="alert" className="mt-4 rounded-lg border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <div className="-mx-6 -mb-6 mt-6 flex flex-col-reverse gap-2 border-t border-line bg-surface-muted px-6 py-4 sm:flex-row sm:justify-end">
            <Button variant="secondary" disabled={pending} onClick={() => dialogRef.current?.close()} autoFocus>
              Cancelar
            </Button>
            <Button variant="dangerSolid" disabled={pending || (releasing && !identityVerified)} onClick={confirm}>
              {pending ? "Excluindo…" : "Excluir definitivamente"}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
