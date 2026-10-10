import { createPublicLeadsHandler, type PublicLeadsLogEntry } from "@/lib/leads/public-leads-handler";
import { createSupabasePublicLeadsRepository } from "@/lib/leads/public-leads-repository";
import { FixedWindowRateLimiter } from "@/lib/leads/rate-limit";

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

function log(entry: PublicLeadsLogEntry) {
  const line = JSON.stringify({ event: "public_leads", ...entry });
  if (entry.status >= 500) console.error(line);
  else console.info(line);
}

const handler = createPublicLeadsHandler({
  ...createSupabasePublicLeadsRepository(),
  devOrigins: readDevOrigins(),
  // 10 envios por minuto por IP (somente em memória).
  rateLimiter: new FixedWindowRateLimiter({ limit: 10, windowMs: 60_000 }),
  now: () => new Date(),
  newRequestId: () => crypto.randomUUID(),
  newFakeLeadId: () => crypto.randomUUID(),
  log,
});

export const POST = handler.POST;
export const OPTIONS = handler.OPTIONS;
