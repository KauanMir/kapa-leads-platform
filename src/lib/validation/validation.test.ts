import { describe, expect, it } from "vitest";

import { ageOn, isValidIsoDate, todayInSaoPaulo } from "@/lib/validation/birth-date";
import { isValidCpf, normalizeCpf } from "@/lib/validation/cpf";
import { normalizeBrazilianPhone } from "@/lib/validation/phone";

describe("CPF", () => {
  it("normaliza com ou sem máscara", () => {
    expect(normalizeCpf("529.982.247-25")).toBe("52998224725");
    expect(normalizeCpf("52998224725")).toBe("52998224725");
    expect(normalizeCpf(" 529 982 247 25 ")).toBe("52998224725");
  });

  it("rejeita formatos inválidos", () => {
    expect(normalizeCpf("529.982.247-2")).toBeNull();
    expect(normalizeCpf("abc.982.247-25")).toBeNull();
    expect(normalizeCpf("")).toBeNull();
  });

  it("aceita dígitos verificadores corretos", () => {
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("11144477735")).toBe(true);
  });

  it("rejeita dígitos verificadores errados", () => {
    expect(isValidCpf("52998224724")).toBe(false);
    expect(isValidCpf("12345678900")).toBe(false);
  });

  it("rejeita sequências repetidas", () => {
    for (const d of "0123456789") expect(isValidCpf(d.repeat(11))).toBe(false);
  });
});

describe("telefone", () => {
  it("aceita celular com 9 após o DDD", () => {
    expect(normalizeBrazilianPhone("(11) 98765-4321")).toBe("11987654321");
    expect(normalizeBrazilianPhone("+55 21 99876-5432")).toBe("21998765432");
    expect(normalizeBrazilianPhone("5551987654321")).toBe("51987654321");
  });

  it("aceita fixo com 10 dígitos", () => {
    expect(normalizeBrazilianPhone("(11) 3456-7890")).toBe("1134567890");
  });

  it("rejeita celular de 11 dígitos sem o 9", () => {
    expect(normalizeBrazilianPhone("11887654321")).toBeNull();
  });

  it("rejeita fixo começando com 6-9", () => {
    expect(normalizeBrazilianPhone("1198765432")).toBeNull();
  });

  it("rejeita DDD inexistente", () => {
    expect(normalizeBrazilianPhone("20987654321")).toBeNull();
    expect(normalizeBrazilianPhone("23987654321")).toBeNull();
    expect(normalizeBrazilianPhone("00987654321")).toBeNull();
  });

  it("rejeita tamanhos e caracteres inválidos", () => {
    expect(normalizeBrazilianPhone("987654321")).toBeNull();
    expect(normalizeBrazilianPhone("119876543210")).toBeNull();
    expect(normalizeBrazilianPhone("11 9876-ABCD")).toBeNull();
  });
});

describe("data de nascimento", () => {
  it("valida datas reais de calendário", () => {
    expect(isValidIsoDate("1990-05-20")).toBe(true);
    expect(isValidIsoDate("2000-02-29")).toBe(true);
    expect(isValidIsoDate("2001-02-29")).toBe(false);
    expect(isValidIsoDate("1990-13-01")).toBe(false);
    expect(isValidIsoDate("20/05/1990")).toBe(false);
    expect(isValidIsoDate("1990-5-20")).toBe(false);
  });

  it("calcula idade completa", () => {
    expect(ageOn("2008-10-10", "2026-10-10")).toBe(18);
    expect(ageOn("2008-10-11", "2026-10-10")).toBe(17);
    expect(ageOn("1990-05-20", "2026-10-10")).toBe(36);
  });

  it("usa a data de hoje de São Paulo", () => {
    // 02:00 UTC de 10/10 ainda é 09/10 em São Paulo (UTC-3).
    expect(todayInSaoPaulo(new Date("2026-10-10T02:00:00Z"))).toBe("2026-10-09");
    expect(todayInSaoPaulo(new Date("2026-10-10T15:00:00Z"))).toBe("2026-10-10");
  });
});
