import type { Metadata } from "next";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/admin/page-skeleton";
import { CampaignForm } from "@/components/config/campaign-form";
import { BackLink, Card, PageHeader } from "@/components/ui/card";
import { createCampaignAction } from "@/lib/actions/config";
import { listStores } from "@/lib/admin/config";
import { getSuperAdminSession } from "@/lib/auth/session";
import { NotFoundPanel } from "@/components/admin/not-found-panel";

export const metadata: Metadata = { title: "Nova campanha · KAPA Leads" };

async function NewCampaignContent() {
  const session = await getSuperAdminSession();
  if (!session) return <NotFoundPanel />;
  const { db } = session;
  const stores = await listStores(db);

  return (
    <>
      <BackLink href="/config/campanhas">Voltar para campanhas</BackLink>
      <PageHeader title="Nova campanha" description="A chave pública (campaignKey) é gerada automaticamente ao salvar." />
      <Card className="max-w-4xl p-4 sm:p-6">
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

export default function NewCampaignPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <NewCampaignContent />
    </Suspense>
  );
}
