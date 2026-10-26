import { STATUS_LABELS, type LeadStatus } from "@/lib/format/status";

/** Cor + texto (nunca só cor). */
export const STATUS_STYLES: Record<LeadStatus, string> = {
  NEW: "bg-blue-50 text-blue-700 ring-blue-200/70",
  CONTACTED: "bg-amber-50 text-amber-800 ring-amber-200/80",
  IN_PROGRESS: "bg-violet-50 text-violet-700 ring-violet-200/70",
  WON: "bg-emerald-50 text-emerald-700 ring-emerald-200/80",
  LOST: "bg-slate-100 text-slate-600 ring-slate-200",
};

export const STATUS_DOTS: Record<LeadStatus, string> = {
  NEW: "bg-blue-500",
  CONTACTED: "bg-amber-500",
  IN_PROGRESS: "bg-violet-500",
  WON: "bg-emerald-500",
  LOST: "bg-slate-400",
};

export function StatusBadge({ status, size = "sm" }: { status: LeadStatus; size?: "sm" | "lg" }) {
  const sizing = size === "lg" ? "h-8 px-3 text-sm gap-2" : "h-6 px-2 text-xs gap-1.5";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-md font-semibold ring-1 ring-inset ${sizing} ${STATUS_STYLES[status]}`}>
      <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${STATUS_DOTS[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Situação simples (ativa/inativa) nas telas de configuração. */
export function ActiveBadge({ active, activeLabel = "Ativa", inactiveLabel = "Inativa" }: { active: boolean; activeLabel?: string; inactiveLabel?: string }) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-semibold ring-1 ring-inset ${
        active ? "bg-emerald-50 text-emerald-700 ring-emerald-200/80" : "bg-slate-100 text-slate-600 ring-slate-200"
      }`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-400"}`} />
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}
