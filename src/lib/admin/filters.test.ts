import { describe, expect, it } from "vitest";

import { filtersToQuery, parseUrlFilters, toLeadFilters } from "@/lib/admin/filters";
import { looksLikeCpf, parseLeadSearch } from "@/lib/admin/search";
import { resolvePeriod } from "@/lib/format/period";
import { formatPhone, telHref, whatsappGreeting, whatsappUrl } from "@/lib/format/phone";

const UUID = "3f0c9a52-6b0e-4c1e-9d0a-2a8f5c1d7e44";

describe("busca sem CPF", () => {
  it("reconhece CPF formatado ou 11 dígitos de CPF válido", () => {
    expect(looksLikeCpf("529.982.247-25")).toBe(true);
    expect(looksLikeCpf("52998224725")).toBe(true);
    // Celular válido não é tratado como CPF.
    expect(looksLikeCpf("11987654321")).toBe(false);
    expect(looksLikeCpf("Maria")).toBe(false);
  });

  it("busca por telefone (dígitos) ou nome (com curingas escapados)", () => {
    expect(parseLeadSearch("(11) 98765")).toEqual({ kind: "phone", digits: "1198765" });
    expect(parseLeadSearch("+55 11 98765-4321")).toEqual({ kind: "phone", digits: "11987654321" });
    expect(parseLeadSearch("Maria 50%_")).toEqual({ kind: "name", pattern: "%Maria 50\\%\\_%" });
    expect(parseLeadSearch("529.982.247-25")).toBeNull();
    expect(parseLeadSearch(" ")).toBeNull();
  });
});

describe("filtros da URL", () => {
  it("ignora valores inválidos e CPF", () => {
    const filters = parseUrlFilters(
      { q: "529.982.247-25", status: "HACK", campanha: "1 or 1=1", loja: UUID, periodo: "x", de: "2026-13", pagina: "-3" },
      "tudo",
    );
    expect(filters).toEqual({ q: "", status: null, campaignId: null, storeId: UUID, period: "tudo", from: "", to: "", page: 1 });
  });

  it("aceita valores válidos", () => {
    const filters = parseUrlFilters({ q: "Maria", status: "WON", campanha: UUID, periodo: "personalizado", de: "2026-10-01", ate: "2026-10-05", pagina: "2" }, "tudo");
    expect(filters).toMatchObject({ q: "Maria", status: "WON", campaignId: UUID, period: "personalizado", from: "2026-10-01", to: "2026-10-05", page: 2 });
    expect(toLeadFilters(filters, new Date("2026-10-10T15:00:00Z")).range).toEqual({
      from: "2026-10-01T00:00:00-03:00",
      to: "2026-10-06T00:00:00-03:00",
    });
  });

  it("monta a query string sem valores vazios e nunca com CPF", () => {
    expect(filtersToQuery({ q: "", status: null, period: "tudo", page: 1 }, "tudo")).toBe("");
    expect(filtersToQuery({ q: "52998224725", status: "NEW", period: "7d", page: 3 }, "tudo")).toBe("?status=NEW&periodo=7d&pagina=3");
  });
});

describe("períodos (São Paulo)", () => {
  const now = new Date("2026-10-10T02:00:00Z"); // ainda 09/10 em São Paulo
  it("hoje, 7 e 30 dias", () => {
    expect(resolvePeriod("hoje", now)).toEqual({ from: "2026-10-09T00:00:00-03:00", to: null });
    expect(resolvePeriod("7d", now)).toEqual({ from: "2026-10-03T00:00:00-03:00", to: null });
    expect(resolvePeriod("30d", now)).toEqual({ from: "2026-09-10T00:00:00-03:00", to: null });
    expect(resolvePeriod("tudo", now)).toEqual({ from: null, to: null });
  });
});

describe("telefone", () => {
  it("formata e monta links sem dados além do telefone e do nome", () => {
    expect(formatPhone("11987654321")).toBe("(11) 98765-4321");
    expect(formatPhone("1134567890")).toBe("(11) 3456-7890");
    expect(telHref("11987654321")).toBe("tel:+5511987654321");
    const message = whatsappGreeting("Maria da Silva", "Vitrine Veículos");
    expect(message).toBe(
      "Olá, Maria. Aqui é da Vitrine Veículos. Recebemos sua solicitação e estou entrando em contato para dar continuidade ao atendimento.",
    );
    expect(whatsappUrl("11987654321", message)).toBe(`https://wa.me/5511987654321?text=${encodeURIComponent(message)}`);
  });
});
