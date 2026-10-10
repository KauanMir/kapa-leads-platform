import type { Database } from "@/types/database";

export type LeadStatus = Database["public"]["Enums"]["lead_status"];

export const LEAD_STATUSES: readonly LeadStatus[] = ["NEW", "CONTACTED", "IN_PROGRESS", "WON", "LOST"];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "Novo",
  CONTACTED: "Contatado",
  IN_PROGRESS: "Em atendimento",
  WON: "Ganho",
  LOST: "Perdido",
};

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUSES as readonly string[]).includes(value);
}
