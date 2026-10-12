import { createPublicLeadsHandler, type PublicLeadsLogEntry } from "@/lib/leads/public-leads-handler";
import { createSupabasePublicLeadsRepository } from "@/lib/leads/public-leads-repository";
import { FixedWindowRateLimiter, readRateLimitConfig } from "@/lib/leads/rate-limit";

/**
 * POST /api/public/leads — recebe leads das Landing Pages.
 * Contrato e exemplos: docs/integracao-landing-page.md
 */

/**
 * Origens extras para testes locais (ex.: http://localhost:5173), separadas
 * por vírgula. IGNORADA em produção (NODE_ENV=production).
 */
function readDevOrigins(): string[] {
  if (process.env.NODE_ENV === "production") return [];
  return (process.env.PUBLIC_LEADS_DEV_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** Limite por IP, em memória (ver PUBLIC_LEADS_RATE_LIMIT_* no .env.example). */
function createRateLimiter() {
  const { limit, windowMs, warnings } = readRateLimitConfig(process.env);
  for (const warning of warnings) console.warn(JSON.stringify({ event: "public_leads_config", warning }));
  return new FixedWindowRateLimiter({ limit, windowMs });
}

function log(entry: PublicLeadsLogEntry) {
  const line = JSON.stringify({ event: "public_leads", ...entry });
  if (entry.status >= 500) console.error(line);
  else console.info(line);
}

const handler = createPublicLeadsHandler({
  ...createSupabasePublicLeadsRepository(),
  devOrigins: readDevOrigins(),
  rateLimiter: createRateLimiter(),
  now: () => new Date(),
  newRequestId: () => crypto.randomUUID(),
  newFakeLeadId: () => crypto.randomUUID(),
  log,
});

export const POST = handler.POST;
export const OPTIONS = handler.OPTIONS;
