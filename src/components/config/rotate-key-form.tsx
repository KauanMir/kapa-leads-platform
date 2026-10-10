"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/actions/types";

/** Rotação explícita da campaign_key, com confirmação obrigatória. */
export function RotateKeyForm({ action }: { action: (state: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" required className="mt-0.5 size-4 accent-accent" />
        Entendo que a chave atual deixa de funcionar imediatamente e a Landing Page precisa ser atualizada com a nova chave.
      </label>
      <div>
        <SubmitButton variant="danger" pendingLabel="Gerando…">
          Gerar nova chave
        </SubmitButton>
      </div>
    </form>
  );
}
