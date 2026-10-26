"use client";

import { useActionState } from "react";

import { CheckboxCard, FieldError, FieldHint, Input, Label, Select, Textarea } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/actions/types";

export type CampaignFormDefaults = {
  storeId: string;
  name: string;
  slug: string;
  consentVersion: string;
  allowedOrigins: string;
  formSchema: string;
  isActive: boolean;
};

const FORM_SCHEMA_EXAMPLE = `{
  "downPaymentCents": { "label": "Valor da entrada", "format": "money" },
  "hasTradeIn": { "label": "Possui carro na troca", "format": "boolean" }
}`;

/** Criação/edição de campanha. A campaign_key não é editável aqui. */
export function CampaignForm({
  action,
  stores,
  defaults,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  stores: Array<{ id: string; name: string }>;
  defaults: CampaignFormDefaults;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const err = (field: string) => fieldError(state, field);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormMessage state={state} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="c-store">Loja</Label>
          <Select id="c-store" name="storeId" defaultValue={defaults.storeId} required aria-invalid={err("storeId") ? true : undefined}>
            <option value="" disabled>
              Selecione…
            </option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </Select>
          <FieldError>{err("storeId")}</FieldError>
        </div>
        <div>
          <Label htmlFor="c-name">Nome</Label>
          <Input id="c-name" name="name" defaultValue={defaults.name} required maxLength={150} aria-invalid={err("name") ? true : undefined} />
          <FieldError>{err("name")}</FieldError>
        </div>
        <div>
          <Label htmlFor="c-slug">Slug</Label>
          <Input id="c-slug" name="slug" defaultValue={defaults.slug} required maxLength={64} placeholder="duelo-de-aprovacoes" aria-invalid={err("slug") ? true : undefined} />
          <FieldError>{err("slug")}</FieldError>
        </div>
        <div>
          <Label htmlFor="c-consent">Versão do consentimento</Label>
          <Input
            id="c-consent"
            name="consentVersion"
            defaultValue={defaults.consentVersion}
            required
            maxLength={32}
            placeholder="2026-10-v1"
            aria-describedby="c-consent-hint"
            aria-invalid={err("consentVersion") ? true : undefined}
          />
          <FieldHint id="c-consent-hint">Ao mudar, a LP precisa enviar a nova versão — envios com a antiga são recusados.</FieldHint>
          <FieldError>{err("consentVersion")}</FieldError>
        </div>
      </div>

      <div>
        <Label htmlFor="c-origins">Origens permitidas (allowed_origins)</Label>
        <Textarea
          id="c-origins"
          name="allowedOrigins"
          rows={3}
          defaultValue={defaults.allowedOrigins}
          placeholder={"https://www.dominio-da-lp.com.br\nhttps://dominio-da-lp.com.br"}
          aria-describedby="c-origins-hint"
          aria-invalid={err("allowedOrigins") ? true : undefined}
          className="font-mono text-sm"
        />
        <FieldHint id="c-origins-hint">Uma por linha, no formato https://dominio — sem caminho e sem barra no final.</FieldHint>
        <FieldError>{err("allowedOrigins")}</FieldError>
      </div>

      <div>
        <Label htmlFor="c-schema">Campos do formulário (form_schema, JSON)</Label>
        <Textarea
          id="c-schema"
          name="formSchema"
          rows={8}
          defaultValue={defaults.formSchema}
          placeholder={FORM_SCHEMA_EXAMPLE}
          aria-describedby="c-schema-hint"
          aria-invalid={err("formSchema") ? true : undefined}
          className="font-mono text-sm"
          spellCheck={false}
        />
        <FieldHint id="c-schema-hint">
          Rótulos e formatos dos campos de formData. Formatos: text, number, money (centavos), boolean, date. Opcional.
        </FieldHint>
        <FieldError>{err("formSchema")}</FieldError>
      </div>

      <CheckboxCard name="isActive" defaultChecked={defaults.isActive}>
        <span className="font-medium">Campanha ativa (recebe leads)</span>
      </CheckboxCard>

      <div className="flex border-t border-line pt-5">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
