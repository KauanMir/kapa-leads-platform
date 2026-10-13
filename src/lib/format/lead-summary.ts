import { formatFormData } from "@/lib/format/form-data";
import { formatPhone } from "@/lib/format/phone";

/**
 * Texto do botão COPIAR RESUMO: o SDR cola no WhatsApp do vendedor.
 *
 * Só dados comercialmente úteis: nome, telefone, campanha e os campos do
 * formulário (rótulos do form_schema; sem schema, nomes legíveis da chave).
 * Nunca: CPF, nascimento, UTMs/origem, ids ou URLs internas.
 */

// Campos de formulário que nunca vão para o resumo, mesmo se uma campanha os tiver.
const BLOCKED_KEY = /cpf|rg$|documento|birth|nasc|utm|referr|page_?url|^id$|_id$/i;
// "leadId", "clienteId" (camelCase): sensível a maiúsculas para não pegar "paid"/"valid".
const CAMEL_ID_KEY = /[a-z]Id$/;
const URL_VALUE = /^https?:\/\//i;

export type LeadSummaryInput = {
  fullName: string;
  phone: string;
  campaignName: string | null;
  formData: unknown;
  formSchema: unknown;
};

export function buildLeadSummary(lead: LeadSummaryInput): string {
  const lines = [`Lead: ${lead.fullName.trim()}`, `Telefone: ${formatPhone(lead.phone)}`];
  if (lead.campaignName) lines.push(`Campanha: ${lead.campaignName}`);

  for (const entry of formatFormData(lead.formData, lead.formSchema)) {
    if (BLOCKED_KEY.test(entry.key) || CAMEL_ID_KEY.test(entry.key) || entry.value === "—" || URL_VALUE.test(entry.value)) continue;
    lines.push(`${entry.label}: ${entry.value}`);
  }
  return lines.join("\n");
}
