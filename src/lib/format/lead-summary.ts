import { formatFormData, formatFormValue } from "@/lib/format/form-data";
import { formatPhone } from "@/lib/format/phone";

/**
 * Texto do botão COPIAR RESUMO (colar no WhatsApp do vendedor). Curto, em
 * blocos, sem linhas vazias:
 *
 *   Lead / Telefone / Campanha
 *   Troca / Veículo na troca / Ano do veículo
 *   Entrada / Valor da entrada
 *   Valor desejado
 *   (outros campos da campanha, com os rótulos do form_schema)
 *
 * Nunca: CPF, nascimento, UTMs/origem, ids ou URLs.
 */

type Field = { key: string; label: string; format: "boolean" | "text" | "number" | "money" };

/** Campos conhecidos (Duelo de Aprovações e campanhas com o mesmo formulário). */
const TRADE_IN: Field[] = [
  { key: "hasTradeIn", label: "Troca", format: "boolean" },
  { key: "tradeInVehicle", label: "Veículo na troca", format: "text" },
  { key: "tradeInYear", label: "Ano do veículo", format: "number" },
];
const DOWN_PAYMENT: Field[] = [
  { key: "hasDownPayment", label: "Entrada", format: "boolean" },
  { key: "downPaymentCents", label: "Valor da entrada", format: "money" },
];
const DESIRED: Field[] = [{ key: "desiredVehicleValueCents", label: "Valor desejado", format: "money" }];
const KNOWN = new Set([...TRADE_IN, ...DOWN_PAYMENT, ...DESIRED].map((f) => f.key));

// Campos que nunca vão para o resumo, mesmo se uma campanha os tiver.
const BLOCKED_KEY = /cpf|rg$|documento|birth|nasc|utm|referr|page_?url|^id$|_id$/i;
// "leadId", "clienteId" (camelCase): sensível a maiúsculas para não pegar "paid"/"valid".
const CAMEL_ID_KEY = /[a-z]Id$/;
const URL_VALUE = /^https?:\/\//i;
// Data no lugar de texto livre = dado errado (ex.: autopreenchimento do nascimento). Não repassa.
const DATE_VALUE = /^\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})\s*$/;

export type LeadSummaryInput = {
  fullName: string;
  phone: string;
  campaignName: string | null;
  formData: unknown;
  formSchema: unknown;
};

function usable(value: string): boolean {
  return value !== "—" && !URL_VALUE.test(value) && !DATE_VALUE.test(value);
}

/** Linhas de um bloco; os detalhes só entram quando a resposta (Sim/Não) é "Sim". */
function block(data: Record<string, unknown>, fields: Field[]): string[] {
  const [first, ...rest] = fields;
  const lines: string[] = [];
  let details = fields;
  if (first.format === "boolean") {
    const answer = data[first.key];
    if (typeof answer === "boolean") lines.push(`${first.label}: ${answer ? "Sim" : "Não"}`);
    if (answer === false) return lines;
    details = rest;
  }
  for (const field of details) {
    const value = formatFormValue(data[field.key], field.format);
    if (usable(value)) lines.push(`${field.label}: ${value}`);
  }
  return lines;
}

export function buildLeadSummary(lead: LeadSummaryInput): string {
  const data =
    lead.formData && typeof lead.formData === "object" && !Array.isArray(lead.formData) ? (lead.formData as Record<string, unknown>) : {};

  const header = [`Lead: ${lead.fullName.trim()}`, `Telefone: ${formatPhone(lead.phone)}`];
  if (lead.campaignName) header.push(`Campanha: ${lead.campaignName}`);

  // Outras campanhas: demais campos com os rótulos do form_schema (ou nomes legíveis da chave).
  const others = formatFormData(data, lead.formSchema)
    .filter((entry) => !KNOWN.has(entry.key) && !BLOCKED_KEY.test(entry.key) && !CAMEL_ID_KEY.test(entry.key) && usable(entry.value))
    .map((entry) => `${entry.label}: ${entry.value}`);

  return [header, block(data, TRADE_IN), block(data, DOWN_PAYMENT), block(data, DESIRED), others]
    .filter((lines) => lines.length > 0)
    .map((lines) => lines.join("\n"))
    .join("\n\n");
}
