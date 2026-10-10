/**
 * Schema (Zod) do payload de POST /api/public/leads.
 *
 * A API é genérica: não conhece os campos específicos de cada LP. Campos
 * próprios da campanha vão em `formData` (objeto plano, valores simples).
 */
import { z } from "zod";

import { MAX_LEAD_AGE, MIN_LEAD_AGE, ageOn, isValidIsoDate, todayInSaoPaulo } from "@/lib/validation/birth-date";
import { isValidCpf, normalizeCpf } from "@/lib/validation/cpf";
import { normalizeBrazilianPhone } from "@/lib/validation/phone";

export const CAMPAIGN_KEY_PATTERN = /^camp_pk_[a-z0-9]{32}$/;
export const CONSENT_VERSION_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;

export const MAX_FORM_DATA_KEYS = 50;
export const MAX_FORM_DATA_STRING_LENGTH = 1000;
const FORM_DATA_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

const MAX_UTM_LENGTH = 255;
const MAX_URL_LENGTH = 2048;

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/** Troca caracteres de controle por espaço, colapsa espaços e apara. */
function cleanText(value: string): string {
  return value.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------
// lead
// ---------------------------------------------------------------------

const nameSchema = z.string().max(300).transform(cleanText).pipe(z.string().min(2).max(150));

const cpfSchema = z
  .string()
  .max(20)
  .transform((value, ctx) => {
    const cpf = normalizeCpf(value);
    if (!cpf || !isValidCpf(cpf)) {
      ctx.addIssue({ code: "custom", message: "invalid cpf" });
      return z.NEVER;
    }
    return cpf;
  });

const phoneSchema = z
  .string()
  .max(30)
  .transform((value, ctx) => {
    const phone = normalizeBrazilianPhone(value);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "invalid phone" });
      return z.NEVER;
    }
    return phone;
  });

const emailSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().toLowerCase().max(254).pipe(z.email()).nullish(),
).transform((value) => value ?? null);

function birthDateSchema(now: Date) {
  return z
    .string()
    .trim()
    .refine(isValidIsoDate, "invalid date (expected YYYY-MM-DD)")
    .refine((value) => {
      const age = ageOn(value, todayInSaoPaulo(now));
      return age >= MIN_LEAD_AGE && age <= MAX_LEAD_AGE;
    }, `age must be between ${MIN_LEAD_AGE} and ${MAX_LEAD_AGE}`);
}

// ---------------------------------------------------------------------
// formData: objeto plano; valores string | number | boolean | null.
// Chaves terminadas em "Cents" (valores monetários) devem ser inteiros.
// ---------------------------------------------------------------------

const formDataValueSchema = z.union([
  z.string().max(MAX_FORM_DATA_STRING_LENGTH),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const formDataSchema = z
  .record(z.string().regex(FORM_DATA_KEY_PATTERN), formDataValueSchema)
  .refine((data) => Object.keys(data).length <= MAX_FORM_DATA_KEYS, `at most ${MAX_FORM_DATA_KEYS} keys`)
  .refine(
    (data) =>
      Object.entries(data).every(
        ([key, value]) => !key.endsWith("Cents") || (typeof value === "number" && Number.isSafeInteger(value)) || value === null,
      ),
    "monetary values (*Cents) must be integers",
  );

// ---------------------------------------------------------------------
// tracking: nunca rejeita o lead; valores inválidos viram null.
// ---------------------------------------------------------------------

function trackingText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return cleanText(value).slice(0, MAX_UTM_LENGTH) || null;
}

function trackingUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  try {
    const { protocol } = new URL(url);
    if (protocol !== "http:" && protocol !== "https:") return null;
  } catch {
    return null;
  }
  return url.slice(0, MAX_URL_LENGTH);
}

export type LeadTracking = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  pageUrl: string | null;
  referrer: string | null;
};

// .optional() é necessário: no Zod 4 uma chave ausente só chega ao transform se o schema for opcional.
const trackingSchema = z.unknown().optional().transform((value): LeadTracking => {
  const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    utmSource: trackingText(input.utmSource),
    utmMedium: trackingText(input.utmMedium),
    utmCampaign: trackingText(input.utmCampaign),
    utmContent: trackingText(input.utmContent),
    utmTerm: trackingText(input.utmTerm),
    pageUrl: trackingUrl(input.pageUrl),
    referrer: trackingUrl(input.referrer),
  };
});

// ---------------------------------------------------------------------
// Payload completo
// ---------------------------------------------------------------------

export const campaignKeySchema = z.string().regex(CAMPAIGN_KEY_PATTERN);

export function buildPublicLeadSchema(now: Date) {
  return z.object({
    campaignKey: campaignKeySchema,
    clientSubmissionId: z.uuid(),
    lead: z.object({
      name: nameSchema,
      cpf: cpfSchema,
      birthDate: birthDateSchema(now),
      phone: phoneSchema,
      email: emailSchema,
    }),
    formData: formDataSchema.nullish().transform((value) => value ?? {}),
    tracking: trackingSchema,
    consent: z.object({
      accepted: z.literal(true),
      version: z.string().regex(CONSENT_VERSION_PATTERN),
    }),
    // Honeypot: tratado antes da validação completa (ver handler).
    website: z.string().max(1000).nullish(),
  });
}

export type PublicLeadPayload = z.infer<ReturnType<typeof buildPublicLeadSchema>>;
