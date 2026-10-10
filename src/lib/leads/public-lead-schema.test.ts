import { describe, expect, it } from "vitest";

import { MAX_FORM_DATA_KEYS, buildPublicLeadSchema, formDataSchema } from "@/lib/leads/public-lead-schema";

const NOW = new Date("2026-10-10T15:00:00Z");
const schema = buildPublicLeadSchema(NOW);

function payload(overrides: Record<string, unknown> = {}) {
  return {
    campaignKey: `camp_pk_${"a".repeat(32)}`,
    clientSubmissionId: "3f0c9a52-6b0e-4c1e-9d0a-2a8f5c1d7e44",
    lead: {
      name: "  Maria   da Silva ",
      cpf: "529.982.247-25",
      birthDate: "1990-05-20",
      phone: "(11) 98765-4321",
      email: " Maria@Example.COM ",
    },
    consent: { accepted: true, version: "2026-10-v1" },
    ...overrides,
  };
}

function failedPaths(input: unknown): string[] {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

describe("payload", () => {
  it("normaliza o lead válido", () => {
    const result = schema.parse(payload());
    expect(result.lead).toEqual({
      name: "Maria da Silva",
      cpf: "52998224725",
      birthDate: "1990-05-20",
      phone: "11987654321",
      email: "maria@example.com",
    });
    expect(result.formData).toEqual({});
  });

  it("e-mail é opcional (vazio, null ou ausente viram null)", () => {
    for (const email of ["", null, undefined]) {
      const result = schema.parse(payload({ lead: { ...payload().lead, email } }));
      expect(result.lead.email).toBeNull();
    }
    expect(failedPaths(payload({ lead: { ...payload().lead, email: "nao-e-email" } }))).toContain("lead.email");
  });

  it("exige nome com pelo menos 2 caracteres", () => {
    expect(failedPaths(payload({ lead: { ...payload().lead, name: " a " } }))).toContain("lead.name");
  });

  it("rejeita menor de 18 e idade acima do limite", () => {
    expect(failedPaths(payload({ lead: { ...payload().lead, birthDate: "2008-10-11" } }))).toContain("lead.birthDate");
    expect(failedPaths(payload({ lead: { ...payload().lead, birthDate: "1900-01-01" } }))).toContain("lead.birthDate");
    expect(failedPaths(payload({ lead: { ...payload().lead, birthDate: "2008-10-10" } }))).toEqual([]);
  });

  it("exige consentimento aceito", () => {
    expect(failedPaths(payload({ consent: { accepted: false, version: "2026-10-v1" } }))).toContain("consent.accepted");
    expect(failedPaths(payload({ consent: undefined }))).toContain("consent");
  });

  it("exige campaignKey e clientSubmissionId válidos", () => {
    expect(failedPaths(payload({ campaignKey: "camp_pk_curta" }))).toContain("campaignKey");
    expect(failedPaths(payload({ clientSubmissionId: "123" }))).toContain("clientSubmissionId");
  });
});

describe("formData", () => {
  it("aceita objeto plano com valores simples", () => {
    const data = { downPaymentCents: 1500000, vehicle: "Onix", financing: true, notes: null, score: 7.5 };
    expect(formDataSchema.parse(data)).toEqual(data);
  });

  it("rejeita arrays e objetos aninhados", () => {
    expect(formDataSchema.safeParse(["a"]).success).toBe(false);
    expect(formDataSchema.safeParse({ list: [1, 2] }).success).toBe(false);
    expect(formDataSchema.safeParse({ nested: { a: 1 } }).success).toBe(false);
  });

  it("limita quantidade de chaves e tamanho das strings", () => {
    const many = Object.fromEntries(Array.from({ length: MAX_FORM_DATA_KEYS + 1 }, (_, i) => [`k${i}`, i]));
    expect(formDataSchema.safeParse(many).success).toBe(false);
    expect(formDataSchema.safeParse({ text: "x".repeat(1001) }).success).toBe(false);
  });

  it("rejeita chaves fora do padrão", () => {
    expect(formDataSchema.safeParse({ "chave com espaço": 1 }).success).toBe(false);
    expect(formDataSchema.safeParse({ __proto__x: 1 }).success).toBe(false);
  });

  it("valores *Cents precisam ser inteiros", () => {
    expect(formDataSchema.safeParse({ downPaymentCents: 1500.5 }).success).toBe(false);
    expect(formDataSchema.safeParse({ downPaymentCents: "1500" }).success).toBe(false);
    expect(formDataSchema.safeParse({ downPaymentCents: 150000 }).success).toBe(true);
  });

  it("formData ausente ou null vira objeto vazio", () => {
    expect(schema.parse(payload({ formData: null })).formData).toEqual({});
  });
});

describe("tracking", () => {
  it("normaliza, limita e nunca rejeita o lead", () => {
    const result = schema.parse(
      payload({
        tracking: {
          utmSource: "  instagram\n",
          utmMedium: "x".repeat(400),
          utmCampaign: 123,
          pageUrl: "https://lp.example.com/duelo?utm_source=instagram",
          referrer: "javascript:alert(1)",
        },
      }),
    );
    expect(result.tracking.utmSource).toBe("instagram");
    expect(result.tracking.utmMedium).toHaveLength(255);
    expect(result.tracking.utmCampaign).toBeNull();
    expect(result.tracking.utmTerm).toBeNull();
    expect(result.tracking.pageUrl).toBe("https://lp.example.com/duelo?utm_source=instagram");
    expect(result.tracking.referrer).toBeNull();
  });

  it("tracking ausente ou inválido vira tudo null", () => {
    for (const tracking of [undefined, null, "lixo", [1]]) {
      const result = schema.parse(payload({ tracking }));
      expect(Object.values(result.tracking).every((value) => value === null)).toBe(true);
    }
  });
});
