"use client";

import { UserCheck } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { assignLeadAction, claimLeadAction } from "@/lib/actions/leads";

type Option = { id: string; label: string };

/**
 * Responsável pelo lead. Gerente/KAPA trocam pelo seletor; SDR só pode
 * ASSUMIR um lead sem responsável. Quem decide é o banco (assign_lead).
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
      <p className="mb-1.5 text-sm font-medium">Responsável pelo lead</p>

      {canManage ? (
        <select
          aria-label="Responsável pelo lead"
          value={assignedTo ?? ""}
          disabled={pending}
          onChange={(event) => run(() => assignLeadAction(leadId, event.target.value), "Responsável atualizado.")}
          className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px] font-semibold"
        >
          <option value="">Sem responsável</option>
          {selectOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <p className="flex items-center gap-2 text-[15px] font-semibold">
          <UserCheck aria-hidden="true" className="size-4 text-muted" />
          {current ?? "Sem responsável"}
        </p>
      )}

      {!canManage && !assignedTo ? (
        <Button size="lg" className="mt-3 w-full" disabled={pending} onClick={() => run(() => claimLeadAction(leadId), "Lead assumido.")}>
          {pending ? "Assumindo…" : "ASSUMIR LEAD"}
        </Button>
      ) : null}

      <p role={message?.tone === "error" ? "alert" : "status"} className={`mt-2 text-sm ${message?.tone === "error" ? "text-danger" : "text-muted"}`}>
        {pending && canManage ? "Salvando…" : message?.text}
      </p>
    </div>
  );
}
