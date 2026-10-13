import { Skeleton } from "@/components/ui/card";

/**
 * Placeholder de cada página do Admin enquanto os dados da sessão chegam.
 *
 * Cada página envolve o próprio conteúdo em <Suspense fallback={<PageSkeleton />}>:
 * na navegação entre páginas o layout (admin) continua montado e o <Suspense>
 * dele não cobre a troca; sem um limite dentro da página, a navegação
 * esperaria a sessão e as consultas (dados por requisição, sem cache).
 */
export function PageSkeleton({ variant }: { variant: "dashboard" | "list" | "detail" | "form" }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      {variant === "detail" ? <Skeleton className="mb-4 h-5 w-20" /> : null}
      {variant !== "detail" ? (
        <div className="mb-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-5 w-72 max-w-full" />
        </div>
      ) : null}

      {variant === "dashboard" ? (
        <>
          <Skeleton className="h-16 rounded-2xl" />
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
              <Skeleton className="h-40 rounded-2xl" />
              <Skeleton className="h-40 rounded-2xl" />
            </div>
            <Skeleton className="h-[344px] rounded-2xl lg:col-span-2" />
          </div>
          <Skeleton className="mt-6 h-64 rounded-2xl" />
        </>
      ) : null}

      {variant === "list" ? (
        <>
          <Skeleton className="h-28 rounded-2xl" />
          <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 border-b border-line px-5 py-4 last:border-b-0">
                <Skeleton className="size-10 shrink-0 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-48 max-w-full" />
                  <Skeleton className="mt-2 h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {variant === "detail" ? (
        <>
          <Skeleton className="h-72 rounded-2xl" />
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
            <Skeleton className="h-56 rounded-2xl lg:col-span-3" />
            <Skeleton className="h-56 rounded-2xl lg:col-span-2" />
          </div>
        </>
      ) : null}

      {variant === "form" ? <Skeleton className="h-80 rounded-2xl" /> : null}
    </div>
  );
}
