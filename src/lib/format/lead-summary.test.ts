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

describe("COPIAR RESUMO", () => {
  it("usa os rótulos do form_schema e formata dinheiro", () => {
    const text = buildLeadSummary({
      fullName: " João Silva ",
      phone: "61999999999",
      campaignName: "Duelo de Aprovações",
      formData: {
        hasTradeIn: true,
        tradeInVehicle: "Onix",
        tradeInYear: 2021,
        hasDownPayment: true,
        downPaymentCents: 1_500_000,
        desiredVehicleValueCents: 8_000_000,
      },
      formSchema: DUELO_SCHEMA,
    });
    // Intl usa espaço não separável depois de "R$".
    expect(text.replace(/\u00a0/g, " ")).toBe(
      [
        "Lead: João Silva",
        "Telefone: (61) 99999-9999",
        "Campanha: Duelo de Aprovações",
        "Possui veículo na troca: Sim",
        "Veículo na troca: Onix",
        "Ano do veículo na troca: 2021",
        "Possui entrada: Sim",
        "Valor da entrada: R$ 15.000,00",
        "Valor aproximado do veículo desejado: R$ 80.000,00",
      ].join("\n").replace(/ /g, " "),
    );
  });

  it("funciona sem form_schema (outra campanha) e omite campos vazios", () => {
    const text = buildLeadSummary({
      fullName: "Ana",
      phone: "1134567890",
      campaignName: null,
      formData: { modeloDesejado: "Corolla", entradaCents: 500_000, observacao: "" },
      formSchema: null,
    });
    expect(text).toContain("Telefone: (11) 3456-7890");
    expect(text).toContain("Modelo desejado: Corolla");
    expect(text).toMatch(/Entrada: R\$\s5\.000,00/);
    expect(text).not.toContain("Campanha");
    expect(text).not.toContain("Observacao");
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
    expect(text).not.toContain(cpf);
    expect(text).not.toContain(formatCpf(cpf));
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
