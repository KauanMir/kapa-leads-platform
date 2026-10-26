import { Skeleton } from "@/components/ui/card";

/**
 * Placeholder de cada página do Admin enquanto os dados da sessão chegam.
 *
 * Cada página envolve o próprio conteúdo em <Suspense fallback={<PageSkeleton />}>:
 * na navegação entre páginas o layout (admin) continua montado e o <Suspense>
 * dele não cobre a troca; sem um limite dentro da página, a navegação
 * esperaria a sessão e as consultas (dados por requisição, sem cache).
 *
 * As formas acompanham o layout final de cada tela (sem "pulos" ao carregar).
 */
export function PageSkeleton({ variant }: { variant: "dashboard" | "list" | "detail" | "form" }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      {variant === "detail" ? <Skeleton className="mb-3 h-8 w-20" /> : null}
      {variant !== "detail" ? (
        <div className="mb-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-5 w-72 max-w-full" />
        </div>
      ) : null}

      {variant === "dashboard" ? (
        <>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-56" />
            <Skeleton className="h-10 w-40" />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-40 rounded-xl" />
              <Skeleton className="h-40 rounded-xl" />
            </div>
            <Skeleton className="h-40 rounded-xl" />
          </div>
          <Skeleton className="mt-5 h-64 rounded-xl" />
        </>
      ) : null}

      {variant === "list" ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex gap-4 border-b border-line px-4 py-3.5">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-16" />
          </div>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="mt-2 h-3 w-32" />
              </div>
              <Skeleton className="hidden h-6 w-20 md:block" />
            </div>
          ))}
        </div>
      ) : null}

      {variant === "detail" ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex flex-col gap-5">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : null}

      {variant === "form" ? <Skeleton className="h-80 max-w-4xl rounded-xl" /> : null}
    </div>
  );
}
