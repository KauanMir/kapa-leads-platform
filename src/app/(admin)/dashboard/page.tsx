import { ArrowRight, ArrowUpRight, ChevronRight, Inbox, UserRoundX, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/admin/page-skeleton";
import { LeadFilters } from "@/components/leads/lead-filters";
import { LeadsTable } from "@/components/leads/leads-table";
import { STATUS_DOTS } from "@/components/leads/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader, PageHeader, TABLE_HEAD } from "@/components/ui/card";
import { listCampaigns } from "@/lib/admin/config";
import { filtersToQuery, parseUrlFilters, toLeadFilters, type AssigneeFilter } from "@/lib/admin/filters";
import { EMPTY_BLOCK, summarizeKpis } from "@/lib/admin/kpis";
import { getLeadKpis, listLeads } from "@/lib/admin/leads";
import { campaignOptions, storeOptions } from "@/lib/admin/options";
import { distinctMembers, getStoreTeam } from "@/lib/admin/team";
import { isStoreManager } from "@/lib/auth/access";
import { getAdminSession } from "@/lib/auth/session";
import { PERIOD_LABELS } from "@/lib/format/period";
import { LEAD_STATUSES, STATUS_LABELS, type LeadStatus } from "@/lib/format/status";

export const metadata: Metadata = { title: "Dashboard · KAPA Leads" };

const DEFAULT_PERIOD = "30d";

const n = (value: number) => value.toLocaleString("pt-BR");

type StatusRow = { status: LeadStatus; label: string; value: number; href: string };

const pct = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

/** Contagem por status: barra de proporção + um bloco clicável por status. */
function StatusBreakdown({ title, rows }: { title: string; rows: StatusRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <Card className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4 sm:px-5">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        <p className="num text-[13px] text-muted">{total === 1 ? "1 lead" : `${n(total)} leads`}</p>
      </div>
      <div aria-hidden="true" className="mx-4 mt-3 flex h-2 gap-[3px] overflow-hidden rounded-full bg-surface-sunken sm:mx-5">
        {total > 0
          ? rows.map((row) => (row.value > 0 ? <span key={row.status} className={`rounded-full ${STATUS_DOTS[row.status]}`} style={{ width: `${(row.value / total) * 100}%` }} /> : null))
          : null}
      </div>
      <ul className="mt-3 grid flex-1 grid-cols-1 divide-y divide-line border-t border-line sm:grid-cols-5 sm:divide-x sm:divide-y-0">
        {rows.map((row) => (
          <li key={row.status} className="flex">
            <Link
              href={row.href}
              className="group flex flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted sm:flex-col sm:items-start sm:justify-between sm:gap-1.5 sm:py-3.5"
            >
              <span className="flex flex-1 items-center gap-2 text-[14px] font-medium text-foreground-soft sm:flex-none sm:items-start sm:text-[13px] sm:leading-tight">
                <span aria-hidden="true" className={`size-2 shrink-0 rounded-full sm:mt-[3px] ${STATUS_DOTS[row.status]}`} />
                {row.label}
              </span>
              <span className="flex items-baseline gap-2">
                <span className={`num text-lg font-semibold tracking-tight sm:text-[28px] sm:leading-9 ${row.value ? "" : "text-subtle"}`}>{n(row.value)}</span>
                <span className="num text-xs text-subtle">{pct(row.value, total)}%</span>
              </span>
              <ChevronRight aria-hidden="true" className="size-4 text-line-strong group-hover:text-muted sm:hidden" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Número principal (leads recebidos / meus leads). */
function HeroStat({ label, value, href, cta }: { label: string; value: number; href: string; cta: string }) {
  return (
    <Link href={href} className="group flex flex-col rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong sm:p-5">
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] font-medium text-muted">
          <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Inbox className="size-4" />
          </span>
          {label}
        </span>
        <ArrowUpRight aria-hidden="true" className="hidden size-4 shrink-0 text-subtle transition-colors group-hover:text-accent sm:block" />
      </span>
      <span className="num mt-3 text-[34px] font-semibold leading-none tracking-tight sm:text-[40px]">{n(value)}</span>
      <span className="mt-auto flex items-center gap-1 pt-4 text-[13px] font-semibold text-accent">
        {cta}
        <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

/** Fila sem responsável: destaque âmbar quando há leads esperando. */
function QueueStat({ label, value, href, hint }: { label: string; value: number; href: string; hint: string }) {
  const waiting = value > 0;
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-xl border bg-surface p-4 shadow-card transition-colors sm:p-5 ${
        waiting ? "border-warning-line hover:border-amber-300" : "border-line hover:border-line-strong"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] font-medium text-muted">
          <span aria-hidden="true" className={`flex size-7 items-center justify-center rounded-lg ${waiting ? "bg-warning-soft text-warning" : "bg-surface-sunken text-subtle"}`}>
            <UserRoundX className="size-4" />
          </span>
          {label}
        </span>
        <ArrowUpRight aria-hidden="true" className="hidden size-4 shrink-0 text-subtle transition-colors group-hover:text-foreground sm:block" />
      </span>
      <span className={`num mt-3 text-[34px] font-semibold leading-none tracking-tight sm:text-[40px] ${waiting ? "text-warning" : ""}`}>{n(value)}</span>
      <span className={`mt-auto flex items-center gap-1 pt-4 text-[13px] font-semibold ${waiting ? "text-warning" : "text-muted"}`}>
        {waiting ? hint : "Nenhum lead esperando"}
        {waiting ? <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover:translate-x-0.5" /> : null}
      </span>
    </Link>
  );
}

async function DashboardContent(props: PageProps<"/dashboard">) {
  const { db, context } = await getAdminSession();
  const searchParams = await props.searchParams;
  const manager = isStoreManager(context);

  const filters = parseUrlFilters(searchParams, DEFAULT_PERIOD);
  const scoped = { ...filters, q: "", status: null, assignee: "todos" as AssigneeFilter, page: 1 };
  const leadFilters = toLeadFilters(scoped, new Date(), context.userId);

  const [kpiRows, recent, campaigns, team] = await Promise.all([
    getLeadKpis(db, leadFilters),
    listLeads(db, manager ? leadFilters : { ...leadFilters, assignedTo: context.userId }, 1, 8),
    listCampaigns(db),
    getStoreTeam(db),
  ]);
  const kpis = summarizeKpis(kpiRows);

  const showStore = context.isSuperAdmin || context.stores.length > 1;
  // Os números levam para /leads com o mesmo período/campanha/loja.
  const leadsDefault: AssigneeFilter = manager ? "todos" : "meus";
  const leadsHref = (next: { status?: LeadStatus; assignee?: AssigneeFilter }) =>
    `/leads${filtersToQuery({ ...scoped, assignee: next.assignee ?? leadsDefault, status: next.status ?? null }, "tudo", leadsDefault)}`;

  // Painel simples (KAPA Leads não é CRM): recebidos, fila e status.
  const mine = kpis.byAssignee.get(context.userId) ?? EMPTY_BLOCK;
  const MY_LABELS: Record<LeadStatus, string> = { NEW: "Meus novos", CONTACTED: "Meus contatados", IN_PROGRESS: "Em atendimento", WON: "Ganhos", LOST: "Perdidos" };
  const statusRows: StatusRow[] = LEAD_STATUSES.map((status) => ({
    status,
    label: manager ? STATUS_LABELS[status] : MY_LABELS[status],
    value: manager ? kpis.byStatus[status] : mine.byStatus[status],
    href: leadsHref({ status }),
  }));

  // Equipe: SDRs ativos + quem tem leads atribuídos no período (ordem alfabética, sem ranking).
  const teamRows = manager
    ? distinctMembers(team, filters.storeId).filter((m) => (m.role === "STORE_USER" && m.isActive) || kpis.byAssignee.has(m.userId))
    : [];
  const firstName = context.fullName?.trim().split(/\s+/)[0];

  return (
    <>
      <PageHeader
        eyebrow={firstName ? `Olá, ${firstName}` : undefined}
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

      <section
        aria-label={manager ? "Indicadores da loja" : "Meus indicadores"}
        className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
      >
        <div className="grid grid-cols-2 gap-4">
          {manager ? (
            <HeroStat label="Leads recebidos" value={kpis.total} href={leadsHref({ assignee: "todos" })} cta="Ver leads" />
          ) : (
            <HeroStat label="Meus leads" value={mine.total} href={leadsHref({ assignee: "meus" })} cta="Ver meus leads" />
          )}
          <QueueStat
            label={manager ? "Sem responsável" : "Fila sem responsável"}
            value={kpis.unassigned}
            href={leadsHref({ assignee: "sem" })}
            hint={manager ? "Distribuir" : "Leads para assumir"}
          />
        </div>
        <StatusBreakdown title={manager ? "Leads por status" : "Meus leads por status"} rows={statusRows} />
      </section>

      {manager ? (
        <Card className="mt-5 overflow-hidden">
          <CardHeader icon={<Users />} title="Equipe" description="Leads de cada SDR no período." />
          {teamRows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Nenhum SDR com leads no período.</p>
          ) : (
            <>
              <div className="hidden lg:block">
                <table className="w-full text-left text-sm">
                  <thead className={TABLE_HEAD}>
                    <tr>
                      <th scope="col" className="py-2.5 pl-5 pr-4 font-medium">SDR</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Atribuídos</th>
                      {LEAD_STATUSES.map((status) => (
                        <th key={status} scope="col" className="px-4 py-2.5 text-right font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <span aria-hidden="true" className={`size-1.5 rounded-full ${STATUS_DOTS[status]}`} />
                            {STATUS_LABELS[status]}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {teamRows.map((member) => {
                      const block = kpis.byAssignee.get(member.userId) ?? EMPTY_BLOCK;
                      return (
                        <tr key={member.userId} className="group relative transition-colors hover:bg-surface-muted">
                          <th scope="row" className="py-3 pl-5 pr-4 font-semibold">
                            <Link
                              href={leadsHref({ assignee: member.userId })}
                              className="inline-flex items-center gap-3 after:absolute after:inset-0 group-hover:text-accent"
                            >
                              <Avatar name={member.fullName} size="sm" />
                              {member.fullName}
                              {member.isActive ? null : <span className="font-normal text-muted">(inativo)</span>}
                            </Link>
                          </th>
                          <td className="num px-4 py-3 text-right text-[15px] font-semibold">{n(block.total)}</td>
                          {LEAD_STATUSES.map((status) => (
                            <td key={status} className={`num px-4 py-3 text-right ${block.byStatus[status] ? "text-foreground-soft" : "text-line-strong"}`}>
                              {n(block.byStatus[status])}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    <tr className="group relative bg-surface-muted/60 transition-colors hover:bg-surface-muted">
                      <th scope="row" className="py-3 pl-5 pr-4 font-medium text-muted">
                        <Link href={leadsHref({ assignee: "sem" })} className="inline-flex items-center gap-3 after:absolute after:inset-0 group-hover:text-accent">
                          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full border border-dashed border-line-strong bg-surface">
                            <UserRoundX className="size-4" />
                          </span>
                          Sem responsável
                        </Link>
                      </th>
                      <td className={`num px-4 py-3 text-right text-[15px] font-semibold ${kpis.unassigned ? "text-warning" : ""}`}>{n(kpis.unassigned)}</td>
                      <td colSpan={LEAD_STATUSES.length} />
                    </tr>
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-line lg:hidden">
                {teamRows.map((member) => {
                  const block = kpis.byAssignee.get(member.userId) ?? EMPTY_BLOCK;
                  return (
                    <li key={member.userId}>
                      <Link href={leadsHref({ assignee: member.userId })} className="block px-4 py-3.5 active:bg-surface-muted">
                        <span className="flex items-center gap-3">
                          <Avatar name={member.fullName} size="sm" />
                          <span className="min-w-0 flex-1 truncate font-semibold">
                            {member.fullName}
                            {member.isActive ? null : <span className="font-normal text-muted"> (inativo)</span>}
                          </span>
                          <span className="num text-lg font-semibold">{n(block.total)}</span>
                          <ChevronRight aria-hidden="true" className="size-4 text-line-strong" />
                        </span>
                        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 pl-11 text-[13px] text-muted">
                          {LEAD_STATUSES.map((status) => (
                            <span key={status} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                              <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${STATUS_DOTS[status]}`} />
                              {STATUS_LABELS[status]} <span className="num font-semibold text-foreground">{n(block.byStatus[status])}</span>
                            </span>
                          ))}
                        </span>
                      </Link>
                    </li>
                  );
                })}
                <li>
                  <Link href={leadsHref({ assignee: "sem" })} className="flex items-center gap-3 bg-surface-muted/60 px-4 py-3.5 text-muted active:bg-surface-muted">
                    <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full border border-dashed border-line-strong bg-surface">
                      <UserRoundX className="size-4" />
                    </span>
                    <span className="flex-1 font-medium">Sem responsável</span>
                    <span className={`num text-lg font-semibold ${kpis.unassigned ? "text-warning" : "text-foreground"}`}>{n(kpis.unassigned)}</span>
                    <ChevronRight aria-hidden="true" className="size-4 text-line-strong" />
                  </Link>
                </li>
              </ul>
            </>
          )}
        </Card>
      ) : null}

      <Card className="mt-5 overflow-hidden">
        <CardHeader
          icon={<Inbox />}
          title={manager ? "Leads mais recentes" : "Meus leads mais recentes"}
          action={
            <Link href={leadsHref({})} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Ver todos
              <ArrowRight aria-hidden="true" className="size-4" />
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

export default function DashboardPage(props: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<PageSkeleton variant="dashboard" />}>
      <DashboardContent {...props} />
    </Suspense>
  );
}
