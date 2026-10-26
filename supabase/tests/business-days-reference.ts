/**
 * Referência independente (TypeScript) da regra de bloqueio de CPF por dias
 * úteis implementada no banco (private.cpf_cooldown_end, migration
 * 20261026120000). Usada só nos testes, para conferir o que o banco gravou.
 *
 * Datas como "AAAA-MM-DD" no calendário de Brasília (UTC−3 o ano todo desde
 * 2019, sem horário de verão).
 */

const DAY_MS = 86_400_000;
const BRASILIA_OFFSET = "-03:00";

/** Domingo de Páscoa (Meeus/Jones/Butcher), como "AAAA-MM-DD". */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const toUtc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, days: number) => fromUtc(toUtc(iso) + days * DAY_MS);

const FIXED = new Set(["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "11-30", "12-25"]);

export function isDfHoliday(iso: string): boolean {
  if (FIXED.has(iso.slice(5))) return true;
  const easter = easterSunday(Number(iso.slice(0, 4)));
  return iso === addDays(easter, -2) || iso === addDays(easter, 60);
}

export function isBusinessDay(iso: string): boolean {
  const weekday = new Date(toUtc(iso)).getUTCDay(); // 0 = domingo
  return weekday !== 0 && weekday !== 6 && !isDfHoliday(iso);
}

/** Data (Brasília) de um instante. */
export function brasiliaDate(instant: Date): string {
  return fromUtc(instant.getTime() - 3 * 3_600_000);
}

/** Instante em que o bloqueio termina (00:00 de Brasília do dia seguinte ao N-ésimo dia útil). */
export function cooldownEnd(requestedAt: Date, businessDays: number): Date {
  let day = brasiliaDate(requestedAt);
  let counted = 0;
  while (counted < businessDays) {
    day = addDays(day, 1);
    if (isBusinessDay(day)) counted++;
  }
  return new Date(`${addDays(day, 1)}T00:00:00${BRASILIA_OFFSET}`);
}
