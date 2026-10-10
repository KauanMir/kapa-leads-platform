import type { Metadata } from "next";

import { NameForm, PasswordForm } from "@/components/profile/profile-forms";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/auth/access";
import { getAdminSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Meu perfil · KAPA Leads" };

export default async function ProfilePage() {
  const { context } = await getAdminSession();

  return (
    <>
      <PageHeader title="Meu perfil" description={context.email ?? undefined} />

      <div className="flex max-w-3xl flex-col gap-6">
        <Card>
          <CardHeader title="Acesso" />
          <div className="p-5">
            <p className="font-medium">{ROLE_LABELS[context.role]}</p>
            <ul className="mt-2 text-sm text-muted">
              {context.isSuperAdmin ? (
                <li>Todas as lojas</li>
              ) : (
                context.stores.map((store) => (
                  <li key={store.id}>
                    {store.name} — {store.role ? ROLE_LABELS[store.role] : "—"}
                  </li>
                ))
              )}
            </ul>
          </div>
        </Card>

        <Card>
          <CardHeader title="Nome" />
          <div className="p-5">
            <NameForm fullName={context.fullName ?? ""} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Senha" description="Mínimo de 10 caracteres." />
          <div className="p-5">
            <PasswordForm />
          </div>
        </Card>
      </div>
    </>
  );
}
