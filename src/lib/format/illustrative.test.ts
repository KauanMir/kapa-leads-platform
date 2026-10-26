import { describe, expect, it } from "vitest";

import { formatCountdown, formatIllustrativeAmount, remainingMs, toIllustrativeValue } from "@/lib/format/illustrative";

const ROW = {
  illustrative_amount_cents: 5_475_000,
  illustrative_presented_at: "2026-10-26T13:00:00.000Z",
  illustrative_expires_at: "2026-10-28T01:00:00.000Z",
};

describe("valor ilustrativo do lead", () => {
  it("usa exatamente o valor gravado", () => {
    const value = toIllustrativeValue(ROW)!;
    expect(formatIllustrativeAmount(value).replace(/\s/g, " ")).toBe("R$ 54.750,00");
    expect(value.expiresAt).toBe(ROW.illustrative_expires_at);
  });

  it("lead antigo ou de outra campanha (colunas vazias/ inválidas) → null", () => {
    expect(toIllustrativeValue({ ...ROW, illustrative_amount_cents: null })).toBeNull();
    expect(toIllustrativeValue({ ...ROW, illustrative_expires_at: null })).toBeNull();
    expect(toIllustrativeValue({ ...ROW, illustrative_amount_cents: 0 })).toBeNull();
    expect(toIllustrativeValue({ ...ROW, illustrative_presented_at: "ontem" })).toBeNull();
  });
});

describe("cronômetro de 36 horas", () => {
  const start = Date.parse(ROW.illustrative_presented_at);

  it("começa em 36:00:00 e desce com horas corridas", () => {
    expect(formatCountdown(remainingMs(ROW.illustrative_expires_at, start))).toBe("36:00:00");
    expect(formatCountdown(remainingMs(ROW.illustrative_expires_at, start + 1_000))).toBe("35:59:59");
    expect(formatCountdown(remainingMs(ROW.illustrative_expires_at, start + 1))).toBe("35:59:59");
    expect(formatCountdown(remainingMs(ROW.illustrative_expires_at, start + 26 * 3_600_000 + 61_000))).toBe("09:58:59");
  });

  it("no vencimento e depois: 00:00:00 (nunca negativo)", () => {
    const end = Date.parse(ROW.illustrative_expires_at);
    expect(remainingMs(ROW.illustrative_expires_at, end)).toBe(0);
    expect(remainingMs(ROW.illustrative_expires_at, end + 3_600_000)).toBe(0);
    expect(formatCountdown(-5_000)).toBe("00:00:00");
  });
});
