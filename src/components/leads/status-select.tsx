"use client";

import { useOptimistic, useState, useTransition } from "react";

import { STATUS_STYLES } from "@/components/leads/status-badge";
import { changeLeadStatus } from "@/lib/actions/leads";
import { LEAD_STATUSES, STATUS_LABELS, isLeadStatus, type LeadStatus } from "@/lib/format/status";

/** Alteração de status com atualização otimista (o servidor valida via RLS). */
export function StatusSelect({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  function onChange(next: string) {
    if (!isLeadStatus(next) || next === optimisticStatus) return;
    setMessage(null);
    startTransition(async () => {
      setOptimisticStatus(next);
      const result = await changeLeadStatus(leadId, next);
      setMessage(result.ok ? { tone: "ok", text: "Status atualizado." } : { tone: "error", text: result.error });
    });
  }

  return (
    <div>
      <label htmlFor="lead-status" className="mb-1.5 block text-[13px] font-medium text-muted">
        Status
      </label>
      <div className="flex flex-col gap-1">
        <select
          id="lead-status"
          value={optimisticStatus}
          onChange={(event) => onChange(event.target.value)}
          disabled={pending}
          aria-describedby="lead-status-msg"
          className={`select-chevron h-11 w-full cursor-pointer rounded-lg px-3 pr-9 text-[15px] font-semibold ring-1 ring-inset transition-colors disabled:cursor-wait ${STATUS_STYLES[optimisticStatus]}`}
        >
          {LEAD_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <p id="lead-status-msg" role={message?.tone === "error" ? "alert" : "status"} className={`text-[13px] empty:hidden ${message?.tone === "error" ? "text-danger" : "text-muted"}`}>
          {pending ? "Salvando…" : message?.text}
        </p>
      </div>
    </div>
  );
}
