import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/admin/page-skeleton";
import { buttonClasses } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { listCampaigns } from "@/lib/admin/config";
import { getSuperAdminSession } from "@/lib/auth/session";
import { NotFoundPanel } from "@/components/admin/not-found-panel";

export const metadata: Metadata = { title: "Campanhas · KAPA Leads" };

async function CampaignsContent() {
  const session = await getSuperAdminSession();
  if (!session) return <NotFoundPanel />;
  const { db } = session;
  const campaigns = await listCampaigns(db);

  return (
    <>
      <PageHeader
        title="Campanhas"
        description="Cada campanha tem uma chave pública (campaignKey) usada pela Landing Page."
        action={
          <Link href="/config/campanhas/nova" className={buttonClasses()}>
            <Plus aria-hidden="true" className="size-4" />
            Nova campanha
          </Link>
        }
      />

      <Card className="overflow-hidden">
        {campaigns.length === 0 ? (
          <EmptyState title="Nenhuma campanha cadastrada." />
        ) : (
          <ul className="divide-y divide-line">
            {campaigns.map((campaign) => (
              <li key={campaign.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/config/campanhas/${campaign.id}`} className="font-semibold hover:text-accent hover:underline">
                    {campaign.name}
                  </Link>
                  <p className="text-sm text-muted">
                    {campaign.storeName} · consentimento {campaign.consentVersion} ·{" "}
                    {campaign.allowedOrigins.length === 0
                      ? "nenhuma origem cadastrada"
                      : `${campaign.allowedOrigins.length} origem(ns)`}{" "}
                    · {campaign.isActive ? "Ativa" : "Inativa"}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-muted">{campaign.campaignKey}</p>
                </div>
                <div className="flex gap-2">
                  <CopyButton value={campaign.campaignKey} label="Copiar chave" />
                  <Link href={`/config/campanhas/${campaign.id}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                    Editar
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

export default function CampaignsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <CampaignsContent />
    </Suspense>
  );
}
