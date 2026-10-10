import { Suspense, type ReactNode } from "react";

import { AdminShell, AdminShellSkeleton } from "@/components/admin/admin-shell";
import { getAdminContext } from "@/lib/auth/session";

/**
 * Área autenticada. A sessão é lida por requisição dentro do <Suspense>
 * (Cache Components): nenhum dado privado vai para cache compartilhado.
 */
export const instant = false;

async function ProtectedShell({ children }: { children: ReactNode }) {
  const context = await getAdminContext();
  return <AdminShell context={context}>{children}</AdminShell>;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <ProtectedShell>{children}</ProtectedShell>
    </Suspense>
  );
}
