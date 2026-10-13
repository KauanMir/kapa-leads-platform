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
