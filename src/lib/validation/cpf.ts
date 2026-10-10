/**
 * CPF: normalização e validação dos dígitos verificadores.
 * Mesma regra da CHECK `private.is_valid_cpf` do banco.
 */

/** Remove a máscara (pontos, hífen, espaços). Retorna null se sobrar algo que não seja 11 dígitos. */
export function normalizeCpf(input: string): string | null {
  if (!/^[\d.\-\s]+$/.test(input)) return null;
  const digits = input.replace(/\D/g, "");
  return digits.length === 11 ? digits : null;
}

/** Valida um CPF já normalizado (11 dígitos). Rejeita sequências repetidas (000..., 111...). */
export function isValidCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

  const digits = Array.from(cpf, Number);
  const checkDigit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += digits[i] * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return checkDigit(9) === digits[9] && checkDigit(10) === digits[10];
}
