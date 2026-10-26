"use client";

import { useActionState, useState } from "react";

import { CheckboxCard, FieldError, FieldHint, Input, Label, Select } from "@/components/ui/field";
import { FormMessage, fieldError } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { lookupCpfCooldownAction, releaseCpfCooldownAction } from "@/lib/actions/lgpd";
import type { FormState } from "@/lib/actions/types";
import { LGPD_REASONS, LGPD_REASON_LABELS } from "@/lib/admin/lgpd-options";
import type { CooldownRecord } from "@/lib/admin/lgpd";
import { formatDateTime } from "@/lib/format/datetime";

/**
 * Pedido do titular sobre o bloqueio de CPF, em duas etapas: 1) consultar em
 * quais lojas o CPF tem registro; 2) escolher a loja, o motivo, confirmar a
 * verificação de identidade e a eliminação. O CPF só vai no corpo das Server
 * Actions (nunca em URL) e o campo é limpo depois da eliminação.
 */
export function LgpdCpfForm() {
  const [cpf, setCpf] = useState("");
  const [lookup, lookupAction] = useActionState<FormState<{ records: CooldownRecord[] }>, FormData>(lookupCpfCooldownAction, null);
  const [release, releaseAction] = useActionState<FormState, FormData>(releaseCpfCooldownAction, null);
  // Resultado da consulta só vale para o CPF consultado: mudou o CPF, some.
  const [lookedUp, setLookedUp] = useState<string | null>(null);

  // Eliminação concluída: limpa o CPF da tela (ajuste de estado no render, sem efeito).
  const [handledRelease, setHandledRelease] = useState(release);
  if (release !== handledRelease) {
    setHandledRelease(release);
    if (release?.ok) {
      setCpf("");
      setLookedUp(null);
    }
  }

  const records = lookup?.ok && lookedUp === cpf ? (lookup.data?.records ?? []) : null;

  return (
    <div className="flex flex-col gap-6">
      <form action={lookupAction} onSubmit={() => setLookedUp(cpf)} className="flex flex-col gap-3" autoComplete="off">
        {lookup && !lookup.ok ? <FormMessage state={lookup} /> : null}
        <div className="max-w-sm">
          <Label htmlFor="lgpd-cpf">CPF do titular</Label>
          <Input
            id="lgpd-cpf"
            name="cpf"
            inputMode="numeric"
            autoComplete="off"
            maxLength={14}
            required
            value={cpf}
            onChange={(event) => setCpf(event.target.value)}
            aria-describedby="lgpd-cpf-hint"
            aria-invalid={fieldError(lookup, "cpf") ? true : undefined}
          />
          <FieldHint id="lgpd-cpf-hint">Com ou sem pontuação. Não fica salvo nem aparece na auditoria.</FieldHint>
          <FieldError>{fieldError(lookup, "cpf")}</FieldError>
        </div>
        <div>
          <SubmitButton variant="secondary" pendingLabel="Consultando…">
            Consultar registros
          </SubmitButton>
        </div>
      </form>

      {release?.ok ? <FormMessage state={release} /> : null}

      {records !== null && records.length === 0 ? (
        <p role="status" className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm">
          Nenhum registro de bloqueio para este CPF. Não há nada a eliminar.
        </p>
      ) : null}

      {records !== null && records.length > 0 ? (
        <form action={releaseAction} className="flex flex-col gap-4 rounded-lg border border-line bg-surface-muted/50 p-4 sm:p-5">
          <input type="hidden" name="cpf" value={cpf} />
          {release && !release.ok ? <FormMessage state={release} /> : null}

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Loja</legend>
            <div className="flex flex-col gap-2">
              {records.map((record) => (
                <label key={record.storeId} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm transition-colors hover:bg-surface-muted has-[:checked]:border-accent-line has-[:checked]:bg-accent-soft">
                  <input type="radio" name="storeId" value={record.storeId} required className="mt-0.5 size-4 accent-accent" defaultChecked={records.length === 1} />
                  <span>
                    <span className="font-semibold">{record.storeName}</span>
                    <span className="block text-muted">
                      {record.active
                        ? `Bloqueio vigente até ${formatDateTime(record.blockedUntil)}`
                        : `Bloqueio vencido em ${formatDateTime(record.blockedUntil)} (aguardando a limpeza diária)`}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <FieldError>{fieldError(release, "storeId")}</FieldError>
          </fieldset>

          <div className="max-w-md">
            <Label htmlFor="lgpd-reason">Motivo do pedido</Label>
            <Select id="lgpd-reason" name="reason" required defaultValue="" aria-invalid={fieldError(release, "reason") ? true : undefined}>
              <option value="" disabled>
                Escolha…
              </option>
              {LGPD_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {LGPD_REASON_LABELS[reason]}
                </option>
              ))}
            </Select>
            <FieldError>{fieldError(release, "reason")}</FieldError>
          </div>

          <CheckboxCard name="identityVerified" required tone="danger">
            Confirmo que verifiquei a identidade do titular pelo canal oficial e que o pedido é legítimo.
          </CheckboxCard>
          <FieldError>{fieldError(release, "identityVerified")}</FieldError>

          <CheckboxCard name="confirmed" required tone="danger">
            Confirmo a eliminação do registro de bloqueio deste CPF <strong>só na loja escolhida</strong>. Depois disso, o titular poderá
            fazer uma nova solicitação nessa loja. A ação é permanente.
          </CheckboxCard>
          <FieldError>{fieldError(release, "confirmed")}</FieldError>

          <div>
            <SubmitButton variant="danger" pendingLabel="Eliminando…">
              Eliminar registro de bloqueio
            </SubmitButton>
          </div>
        </form>
      ) : null}
    </div>
  );
}
