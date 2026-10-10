/**
 * Telefone brasileiro: normaliza para somente dígitos (DDD + número).
 *
 * - 11 dígitos: celular, obrigatoriamente com 9 após o DDD.
 * - 10 dígitos: fixo, número começando com 2 a 5.
 * - Aceita prefixo +55 (removido na normalização).
 */

const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export function isValidDdd(ddd: number): boolean {
  return VALID_DDDS.has(ddd);
}

/** Retorna o telefone normalizado (10 ou 11 dígitos) ou null se inválido. */
export function normalizeBrazilianPhone(input: string): string | null {
  if (!/^[\d\s()+.\-]+$/.test(input)) return null;

  let digits = input.replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10 && digits.length !== 11) return null;
  if (!isValidDdd(Number(digits.slice(0, 2)))) return null;

  const subscriber = digits.slice(2);
  if (digits.length === 11 && subscriber[0] !== "9") return null;
  if (digits.length === 10 && !/^[2-5]/.test(subscriber)) return null;

  return digits;
}
