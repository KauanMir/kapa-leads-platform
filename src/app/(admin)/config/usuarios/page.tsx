import { ChevronRight, Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { NotFoundPanel } from "@/components/admin/not-found-panel";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { Avatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/card";
import { listUsers } from "@/lib/admin/config";
import { ROLE_LABELS } from "@/lib/auth/access";
import { getSuperAdminSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Usuários · KAPA Leads" };

function Tag({ tone = "neutral", children }: { tone?: "neutral" | "accent" | "danger"; children: React.ReactNode }) {
  const styles = {
    neutral: "bg-surface-muted text-foreground-soft ring-line",
    accent: "bg-accent-soft text-accent ring-accent-line",
    danger: "bg-danger-soft text-danger ring-danger/20",
  }[tone];
  return <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-md px-2 text-xs font-semibold ring-1 ring-inset ${styles}`}>{children}</span>;
}

async function UsersContent(props: PageProps<"/config/usuarios">) {
  const session = await getSuperAdminSession();
  const { criado, vinculo } = await props.searchParams;
  if (!session) return <NotFoundPanel />;
  const { db } = session;
  const users = await listUsers(db);

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Acesso ao painel e vínculos com as lojas."
        action={
          <Link href="/config/usuarios/novo" className={buttonClasses()}>
            <Plus aria-hidden="true" className="size-4" />
            Novo usuário
          </Link>
        }
      />

      {criado ? (
        <div className="mb-5">
          <Notice tone={vinculo === "falhou" ? "error" : "success"}>
            {vinculo === "falhou" ? "Usuário criado, mas o vínculo com a loja falhou. Abra o usuário e vincule novamente." : "Usuário criado."}
          </Notice>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        {users.length === 0 ? (
          <EmptyState title="Nenhum usuário." icon={<Users />} />
        ) : (
          <ul className="divide-y divide-line">
            {users.map((user) => {
              const active = user.memberships.filter((m) => m.isActive);
              const name = user.fullName || user.email || "Sem nome";
              return (
                <li key={user.id}>
                  <Link
                    href={`/config/usuarios/${user.id}`}
                    className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-muted sm:px-5 md:gap-4"
                  >
                    <Avatar name={name} size="md" className={user.isActive ? "" : "opacity-50"} />
                    <div className="min-w-0 flex-1 md:flex md:items-center md:gap-6">
                      <div className="min-w-0 md:w-[36%] md:shrink-0">
                        <p className="flex flex-wrap items-center gap-x-2 font-semibold group-hover:text-accent">
                          <span className="truncate">{name}</span>
                          {!user.isActive ? <span className="text-sm font-medium text-danger">(inativo)</span> : null}
                        </p>
                        <p className="truncate text-[13px] text-muted">{user.email}</p>
                      </div>
                      <div className="mt-2 flex min-w-0 flex-wrap gap-1.5 md:mt-0">
                        {user.isSuperAdmin ? (
                          <Tag tone="accent">{ROLE_LABELS.SUPER_ADMIN}</Tag>
                        ) : active.length === 0 ? (
                          <Tag tone="danger">Sem loja ativa</Tag>
                        ) : (
                          active.map((m) => (
                            <Tag key={m.storeId}>
                              {m.storeName} ({m.role === "STORE_ADMIN" ? "admin" : "usuário"})
                            </Tag>
                          ))
                        )}
                      </div>
                    </div>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-line-strong group-hover:text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

export default function UsersPage(props: PageProps<"/config/usuarios">) {
  return (
    <Suspense fallback={<PageSkeleton variant="list" />}>
      <UsersContent {...props} />
    </Suspense>
  );
}
