"use client";

import { useActionState, useEffect, useRef } from "react";

import { FieldError, FieldHint, Input, Label } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { createStoreAction } from "@/lib/actions/config";
import type { FormState } from "@/lib/actions/types";

export function StoreForm() {
  const [state, action] = useActionState<FormState, FormData>(createStoreAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="@container flex flex-col gap-4">
      <FormMessage state={state} />
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-3">
        <div>
          <Label htmlFor="store-name">Nome</Label>
          <Input id="store-name" name="name" required maxLength={150} aria-invalid={fieldError(state, "name") ? true : undefined} />
          <FieldError>{fieldError(state, "name")}</FieldError>
        </div>
        <div>
          <Label htmlFor="store-slug">Slug</Label>
          <Input id="store-slug" name="slug" required maxLength={64} placeholder="minha-loja" aria-describedby="store-slug-hint" aria-invalid={fieldError(state, "slug") ? true : undefined} />
          <FieldHint id="store-slug-hint">Identificador curto: minúsculas, números e hífens.</FieldHint>
          <FieldError>{fieldError(state, "slug")}</FieldError>
        </div>
        <div>
          <Label htmlFor="store-logo">Logo (URL, opcional)</Label>
          <Input id="store-logo" name="logoUrl" type="url" placeholder="https://" aria-invalid={fieldError(state, "logoUrl") ? true : undefined} />
          <FieldError>{fieldError(state, "logoUrl")}</FieldError>
        </div>
      </div>
      <div>
        <SubmitButton pendingLabel="Criando…">Criar loja</SubmitButton>
      </div>
    </form>
  );
}
