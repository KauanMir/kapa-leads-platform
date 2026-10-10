/**
 * Exibição amigável de leads.form_data usando campaigns.form_schema.
 *
 * Retorna somente texto: quem renderiza (React) escapa o conteúdo, então
 * nenhum HTML vindo do JSON é interpretado.
 *
 * form_schema (exemplo):
 *   { "downPaymentCents": { "label": "Valor da entrada", "format": "money", "order": 1 } }
 */
import { z } from "zod";

import { formatIsoDate } from "@/lib/format/datetime";

export const FORM_FIELD_FORMATS = ["text", "number", "money", "boolean", "date"] as const;
export type FormFieldFormat = (typeof FORM_FIELD_FORMATS)[number];

export const formSchemaSchema = z.record(
  z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  z.object({
    label: z.string().trim().min(1).max(100),
    format: z.enum(FORM_FIELD_FORMATS).default("text"),
    order: z.number().int().min(0).max(1000).optional(),
  }),
);

export type FormSchema = z.infer<typeof formSchemaSchema>;

export type FormDataEntry = { key: string; label: string; value: string };

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numberFormatter = new Intl.NumberFormat("pt-BR");
// Sem separador de milhar: anos (2021) e códigos não viram "2.021".
const plainNumberFormatter = new Intl.NumberFormat("pt-BR", { useGrouping: false, maximumFractionDigits: 6 });

export function formatCents(cents: number): string {
  return moneyFormatter.format(cents / 100);
}

/** "downPaymentCents" → "Down payment" ; "trade_year" → "Trade year" */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/Cents$/, "")
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

function guessFormat(key: string, value: unknown): FormFieldFormat {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number" && key.endsWith("Cents")) return "money";
  return "text";
}

export function formatFormValue(value: unknown, format: FormFieldFormat): string {
  if (value === null || value === undefined || value === "") return "—";

  switch (format) {
    case "boolean":
      if (typeof value === "boolean") return value ? "Sim" : "Não";
      break;
    case "money":
      if (typeof value === "number" && Number.isFinite(value)) return formatCents(value);
      break;
    case "number":
      // Separador de milhar só a partir de 10.000 (anos como 2021 ficam legíveis).
      if (typeof value === "number" && Number.isFinite(value)) {
        return Math.abs(value) >= 10_000 ? numberFormatter.format(value) : plainNumberFormatter.format(value);
      }
      break;
    case "date":
      if (typeof value === "string") return formatIsoDate(value);
      break;
    case "text":
      break;
  }

  if (typeof value === "number") return Number.isFinite(value) ? plainNumberFormatter.format(value) : "—";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  // Estruturas inesperadas (não deveriam existir pela validação da API).
  return JSON.stringify(value);
}

/** Lista ordenada de campos para exibição. Schema inválido → fallback genérico. */
export function formatFormData(formData: unknown, formSchema: unknown): FormDataEntry[] {
  if (!formData || typeof formData !== "object" || Array.isArray(formData)) return [];
  const parsedSchema = formSchemaSchema.safeParse(formSchema ?? {});
  const schema: FormSchema = parsedSchema.success ? parsedSchema.data : {};

  const entries = Object.entries(formData as Record<string, unknown>).map(([key, value]) => {
    const field = schema[key];
    const format = field?.format ?? guessFormat(key, value);
    return {
      key,
      label: field?.label ?? humanizeKey(key),
      value: formatFormValue(value, format),
      order: field?.order ?? (field ? 500 : 1000),
    };
  });

  entries.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "pt-BR"));
  return entries.map(({ key, label, value }) => ({ key, label, value }));
}
