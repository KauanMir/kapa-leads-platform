import type { Metadata } from "next";
import { Suspense } from "react";

import { NotFoundPanel } from "@/components/admin/not-found-panel";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { LgpdCpfForm } from "@/components/config/lgpd-cpf-form";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { listLgpdReleases } from "@/lib/admin/lgpd";
import { LGPD_CHANNEL_LABELS, LGPD_REASON_LABELS, type LgpdReason } from "@/lib/admin/lgpd-options";
import { getSuperAdminSession } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format/datetime";

export const metadata: Metadata = { title: "Pedidos LGPD · KAPA Leads" };

async function LgpdContent() {
  const session = await getSuperAdminSession();
  if (!session) return <NotFoundPanel />;
  const releases = await listLgpdReleases(session.db);

  return (
    <>
      <PageHeader
        title="Pedidos LGPD"
        description="Eliminação do registro de bloqueio de CPF (10 dias úteis) a pedido do titular, mesmo quando o lead já foi excluído. Só a KAPA."
      />

      <Card className="mb-6">
        <CardHeader title="Bloqueio de CPF" description="Consulte o CPF, escolha a loja e confirme a verificação de identidade." />
        <div className="p-5">
          <LgpdCpfForm />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Auditoria" description="Últimos 50 pedidos atendidos. Sem CPF: só loja, motivo, canal e resultado." />
        {releases.length === 0 ? (
          <EmptyState title="Nenhum pedido registrado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-background/60 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Quando</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Loja</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Motivo</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Canal</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Registro</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Operador</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {releases.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatDateTime(row.createdAt)}</td>
                    <td className="px-4 py-3">{row.storeName ?? "—"}</td>
                    <td className="px-4 py-3">{LGPD_REASON_LABELS[row.reason as LgpdReason] ?? row.reason}</td>
                    <td className="px-4 py-3">{LGPD_CHANNEL_LABELS[row.channel] ?? row.channel}</td>
                    <td className="px-4 py-3">{row.recordFound ? "Eliminado" : "Não havia"}</td>
                    <td className="px-4 py-3">{row.performedBy ?? "—"}</td>
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

export default function LgpdPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <LgpdContent />
    </Suspense>
  );
}
