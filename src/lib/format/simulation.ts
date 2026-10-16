import { formatCents, formatFormData, formatFormValue, type FormDataEntry } from "@/lib/format/form-data";

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

  const others = formatFormData(data, formSchema).filter((entry) => !KNOWN.has(entry.key) && !isPresentedSimulationKey(entry.key));
  return { highlights, others };
}

// ---------------------------------------------------------------------
// Simulação apresentada: snapshot que a LP mostrou ao cliente, salvo em
// form_data no envio do lead (simulationFinancedAmountCents,
// simulationMonthlyRateBps, simulation{36,48,60}Cents, simulationSelectedTerm).
//
// NUNCA recalcula: se a taxa de referência da LP mudar, leads antigos continuam
// mostrando os valores originais. Lead sem o snapshot completo → null (sem bloco).
// ---------------------------------------------------------------------

/** Chaves do snapshot (nunca aparecem com nome técnico na tela nem no resumo). */
export function isPresentedSimulationKey(key: string): boolean {
  return /^simulation[A-Z0-9]/.test(key);
}

const TERM_KEY = /^simulation(\d{1,3})Cents$/;

export type PresentedSimulationOption = { term: number; label: string; cents: number; value: string; selected: boolean };

export type PresentedSimulation = {
  financedCents: number;
  financed: string;
  /** "1,9% a.m." */
  rate: string;
  options: PresentedSimulationOption[];
};

const rateFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

function positiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function buildPresentedSimulation(formData: unknown): PresentedSimulation | null {
  if (!formData || typeof formData !== "object" || Array.isArray(formData)) return null;
  const data = formData as Record<string, unknown>;

  const financedCents = data.simulationFinancedAmountCents;
  const rateBps = data.simulationMonthlyRateBps;
  if (!positiveInt(financedCents) || !positiveInt(rateBps)) return null;

  const selectedTerm = data.simulationSelectedTerm;
  const options = Object.entries(data)
    .flatMap(([key, cents]) => {
      const match = TERM_KEY.exec(key);
      if (!match || !positiveInt(cents)) return [];
      const term = Number(match[1]);
      return term > 0 ? [{ term, label: `${term}x`, cents, value: formatCents(cents), selected: term === selectedTerm }] : [];
    })
    .sort((a, b) => a.term - b.term);
  if (options.length === 0) return null;

  return {
    financedCents,
    financed: formatCents(financedCents),
    // 190 bps = 1,9% a.m.
    rate: `${rateFormatter.format(rateBps / 100)}% a.m.`,
    options,
  };
}
