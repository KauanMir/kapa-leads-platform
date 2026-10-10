import { describe, expect, it } from "vitest";

import { generateCampaignKey } from "@/lib/admin/config";
import { campaignInputSchema, createUserSchema, parseStrictOrigin, storeInputSchema } from "@/lib/admin/schemas";

const STORE_ID = "3f0c9a52-6b0e-4c1e-9d0a-2a8f5c1d7e44";

function campaign(overrides: Record<string, unknown> = {}) {
  return {
    storeId: STORE_ID,
    name: "Duelo",
    slug: "duelo",
    consentVersion: "2026-10-v1",
    allowedOrigins: "",
    formSchema: "",
    isActive: "on",
    ...overrides,
  };
}

describe("origens permitidas", () => {
  it("aceita somente protocolo://host[:porta]", () => {
    expect(parseStrictOrigin("https://www.Exemplo.com.br")).toBe("https://www.exemplo.com.br");
    expect(parseStrictOrigin("https://exemplo.com.br/")).toBe("https://exemplo.com.br");
    expect(parseStrictOrigin("http://localhost:5173")).toBe("http://localhost:5173");
    expect(parseStrictOrigin("https://exemplo.com.br/lp")).toBeNull();
    expect(parseStrictOrigin("https://exemplo.com.br?x=1")).toBeNull();
    expect(parseStrictOrigin("ftp://exemplo.com.br")).toBeNull();
    expect(parseStrictOrigin("exemplo.com.br")).toBeNull();
  });

  it("normaliza a lista (uma por linha, sem duplicatas)", () => {
    const result = campaignInputSchema.parse(campaign({ allowedOrigins: "https://a.com.br\nhttps://A.com.br/\n\nhttps://www.a.com.br" }));
    expect(result.allowedOrigins).toEqual(["https://a.com.br", "https://www.a.com.br"]);
  });

  it("rejeita origem com caminho", () => {
    expect(campaignInputSchema.safeParse(campaign({ allowedOrigins: "https://a.com.br/duelo" })).success).toBe(false);
  });
});

describe("form_schema", () => {
  it("vazio vira {}; JSON válido é aceito", () => {
    expect(campaignInputSchema.parse(campaign()).formSchema).toEqual({});
    const schema = '{"downPaymentCents":{"label":"Valor da entrada","format":"money"}}';
    expect(campaignInputSchema.parse(campaign({ formSchema: schema })).formSchema).toEqual({
      downPaymentCents: { label: "Valor da entrada", format: "money" },
    });
  });

  it("rejeita JSON inválido ou formato desconhecido", () => {
    expect(campaignInputSchema.safeParse(campaign({ formSchema: "{nao json" })).success).toBe(false);
    expect(campaignInputSchema.safeParse(campaign({ formSchema: '{"a":{"label":"A","format":"html"}}' })).success).toBe(false);
    expect(campaignInputSchema.safeParse(campaign({ formSchema: "[1,2]" })).success).toBe(false);
  });
});

describe("outros formulários", () => {
  it("checkbox ativo", () => {
    expect(campaignInputSchema.parse(campaign({ isActive: null })).isActive).toBe(false);
    expect(campaignInputSchema.parse(campaign({ isActive: "on" })).isActive).toBe(true);
  });

  it("slug de loja e logo https", () => {
    expect(storeInputSchema.safeParse({ name: "Loja", slug: "Minha Loja", logoUrl: "" }).success).toBe(false);
    expect(storeInputSchema.parse({ name: "Loja", slug: "minha-loja", logoUrl: "" }).logoUrl).toBeNull();
    expect(storeInputSchema.safeParse({ name: "Loja", slug: "minha-loja", logoUrl: "http://x.com/a.png" }).success).toBe(false);
  });

  it("usuário: senha mínima e papel válido", () => {
    const base = { fullName: "Ana", email: "ANA@Example.com", password: "senha-bem-longa", storeId: "", role: "STORE_USER" };
    expect(createUserSchema.parse(base)).toMatchObject({ email: "ana@example.com", storeId: null });
    expect(createUserSchema.safeParse({ ...base, password: "curta" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, role: "SUPER_ADMIN" }).success).toBe(false);
  });

  it("chave de campanha no mesmo formato do banco", () => {
    const keys = new Set(Array.from({ length: 50 }, generateCampaignKey));
    expect(keys.size).toBe(50);
    for (const key of keys) expect(key).toMatch(/^camp_pk_[a-z0-9]{32}$/);
  });
});
