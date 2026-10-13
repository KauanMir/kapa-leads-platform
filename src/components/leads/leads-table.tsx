import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/leads/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/card";
import type { LeadListItem } from "@/lib/admin/leads";
import { formatDateTime, formatRelative } from "@/lib/format/datetime";
import { formatPhone } from "@/lib/format/phone";

/** Nomes da equipe (id → nome) e o usuário logado, para a coluna Responsável. */
export type AssigneeLabels = { names: Record<string, string>; currentUserId: string };

function assigneeLabel(id: string, labels: AssigneeLabels): string {
  if (id === labels.currentUserId) return "Você";
  return labels.names[id] ?? "Membro da equipe";
}

function Assignee({ id, labels }: { id: string | null; labels: AssigneeLabels }) {
  if (!id) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning ring-1 ring-inset ring-amber-200">
        Sem responsável
      </span>
    );
  }
  const label = assigneeLabel(id, labels);
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar name={labels.names[id] ?? label} size="xs" />
      <span className="truncate text-sm font-medium">{label}</span>
    </span>
  );
}

/** Lista de leads: tabela no desktop, cards no celular. Sem CPF. A linha inteira abre o lead. */
export function LeadsTable({
  rows,
  showStore,
  assignees,
  emptyMessage = "Nenhum lead encontrado.",
}: {
  rows: LeadListItem[];
  showStore: boolean;
  assignees: AssigneeLabels;
  emptyMessage?: string;
}) {
  if (rows.length === 0) return <EmptyState title={emptyMessage}>Ajuste os filtros ou aguarde novos leads.</EmptyState>;
  const now = new Date();
  const origin = (lead: LeadListItem) => [showStore ? lead.storeName : null, lead.campaignName].filter(Boolean).join(" · ");

  return (
    <>
      <div className="hidden md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-surface-muted text-[11px] uppercase tracking-[0.06em] text-muted">
            <tr>
              <th scope="col" className="py-3 pl-5 pr-4 font-semibold">Lead</th>
              <th scope="col" className="px-4 py-3 font-semibold">Telefone</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              <th scope="col" className="px-4 py-3 font-semibold">Responsável</th>
              <th scope="col" className="py-3 pl-4 pr-5 text-right font-semibold">Recebido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((lead) => (
              <tr key={lead.id} className="group relative transition-colors hover:bg-accent-soft/40">
                <td className="py-3.5 pl-5 pr-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={lead.fullName} size="md" />
                    <div className="min-w-0">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="block truncate text-[15px] font-semibold text-foreground after:absolute after:inset-0 group-hover:text-accent"
                      >
                        {lead.fullName}
                      </Link>
                      {origin(lead) ? <p className="truncate text-[13px] text-muted">{origin(lead)}</p> : null}
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 font-medium tabular-nums">{formatPhone(lead.phone)}</td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={lead.status} />
                </td>
                <td className="max-w-48 px-4 py-3.5">
                  <Assignee id={lead.assignedTo} labels={assignees} />
                </td>
                <td className="whitespace-nowrap py-3.5 pl-4 pr-5 text-right">
                  <time dateTime={lead.createdAt} title={formatDateTime(lead.createdAt)} className="tabular-nums text-muted">
                    {formatRelative(lead.createdAt, now)}
                  </time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line md:hidden">
        {rows.map((lead) => (
          <li key={lead.id}>
            <Link href={`/leads/${lead.id}`} className="flex gap-3 px-4 py-4 active:bg-surface-muted">
              <Avatar name={lead.fullName} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-[15px] font-semibold">{lead.fullName}</span>
                  <time dateTime={lead.createdAt} className="shrink-0 pt-0.5 text-xs tabular-nums text-muted">
                    {formatRelative(lead.createdAt, now)}
                  </time>
                </div>
                <p className="mt-0.5 font-medium tabular-nums">{formatPhone(lead.phone)}</p>
                {origin(lead) ? <p className="truncate text-[13px] text-muted">{origin(lead)}</p> : null}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <StatusBadge status={lead.status} />
                  <Assignee id={lead.assignedTo} labels={assignees} />
                </div>
              </div>
              <ChevronRight aria-hidden="true" className="mt-3 size-5 shrink-0 text-line-strong" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
