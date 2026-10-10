import type { Metadata } from "next";
import Link from "next/link";

import { LeadFilters } from "@/components/leads/lead-filters";
import { LeadsTable } from "@/components/leads/leads-table";
import { STATUS_DOTS } from "@/components/leads/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { listCampaigns } from "@/lib/admin/config";
import { filtersToQuery, parseUrlFilters, toLeadFilters } from "@/lib/admin/filters";
import { getDashboardCounts, listLeads } from "@/lib/admin/leads";
import { campaignOptions, storeOptions } from "@/lib/admin/options";
import { getAdminSession } from "@/lib/auth/session";
import { PERIOD_LABELS } from "@/lib/format/period";
import { LEAD_STATUSES, STATUS_LABELS, type LeadStatus } from "@/lib/format/status";

export const metadata: Metadata = { title: "Dashboard · KAPA Leads" };

const DEFAULT_PERIOD = "30d";

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const searchParams = await props.searchParams;
  const { db, context } = await getAdminSession();

  const filters = parseUrlFilters(searchParams, DEFAULT_PERIOD);
  const scoped = { ...filters, q: "", status: null, page: 1 };
  const leadFilters = toLeadFilters(scoped, new Date());

  const [counts, recent, campaigns] = await Promise.all([
    getDashboardCounts(db, leadFilters),
    listLeads(db, leadFilters, 1, 10),
    listCampaigns(db),
  ]);

  const showStore = context.isSuperAdmin || context.stores.length > 1;
  const leadsHref = (status?: LeadStatus) => `/leads${filtersToQuery({ ...scoped, status: status ?? null }, "tudo")}`;

  const cards: Array<{ label: string; value: number; status?: LeadStatus }> = [
    { label: "Total de leads", value: counts.total },
    ...LEAD_STATUSES.map((status) => ({ label: STATUS_LABELS[status], value: counts[status], status })),
  ];

  return (
    <>
      <PageHeader title="Dashboard" description={`Resumo de leads · ${PERIOD_LABELS[filters.period]}`} />

      <LeadFilters
        basePath="/dashboard"
        current={filters}
        defaultPeriod={DEFAULT_PERIOD}
        campaigns={campaignOptions(campaigns, showStore)}
        stores={showStore ? storeOptions(context) : null}
        showSearch={false}
        showStatus={false}
      />

      <section aria-label="Contagem de leads por status" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={leadsHref(card.status)}
            className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong"
          >
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {card.status ? <span aria-hidden="true" className={`size-2 rounded-full ${STATUS_DOTS[card.status]}`} /> : null}
              {card.label}
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{card.value.toLocaleString("pt-BR")}</p>
          </Link>
        ))}
      </section>

      <Card className="mt-6">
        <CardHeader
          title="Leads mais recentes"
          description="Os 10 últimos leads do período"
          action={
            <Link href={leadsHref()} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Ver todos
            </Link>
          }
        />
        <LeadsTable rows={recent.rows} showStore={showStore} emptyMessage="Nenhum lead no período." />
      </Card>
    </>
  );
}
