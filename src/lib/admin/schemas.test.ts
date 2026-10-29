import { describe, expect, it } from "vitest";

import { generateCampaignKey } from "@/lib/admin/config";
import { campaignInputSchema, createUserSchema, fieldErrors, lgpdLookupSchema, lgpdReleaseSchema, parseStrictOrigin, storeInputSchema } from "@/lib/admin/schemas";

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
    expect(parseStrictOrigin("http://exemplo.com.br")).toBeNull();
    expect(parseStrictOrigin("https://*.exemplo.com.br")).toBeNull();
    expect(parseStrictOrigin("*")).toBeNull();
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

  describe("novo usuário", () => {
    const base = { fullName: "Ana", email: "ANA@Example.com", password: "senha-bem-longa", storeId: STORE_ID, access: "STORE_USER", confirmGlobal: null };
    const errors = (input: Record<string, unknown>) => {
      const result = createUserSchema.safeParse(input);
      return result.success ? {} : fieldErrors(result.error);
    };

    it("Gerente e SDR: loja obrigatória; e-mail normalizado", () => {
      expect(createUserSchema.parse(base)).toEqual({ fullName: "Ana", email: "ana@example.com", password: "senha-bem-longa", storeId: STORE_ID, access: "STORE_USER" });
      expect(createUserSchema.parse({ ...base, access: "STORE_ADMIN" }).access).toBe("STORE_ADMIN");
      expect(errors({ ...base, storeId: "" })).toEqual({ storeId: "Selecione a loja" });
      expect(errors({ ...base, access: "STORE_ADMIN", storeId: "" })).toEqual({ storeId: "Selecione a loja" });
    });

    it("senha com os requisitos atuais (10 a 72 caracteres)", () => {
      expect(errors({ ...base, password: "curta" })).toHaveProperty("password");
      expect(errors({ ...base, password: "x".repeat(73) })).toHaveProperty("password");
    });

    it("Administrador Geral: sem loja e com confirmação explícita do acesso global", () => {
      const global = { ...base, access: "SUPER_ADMIN", storeId: "", confirmGlobal: "on" };
      expect(createUserSchema.parse(global)).toMatchObject({ access: "SUPER_ADMIN", storeId: null });
      expect(errors({ ...global, confirmGlobal: null })).toEqual({ confirmGlobal: "Confirme o acesso global" });
      // Loja enviada junto (requisição manipulada) é descartada: o acesso é global.
      expect(createUserSchema.parse({ ...global, storeId: STORE_ID }).storeId).toBeNull();
    });

    it("tipo de acesso desconhecido ou ausente é recusado", () => {
      expect(errors({ ...base, access: "OWNER" })).toHaveProperty("access");
      expect(errors({ ...base, access: null })).toHaveProperty("access");
      // O nome antigo do campo não cria acesso.
      expect(errors({ ...base, access: undefined, role: "SUPER_ADMIN" })).toHaveProperty("access");
    });
  });

  it("chave de campanha no mesmo formato do banco", () => {
    const keys = new Set(Array.from({ length: 50 }, generateCampaignKey));
    expect(keys.size).toBe(50);
    for (const key of keys) expect(key).toMatch(/^camp_pk_[a-z0-9]{32}$/);
  });
});

describe("pedidos LGPD (bloqueio de CPF)", () => {
  const release = (overrides: Record<string, unknown> = {}) => ({
    cpf: "529.982.247-25",
    storeId: STORE_ID,
    reason: "ELIMINACAO",
    identityVerified: "on",
    confirmed: "on",
    ...overrides,
  });

  it("normaliza o CPF no servidor (com ou sem máscara) e valida os dígitos", () => {
    expect(lgpdLookupSchema.parse({ cpf: " 529.982.247-25 " }).cpf).toBe("52998224725");
    expect(lgpdLookupSchema.parse({ cpf: "52998224725" }).cpf).toBe("52998224725");
    for (const cpf of ["52998224724", "111.111.111-11", "abc", "5299822472", ""]) {
      expect(lgpdLookupSchema.safeParse({ cpf }).success, cpf).toBe(false);
    }
  });

  it("erro de CPF nunca repete o valor digitado", () => {
    const result = lgpdLookupSchema.safeParse({ cpf: "529.982.247-24" });
    expect(result.success).toBe(false);
    if (!result.success) expect(JSON.stringify(fieldErrors(result.error))).not.toMatch(/529|982|247/);
  });

  it("eliminação exige loja, motivo da lista, identidade verificada e confirmação explícita", () => {
    expect(lgpdReleaseSchema.parse(release())).toEqual({
      cpf: "52998224725",
      storeId: STORE_ID,
      reason: "ELIMINACAO",
      identityVerified: true,
      confirmed: true,
    });
    const errors = (input: Record<string, unknown>) => {
      const result = lgpdReleaseSchema.safeParse(input);
      return result.success ? {} : fieldErrors(result.error);
    };
    expect(errors(release({ identityVerified: null }))).toHaveProperty("identityVerified");
    expect(errors(release({ confirmed: null }))).toHaveProperty("confirmed");
    expect(errors(release({ reason: "MARKETING" }))).toHaveProperty("reason");
    expect(errors(release({ storeId: "loja" }))).toHaveProperty("storeId");
    for (const reason of ["OPOSICAO", "USO_INDEVIDO_TERCEIRO"]) expect(lgpdReleaseSchema.safeParse(release({ reason })).success).toBe(true);
  });
});
