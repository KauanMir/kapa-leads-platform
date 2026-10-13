import type { Metadata } from "next";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/admin/page-skeleton";
import { StoreForm } from "@/components/config/store-form";
import { ActionButton } from "@/components/ui/action-button";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { setStoreActiveAction } from "@/lib/actions/config";
import { listStores } from "@/lib/admin/config";
import { getSuperAdminSession } from "@/lib/auth/session";
import { NotFoundPanel } from "@/components/admin/not-found-panel";
import { formatDay } from "@/lib/format/datetime";

export const metadata: Metadata = { title: "Lojas · KAPA Leads" };

async function StoresContent() {
  const session = await getSuperAdminSession();
  if (!session) return <NotFoundPanel />;
  const { db } = session;
  const stores = await listStores(db);

  return (
    <>
      <PageHeader title="Lojas" description="Lojas atendidas pela KAPA. Loja inativa não recebe novos leads; o histórico continua visível." />

      <Card className="mb-6">
        <CardHeader title="Nova loja" />
        <div className="p-5">
          <StoreForm />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {stores.length === 0 ? (
          <EmptyState title="Nenhuma loja cadastrada." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-background/60 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Loja</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Slug</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Campanhas</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Criada em</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Situação</th>
                  <th scope="col" className="px-4 py-3 font-semibold"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {stores.map((store) => (
                  <tr key={store.id}>
                    <td className="px-4 py-3 font-semibold">{store.name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{store.slug}</td>
                    <td className="px-4 py-3 tabular-nums">{store.campaignCount}</td>
                    <td className="px-4 py-3 tabular-nums text-muted">{formatDay(store.createdAt)}</td>
                    <td className="px-4 py-3">{store.isActive ? "Ativa" : "Inativa"}</td>
                    <td className="px-4 py-3 text-right">
                      <ActionButton
                        action={setStoreActiveAction.bind(null, store.id, !store.isActive)}
                        variant={store.isActive ? "danger" : "secondary"}
                        confirmMessage={store.isActive ? "Desativar? A loja deixa de receber leads." : undefined}
                      >
                        {store.isActive ? "Desativar" : "Ativar"}
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
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
