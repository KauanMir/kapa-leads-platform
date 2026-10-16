import { describe, expect, it } from "vitest";

import { buildPresentedSimulation, buildSimulationView } from "@/lib/format/simulation";

const plain = (value: string) => value.replace(/ /g, " ");

describe("buildSimulationView", () => {
  it("destaca valor desejado, entrada e troca (Duelo)", () => {
    const view = buildSimulationView(
      { hasTradeIn: true, tradeInVehicle: "Onix LT", tradeInYear: 2021, hasDownPayment: true, downPaymentCents: 1_500_000, desiredVehicleValueCents: 8_000_000 },
      {},
    );
    expect(view.highlights.map((h) => [h.label, plain(h.value), h.detail ?? null, h.positive])).toEqual([
      ["Valor desejado", "R$ 80.000,00", null, true],
      ["Entrada", "R$ 15.000,00", null, true],
      ["Veículo na troca", "Onix LT", "Ano 2021", true],
    ]);
    expect(view.others).toEqual([]);
  });

  it("respostas Não ficam como 'Sem entrada' / 'Sem troca'", () => {
    const view = buildSimulationView({ hasTradeIn: false, hasDownPayment: false, desiredVehicleValueCents: 5_000_000 }, {});
    expect(view.highlights.map((h) => [h.label, plain(h.value), h.positive])).toEqual([
      ["Valor desejado", "R$ 50.000,00", true],
      ["Entrada", "Sem entrada", false],
      ["Veículo na troca", "Sem troca", false],
    ]);
  });

  it("outras campanhas: campos extras com os rótulos do form_schema; sem campos do Duelo, sem destaques", () => {
    const view = buildSimulationView({ modelo: "HB20", parcelas: 48 }, { modelo: { label: "Modelo de interesse" }, parcelas: { label: "Parcelas", format: "number" } });
    expect(view.highlights).toEqual([]);
    expect(view.others.map((e) => `${e.label}: ${e.value}`)).toEqual(["Modelo de interesse: HB20", "Parcelas: 48"]);
  });

  it("dados inválidos não quebram a tela", () => {
    expect(buildSimulationView(null, null)).toEqual({ highlights: [], others: [] });
    expect(buildSimulationView(["x"], {})).toEqual({ highlights: [], others: [] });
  });
});

/** form_data como a LP Duelo envia: R$ 70.000, entrada R$ 20.000, taxa 1,9% a.m. */
const DUELO_WITH_SNAPSHOT = {
  hasTradeIn: false,
  hasDownPayment: true,
  downPaymentCents: 2_000_000,
  desiredVehicleValueCents: 7_000_000,
  simulationFinancedAmountCents: 5_000_000,
  simulationMonthlyRateBps: 190,
  simulation36Cents: 193_028,
  simulation48Cents: 159_710,
  simulation60Cents: 140_378,
  simulationSelectedTerm: 48,
};

/** Cópia sem as chaves indicadas (simula snapshot incompleto). */
function without(data: Record<string, unknown>, ...keys: string[]) {
  return Object.fromEntries(Object.entries(data).filter(([key]) => !keys.includes(key)));
}

describe("buildPresentedSimulation (simulação apresentada ao cliente)", () => {
  it("mostra os valores salvos: moeda, taxa e prazo registrado", () => {
    const sim = buildPresentedSimulation(DUELO_WITH_SNAPSHOT);
    expect(sim).not.toBeNull();
    expect(plain(sim!.financed)).toBe("R$ 50.000,00");
    expect(sim!.rate).toBe("1,9% a.m.");
    expect(sim!.options.map((o) => [o.label, plain(o.value), o.selected])).toEqual([
      ["36x", "R$ 1.930,28", false],
      ["48x", "R$ 1.597,10", true],
      ["60x", "R$ 1.403,78", false],
    ]);
  });

  it("não recalcula: usa exatamente o que foi salvo, mesmo com outra taxa", () => {
    // Taxa futura diferente (2,35% a.m.) e parcelas que não batem com nenhuma fórmula: exibidas como vieram.
    const sim = buildPresentedSimulation({ ...DUELO_WITH_SNAPSHOT, simulationMonthlyRateBps: 235, simulation48Cents: 123_456 });
    expect(sim!.rate).toBe("2,35% a.m.");
    expect(plain(sim!.options[1].value)).toBe("R$ 1.234,56");
    expect(buildPresentedSimulation({ ...DUELO_WITH_SNAPSHOT, simulationMonthlyRateBps: 200 })!.rate).toBe("2% a.m.");
  });

  it("lead antigo (sem simulation*) ou snapshot incompleto/inválido: sem bloco", () => {
    expect(buildPresentedSimulation({ hasTradeIn: false, hasDownPayment: true, downPaymentCents: 2_000_000, desiredVehicleValueCents: 7_000_000 })).toBeNull();
    expect(buildPresentedSimulation(without(DUELO_WITH_SNAPSHOT, "simulationFinancedAmountCents"))).toBeNull();
    expect(buildPresentedSimulation(without(DUELO_WITH_SNAPSHOT, "simulationMonthlyRateBps"))).toBeNull();
    expect(buildPresentedSimulation(without(DUELO_WITH_SNAPSHOT, "simulation36Cents", "simulation48Cents", "simulation60Cents"))).toBeNull();
    expect(buildPresentedSimulation({ ...DUELO_WITH_SNAPSHOT, simulationFinancedAmountCents: "5000000" })).toBeNull();
    expect(buildPresentedSimulation({ ...DUELO_WITH_SNAPSHOT, simulationFinancedAmountCents: -1 })).toBeNull();
    expect(buildPresentedSimulation(null)).toBeNull();
    expect(buildPresentedSimulation(["x"])).toBeNull();
  });

  it("sem prazo registrado: mostra as parcelas sem destaque", () => {
    expect(buildPresentedSimulation(without(DUELO_WITH_SNAPSHOT, "simulationSelectedTerm"))!.options.every((o) => !o.selected)).toBe(true);
  });

  it("chaves simulation* nunca aparecem como campos extras (nome técnico) na tela", () => {
    const view = buildSimulationView(DUELO_WITH_SNAPSHOT, {});
    expect(view.others).toEqual([]);
    expect(JSON.stringify(view)).not.toMatch(/simulation/i);
    expect(view.highlights.map((h) => h.key)).toEqual(["desired", "downPayment", "tradeIn"]);
  });
});
