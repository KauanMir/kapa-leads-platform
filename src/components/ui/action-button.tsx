"use client";

import { useState, useTransition } from "react";

import { buttonClasses } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions/types";

/** Botão que executa uma Server Action já vinculada (ex.: ativar/desativar). */
export function ActionButton({
  action,
  children,
  confirmMessage,
  variant = "secondary",
}: {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  confirmMessage?: string;
  variant?: "secondary" | "danger" | "primary";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function run() {
    setError(null);
    setConfirming(false);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
    });
  }

  if (confirming) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-danger/20 bg-danger-soft/70 py-1.5 pl-3 pr-1.5">
        <span className="text-sm font-medium text-foreground">{confirmMessage}</span>
        <button type="button" onClick={run} className={buttonClasses({ variant: "danger", size: "sm" })}>
          Confirmar
        </button>
        <button type="button" onClick={() => setConfirming(false)} className={buttonClasses({ variant: "ghost", size: "sm" })}>
          Cancelar
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => (confirmMessage ? setConfirming(true) : run())}
        className={buttonClasses({ variant, size: "sm" })}
      >
        {pending ? "Salvando…" : children}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
