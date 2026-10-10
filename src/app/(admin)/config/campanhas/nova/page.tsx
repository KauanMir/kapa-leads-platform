import type { Metadata } from "next";

import { CampaignForm } from "@/components/config/campaign-form";
import { Card, PageHeader } from "@/components/ui/card";
import { createCampaignAction } from "@/lib/actions/config";
import { listStores } from "@/lib/admin/config";
import { getSuperAdminSession } from "@/lib/auth/session";
import { NotFoundPanel } from "@/components/admin/not-found-panel";

export const metadata: Metadata = { title: "Nova campanha · KAPA Leads" };

export default async function NewCampaignPage() {
  const session = await getSuperAdminSession();
  if (!session) return <NotFoundPanel />;
  const { db } = session;
  const stores = await listStores(db);

  return (
    <>
      <PageHeader title="Nova campanha" description="A chave pública (campaignKey) é gerada automaticamente ao salvar." />
      <Card className="p-5">
        <CampaignForm
          action={createCampaignAction}
          stores={stores.map((store) => ({ id: store.id, name: store.isActive ? store.name : `${store.name} (inativa)` }))}
          defaults={{ storeId: "", name: "", slug: "", consentVersion: "", allowedOrigins: "", formSchema: "", isActive: true }}
          submitLabel="Criar campanha"
        />
      </Card>
    </>
  );
}
