"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { FieldError, Label, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { addNote } from "@/lib/actions/leads";
import type { FormState } from "@/lib/actions/types";

const MAX = 5000;

/** Observações são históricas: só inclusão (sem editar/apagar). */
export function NoteForm({ leadId }: { leadId: string }) {
  const [state, action] = useActionState<FormState, FormData>(addNote.bind(null, leadId), null);
  const [length, setLength] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  // Após salvar, limpa o formulário (o contador zera no evento "reset").
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  const error = state && !state.ok ? state.error : null;

  return (
    <form ref={formRef} action={action} onReset={() => setLength(0)} className="flex flex-col gap-2">
      <Label htmlFor="note-body" className="sr-only">
        Adicionar observação
      </Label>
      <Textarea
        id="note-body"
        name="body"
        rows={3}
        maxLength={MAX}
        required
        onChange={(event) => setLength(event.target.value.length)}
        aria-invalid={error ? true : undefined}
        aria-describedby="note-body-help"
        placeholder="Escreva uma observação… Ex.: cliente pediu retorno às 15h."
        className="resize-y bg-surface-muted focus:bg-surface"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id="note-body-help" className="text-[13px] text-muted">
          {length > MAX - 500 ? `${length}/${MAX} · ` : null}Não pode ser editada depois.
        </p>
        <SubmitButton pendingLabel="Salvando…" size="sm">
          Salvar observação
        </SubmitButton>
      </div>
      <FieldError>{error}</FieldError>
      {state?.ok ? (
        <p role="status" className="text-sm text-success">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
