import { formatCents } from "@/lib/format/form-data";

/**
 * Valor ilustrativo da simulação (ex.: Fábrica de Aprovação): o valor que a LP
 * mostrou ao cliente e a validade dessa apresentação, gravados pelo banco no
 * registro do lead. NÃO é decisão de crédito.
 *
 * Só apresentação: nada aqui recalcula o valor; a validade vem do banco.
 *
 * Futuro (não ativo): uma pré-aprovação real teria status e valor oficiais
 * recebidos de uma integração bancária, guardados à parte — nunca nestes campos.
 */
export type IllustrativeValue = {
  amountCents: number;
  /** Início da validade = registro do lead (ISO 8601). */
  presentedAt: string;
  expiresAt: string;
};

export const ILLUSTRATIVE_VALUE_LABEL = "Valor da simulação — ilustrativo";

/** Lê as colunas do lead; null se faltar qualquer uma (lead antigo ou de outra campanha). */
export function toIllustrativeValue(row: {
  illustrative_amount_cents: number | null;
  illustrative_presented_at: string | null;
  illustrative_expires_at: string | null;
}): IllustrativeValue | null {
  const { illustrative_amount_cents: amountCents, illustrative_presented_at: presentedAt, illustrative_expires_at: expiresAt } = row;
  if (amountCents === null || presentedAt === null || expiresAt === null) return null;
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return null;
  if (Number.isNaN(Date.parse(presentedAt)) || Number.isNaN(Date.parse(expiresAt))) return null;
  return { amountCents, presentedAt, expiresAt };
}

export function formatIllustrativeAmount(value: IllustrativeValue): string {
  return formatCents(value.amountCents);
}

/** Tempo restante em milissegundos (0 quando expirada). */
export function remainingMs(expiresAt: string, nowMs: number): number {
  return Math.max(0, Date.parse(expiresAt) - nowMs);
}

/** "35:59:59": horas corridas (podem passar de 24), minutos e segundos. Arredonda para baixo. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}
