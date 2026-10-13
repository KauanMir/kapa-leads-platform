/** Datas sempre exibidas no fuso de São Paulo. */
const TIME_ZONE = "America/Sao_Paulo";

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
const dayFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });

/** "10/10/2026 14:32" */
export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso)).replace(",", "");
}

/** "14:32" */
export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

/** "10/10/2026" a partir de um timestamp. */
export function formatDay(iso: string): string {
  return dayFormatter.format(new Date(iso));
}

/** "20/05/1990" a partir de AAAA-MM-DD (sem conversão de fuso). */
export function formatIsoDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
}

// "2026-10-13" (dia no fuso de São Paulo) — para comparar dias.
const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const shortDayFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit" });

function daysBetween(iso: string, now: Date): number {
  const toUtc = (date: Date) => Date.parse(`${dayKeyFormatter.format(date)}T00:00:00Z`);
  return Math.round((toUtc(now) - toUtc(new Date(iso))) / 86_400_000);
}

/** "agora", "há 5 min", "há 3 h", "ontem, 14:32", "12/10, 09:10", "12/10/2025". */
export function formatRelative(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  const days = daysBetween(iso, now);
  if (minutes < 1) return "agora";
  if (days === 0 && minutes < 60) return `há ${minutes} min`;
  if (days === 0) return `há ${Math.floor(minutes / 60)} h`;
  if (days === 1) return `ontem, ${formatTime(iso)}`;
  if (dayKeyFormatter.format(new Date(iso)).slice(0, 4) === dayKeyFormatter.format(now).slice(0, 4)) {
    return `${shortDayFormatter.format(new Date(iso))}, ${formatTime(iso)}`;
  }
  return formatDay(iso);
}

/** Rótulo para agrupar por dia: "Hoje", "Ontem" ou "12/10/2026". */
export function formatDayLabel(iso: string, now: Date): string {
  const days = daysBetween(iso, now);
  if (days === 0) return "Hoje";
  if (days === 1) return "Ontem";
  return formatDay(iso);
}
