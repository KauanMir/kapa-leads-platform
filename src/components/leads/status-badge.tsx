import { STATUS_LABELS, type LeadStatus } from "@/lib/format/status";

/** Cor + texto (nunca só cor). */
export const STATUS_STYLES: Record<LeadStatus, string> = {
  NEW: "bg-blue-50 text-blue-700 ring-blue-200/80",
  CONTACTED: "bg-amber-50 text-amber-800 ring-amber-200/80",
  IN_PROGRESS: "bg-violet-50 text-violet-700 ring-violet-200/80",
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
  const sizing = size === "lg" ? "px-3 py-1 text-sm gap-2" : "px-2.5 py-0.5 text-xs gap-1.5";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full font-semibold ring-1 ring-inset ${sizing} ${STATUS_STYLES[status]}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${STATUS_DOTS[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}
