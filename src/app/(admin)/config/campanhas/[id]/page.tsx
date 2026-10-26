import { KeyRound, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { NotFoundPanel } from "@/components/admin/not-found-panel";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { CampaignForm } from "@/components/config/campaign-form";
import { RotateKeyForm } from "@/components/config/rotate-key-form";
import { ActiveBadge } from "@/components/leads/status-badge";
import { BackLink, Card, CardHeader, Notice, PageHeader } from "@/components/ui/card";
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
      <BackLink href="/config/campanhas">Voltar para campanhas</BackLink>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {campaign.name}
            <ActiveBadge active={campaign.isActive} />
          </span>
        }
        description={campaign.storeName ?? undefined}
      />

      {criada ? (
        <div className="mb-6">
          <Notice tone="success">Campanha criada. Copie a chave abaixo para a Landing Page.</Notice>
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="xl:sticky xl:top-6 xl:order-2">
          <CardHeader icon={<KeyRound />} title="Chave pública (campaignKey)" description="Identifica a campanha nos envios da Landing Page. Não é senha." />
          <div className="flex flex-col gap-4 p-4 sm:p-5">
            <div className="flex flex-col items-start gap-3">
              <code className="w-full break-all rounded-lg border border-line bg-surface-muted px-3 py-2.5 font-mono text-sm text-foreground-soft">{campaign.campaignKey}</code>
              <CopyButton value={campaign.campaignKey} label="Copiar chave" />
            </div>
            <details className="group rounded-lg border border-line bg-surface-muted/50 px-4 py-3 open:bg-surface">
              <summary className="cursor-pointer text-sm font-medium text-foreground-soft">Trocar a chave (rotação)</summary>
              <div className="mt-4">
                <RotateKeyForm action={rotateCampaignKeyAction.bind(null, campaign.id)} />
              </div>
            </details>
          </div>
        </Card>

        <Card className="min-w-0 xl:order-1">
          <CardHeader icon={<Settings2 />} title="Dados da campanha" />
          <div className="p-4 sm:p-5">
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
          </div>
        </Card>
      </div>
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
