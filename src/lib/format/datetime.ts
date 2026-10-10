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
