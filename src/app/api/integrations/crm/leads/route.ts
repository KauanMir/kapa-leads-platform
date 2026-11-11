import { getCrmExportHandler } from "@/lib/crm-export/route-deps";

/**
 * GET /api/integrations/crm/leads — exportação SOMENTE LEITURA para o KAPA CRM.
 * Desligada por padrão (404). Contrato: docs/integracao-crm.md
 * Sem segment config: com cacheComponents, um handler que lê a requisição já é dinâmico.
 */

export function GET(request: Request) {
  return getCrmExportHandler().list(request);
}
