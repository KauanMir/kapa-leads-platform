import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { NotFoundPanel } from "@/components/admin/not-found-panel";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { CampaignForm } from "@/components/config/campaign-form";
import { RotateKeyForm } from "@/components/config/rotate-key-form";
import { Card, CardHeader, Notice, PageHeader } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { rotateCampaignKeyAction, updateCampaignAction } from "@/lib/actions/config";
import { getCampaign, listStores } from "@/lib/admin/config";
import { getSuperAdminSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Campanha · KAPA Leads" };

async function EditCampaignContent(props: PageProps<"/config/campanhas/[id]">) {
  const session = await getSuperAdminSession();
  const { id } = await props.params;
  const { criada } = await props.searchParams;
  if (!session) return <NotFoundPanel />;
  const { db } = session;

  const [campaign, stores] = await Promise.all([getCampaign(db, id), listStores(db)]);
  if (!campaign) return <NotFoundPanel />;

  const formSchema = JSON.stringify(campaign.formSchema ?? {}, null, 2);

  return (
    <>
      <Link href="/config/campanhas" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar para campanhas
      </Link>
      <PageHeader title={campaign.name} description={campaign.storeName ?? undefined} />

      {criada ? (
        <div className="mb-6">
          <Notice tone="success">Campanha criada. Copie a chave abaixo para a Landing Page.</Notice>
        </div>
      ) : null}

      <Card className="mb-6">
        <CardHeader title="Chave pública (campaignKey)" description="Identifica a campanha nos envios da Landing Page. Não é senha." />
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <code className="break-all rounded-lg bg-background px-3 py-2 font-mono text-sm">{campaign.campaignKey}</code>
            <CopyButton value={campaign.campaignKey} label="Copiar chave" />
          </div>
          <details className="rounded-lg border border-line p-4">
            <summary className="cursor-pointer text-sm font-medium">Trocar a chave (rotação)</summary>
            <div className="mt-4">
              <RotateKeyForm action={rotateCampaignKeyAction.bind(null, campaign.id)} />
            </div>
          </details>
        </div>
      </Card>

      <Card className="p-5">
        <CampaignForm
          action={updateCampaignAction.bind(null, campaign.id)}
          stores={stores.map((store) => ({ id: store.id, name: store.isActive ? store.name : `${store.name} (inativa)` }))}
          defaults={{
            storeId: campaign.storeId,
            name: campaign.name,
            slug: campaign.slug,
            consentVersion: campaign.consentVersion,
            allowedOrigins: campaign.allowedOrigins.join("\n"),
            formSchema: formSchema === "{}" ? "" : formSchema,
            isActive: campaign.isActive,
          }}
          submitLabel="Salvar alterações"
        />
      </Card>
    </>
  );
}

export default function EditCampaignPage(props: PageProps<"/config/campanhas/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <EditCampaignContent {...props} />
    </Suspense>
  );
}
