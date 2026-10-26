import { ChevronRight, Globe, Megaphone, Plus, ShieldCheck, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { NotFoundPanel } from "@/components/admin/not-found-panel";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { ActiveBadge } from "@/components/leads/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { listCampaigns } from "@/lib/admin/config";
import { getSuperAdminSession } from "@/lib/auth/session";

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
          <EmptyState title="Nenhuma campanha cadastrada." icon={<Megaphone />} />
        ) : (
          <ul className="divide-y divide-line">
            {campaigns.map((campaign) => (
              <li key={campaign.id} className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-surface-muted/60 sm:px-5 lg:flex-row lg:items-center lg:gap-6">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span aria-hidden="true" className="mt-0.5 hidden size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-muted text-muted sm:flex">
                    <Megaphone className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/config/campanhas/${campaign.id}`} className="text-[15px] font-semibold hover:text-accent">
                        {campaign.name}
                      </Link>
                      <ActiveBadge active={campaign.isActive} />
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <Store aria-hidden="true" className="size-3.5" />
                        {campaign.storeName}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck aria-hidden="true" className="size-3.5" />
                        consentimento {campaign.consentVersion}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Globe aria-hidden="true" className="size-3.5" />
                        {campaign.allowedOrigins.length === 0 ? "nenhuma origem cadastrada" : `${campaign.allowedOrigins.length} origem(ns)`}
                      </span>
                    </p>
                    <code className="mt-2 inline-block max-w-full break-all rounded-md bg-surface-sunken px-2 py-1 font-mono text-xs text-foreground-soft">
                      {campaign.campaignKey}
                    </code>
                  </div>
                </div>
                <div className="flex gap-2 sm:pl-12 lg:pl-0">
                  <CopyButton value={campaign.campaignKey} label="Copiar chave" />
                  <Link href={`/config/campanhas/${campaign.id}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                    Editar
                    <ChevronRight aria-hidden="true" />
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
