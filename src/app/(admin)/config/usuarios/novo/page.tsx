import type { Metadata } from "next";

import { CreateUserForm } from "@/components/config/user-forms";
import { Card, PageHeader } from "@/components/ui/card";
import { listStores } from "@/lib/admin/config";
import { getSuperAdminSession } from "@/lib/auth/session";
import { NotFoundPanel } from "@/components/admin/not-found-panel";

export const metadata: Metadata = { title: "Novo usuário · KAPA Leads" };

export default async function NewUserPage() {
  const session = await getSuperAdminSession();
  if (!session) return <NotFoundPanel />;
  const { db } = session;
  const stores = await listStores(db);

  return (
    <>
      <PageHeader title="Novo usuário" description="O usuário entra com e-mail e a senha inicial definida aqui." />
      <Card className="p-5">
        <CreateUserForm stores={stores.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name }))} />
      </Card>
    </>
  );
}
