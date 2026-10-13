import { LEAD_STATUSES, type LeadStatus } from "@/lib/format/status";

/**
 * KPIs operacionais a partir das linhas agregadas de lead_kpis() no banco.
 *
 * Fórmulas (docs/operacao-lojas.md):
 *   Pendentes   = Novos + Contatados + Em atendimento
 *   Concluídos  = Ganhos + Perdidos
 *   Conversão   = Ganhos / Concluídos  (null quando ainda não há concluídos)
 *   1º atendimento = média de (primeira mudança de status saindo de "Novo"
 *                    − chegada do lead), só entre os leads que já saíram de "Novo".
 */

export type KpiRow = {
  assignedTo: string | null;
  status: LeadStatus;
  leads: number;
  firstContactLeads: number;
  firstContactSeconds: number;
};

export type KpiBlock = {
  total: number;
  byStatus: Record<LeadStatus, number>;
  pending: number;
  closed: number;
  /** 0..1, ou null sem leads concluídos. */
  conversion: number | null;
  /** Média em segundos, ou null sem nenhum lead atendido. */
  avgFirstContactSeconds: number | null;
};

export type KpiSummary = KpiBlock & {
  unassigned: number;
  byAssignee: Map<string, KpiBlock>;
};

type Acc = { total: number; byStatus: Record<LeadStatus, number>; fcLeads: number; fcSeconds: number };

const emptyAcc = (): Acc => ({
  total: 0,
  byStatus: Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>,
  fcLeads: 0,
  fcSeconds: 0,
});

function add(acc: Acc, row: KpiRow) {
  acc.total += row.leads;
  acc.byStatus[row.status] += row.leads;
  acc.fcLeads += row.firstContactLeads;
  acc.fcSeconds += row.firstContactSeconds;
}

function toBlock(acc: Acc): KpiBlock {
  const { NEW, CONTACTED, IN_PROGRESS, WON, LOST } = acc.byStatus;
  const closed = WON + LOST;
  return {
    total: acc.total,
    byStatus: acc.byStatus,
    pending: NEW + CONTACTED + IN_PROGRESS,
    closed,
    conversion: closed > 0 ? WON / closed : null,
    avgFirstContactSeconds: acc.fcLeads > 0 ? acc.fcSeconds / acc.fcLeads : null,
  };
}

export function summarizeKpis(rows: KpiRow[]): KpiSummary {
  const all = emptyAcc();
  const perUser = new Map<string, Acc>();
  let unassigned = 0;

  for (const row of rows) {
    add(all, row);
    if (!row.assignedTo) {
      unassigned += row.leads;
      continue;
    }
    const acc = perUser.get(row.assignedTo) ?? emptyAcc();
    add(acc, row);
    perUser.set(row.assignedTo, acc);
  }

  return {
    ...toBlock(all),
    unassigned,
    byAssignee: new Map([...perUser].map(([id, acc]) => [id, toBlock(acc)])),
  };
}

export const EMPTY_BLOCK: KpiBlock = toBlock(emptyAcc());

export function formatConversion(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 1000) / 10}%`.replace(".", ",");
}

/** "8 min", "2 h 15 min", "1 d 3 h". */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days} d ${hours % 24} h` : `${days} d`;
}
