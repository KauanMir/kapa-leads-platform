import type { Metadata } from "next";
import Link from "next/link";

import { LeadFilters } from "@/components/leads/lead-filters";
import { LeadsTable } from "@/components/leads/leads-table";
import { STATUS_DOTS } from "@/components/leads/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { listCampaigns } from "@/lib/admin/config";
import { filtersToQuery, parseUrlFilters, toLeadFilters, type AssigneeFilter } from "@/lib/admin/filters";
import { EMPTY_BLOCK, formatConversion, formatDuration, summarizeKpis } from "@/lib/admin/kpis";
import { getLeadKpis, listLeads } from "@/lib/admin/leads";
import { campaignOptions, storeOptions } from "@/lib/admin/options";
import { distinctMembers, getStoreTeam } from "@/lib/admin/team";
import { isStoreManager } from "@/lib/auth/access";
import { getAdminSession } from "@/lib/auth/session";
import { PERIOD_LABELS } from "@/lib/format/period";
import { LEAD_STATUSES, STATUS_LABELS, type LeadStatus } from "@/lib/format/status";

export const metadata: Metadata = { title: "Dashboard · KAPA Leads" };

const DEFAULT_PERIOD = "30d";

type KpiCard = { label: string; value: string; href?: string; status?: LeadStatus; hint?: string };

function KpiCards({ cards, label }: { cards: KpiCard[]; label: string }) {
  return (
    <section aria-label={label} className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => {
        const content = (
          <>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {card.status ? <span aria-hidden="true" className={`size-2 rounded-full ${STATUS_DOTS[card.status]}`} /> : null}
              {card.label}
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{card.value}</p>
            {card.hint ? <p className="mt-1 text-xs text-muted">{card.hint}</p> : null}
          </>
        );
        const className = "rounded-xl border border-line bg-surface p-4";
        return card.href ? (
          <Link key={card.label} href={card.href} className={`${className} transition-colors hover:border-line-strong`}>
            {content}
          </Link>
        ) : (
          <div key={card.label} className={className}>
            {content}
          </div>
        );
      })}
    </section>
  );
}

