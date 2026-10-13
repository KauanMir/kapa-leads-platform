import { formatFormData, formatFormValue, type FormDataEntry } from "@/lib/format/form-data";

/**
 * Dados da simulação para a tela do lead: os três números que o vendedor
 * procura primeiro (valor desejado, entrada e troca) em destaque, e os demais
 * campos da campanha logo abaixo, com os rótulos do form_schema.
 *
 * Só apresentação: mostra o que foi salvo, sem corrigir nada.
 */

export type SimulationHighlight = {
  key: "desired" | "downPayment" | "tradeIn";
  label: string;
  value: string;
  detail?: string;
  /** false = resposta "Não" (exibida mais apagada). */
  positive: boolean;
};

export type SimulationView = { highlights: SimulationHighlight[]; others: FormDataEntry[] };

const KNOWN = new Set(["desiredVehicleValueCents", "hasDownPayment", "downPaymentCents", "hasTradeIn", "tradeInVehicle", "tradeInYear"]);

function present(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

export function buildSimulationView(formData: unknown, formSchema: unknown): SimulationView {
  const data = formData && typeof formData === "object" && !Array.isArray(formData) ? (formData as Record<string, unknown>) : {};
  const highlights: SimulationHighlight[] = [];

  if (present(data.desiredVehicleValueCents)) {
    highlights.push({ key: "desired", label: "Valor desejado", value: formatFormValue(data.desiredVehicleValueCents, "money"), positive: true });
  }

  if (typeof data.hasDownPayment === "boolean" || present(data.downPaymentCents)) {
    const has = data.hasDownPayment !== false;
    highlights.push({
      key: "downPayment",
      label: "Entrada",
      value: !has ? "Sem entrada" : present(data.downPaymentCents) ? formatFormValue(data.downPaymentCents, "money") : "Sim",
      positive: has,
    });
  }

  if (typeof data.hasTradeIn === "boolean" || present(data.tradeInVehicle)) {
    const has = data.hasTradeIn !== false;
    const vehicle = present(data.tradeInVehicle) ? formatFormValue(data.tradeInVehicle, "text") : null;
    const year = present(data.tradeInYear) ? formatFormValue(data.tradeInYear, "number") : null;
    highlights.push({
      key: "tradeIn",
      label: "Veículo na troca",
      value: !has ? "Sem troca" : (vehicle ?? year ?? "Sim"),
      detail: has && vehicle && year ? `Ano ${year}` : undefined,
      positive: has,
    });
  }

  const others = formatFormData(data, formSchema).filter((entry) => !KNOWN.has(entry.key));
  return { highlights, others };
}
