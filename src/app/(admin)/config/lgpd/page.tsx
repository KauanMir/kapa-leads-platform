import { FileClock, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { NotFoundPanel } from "@/components/admin/not-found-panel";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { LgpdCpfForm } from "@/components/config/lgpd-cpf-form";
import { Card, CardHeader, EmptyState, PageHeader, TABLE_HEAD } from "@/components/ui/card";
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

      <div className="grid grid-cols-1 items-start gap-5 2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader icon={<ShieldCheck />} title="Bloqueio de CPF" description="Consulte o CPF, escolha a loja e confirme a verificação de identidade." />
          <div className="p-4 sm:p-5">
            <LgpdCpfForm />
          </div>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader icon={<FileClock />} title="Auditoria" description="Últimos 50 pedidos atendidos. Sem CPF: só loja, motivo, canal e resultado." />
          {releases.length === 0 ? (
            <EmptyState title="Nenhum pedido registrado." icon={<FileClock />} />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className={TABLE_HEAD}>
                    <tr>
                      <th scope="col" className="py-2.5 pl-5 pr-4 font-medium">Quando</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Loja</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Motivo</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Canal</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Registro</th>
                      <th scope="col" className="py-2.5 pl-4 pr-5 font-medium">Operador</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {releases.map((row) => (
                      <tr key={row.id} className="transition-colors hover:bg-surface-muted">
                        <td className="num whitespace-nowrap py-3 pl-5 pr-4 text-foreground-soft">{formatDateTime(row.createdAt)}</td>
                        <td className="px-4 py-3 font-medium">{row.storeName ?? "—"}</td>
                        <td className="px-4 py-3">{LGPD_REASON_LABELS[row.reason as LgpdReason] ?? row.reason}</td>
                        <td className="px-4 py-3">{LGPD_CHANNEL_LABELS[row.channel] ?? row.channel}</td>
                        <td className="px-4 py-3">{row.recordFound ? "Eliminado" : "Não havia"}</td>
                        <td className="py-3 pl-4 pr-5">{row.performedBy ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-line md:hidden">
                {releases.map((row) => (
                  <li key={row.id} className="px-4 py-3.5 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold">{row.storeName ?? "—"}</span>
                      <span className="num shrink-0 text-xs text-muted">{formatDateTime(row.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-foreground-soft">{LGPD_REASON_LABELS[row.reason as LgpdReason] ?? row.reason}</p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {LGPD_CHANNEL_LABELS[row.channel] ?? row.channel} · {row.recordFound ? "Eliminado" : "Não havia"} · {row.performedBy ?? "—"}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
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
