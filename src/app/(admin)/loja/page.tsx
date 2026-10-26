import { Megaphone, Users } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { NotFoundPanel } from "@/components/admin/not-found-panel";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { ActiveBadge } from "@/components/leads/status-badge";
import { Avatar, initials } from "@/components/ui/avatar";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { listCampaigns, listStoreMembers } from "@/lib/admin/config";
import { ROLE_LABELS } from "@/lib/auth/access";
import { getAdminSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Minha loja · KAPA Leads" };

/** STORE_ADMIN: campanhas e membros das lojas que administra (somente leitura). */
async function MyStoreContent() {
  const { db, context } = await getAdminSession();
  const adminStores = context.stores.filter((store) => store.role === "STORE_ADMIN");
  if (adminStores.length === 0) return <NotFoundPanel />;

  const storeIds = adminStores.map((store) => store.id);
  const [campaigns, members] = await Promise.all([listCampaigns(db), listStoreMembers(db, storeIds)]);

  return (
    <>
      <PageHeader title="Minha loja" description="Campanhas e equipe. Alterações estruturais são feitas pela KAPA." />

      <div className="flex flex-col gap-8">
        {adminStores.map((store) => {
          const storeCampaigns = campaigns.filter((c) => c.storeId === store.id);
          const storeMembers = members.filter((m) => m.store_id === store.id);
          return (
            <section key={store.id} aria-labelledby={`loja-${store.id}`} className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-sm font-semibold text-white">
                  {initials(store.name)}
                </span>
                <h2 id={`loja-${store.id}`} className="text-lg font-semibold tracking-tight">
                  {store.name}
                  {!store.isActive ? <span className="ml-2 text-sm font-medium text-danger">(inativa)</span> : null}
                </h2>
              </div>

              <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <Card className="overflow-hidden">
                  <CardHeader icon={<Megaphone />} title="Campanhas" />
                  {storeCampaigns.length === 0 ? (
                    <EmptyState title="Nenhuma campanha." icon={<Megaphone />} />
                  ) : (
                    <ul className="divide-y divide-line">
                      {storeCampaigns.map((campaign) => (
                        <li key={campaign.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                          <span className="font-medium">{campaign.name}</span>
                          <ActiveBadge active={campaign.isActive} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card className="overflow-hidden">
                  <CardHeader icon={<Users />} title="Equipe" />
                  {storeMembers.length === 0 ? (
                    <EmptyState title="Nenhum membro." icon={<Users />} />
                  ) : (
                    <ul className="divide-y divide-line">
                      {storeMembers.map((member) => {
                        const name = member.profile?.full_name || member.profile?.email || "Membro";
                        return (
                          <li key={member.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                            <Avatar name={name} size="sm" className={member.is_active ? "" : "opacity-50"} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{name}</span>
                              {member.profile?.email ? <span className="block truncate text-[13px] text-muted">{member.profile.email}</span> : null}
                            </span>
                            <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                              {ROLE_LABELS[member.role]}
                              <ActiveBadge active={member.is_active} activeLabel="Ativo" inactiveLabel="Inativo" />
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

export default function MyStorePage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <MyStoreContent />
    </Suspense>
  );
}
