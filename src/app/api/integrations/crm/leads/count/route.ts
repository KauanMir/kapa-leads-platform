import { getCrmExportHandler } from "@/lib/crm-export/route-deps";

/**
 * GET /api/integrations/crm/leads/count — contagem para reconciliação (sem dados pessoais).
 * Desligada por padrão (404). Contrato: docs/integracao-crm.md
 * Sem segment config: com cacheComponents, um handler que lê a requisição já é dinâmico.
 */

export function GET(request: Request) {
  return getCrmExportHandler().count(request);
}
