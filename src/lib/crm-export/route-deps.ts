import "server-only";

import { readCrmExportConfig } from "@/lib/crm-export/config";
import { createCrmExportHandler, type CrmExportLogEntry } from "@/lib/crm-export/export-handler";
import { createSupabaseCrmExportRepository } from "@/lib/crm-export/export-repository";
import { FixedWindowRateLimiter } from "@/lib/leads/rate-limit";

/** Uma instância por processo; a configuração é lida das variáveis do servidor. */
let handler: ReturnType<typeof createCrmExportHandler> | null = null;

function log(entry: CrmExportLogEntry) {
  const line = JSON.stringify({ event: "crm_export", ...entry });
  if (entry.status >= 500) console.error(line);
  else console.info(line);
}

export function getCrmExportHandler() {
  if (handler) return handler;
  const config = readCrmExportConfig(process.env);
  for (const warning of config.warnings) console.warn(JSON.stringify({ event: "crm_export_config", warning }));
  handler = createCrmExportHandler({
    config,
    ...createSupabaseCrmExportRepository(),
    // O CRM consulta algumas vezes por minuto; o limite só contém um uso indevido do segredo.
    rateLimiter: new FixedWindowRateLimiter({ limit: 120, windowMs: 60_000 }),
    now: () => new Date(),
    newRequestId: () => crypto.randomUUID(),
    log,
  });
  return handler;
}
