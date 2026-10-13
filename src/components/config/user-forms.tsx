"use client";

import { useActionState } from "react";

import { FieldError, FieldHint, Input, Label, Select } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { createUserAction, saveMembershipAction } from "@/lib/actions/config";
import type { FormState } from "@/lib/actions/types";

type StoreOption = { id: string; name: string };

function RoleSelect({ id, defaultValue = "STORE_USER" }: { id: string; defaultValue?: string }) {
  return (
    <Select id={id} name="role" defaultValue={defaultValue}>
      <option value="STORE_USER">SDR (atende os leads)</option>
      <option value="STORE_ADMIN">Gerente (admin da loja)</option>
    </Select>
  );
}

/** Criação de usuário (servidor + Supabase Admin API). A senha não é exibida depois. */
export function CreateUserForm({ stores }: { stores: StoreOption[] }) {
  const [state, action] = useActionState<FormState, FormData>(createUserAction, null);
  const err = (field: string) => fieldError(state, field);

  return (
    <form action={action} className="flex flex-col gap-5" autoComplete="off">
      <FormMessage state={state} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="u-name">Nome completo</Label>
          <Input id="u-name" name="fullName" required maxLength={150} aria-invalid={err("fullName") ? true : undefined} />
          <FieldError>{err("fullName")}</FieldError>
        </div>
        <div>
          <Label htmlFor="u-email">E-mail</Label>
          <Input id="u-email" name="email" type="email" required autoComplete="off" aria-invalid={err("email") ? true : undefined} />
          <FieldError>{err("email")}</FieldError>
        </div>
        <div>
          <Label htmlFor="u-password">Senha inicial</Label>
          <Input
            id="u-password"
            name="password"
            type="password"
            required
            minLength={10}
            maxLength={72}
            autoComplete="new-password"
            aria-describedby="u-password-hint"
            aria-invalid={err("password") ? true : undefined}
          />
          <FieldHint id="u-password-hint">Mínimo de 10 caracteres. Ela não será exibida depois; o usuário pode trocá-la em “Meu perfil”.</FieldHint>
          <FieldError>{err("password")}</FieldError>
        </div>
        <div>
          <Label htmlFor="u-store">Loja (opcional)</Label>
          <Select id="u-store" name="storeId" defaultValue="">
            <option value="">Sem vínculo por enquanto</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="u-role">Papel na loja</Label>
          <RoleSelect id="u-role" />
        </div>
      </div>
      <div>
        <SubmitButton pendingLabel="Criando…">Criar usuário</SubmitButton>
      </div>
    </form>
  );
}

/** Adiciona vínculo ou altera o papel (reativa se estiver inativo). */
export function MembershipForm({ userId, stores }: { userId: string; stores: StoreOption[] }) {
  const [state, action] = useActionState<FormState, FormData>(saveMembershipAction, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <input type="hidden" name="userId" value={userId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <Label htmlFor={`m-store-${userId}`}>Loja</Label>
          <Select id={`m-store-${userId}`} name="storeId" defaultValue="" required>
            <option value="" disabled>
              Selecione…
            </option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </Select>
          <FieldError>{fieldError(state, "storeId")}</FieldError>
        </div>
        <div>
          <Label htmlFor={`m-role-${userId}`}>Papel</Label>
          <RoleSelect id={`m-role-${userId}`} />
        </div>
        <SubmitButton>Salvar vínculo</SubmitButton>
      </div>
    </form>
  );
}