const n = (value: number) => value.toLocaleString("pt-BR");

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const searchParams = await props.searchParams;
  const { db, context } = await getAdminSession();
  const manager = isStoreManager(context);

  const filters = parseUrlFilters(searchParams, DEFAULT_PERIOD);
  const scoped = { ...filters, q: "", status: null, assignee: "todos" as AssigneeFilter, page: 1 };
  const leadFilters = toLeadFilters(scoped, new Date(), context.userId);

  const [kpiRows, recent, campaigns, team] = await Promise.all([
    getLeadKpis(db, leadFilters),
    listLeads(db, manager ? leadFilters : { ...leadFilters, assignedTo: context.userId }, 1, 10),
    listCampaigns(db),
    getStoreTeam(db),
  ]);
  const kpis = summarizeKpis(kpiRows);

  const showStore = context.isSuperAdmin || context.stores.length > 1;
  // Os cards levam para /leads com o mesmo período/campanha/loja.
  const leadsDefault: AssigneeFilter = manager ? "todos" : "meus";
  const leadsHref = (next: { status?: LeadStatus; assignee?: AssigneeFilter }) =>
    `/leads${filtersToQuery({ ...scoped, assignee: next.assignee ?? leadsDefault, status: next.status ?? null }, "tudo", leadsDefault)}`;

  const firstContactHint = "Média até o 1º atendimento registrado";
  let cards: KpiCard[];
  if (manager) {
    cards = [
      { label: "Leads recebidos", value: n(kpis.total), href: leadsHref({ assignee: "todos" }) },
      { label: "Sem responsável", value: n(kpis.unassigned), href: leadsHref({ assignee: "sem" }) },
      { label: "Pendentes", value: n(kpis.pending), hint: "Novos + contatados + em atendimento" },
      { label: "Conversão", value: formatConversion(kpis.conversion), hint: "Ganhos ÷ (ganhos + perdidos)" },
      { label: "1º atendimento", value: formatDuration(kpis.avgFirstContactSeconds), hint: firstContactHint },
      ...LEAD_STATUSES.map((status) => ({ label: STATUS_LABELS[status], value: n(kpis.byStatus[status]), status, href: leadsHref({ status }) })),
    ];
  } else {
    const mine = kpis.byAssignee.get(context.userId) ?? EMPTY_BLOCK;
    cards = [
      { label: "Meus novos", value: n(mine.byStatus.NEW), status: "NEW", href: leadsHref({ status: "NEW" }) },
      { label: "Meus contatados", value: n(mine.byStatus.CONTACTED), status: "CONTACTED", href: leadsHref({ status: "CONTACTED" }) },
      { label: "Em atendimento", value: n(mine.byStatus.IN_PROGRESS), status: "IN_PROGRESS", href: leadsHref({ status: "IN_PROGRESS" }) },
      { label: "Ganhos", value: n(mine.byStatus.WON), status: "WON", href: leadsHref({ status: "WON" }) },
      { label: "Perdidos", value: n(mine.byStatus.LOST), status: "LOST", href: leadsHref({ status: "LOST" }) },
      { label: "Fila sem responsável", value: n(kpis.unassigned), href: leadsHref({ assignee: "sem" }), hint: "Leads para assumir" },
    ];
  }

  // Equipe: SDRs ativos + quem tem leads atribuídos no período (ordem alfabética, sem ranking).
  const teamRows = manager
    ? distinctMembers(team, filters.storeId).filter((m) => (m.role === "STORE_USER" && m.isActive) || kpis.byAssignee.has(m.userId))
    : [];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${manager ? "Visão da equipe" : "Meus leads"} · ${PERIOD_LABELS[filters.period]}`}
      />

      <LeadFilters
        basePath="/dashboard"
        current={filters}
        defaultPeriod={DEFAULT_PERIOD}
        campaigns={campaignOptions(campaigns, showStore)}
        stores={showStore ? storeOptions(context) : null}
        showSearch={false}
        showStatus={false}
      />

      <KpiCards cards={cards} label={manager ? "Indicadores da loja" : "Meus indicadores"} />

      {manager ? (
        <Card className="mt-6">
          <CardHeader title="Equipe" description="Leads atribuídos a cada SDR no período (ordem alfabética)." />
          {teamRows.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted">Nenhum SDR com leads no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-background/60 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">SDR</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Atribuídos</th>
                    {LEAD_STATUSES.map((status) => (
                      <th key={status} scope="col" className="px-4 py-3 text-right font-semibold">
                        {STATUS_LABELS[status]}
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Conversão</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">1º atendimento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {teamRows.map((member) => {
                    const block = kpis.byAssignee.get(member.userId) ?? EMPTY_BLOCK;
                    return (
                      <tr key={member.userId}>
                        <th scope="row" className="whitespace-nowrap px-4 py-3 font-semibold">
                          <Link href={leadsHref({ assignee: member.userId })} className="hover:text-accent hover:underline">
                            {member.fullName}
                          </Link>
                          {member.isActive ? null : <span className="ml-1 font-normal text-muted">(inativo)</span>}
                        </th>
                        <td className="px-4 py-3 text-right tabular-nums">{n(block.total)}</td>
                        {LEAD_STATUSES.map((status) => (
                          <td key={status} className="px-4 py-3 text-right tabular-nums">
                            {n(block.byStatus[status])}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right tabular-nums">{formatConversion(block.conversion)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatDuration(block.avgFirstContactSeconds)}</td>
                      </tr>
                    );
                  })}
                  <tr className="text-muted">
                    <th scope="row" className="px-4 py-3 font-medium">
                      <Link href={leadsHref({ assignee: "sem" })} className="hover:text-accent hover:underline">
                        Sem responsável
                      </Link>
                    </th>
                    <td className="px-4 py-3 text-right tabular-nums">{n(kpis.unassigned)}</td>
                    <td colSpan={LEAD_STATUSES.length + 2} />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardHeader
          title={manager ? "Leads mais recentes" : "Meus leads mais recentes"}
          description="Os 10 últimos do período"
          action={
            <Link href={leadsHref({})} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Ver todos
            </Link>
          }
        />
        <LeadsTable
          rows={recent.rows}
          showStore={showStore}
          assignees={{ names: Object.fromEntries(team.map((m) => [m.userId, m.fullName])), currentUserId: context.userId }}
          emptyMessage="Nenhum lead no período."
        />
      </Card>
    </>
  );
}
