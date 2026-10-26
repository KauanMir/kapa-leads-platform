import { ArrowLeft, Inbox } from "lucide-react";
import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";

/** Superfície padrão: branca, borda de 1px, cantos de 12px e sombra quase imperceptível. */
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-xl border border-line bg-surface shadow-card ${className}`} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon ? (
          <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-muted [&>svg]:size-4">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {description ? <p className="text-[13px] text-muted">{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Cabeçalho de página: título forte, subtítulo curto e ação à direita. */
export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 sm:mb-6">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-[13px] font-medium text-muted">{eyebrow}</p> : null}
        <h1 className="text-[22px] font-semibold leading-8 tracking-tight text-foreground sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-[14px] text-muted sm:text-[15px]">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Voltar para a lista (acima do título das telas de detalhe). */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-1.5 mb-3 inline-flex h-8 items-center gap-1.5 rounded-lg px-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-foreground"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {children}
    </Link>
  );
}

/** Cabeçalho das tabelas (mesmo estilo em todas as telas). */
export const TABLE_HEAD = "border-b border-line bg-surface-muted text-[12px] font-medium text-muted";

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: ReactNode }) {
  const styles = {
    info: "border-accent-line bg-accent-soft text-foreground",
    error: "border-danger/25 bg-danger-soft text-danger",
    success: "border-success/25 bg-success-soft text-success",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm font-medium ${styles}`}>
      {children}
    </div>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <span aria-hidden="true" className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl border border-line bg-surface-muted text-subtle [&>svg]:size-5">
        {icon ?? <Inbox />}
      </span>
      <p className="font-semibold">{title}</p>
      {children ? <div className="mx-auto mt-1 max-w-sm text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-surface-sunken ${className}`} />;
}
