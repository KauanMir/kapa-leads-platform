import { Building2, KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { NotFoundPanel } from "@/components/admin/not-found-panel";
import { PageSkeleton } from "@/components/admin/page-skeleton";
import { MembershipForm } from "@/components/config/user-forms";
import { ActiveBadge } from "@/components/leads/status-badge";
import { ActionButton } from "@/components/ui/action-button";
import { Avatar } from "@/components/ui/avatar";
import { BackLink, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { setMembershipActiveAction, setUserActiveAction } from "@/lib/actions/config";
import { listStores, listUsers } from "@/lib/admin/config";
import { ROLE_LABELS } from "@/lib/auth/access";
import { getSuperAdminSession } from "@/lib/auth/session";
import { formatDay } from "@/lib/format/datetime";

export const metadata: Metadata = { title: "Usuário · KAPA Leads" };

async function UserDetailContent(props: PageProps<"/config/usuarios/[id]">) {
  const session = await getSuperAdminSession();
  const { id } = await props.params;
  if (!session) return <NotFoundPanel />;
  const { db, context } = session;

  const [users, stores] = await Promise.all([listUsers(db), listStores(db)]);
  const user = users.find((u) => u.id === id);
  if (!user) return <NotFoundPanel />;

  const isSelf = user.id === context.userId;
  const name = user.fullName || user.email || "Usuário";

  return (
    <>
      <BackLink href="/config/usuarios">Voltar para usuários</BackLink>

      <div className="mb-6 flex items-center gap-4">
        <Avatar name={name} size="lg" />
        <div className="min-w-0">
          <h1 className="break-words text-[22px] font-semibold leading-tight tracking-tight sm:text-2xl">{name}</h1>
          {user.email ? <p className="mt-0.5 break-all text-[15px] text-muted">{user.email}</p> : null}
        </div>
      </div>

      <div className="grid max-w-5xl grid-cols-1 gap-5">
        <Card>
          <CardHeader icon={<KeyRound />} title="Acesso" />
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
            <div>
              <p className="flex flex-wrap items-center gap-2 font-medium">
                <ActiveBadge active={user.isActive} activeLabel="Ativo" inactiveLabel="Inativo" />
                {user.isActive ? null : <span className="text-sm text-muted">— não consegue entrar</span>}
              </p>
              <p className="mt-1.5 text-sm text-muted">
                {user.isSuperAdmin ? ROLE_LABELS.SUPER_ADMIN : "Acesso conforme os vínculos abaixo"} · criado em {formatDay(user.createdAt)}
              </p>
            </div>
            {isSelf ? (
              <p className="text-sm text-muted">Você não pode desativar o próprio usuário.</p>
            ) : (
              <ActionButton
                action={setUserActiveAction.bind(null, user.id, !user.isActive)}
                variant={user.isActive ? "danger" : "secondary"}
                confirmMessage={user.isActive ? "Desativar este usuário?" : undefined}
              >
                {user.isActive ? "Desativar usuário" : "Reativar usuário"}
              </ActionButton>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader icon={<Building2 />} title="Vínculos com lojas" description="Papel em cada loja. Vínculo inativo não dá acesso à loja." />
          {user.memberships.length === 0 ? (
            <EmptyState title="Sem vínculos." icon={<Building2 />} />
          ) : (
            <ul className="divide-y divide-line border-b border-line">
              {user.memberships.map((membership) => (
                <li key={membership.storeId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="font-semibold">{membership.storeName}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
                      {ROLE_LABELS[membership.role]}
                      <ActiveBadge active={membership.isActive} activeLabel="Ativo" inactiveLabel="Inativo" />
                    </p>
                  </div>
                  <ActionButton
                    action={setMembershipActiveAction.bind(null, user.id, membership.storeId, !membership.isActive)}
                    variant={membership.isActive ? "danger" : "secondary"}
                  >
                    {membership.isActive ? "Desativar vínculo" : "Reativar vínculo"}
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
          <div className="bg-surface-muted/60 p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-semibold">Adicionar loja ou alterar papel</h3>
            <MembershipForm userId={user.id} stores={stores.map((s) => ({ id: s.id, name: s.name }))} />
          </div>
        </Card>
      </div>
    </>
  );
}

export default function UserDetailPage(props: PageProps<"/config/usuarios/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <UserDetailContent {...props} />
    </Suspense>
  );
}
