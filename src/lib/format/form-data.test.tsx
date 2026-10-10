import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DetailsList } from "@/components/leads/details-list";
import { formatCents, formatFormData, humanizeKey } from "@/lib/format/form-data";

// Normaliza o espaço não separável que o Intl usa em "R$ 15.000,00".
const plain = (value: string) => value.replace(/ /g, " ");

describe("formatFormData", () => {
  const formData = {
    hasTradeIn: true,
    tradeVehicle: "Onix",
    tradeYear: 2021,
    hasDownPayment: true,
    downPaymentCents: 1500000,
  };
  const formSchema = {
    hasTradeIn: { label: "Possui carro na troca", format: "boolean", order: 1 },
    tradeVehicle: { label: "Veículo na troca", format: "text", order: 2 },
    tradeYear: { label: "Ano", format: "number", order: 3 },
    hasDownPayment: { label: "Possui entrada", format: "boolean", order: 4 },
    downPaymentCents: { label: "Valor da entrada", format: "money", order: 5 },
  };

  it("usa o form_schema da campanha (rótulos, formatos e ordem)", () => {
    expect(formatFormData(formData, formSchema).map((e) => `${e.label}: ${plain(e.value)}`)).toEqual([
      "Possui carro na troca: Sim",
      "Veículo na troca: Onix",
      "Ano: 2021",
      "Possui entrada: Sim",
      "Valor da entrada: R$ 15.000,00",
    ]);
  });

  it("sem form_schema usa fallback seguro (anos sem separador, *Cents como dinheiro)", () => {
    const entries = Object.fromEntries(formatFormData(formData, null).map((e) => [e.key, plain(e.value)]));
    expect(entries).toEqual({
      hasTradeIn: "Sim",
      tradeVehicle: "Onix",
      tradeYear: "2021",
      hasDownPayment: "Sim",
      downPaymentCents: "R$ 15.000,00",
    });
  });

  it("form_schema inválido não quebra a tela", () => {
    expect(formatFormData({ a: 1 }, { a: { format: "html" } })).toEqual([{ key: "a", label: "A", value: "1" }]);
    expect(formatFormData({ a: 1 }, "lixo")).toHaveLength(1);
  });

  it("valores vazios viram travessão; form_data inválido vira lista vazia", () => {
    expect(formatFormData({ notes: null, other: "" }, null).map((e) => e.value)).toEqual(["—", "—"]);
    expect(formatFormData(["x"], null)).toEqual([]);
    expect(formatFormData(null, null)).toEqual([]);
  });

  it("helpers", () => {
    expect(humanizeKey("downPaymentCents")).toBe("Down payment");
    expect(humanizeKey("trade_year")).toBe("Trade year");
    expect(plain(formatCents(123456))).toBe("R$ 1.234,56");
  });

  it("HTML vindo do JSON é exibido como texto (escapado), nunca interpretado", () => {
    const entries = formatFormData({ vehicle: '<img src=x onerror="alert(1)"><script>alert(2)</script>' }, {
      vehicle: { label: "<b>Veículo</b>", format: "text" },
    });
    const html = renderToStaticMarkup(<DetailsList items={entries.map((e) => ({ key: e.key, label: e.label, value: e.value }))} />);

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;Veículo&lt;/b&gt;");
  });
});
