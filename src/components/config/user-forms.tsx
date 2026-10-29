"use client";

import { useActionState, useState } from "react";

import { CheckboxCard, FieldError, FieldHint, Input, Label, Select } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { createUserAction, saveMembershipAction } from "@/lib/actions/config";
import type { FormState } from "@/lib/actions/types";
import type { UserAccess } from "@/lib/admin/schemas";

type StoreOption = { id: string; name: string };

function RoleSelect({ id, defaultValue = "STORE_USER" }: { id: string; defaultValue?: string }) {
  return (
    <Select id={id} name="role" defaultValue={defaultValue}>
      <option value="STORE_USER">SDR (atende os leads)</option>
      <option value="STORE_ADMIN">Gerente (admin da loja)</option>
    </Select>
  );
}

const ACCESS_OPTIONS: Array<{ value: UserAccess; title: string; description: string }> = [
  { value: "SUPER_ADMIN", title: "Administrador Geral", description: "Todas as lojas e as Configurações da KAPA." },
  { value: "STORE_ADMIN", title: "Gerente de Loja", description: "Leads, campanhas e equipe da loja escolhida." },
  { value: "STORE_USER", title: "SDR", description: "Atende os leads da loja escolhida." },
];

/**
 * Criação de usuário (servidor + Supabase Admin API). A senha não é exibida depois.
 * O tipo de acesso decide os campos: Administrador Geral não tem loja e exige
 * confirmação do acesso global; Gerente e SDR exigem a loja. O servidor revalida tudo.
 */
export function CreateUserForm({ stores }: { stores: StoreOption[] }) {
  // Cada resposta do servidor incrementa `count`: os campos são remontados a partir
  // do estado (o reset automático do React não deixa o rádio divergir do tipo escolhido).
  const [submission, action] = useActionState<{ state: FormState; count: number }, FormData>(
    async (previous, formData) => ({ state: await createUserAction(previous.state, formData), count: previous.count + 1 }),
    { state: null, count: 0 },
  );
  const state = submission.state;
  const err = (field: string) => fieldError(state, field);
  // Continuam preenchidos se o servidor recusar (a senha e a confirmação não).
  const [access, setAccess] = useState<UserAccess>("STORE_USER");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [storeId, setStoreId] = useState("");
  const isGlobal = access === "SUPER_ADMIN";

  return (
    <form action={action} className="flex flex-col gap-5" autoComplete="off">
      <FormMessage state={state} />

      <div key={submission.count} className="flex flex-col gap-5">
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-foreground-soft">Tipo de acesso</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {ACCESS_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface px-3.5 py-3 text-sm transition-colors hover:bg-surface-muted has-[:checked]:border-accent-line has-[:checked]:bg-accent-soft/60"
              >
                <input
                  type="radio"
                  name="access"
                  value={option.value}
                  checked={access === option.value}
                  onChange={() => setAccess(option.value)}
                  className="mt-0.5 size-4 shrink-0 accent-accent"
                />
                <span className="min-w-0">
                  <span className="block font-semibold">{option.title}</span>
                  <span className="mt-0.5 block leading-snug text-muted">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
          <FieldError>{err("access")}</FieldError>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="u-name">Nome completo</Label>
            <Input
              id="u-name"
              name="fullName"
              required
              maxLength={150}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              aria-invalid={err("fullName") ? true : undefined}
            />
            <FieldError>{err("fullName")}</FieldError>
          </div>
          <div>
            <Label htmlFor="u-email">E-mail</Label>
            <Input
              id="u-email"
              name="email"
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={err("email") ? true : undefined}
            />
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
          {isGlobal ? null : (
            <div>
              <Label htmlFor="u-store">Loja</Label>
              <Select
                id="u-store"
                name="storeId"
                required
                value={storeId}
                onChange={(event) => setStoreId(event.target.value)}
                aria-describedby={stores.length === 0 ? "u-store-hint" : undefined}
                aria-invalid={err("storeId") ? true : undefined}
              >
                <option value="" disabled>
                  Selecione…
                </option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </Select>
              {stores.length === 0 ? <FieldHint id="u-store-hint">Nenhuma loja ativa. Crie ou reative uma loja antes.</FieldHint> : null}
              <FieldError>{err("storeId")}</FieldError>
            </div>
          )}
        </div>

        {isGlobal ? (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] leading-snug text-muted">
              Acesso global: todas as lojas, atuais e futuras, sem vínculo com uma loja específica.
            </p>
            <CheckboxCard name="confirmGlobal" required aria-invalid={err("confirmGlobal") ? true : undefined}>
              Confirmo que esta pessoa terá acesso de <strong>Administrador Geral</strong>: todas as lojas e leads, campanhas, usuários e as
              Configurações da KAPA.
            </CheckboxCard>
            <FieldError>{err("confirmGlobal")}</FieldError>
          </div>
        ) : null}
      </div>

      <div className="flex border-t border-line pt-5">
        <SubmitButton pendingLabel="Criando…">{isGlobal ? "Criar administrador geral" : "Criar usuário"}</SubmitButton>
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
