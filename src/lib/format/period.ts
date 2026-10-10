import { todayInSaoPaulo } from "@/lib/validation/birth-date";

/**
 * Períodos de filtro em São Paulo. O Brasil não tem horário de verão desde
 * 2019, então o deslocamento é fixo em -03:00.
 */
export const PERIODS = ["hoje", "7d", "30d", "personalizado", "tudo"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABELS: Record<Period, string> = {
  hoje: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  personalizado: "Personalizado",
  tudo: "Todo o período",
};

const SP_OFFSET = "-03:00";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isPeriod(value: unknown): value is Period {
  return typeof value === "string" && (PERIODS as readonly string[]).includes(value);
}

function shiftDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type DateRange = { from: string | null; to: string | null };

/** Intervalo [from, to) em ISO 8601 para filtrar created_at. */
export function resolvePeriod(period: Period, now: Date, custom?: { from?: string; to?: string }): DateRange {
  const today = todayInSaoPaulo(now);
  const startOf = (date: string) => `${date}T00:00:00${SP_OFFSET}`;

  switch (period) {
    case "hoje":
      return { from: startOf(today), to: null };
    case "7d":
      return { from: startOf(shiftDays(today, -6)), to: null };
    case "30d":
      return { from: startOf(shiftDays(today, -29)), to: null };
    case "personalizado": {
      const from = custom?.from && ISO_DATE.test(custom.from) ? startOf(custom.from) : null;
      const to = custom?.to && ISO_DATE.test(custom.to) ? startOf(shiftDays(custom.to, 1)) : null;
      return { from, to };
    }
    case "tudo":
      return { from: null, to: null };
  }
}
