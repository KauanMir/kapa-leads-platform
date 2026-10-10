import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NotFoundPanel } from "@/components/admin/not-found-panel";
import { MembershipForm } from "@/components/config/user-forms";
import { ActionButton } from "@/components/ui/action-button";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { setMembershipActiveAction, setUserActiveAction } from "@/lib/actions/config";
import { listStores, listUsers } from "@/lib/admin/config";
import { ROLE_LABELS } from "@/lib/auth/access";
import { getSuperAdminSession } from "@/lib/auth/session";
import { formatDay } from "@/lib/format/datetime";

export const metadata: Metadata = { title: "Usuário · KAPA Leads" };

export default async function UserDetailPage(props: PageProps<"/config/usuarios/[id]">) {
  const { id } = await props.params;
  const session = await getSuperAdminSession();
  if (!session) return <NotFoundPanel />;
  const { db, context } = session;

  const [users, stores] = await Promise.all([listUsers(db), listStores(db)]);
  const user = users.find((u) => u.id === id);
  if (!user) return <NotFoundPanel />;

  const isSelf = user.id === context.userId;

  return (
    <>
      <Link href="/config/usuarios" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar para usuários
      </Link>
      <PageHeader title={user.fullName || user.email || "Usuário"} description={user.email ?? undefined} />

      <Card className="mb-6">
        <CardHeader title="Acesso" />
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="font-medium">{user.isActive ? "Ativo" : "Inativo — não consegue entrar"}</p>
            <p className="text-sm text-muted">
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

      <Card>
        <CardHeader title="Vínculos com lojas" description="Papel em cada loja. Vínculo inativo não dá acesso à loja." />
        {user.memberships.length === 0 ? (
          <EmptyState title="Sem vínculos." />
        ) : (
          <ul className="divide-y divide-line border-b border-line">
            {user.memberships.map((membership) => (
              <li key={membership.storeId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="font-medium">{membership.storeName}</p>
                  <p className="text-sm text-muted">
                    {ROLE_LABELS[membership.role]} · {membership.isActive ? "Ativo" : "Inativo"}
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
        <div className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Adicionar loja ou alterar papel</h3>
          <MembershipForm userId={user.id} stores={stores.map((s) => ({ id: s.id, name: s.name }))} />
        </div>
      </Card>
    </>
  );
}
