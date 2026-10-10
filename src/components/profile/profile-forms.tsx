"use client";

import { useActionState, useEffect, useRef } from "react";

import { FieldError, Input, Label } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { changeOwnPassword, updateOwnName } from "@/lib/actions/auth";
import type { FormState } from "@/lib/actions/types";

export function NameForm({ fullName }: { fullName: string }) {
  const [state, action] = useActionState<FormState, FormData>(updateOwnName, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <div>
        <Label htmlFor="p-name">Nome</Label>
        <Input id="p-name" name="fullName" defaultValue={fullName} required maxLength={150} aria-invalid={fieldError(state, "fullName") ? true : undefined} />
        <FieldError>{fieldError(state, "fullName")}</FieldError>
      </div>
      <div>
        <SubmitButton>Salvar nome</SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(changeOwnPassword, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="p-password">Nova senha</Label>
          <Input id="p-password" name="password" type="password" required minLength={10} maxLength={72} autoComplete="new-password" aria-invalid={fieldError(state, "password") ? true : undefined} />
          <FieldError>{fieldError(state, "password")}</FieldError>
        </div>
        <div>
          <Label htmlFor="p-confirm">Confirmar nova senha</Label>
          <Input id="p-confirm" name="confirm" type="password" required minLength={10} maxLength={72} autoComplete="new-password" aria-invalid={fieldError(state, "confirm") ? true : undefined} />
          <FieldError>{fieldError(state, "confirm")}</FieldError>
        </div>
      </div>
      <div>
        <SubmitButton pendingLabel="Alterando…">Alterar senha</SubmitButton>
      </div>
    </form>
  );
}
