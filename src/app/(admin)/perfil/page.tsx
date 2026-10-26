import { KeyRound, Lock, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/admin/page-skeleton";
import { NameForm, PasswordForm } from "@/components/profile/profile-forms";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardHeader } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/auth/access";
import { getAdminSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Meu perfil · KAPA Leads" };

async function ProfileContent() {
  const { context } = await getAdminSession();
  const name = context.fullName?.trim() || context.email || "Usuário";

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center gap-4">
        <Avatar name={name} size="lg" />
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight sm:text-2xl">Meu perfil</h1>
          {context.email ? <p className="mt-0.5 break-all text-[15px] text-muted">{context.email}</p> : null}
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader icon={<KeyRound />} title="Acesso" />
          <div className="p-4 sm:p-5">
            <p className="font-semibold">{ROLE_LABELS[context.role]}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5 text-sm text-muted">
              {context.isSuperAdmin ? (
                <li className="rounded-md bg-surface-muted px-2 py-1 ring-1 ring-inset ring-line">Todas as lojas</li>
              ) : (
                context.stores.map((store) => (
                  <li key={store.id} className="rounded-md bg-surface-muted px-2 py-1 ring-1 ring-inset ring-line">
                    {store.name} — {store.role ? ROLE_LABELS[store.role] : "—"}
                  </li>
                ))
              )}
            </ul>
          </div>
        </Card>

        <Card>
          <CardHeader icon={<UserRound />} title="Nome" />
          <div className="p-4 sm:p-5">
            <NameForm fullName={context.fullName ?? ""} />
          </div>
        </Card>

        <Card>
          <CardHeader icon={<Lock />} title="Senha" description="Mínimo de 10 caracteres." />
          <div className="p-4 sm:p-5">
            <PasswordForm />
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <ProfileContent />
    </Suspense>
  );
}
