import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { NotFoundPanel } from "@/components/admin/not-found-panel";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { StoreForm } from "@/components/config/store-form";
import { ActiveBadge } from "@/components/leads/status-badge";
import { ActionButton } from "@/components/ui/action-button";
import { Card, CardHeader, EmptyState, PageHeader, TABLE_HEAD } from "@/components/ui/card";
import { setStoreActiveAction } from "@/lib/actions/config";
import { listStores } from "@/lib/admin/config";
import { getSuperAdminSession } from "@/lib/auth/session";
import { formatDay } from "@/lib/format/datetime";

export const metadata: Metadata = { title: "Lojas · KAPA Leads" };

async function StoresContent() {
  const session = await getSuperAdminSession();
  if (!session) return <NotFoundPanel />;
  const { db } = session;
  const stores = await listStores(db);

  const toggle = (store: (typeof stores)[number]) => (
    <ActionButton
      action={setStoreActiveAction.bind(null, store.id, !store.isActive)}
      variant={store.isActive ? "danger" : "secondary"}
      confirmMessage={store.isActive ? "Desativar? A loja deixa de receber leads." : undefined}
    >
      {store.isActive ? "Desativar" : "Ativar"}
    </ActionButton>
  );

  return (
    <>
      <PageHeader title="Lojas" description="Lojas atendidas pela KAPA. Loja inativa não recebe novos leads; o histórico continua visível." />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden xl:order-2">
          <CardHeader title="Nova loja" />
          <div className="p-4 sm:p-5">
            <StoreForm />
          </div>
        </Card>

        <Card className="min-w-0 overflow-hidden xl:order-1">
          <CardHeader icon={<Building2 />} title="Lojas cadastradas" description={stores.length === 1 ? "1 loja" : `${stores.length} lojas`} />
          {stores.length === 0 ? (
            <EmptyState title="Nenhuma loja cadastrada." icon={<Building2 />} />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className={TABLE_HEAD}>
                    <tr>
                      <th scope="col" className="py-2.5 pl-5 pr-4 font-medium">Loja</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Slug</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Campanhas</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Criada em</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Situação</th>
                      <th scope="col" className="py-2.5 pl-4 pr-5 font-medium"><span className="sr-only">Ações</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {stores.map((store) => (
                      <tr key={store.id} className="transition-colors hover:bg-surface-muted">
                        <td className="py-3 pl-5 pr-4 text-[14px] font-semibold">{store.name}</td>
                        <td className="px-4 py-3">
                          <code className="whitespace-nowrap rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-xs text-foreground-soft">{store.slug}</code>
                        </td>
                        <td className="num px-4 py-3 text-right">{store.campaignCount}</td>
                        <td className="num px-4 py-3 text-muted">{formatDay(store.createdAt)}</td>
                        <td className="px-4 py-3">
                          <ActiveBadge active={store.isActive} />
                        </td>
                        <td className="py-3 pl-4 pr-5 text-right">{toggle(store)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-line md:hidden">
                {stores.map((store) => (
                  <li key={store.id} className="flex flex-col gap-2.5 px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-semibold">{store.name}</p>
                        <p className="mt-0.5 break-all font-mono text-xs text-muted">{store.slug}</p>
                      </div>
                      <ActiveBadge active={store.isActive} />
                    </div>
                    <p className="num text-[13px] text-muted">
                      {store.campaignCount === 1 ? "1 campanha" : `${store.campaignCount} campanhas`} · criada em {formatDay(store.createdAt)}
                    </p>
                    <div>{toggle(store)}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </>
  );
}

export default function StoresPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <StoresContent />
    </Suspense>
  );
}
