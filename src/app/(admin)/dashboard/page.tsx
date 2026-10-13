import { ArrowRight, ChevronRight, Inbox, UserRoundX, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/admin/page-skeleton";
import { LeadFilters } from "@/components/leads/lead-filters";
import { LeadsTable } from "@/components/leads/leads-table";
import { STATUS_DOTS } from "@/components/leads/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
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

/** Contagem por status: barra de proporção + uma linha clicável por status. */
function StatusBreakdown({ title, rows }: { title: string; rows: StatusRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <Card className="flex flex-col p-5">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      <div aria-hidden="true" className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-line/70">
        {total > 0
          ? rows.map((row) => (row.value > 0 ? <span key={row.status} className={STATUS_DOTS[row.status]} style={{ width: `${(row.value / total) * 100}%` }} /> : null))
          : null}
      </div>
      <ul className="mt-3 divide-y divide-line">
        {rows.map((row) => (
          <li key={row.status}>
            <Link href={row.href} className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-muted">
              <span aria-hidden="true" className={`size-2.5 rounded-full ${STATUS_DOTS[row.status]}`} />
              <span className="flex-1 text-[15px] font-medium">{row.label}</span>
              <span className="text-lg font-semibold tabular-nums">{n(row.value)}</span>
              <ChevronRight aria-hidden="true" className="size-4 text-line-strong group-hover:text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Número principal (destaque em azul). */
function HeroStat({ label, value, href, cta }: { label: string; value: number; href: string; cta: string }) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col overflow-hidden rounded-2xl bg-gradient-to-br from-[#2a5cf0] to-[#1838a8] p-4 text-white shadow-raised sm:p-5"
    >
      <span aria-hidden="true" className="absolute -right-10 -top-12 size-40 rounded-full bg-white/10" />
      <span aria-hidden="true" className="absolute -bottom-16 right-10 size-32 rounded-full bg-white/[0.06]" />
      <span className="relative flex items-center gap-2 text-sm font-medium text-white/80">
        <Inbox aria-hidden="true" className="size-4" />
        {label}
      </span>
      <span className="relative mt-3 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{n(value)}</span>
      <span className="relative mt-auto flex items-center gap-1 pt-5 text-sm font-semibold text-white/90 group-hover:text-white">
        {cta}
        <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

/** Fila sem responsável: âmbar quando há leads esperando. */
function QueueStat({ label, value, href, hint }: { label: string; value: number; href: string; hint: string }) {
  const waiting = value > 0;
  return (
    <Link
      href={href}
      className={`group flex flex-col rounded-2xl border p-4 shadow-card transition-colors sm:p-5 ${
        waiting ? "border-amber-200 bg-warning-soft hover:border-amber-300" : "border-line bg-surface hover:border-line-strong"
      }`}
    >
      <span className={`flex items-center gap-2 text-sm font-medium ${waiting ? "text-warning" : "text-muted"}`}>
        <UserRoundX aria-hidden="true" className="size-4" />
        {label}
      </span>
      <span className="mt-3 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{n(value)}</span>
      <span className={`mt-auto flex items-center gap-1 pt-6 text-sm font-semibold ${waiting ? "text-warning" : "text-muted"}`}>
        {waiting ? hint : "Nenhum lead esperando"}
        {waiting ? <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" /> : null}
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

      <section aria-label={manager ? "Indicadores da loja" : "Meus indicadores"} className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
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
        <div className="lg:col-span-2">
          <StatusBreakdown title={manager ? "Leads por status" : "Meus leads por status"} rows={statusRows} />
        </div>
      </section>

      {manager ? (
        <Card className="mt-6 overflow-hidden">
          <CardHeader icon={<Users />} title="Equipe" description="Leads de cada SDR no período." />
          {teamRows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Nenhum SDR com leads no período.</p>
          ) : (
            <>
              <div className="hidden md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line bg-surface-muted text-[11px] uppercase tracking-[0.06em] text-muted">
                    <tr>
                      <th scope="col" className="py-3 pl-5 pr-4 font-semibold">SDR</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Atribuídos</th>
                      {LEAD_STATUSES.map((status) => (
                        <th key={status} scope="col" className="px-4 py-3 text-right font-semibold">
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
                        <tr key={member.userId} className="hover:bg-surface-muted/70">
                          <th scope="row" className="py-3 pl-5 pr-4 font-semibold">
                            <Link href={leadsHref({ assignee: member.userId })} className="inline-flex items-center gap-3 hover:text-accent">
                              <Avatar name={member.fullName} size="sm" />
                              {member.fullName}
                              {member.isActive ? null : <span className="font-normal text-muted">(inativo)</span>}
                            </Link>
                          </th>
                          <td className="px-4 py-3 text-right text-[15px] font-semibold tabular-nums">{n(block.total)}</td>
                          {LEAD_STATUSES.map((status) => (
                            <td key={status} className={`px-4 py-3 text-right tabular-nums ${block.byStatus[status] ? "" : "text-line-strong"}`}>
                              {n(block.byStatus[status])}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    <tr className="bg-surface-muted/50">
                      <th scope="row" className="py-3 pl-5 pr-4 font-medium text-muted">
                        <Link href={leadsHref({ assignee: "sem" })} className="inline-flex items-center gap-3 hover:text-accent">
                          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full border border-dashed border-line-strong">
                            <UserRoundX className="size-4" />
                          </span>
                          Sem responsável
                        </Link>
                      </th>
                      <td className="px-4 py-3 text-right text-[15px] font-semibold tabular-nums">{n(kpis.unassigned)}</td>
                      <td colSpan={LEAD_STATUSES.length} />
                    </tr>
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-line md:hidden">
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
                          <span className="text-lg font-semibold tabular-nums">{n(block.total)}</span>
                        </span>
                        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 pl-11 text-[13px] text-muted">
                          {LEAD_STATUSES.map((status) => (
                            <span key={status} className="inline-flex items-center gap-1.5">
                              <span aria-hidden="true" className={`size-1.5 rounded-full ${STATUS_DOTS[status]}`} />
                              {STATUS_LABELS[status]} <span className="font-semibold text-foreground tabular-nums">{n(block.byStatus[status])}</span>
                            </span>
                          ))}
                        </span>
                      </Link>
                    </li>
                  );
                })}
                <li>
                  <Link href={leadsHref({ assignee: "sem" })} className="flex items-center gap-3 px-4 py-3.5 text-muted active:bg-surface-muted">
                    <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full border border-dashed border-line-strong">
                      <UserRoundX className="size-4" />
                    </span>
                    <span className="flex-1 font-medium">Sem responsável</span>
                    <span className="text-lg font-semibold tabular-nums text-foreground">{n(kpis.unassigned)}</span>
                  </Link>
                </li>
              </ul>
            </>
          )}
        </Card>
      ) : null}

      <Card className="mt-6 overflow-hidden">
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
