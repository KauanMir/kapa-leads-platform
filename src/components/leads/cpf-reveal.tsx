"use client";

import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { buttonClasses } from "@/components/ui/button";
import { revealCpfAction } from "@/lib/actions/leads";
import { formatCpf } from "@/lib/validation/cpf";

/** Quanto tempo o CPF fica visível antes de voltar a ser mascarado. */
const VISIBLE_MS = 60_000;

/**
 * CPF mascarado por padrão. O completo só é buscado no clique (função
 * auditada no banco: evento CPF_REVEALED), fica só neste estado local e some
 * sozinho após 1 minuto. Nunca vai para URL, log ou HTML inicial.
 */
export function CpfReveal({ leadId, masked }: { leadId: string; masked: string | null }) {
  const [cpf, setCpf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!cpf) return;
    const timer = setTimeout(() => setCpf(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [cpf]);

  function reveal() {
    setError(null);
    startTransition(async () => {
      const result = await revealCpfAction(leadId);
      if (result.ok && result.data) setCpf(result.data);
      else setError(result.ok ? "Não foi possível revelar." : result.error);
    });
  }

  async function copy() {
    if (!cpf) return;
    try {
      await navigator.clipboard.writeText(cpf);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const small = buttonClasses({ variant: "secondary", size: "sm" });
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="tabular-nums">{cpf ? formatCpf(cpf) : (masked ?? "—")}</span>
      {cpf ? (
        <>
          <button type="button" onClick={copy} className={small}>
            {copied ? <Check aria-hidden="true" className="size-4 text-success" /> : <Copy aria-hidden="true" className="size-4" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
          <button type="button" onClick={() => setCpf(null)} className={small}>
            <EyeOff aria-hidden="true" className="size-4" />
            Ocultar
          </button>
        </>
      ) : (
        <button type="button" onClick={reveal} disabled={pending} className={small}>
          <Eye aria-hidden="true" className="size-4" />
          {pending ? "Revelando…" : "REVELAR CPF"}
        </button>
      )}
      {error ? (
        <span role="alert" className="w-full text-sm font-normal text-danger">
          {error}
        </span>
      ) : null}
      {cpf ? <span className="w-full text-xs font-normal text-muted">Registrado no histórico. Some em 1 minuto.</span> : null}
    </span>
  );
}
