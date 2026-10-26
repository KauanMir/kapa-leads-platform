import type { Metadata } from "next";
import { Suspense } from "react";

import { PageSkeleton } from "@/components/admin/page-skeleton";
import { CreateUserForm } from "@/components/config/user-forms";
import { BackLink, Card, PageHeader } from "@/components/ui/card";
import { listStores } from "@/lib/admin/config";
import { getSuperAdminSession } from "@/lib/auth/session";
import { NotFoundPanel } from "@/components/admin/not-found-panel";

export const metadata: Metadata = { title: "Novo usuário · KAPA Leads" };

async function NewUserContent() {
  const session = await getSuperAdminSession();
  if (!session) return <NotFoundPanel />;
  const { db } = session;
  const stores = await listStores(db);

  return (
    <>
      <BackLink href="/config/usuarios">Voltar para usuários</BackLink>
      <PageHeader title="Novo usuário" description="O usuário entra com e-mail e a senha inicial definida aqui." />
      <Card className="max-w-4xl p-4 sm:p-6">
        <CreateUserForm stores={stores.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name }))} />
      </Card>
    </>
  );
}

export default function NewUserPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="form" />}>
      <NewUserContent />
    </Suspense>
  );
}
