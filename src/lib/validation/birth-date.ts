/**
 * Data de nascimento no formato ISO (AAAA-MM-DD) e cálculo de idade.
 * A data de "hoje" é sempre a de America/Sao_Paulo.
 */

export const MIN_LEAD_AGE = 18;
export const MAX_LEAD_AGE = 120;

const TIME_ZONE = "America/Sao_Paulo";

/** Valida AAAA-MM-DD como data real de calendário (rejeita 2024-02-30). */
export function isValidIsoDate(input: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Data de hoje (AAAA-MM-DD) em São Paulo. */
export function todayInSaoPaulo(now: Date): string {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Idade completa em anos na data `today` (ambas AAAA-MM-DD válidas). */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const hadBirthday = tm > bm || (tm === bm && td >= bd);
  return ty - by - (hadBirthday ? 0 : 1);
}
