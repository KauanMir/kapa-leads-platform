"use client";

import { UserRoundX } from "lucide-react";
import { useState, useTransition } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { assignLeadAction, claimLeadAction } from "@/lib/actions/leads";

type Option = { id: string; label: string };

/**
 * Responsável pelo lead. Gerente/KAPA trocam pelo seletor (transferência,
 * registrada como ASSIGNED no histórico); SDR só pode ASSUMIR um lead sem
 * responsável — exclusivo, sem tomar o de outro. Quem decide é o banco (assign_lead).
 */
export function AssigneeCard({
  leadId,
  assignedTo,
  assigneeName,
  currentUserId,
  canManage,
  options,
}: {
  leadId: string;
  assignedTo: string | null;
  assigneeName: string | null;
  currentUserId: string;
  canManage: boolean;
  options: Option[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(result.ok ? { tone: "ok", text: okText } : { tone: "error", text: result.error ?? "Não foi possível salvar." });
    });
  }

  const current = assignedTo === currentUserId ? "Você" : (assigneeName ?? (assignedTo ? "Membro da equipe" : null));
  // O responsável atual pode estar inativo: continua visível no seletor até ser trocado.
  const selectOptions = assignedTo && !options.some((o) => o.id === assignedTo) ? [{ id: assignedTo, label: `${current} (inativo)` }, ...options] : options;

  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-muted">Responsável</p>

      {canManage ? (
        <select
          aria-label="Responsável pelo lead"
          value={assignedTo ?? ""}
          disabled={pending}
          onChange={(event) => run(() => assignLeadAction(leadId, event.target.value), "Responsável atualizado.")}
          className="select-chevron h-11 w-full cursor-pointer rounded-lg border border-line-strong bg-surface px-3 pr-9 text-[15px] font-semibold shadow-xs transition-colors hover:border-[#c3c9d4] disabled:cursor-wait"
        >
          <option value="">Sem responsável</option>
          {selectOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <p className="flex h-11 items-center gap-2.5 text-[15px] font-semibold">
          {current ? (
            <Avatar name={assigneeName ?? current} size="sm" />
          ) : (
            <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full border border-dashed border-warning-line bg-warning-soft text-warning">
              <UserRoundX className="size-4" />
            </span>
          )}
          {current ?? "Sem responsável"}
        </p>
      )}

      {!canManage && !assignedTo ? (
        <Button size="lg" className="mt-2 w-full" disabled={pending} onClick={() => run(() => claimLeadAction(leadId), "Lead assumido.")}>
          {pending ? "Assumindo…" : "ASSUMIR LEAD"}
        </Button>
      ) : null}

      <p role={message?.tone === "error" ? "alert" : "status"} className={`mt-1 text-[13px] empty:hidden ${message?.tone === "error" ? "text-danger" : "text-muted"}`}>
        {pending && canManage ? "Salvando…" : message?.text}
      </p>
      {canManage && assignedTo && !pending && !message ? (
        <p className="mt-1 text-[13px] text-subtle">Transferências ficam registradas no histórico.</p>
      ) : null}
    </div>
  );
}
