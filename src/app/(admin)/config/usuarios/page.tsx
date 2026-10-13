import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/admin/page-skeleton";
import { buttonClasses } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/card";
import { listUsers } from "@/lib/admin/config";
import { ROLE_LABELS } from "@/lib/auth/access";
import { getSuperAdminSession } from "@/lib/auth/session";
import { NotFoundPanel } from "@/components/admin/not-found-panel";

export const metadata: Metadata = { title: "Usuários · KAPA Leads" };

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
        <div className="mb-6">
          <Notice tone={vinculo === "falhou" ? "error" : "success"}>
            {vinculo === "falhou" ? "Usuário criado, mas o vínculo com a loja falhou. Abra o usuário e vincule novamente." : "Usuário criado."}
          </Notice>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        {users.length === 0 ? (
          <EmptyState title="Nenhum usuário." />
        ) : (
          <ul className="divide-y divide-line">
            {users.map((user) => {
              const active = user.memberships.filter((m) => m.isActive);
              return (
                <li key={user.id}>
                  <Link href={`/config/usuarios/${user.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-background/60">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {user.fullName || user.email || "Sem nome"}
                        {!user.isActive ? <span className="ml-2 text-sm font-medium text-danger">(inativo)</span> : null}
                      </p>
                      <p className="text-sm text-muted">{user.email}</p>
                    </div>
                    <p className="text-sm text-muted">
                      {user.isSuperAdmin
                        ? ROLE_LABELS.SUPER_ADMIN
                        : active.length === 0
                          ? "Sem loja ativa"
                          : active.map((m) => `${m.storeName} (${m.role === "STORE_ADMIN" ? "admin" : "usuário"})`).join(", ")}
                    </p>
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
