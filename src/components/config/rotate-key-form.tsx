"use client";

import { useActionState } from "react";

import { CheckboxCard } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/actions/types";

/** Rotação explícita da campaign_key, com confirmação obrigatória. */
export function RotateKeyForm({ action }: { action: (state: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <CheckboxCard name="confirm" required tone="danger">
        Entendo que a chave atual deixa de funcionar imediatamente e a Landing Page precisa ser atualizada com a nova chave.
      </CheckboxCard>
      <div>
        <SubmitButton variant="danger" pendingLabel="Gerando…">
          Gerar nova chave
        </SubmitButton>
      </div>
    </form>
  );
}
