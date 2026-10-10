import type { Metadata } from "next";

import { LeadFilters } from "@/components/leads/lead-filters";
import { LeadsTable } from "@/components/leads/leads-table";
import { Pagination } from "@/components/leads/pagination";
import { Card, PageHeader } from "@/components/ui/card";
import { listCampaigns } from "@/lib/admin/config";
import { filtersToQuery, parseUrlFilters, toLeadFilters } from "@/lib/admin/filters";
import { listLeads } from "@/lib/admin/leads";
import { campaignOptions, storeOptions } from "@/lib/admin/options";
import { getAdminSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Leads · KAPA Leads" };

const DEFAULT_PERIOD = "tudo";

export default async function LeadsPage(props: PageProps<"/leads">) {
  const searchParams = await props.searchParams;
  const { db, context } = await getAdminSession();

  const filters = parseUrlFilters(searchParams, DEFAULT_PERIOD);
  const [result, campaigns] = await Promise.all([
    listLeads(db, toLeadFilters(filters, new Date()), filters.page),
    listCampaigns(db),
  ]);

  const showStore = context.isSuperAdmin || context.stores.length > 1;

  return (
    <>
      <PageHeader title="Leads" description="Busque, filtre e abra um lead para atender." />

      <LeadFilters
        basePath="/leads"
        current={filters}
        defaultPeriod={DEFAULT_PERIOD}
        campaigns={campaignOptions(campaigns, showStore)}
        stores={showStore ? storeOptions(context) : null}
      />

      <Card className="mt-6 overflow-hidden">
        <LeadsTable rows={result.rows} showStore={showStore} />
        {result.total > 0 ? (
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            hrefFor={(page) => `/leads${filtersToQuery({ ...filters, page }, DEFAULT_PERIOD)}`}
          />
        ) : null}
      </Card>
    </>
  );
}
