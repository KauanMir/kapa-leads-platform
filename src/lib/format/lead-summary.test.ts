import { describe, expect, it } from "vitest";

import { buildLeadSummary } from "@/lib/format/lead-summary";
import { formatCpf } from "@/lib/validation/cpf";

const DUELO_SCHEMA = {
  hasTradeIn: { label: "Possui veículo na troca", format: "boolean", order: 1 },
  tradeInVehicle: { label: "Veículo na troca", format: "text", order: 2 },
  tradeInYear: { label: "Ano do veículo na troca", format: "number", order: 3 },
  hasDownPayment: { label: "Possui entrada", format: "boolean", order: 4 },
  downPaymentCents: { label: "Valor da entrada", format: "money", order: 5 },
  desiredVehicleValueCents: { label: "Valor aproximado do veículo desejado", format: "money", order: 6 },
};

// Intl usa espaço não separável depois de "R$".
const plain = (text: string) => text.replace(/ /g, " ");

const base = { fullName: " João Silva ", phone: "61999999999", campaignName: "Duelo de Aprovações", formSchema: DUELO_SCHEMA };

describe("COPIAR RESUMO", () => {
  it("inclui a simulação apresentada ao cliente (curta, sem CPF, ids ou nomes técnicos)", () => {
    const text = buildLeadSummary({
      ...base,
      formData: {
        hasTradeIn: true,
        tradeInVehicle: "Onix",
        tradeInYear: 2021,
        hasDownPayment: true,
        downPaymentCents: 2_000_000,
        desiredVehicleValueCents: 7_000_000,
        simulationFinancedAmountCents: 5_000_000,
        simulationMonthlyRateBps: 190,
        simulation36Cents: 193_028,
        simulation48Cents: 159_710,
        simulation60Cents: 140_378,
        simulationSelectedTerm: 48,
        cpf: "52998224725",
        leadId: "abc",
      },
    });
    expect(plain(text)).toBe(
      [
        "Lead: João Silva",
        "Telefone: (61) 99999-9999",
        "Campanha: Duelo de Aprovações",
        "",
        "Troca: Sim",
        "Veículo na troca: Onix",
        "Ano do veículo: 2021",
        "",
        "Entrada: Sim",
        "Valor da entrada: R$ 20.000,00",
        "",
        "Valor desejado: R$ 70.000,00",
        "",
        "Valor estimado a financiar: R$ 50.000,00",
        "36x: R$ 1.930,28",
        "48x: R$ 1.597,10",
        "60x: R$ 1.403,78",
      ].join("\n"),
    );
    expect(text).not.toMatch(/simulation|Bps|Selected|529|abc/i);
  });

  it("lead antigo sem simulação: resumo igual ao de antes, sem linhas de parcelas", () => {
    const text = buildLeadSummary({ ...base, formData: { hasTradeIn: false, hasDownPayment: false, desiredVehicleValueCents: 7_000_000 } });
    expect(text).not.toMatch(/financiar|\d+x:/);
    expect(text.split("\n").slice(-1)[0]).toMatch(/^Valor desejado: /);
  });

  it("formato curto, em blocos, com R$ formatado", () => {
    const text = buildLeadSummary({
      ...base,
      formData: {
        hasTradeIn: true,
        tradeInVehicle: "Onix",
        tradeInYear: 2021,
        hasDownPayment: true,
        downPaymentCents: 1_500_000,
        desiredVehicleValueCents: 8_000_000,
      },
    });
    expect(plain(text)).toBe(
      [
        "Lead: João Silva",
        "Telefone: (61) 99999-9999",
        "Campanha: Duelo de Aprovações",
        "",
        "Troca: Sim",
        "Veículo na troca: Onix",
        "Ano do veículo: 2021",
        "",
        "Entrada: Sim",
        "Valor da entrada: R$ 15.000,00",
        "",
        "Valor desejado: R$ 80.000,00",
      ].join("\n"),
    );
  });

  it("sem troca/entrada: só Não, sem detalhes e sem linhas vazias", () => {
    const text = buildLeadSummary({
      ...base,
      formData: { hasTradeIn: false, tradeInVehicle: "sobra", hasDownPayment: false, downPaymentCents: 0 },
    });
    expect(text).toBe(["Lead: João Silva", "Telefone: (61) 99999-9999", "Campanha: Duelo de Aprovações", "", "Troca: Não", "", "Entrada: Não"].join("\n"));
  });

  it("bug do autopreenchimento: data no campo do veículo não vai para o resumo", () => {
    const text = buildLeadSummary({
      ...base,
      formData: { hasTradeIn: true, tradeInVehicle: "01/01/1990", tradeInYear: 2021, hasDownPayment: false },
    });
    expect(text).toContain("Troca: Sim\nAno do veículo: 2021");
    expect(text).not.toContain("01/01/1990");
    expect(text).not.toContain("Veículo na troca");
  });

  it("campos faltando: omite a linha", () => {
    const text = buildLeadSummary({ ...base, formData: { hasTradeIn: true, desiredVehicleValueCents: null } });
    expect(text.split("\n").slice(-1)[0]).toBe("Troca: Sim");
    expect(text).not.toMatch(/\n\n$|: —|: $/m);
  });

  it("outra campanha, sem form_schema: campos extras com nomes legíveis; sem campanha, sem linha", () => {
    const text = buildLeadSummary({
      fullName: "Ana",
      phone: "1134567890",
      campaignName: null,
      formData: { modeloDesejado: "Corolla", entradaCents: 500_000, observacao: "" },
      formSchema: null,
    });
    expect(plain(text)).toBe(["Lead: Ana", "Telefone: (11) 3456-7890", "", "Entrada: R$ 5.000,00", "Modelo desejado: Corolla"].join("\n"));
  });

  it("nunca inclui CPF, nascimento, UTMs, ids ou URLs — nem se vierem no form_data", () => {
    const cpf = "52998224725";
    const text = buildLeadSummary({
      fullName: "Carlos",
      phone: "11987654321",
      campaignName: "Teste",
      formData: {
        cpf,
        cpfConjuge: formatCpf(cpf),
        birthDate: "1990-05-20",
        dataNascimento: "1990-05-20",
        utmSource: "meta",
        leadId: "123",
        site: "https://exemplo.com/x",
        cor: "Prata",
      },
      formSchema: {},
    });
    expect(text.includes(cpf)).toBe(false);
    expect(text.includes(formatCpf(cpf))).toBe(false);
    expect(text).not.toMatch(/1990|meta|https?:|123/);
    expect(text).toContain("Cor: Prata");
  });
});

describe("formatCpf", () => {
  it("formata 11 dígitos", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    expect(formatCpf("123")).toBe("123");
  });
});
