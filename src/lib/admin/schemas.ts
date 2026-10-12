/**
 * Validação (Zod) dos formulários de configuração do SUPER_ADMIN.
 * Tudo que vem do navegador é revalidado no servidor.
 */
import { z } from "zod";

import { formSchemaSchema } from "@/lib/format/form-data";
import { CONSENT_VERSION_PATTERN } from "@/lib/leads/public-lead-schema";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Mínimo de 2 caracteres")
  .max(64, "Máximo de 64 caracteres")
  .regex(SLUG_PATTERN, "Use apenas letras minúsculas, números e hífens (ex.: minha-loja)");

const name = z.string().trim().min(1, "Obrigatório").max(150, "Máximo de 150 caracteres");

const checkbox = z.preprocess((value) => value === "on" || value === "true" || value === true, z.boolean());

export const storeInputSchema = z.object({
  name,
  slug,
  logoUrl: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(2048).regex(/^https:\/\//, "Use uma URL https://").nullable(),
  ),
});

/**
 * Aceita somente https://host[:porta] (sem caminho, query, credenciais nem
 * curinga). http só para localhost/127.0.0.1 (testes locais).
 */
export function parseStrictOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    if (url.hostname.includes("*")) return null;
    if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Uma origem por linha → lista normalizada. */
const allowedOrigins = z.string().transform((value, ctx) => {
  const lines = value
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter(Boolean);
  const origins: string[] = [];
  for (const line of lines) {
    const origin = parseStrictOrigin(line);
    if (!origin) {
      ctx.addIssue({ code: "custom", message: `Origem inválida: "${line.slice(0, 80)}". Use https://dominio.com.br, sem caminho e sem *.` });
      return z.NEVER;
    }
    if (!origins.includes(origin)) origins.push(origin);
  }
  if (origins.length > 20) {
    ctx.addIssue({ code: "custom", message: "Máximo de 20 origens" });
    return z.NEVER;
  }
  return origins;
});

const formSchemaJson = z.string().transform((value, ctx) => {
  const text = value.trim() || "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    ctx.addIssue({ code: "custom", message: "JSON inválido" });
    return z.NEVER;
  }
  const result = formSchemaSchema.safeParse(parsed);
  if (!result.success) {
    ctx.addIssue({
      code: "custom",
      message: 'Formato esperado: { "campo": { "label": "Rótulo", "format": "text|number|money|boolean|date" } }',
    });
    return z.NEVER;
  }
  if (JSON.stringify(result.data).length > 60_000) {
    ctx.addIssue({ code: "custom", message: "form_schema muito grande" });
    return z.NEVER;
  }
  return result.data;
});

export const campaignInputSchema = z.object({
  storeId: z.uuid("Selecione a loja"),
  name,
  slug,
  consentVersion: z
    .string()
    .trim()
    .regex(CONSENT_VERSION_PATTERN, "Use letras, números, ponto, hífen ou _ (ex.: 2026-10-v1)"),
  allowedOrigins,
  formSchema: formSchemaJson,
  isActive: checkbox,
});

export const STORE_ROLES = ["STORE_ADMIN", "STORE_USER"] as const;

export const createUserSchema = z.object({
  fullName: name,
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("E-mail inválido")),
  password: z.string().min(10, "Mínimo de 10 caracteres").max(72, "Máximo de 72 caracteres"),
  storeId: z.preprocess((value) => (value === "" ? null : value), z.uuid().nullable()),
  role: z.enum(STORE_ROLES),
});

export const membershipSchema = z.object({
  userId: z.uuid(),
  storeId: z.uuid("Selecione a loja"),
  role: z.enum(STORE_ROLES),
});

export const changePasswordSchema = z
  .object({
    password: z.string().min(10, "Mínimo de 10 caracteres").max(72, "Máximo de 72 caracteres"),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, { message: "As senhas não conferem", path: ["confirm"] });

/** Primeira mensagem de erro de cada campo. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}
