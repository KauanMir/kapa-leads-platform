"use client";

import { Check, ClipboardCopy, NotebookPen } from "lucide-react";
import { useState } from "react";

import { buttonClasses } from "@/components/ui/button";

const HANDOFF_NOTE = "Encaminhado ao vendedor ";

/**
 * COPIAR RESUMO: texto limpo (sem CPF/nascimento/UTMs) para o SDR colar no
 * WhatsApp do vendedor. Nada é enviado: só a área de transferência. Depois,
 * oferece registrar o repasse como observação (o SDR completa o nome).
 */
export function SummaryCopy({ summary }: { summary: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(summary);
      setState("copied");
    } catch {
      setState("error");
    }
  }

  function startNote() {
    const field = document.getElementById("note-body");
    if (!(field instanceof HTMLTextAreaElement)) return;
    if (!field.value.trim()) {
      // Setter nativo + evento "input": o React enxerga a mudança (contador de caracteres).
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(field, HANDOFF_NOTE);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={copy} className={buttonClasses({ variant: "secondary", size: "lg", className: "h-12 flex-1 basis-40 text-base" })}>
          {state === "copied" ? <Check aria-hidden="true" className="size-5 text-success" /> : <ClipboardCopy aria-hidden="true" className="size-5" />}
          {state === "copied" ? "RESUMO COPIADO" : "COPIAR RESUMO"}
        </button>
        {state === "copied" ? (
          <button type="button" onClick={startNote} className={buttonClasses({ variant: "secondary", size: "lg", className: "h-12 flex-1 basis-40 text-base" })}>
            <NotebookPen aria-hidden="true" className="size-5" />
            ADICIONAR OBSERVAÇÃO
          </button>
        ) : null}
      </div>
      <p role="status" className={state === "error" ? "mt-2 text-sm text-danger" : "mt-2 text-sm text-muted"}>
        {state === "error"
          ? "Não foi possível copiar. Tente novamente."
          : state === "copied"
            ? "Cole no WhatsApp do vendedor. Depois registre o repasse (ex.: “Encaminhado ao vendedor João”)."
            : "Resumo para o vendedor, sem CPF e sem dados técnicos."}
      </p>
    </div>
  );
}
