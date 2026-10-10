import { isValidCpf } from "@/lib/validation/cpf";
import { normalizeBrazilianPhone } from "@/lib/validation/phone";

/**
 * Busca da lista de leads: por nome ou telefone.
 *
 * CPF nunca pode ir para a URL. Termos com cara de CPF (formato
 * 000.000.000-00, ou 11 dígitos que formam um CPF válido e não um celular
 * válido) são recusados — na tela e também no servidor.
 */
export function looksLikeCpf(term: string): boolean {
  const trimmed = term.trim();
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(trimmed)) return true;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length !== 11 || !/^[\d\s.\-]+$/.test(trimmed)) return false;
  return isValidCpf(digits) && normalizeBrazilianPhone(digits) === null;
}

export type ParsedSearch = { kind: "phone"; digits: string } | { kind: "name"; pattern: string } | null;

/** Escapa curingas do LIKE (% _ \). */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function parseLeadSearch(raw: string | null | undefined): ParsedSearch {
  const term = (raw ?? "").trim().slice(0, 100);
  if (!term || looksLikeCpf(term)) return null;

  if (/^[\d\s()+.\-]+$/.test(term)) {
    let digits = term.replace(/\D/g, "");
    if (digits.length >= 12 && digits.startsWith("55")) digits = digits.slice(2);
    return digits.length >= 3 ? { kind: "phone", digits } : null;
  }

  return term.length >= 2 ? { kind: "name", pattern: `%${escapeLike(term)}%` } : null;
}
