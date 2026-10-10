import type { Metadata } from "next";
import { NotFoundPanel } from "@/components/admin/not-found-panel";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { listCampaigns, listStoreMembers } from "@/lib/admin/config";
import { ROLE_LABELS } from "@/lib/auth/access";
import { getAdminSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Minha loja · KAPA Leads" };

/** STORE_ADMIN: campanhas e membros das lojas que administra (somente leitura). */
export default async function MyStorePage() {
  const { db, context } = await getAdminSession();
  const adminStores = context.stores.filter((store) => store.role === "STORE_ADMIN");
  if (adminStores.length === 0) return <NotFoundPanel />;

  const storeIds = adminStores.map((store) => store.id);
  const [campaigns, members] = await Promise.all([listCampaigns(db), listStoreMembers(db, storeIds)]);

  return (
    <>
      <PageHeader title="Minha loja" description="Campanhas e equipe. Alterações estruturais são feitas pela KAPA." />

      <div className="flex flex-col gap-6">
        {adminStores.map((store) => {
          const storeCampaigns = campaigns.filter((c) => c.storeId === store.id);
          const storeMembers = members.filter((m) => m.store_id === store.id);
          return (
            <section key={store.id} aria-labelledby={`loja-${store.id}`} className="flex flex-col gap-4">
              <h2 id={`loja-${store.id}`} className="text-lg font-semibold">
                {store.name}
                {!store.isActive ? <span className="ml-2 text-sm font-medium text-danger">(inativa)</span> : null}
              </h2>

              <Card>
                <CardHeader title="Campanhas" />
                {storeCampaigns.length === 0 ? (
                  <EmptyState title="Nenhuma campanha." />
                ) : (
                  <ul className="divide-y divide-line">
                    {storeCampaigns.map((campaign) => (
                      <li key={campaign.id} className="flex flex-wrap justify-between gap-2 px-5 py-3">
                        <span className="font-medium">{campaign.name}</span>
                        <span className="text-sm text-muted">{campaign.isActive ? "Ativa" : "Inativa"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader title="Equipe" />
                {storeMembers.length === 0 ? (
                  <EmptyState title="Nenhum membro." />
                ) : (
                  <ul className="divide-y divide-line">
                    {storeMembers.map((member) => (
                      <li key={member.user_id} className="flex flex-wrap justify-between gap-2 px-5 py-3">
                        <span>
                          <span className="font-medium">{member.profile?.full_name || member.profile?.email || "Membro"}</span>
                          {member.profile?.email ? <span className="block text-sm text-muted">{member.profile.email}</span> : null}
                        </span>
                        <span className="text-sm text-muted">
                          {ROLE_LABELS[member.role]} · {member.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>
          );
        })}
      </div>
    </>
  );
}
