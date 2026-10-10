import { STATUS_LABELS, type LeadStatus } from "@/lib/format/status";

/** Cor + texto (nunca só cor). */
export const STATUS_STYLES: Record<LeadStatus, string> = {
  NEW: "bg-blue-50 text-blue-800 ring-blue-200",
  CONTACTED: "bg-amber-50 text-amber-800 ring-amber-200",
  IN_PROGRESS: "bg-violet-50 text-violet-800 ring-violet-200",
  WON: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  LOST: "bg-slate-100 text-slate-700 ring-slate-200",
};

export const STATUS_DOTS: Record<LeadStatus, string> = {
  NEW: "bg-blue-600",
  CONTACTED: "bg-amber-500",
  IN_PROGRESS: "bg-violet-600",
  WON: "bg-emerald-600",
  LOST: "bg-slate-400",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[status]}`}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </span>
  );
}
