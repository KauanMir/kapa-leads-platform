import type { Metadata } from "next";

import { AssigneeTabs } from "@/components/leads/assignee-tabs";
import { LeadFilters } from "@/components/leads/lead-filters";
import { LeadsTable } from "@/components/leads/leads-table";
import { Pagination } from "@/components/leads/pagination";
import { Card, PageHeader } from "@/components/ui/card";
import { listCampaigns } from "@/lib/admin/config";
import { filtersToQuery, parseUrlFilters, toLeadFilters, type AssigneeFilter } from "@/lib/admin/filters";
import { listLeads } from "@/lib/admin/leads";
import { campaignOptions, storeOptions } from "@/lib/admin/options";
import { distinctMembers, getStoreTeam } from "@/lib/admin/team";
import { isStoreManager } from "@/lib/auth/access";
import { getAdminSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Leads · KAPA Leads" };

const DEFAULT_PERIOD = "tudo";

export default async function LeadsPage(props: PageProps<"/leads">) {
  const searchParams = await props.searchParams;
  const { db, context } = await getAdminSession();

  // SDR abre direto em "Meus leads"; gerente/KAPA em "Todos".
  const manager = isStoreManager(context);
  const defaultAssignee: AssigneeFilter = manager ? "todos" : "meus";

  const filters = parseUrlFilters(searchParams, DEFAULT_PERIOD, defaultAssignee);
  const [result, campaigns, team] = await Promise.all([
    listLeads(db, toLeadFilters(filters, new Date(), context.userId), filters.page),
    listCampaigns(db),
    getStoreTeam(db),
  ]);

  const showStore = context.isSuperAdmin || context.stores.length > 1;
  const members = distinctMembers(team, filters.storeId);
  const hrefFor = (next: Partial<typeof filters>) => `/leads${filtersToQuery({ ...filters, page: 1, ...next }, DEFAULT_PERIOD, defaultAssignee)}`;

  return (
    <>
      <PageHeader
        title="Leads"
        description={manager ? "Distribua os leads para os SDRs e acompanhe o atendimento." : "Seus leads e a fila sem responsável."}
      />

      <AssigneeTabs current={filters.assignee} hrefFor={(assignee) => hrefFor({ assignee })} />

      <LeadFilters
        basePath="/leads"
        current={filters}
        defaultPeriod={DEFAULT_PERIOD}
        campaigns={campaignOptions(campaigns, showStore)}
        stores={showStore ? storeOptions(context) : null}
        assignee={{
          defaultValue: defaultAssignee,
          members: manager ? members.map((m) => ({ id: m.userId, label: m.isActive ? m.fullName : `${m.fullName} (inativo)` })) : null,
        }}
      />

      <Card className="mt-6 overflow-hidden">
        <LeadsTable
          rows={result.rows}
          showStore={showStore}
          assignees={{ names: Object.fromEntries(team.map((m) => [m.userId, m.fullName])), currentUserId: context.userId }}
          emptyMessage={filters.assignee === "meus" ? "Nenhum lead seu aqui." : filters.assignee === "sem" ? "Nenhum lead sem responsável." : undefined}
        />
        {result.total > 0 ? (
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            hrefFor={(page) => `/leads${filtersToQuery({ ...filters, page }, DEFAULT_PERIOD, defaultAssignee)}`}
          />
        ) : null}
      </Card>
    </>
  );
}
