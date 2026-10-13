import { describe, expect, it } from "vitest";

import { buildSimulationView } from "@/lib/format/simulation";

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
