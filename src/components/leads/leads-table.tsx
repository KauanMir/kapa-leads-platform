import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/leads/status-badge";
import { EmptyState } from "@/components/ui/card";
import type { LeadListItem } from "@/lib/admin/leads";
import { formatDateTime } from "@/lib/format/datetime";
import { formatPhone } from "@/lib/format/phone";

/** Lista de leads: tabela no desktop, cards no mobile. Sem CPF. */
export function LeadsTable({ rows, showStore, emptyMessage = "Nenhum lead encontrado." }: { rows: LeadListItem[]; showStore: boolean; emptyMessage?: string }) {
  if (rows.length === 0) return <EmptyState title={emptyMessage}>Ajuste os filtros ou aguarde novos leads.</EmptyState>;

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-background/60 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Nome</th>
              <th scope="col" className="px-4 py-3 font-semibold">Telefone</th>
              {showStore ? <th scope="col" className="px-4 py-3 font-semibold">Loja</th> : null}
              <th scope="col" className="px-4 py-3 font-semibold">Campanha</th>
              <th scope="col" className="px-4 py-3 font-semibold">Origem</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              <th scope="col" className="px-4 py-3 font-semibold">Data/hora</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((lead) => (
              <tr key={lead.id} className="hover:bg-background/60">
                <td className="px-4 py-3">
                  <Link href={`/leads/${lead.id}`} className="font-semibold text-foreground hover:text-accent hover:underline">
                    {lead.fullName}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatPhone(lead.phone)}</td>
                {showStore ? <td className="px-4 py-3">{lead.storeName ?? "—"}</td> : null}
                <td className="px-4 py-3">{lead.campaignName ?? "—"}</td>
                <td className="px-4 py-3 text-muted">{lead.utmSource ?? "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={lead.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted">{formatDateTime(lead.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line md:hidden">
        {rows.map((lead) => (
          <li key={lead.id}>
            <Link href={`/leads/${lead.id}`} className="flex items-center gap-3 px-4 py-4 hover:bg-background/60">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{lead.fullName}</span>
                  <StatusBadge status={lead.status} />
                </div>
                <p className="mt-1 tabular-nums">{formatPhone(lead.phone)}</p>
                <p className="mt-1 text-sm text-muted">
                  {[showStore ? lead.storeName : null, lead.campaignName, lead.utmSource].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-0.5 text-sm tabular-nums text-muted">{formatDateTime(lead.createdAt)}</p>
              </div>
              <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
