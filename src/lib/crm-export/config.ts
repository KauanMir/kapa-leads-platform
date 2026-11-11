/**
 * Configuração da exportação para o KAPA CRM. DESLIGADA por padrão.
 *
 *   CRM_EXPORT_SECRET           segredo atual (mín. 32 caracteres), só no servidor
 *   CRM_EXPORT_SECRET_PREVIOUS  opcional: segredo anterior, aceito durante uma troca
 *   CRM_EXPORT_STORE_IDS        lojas (UUID) liberadas, separadas por vírgula
 *
 * Sem segredo válido ou sem nenhuma loja, a rota responde 404 como se não existisse.
 * Só leitura: nada aqui escreve no banco.
 */
import { MIN_SECRET_LENGTH } from "@/lib/crm-export/signature";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type CrmExportConfig =
  | { enabled: false; warnings: string[] }
  | { enabled: true; secrets: string[]; storeIds: ReadonlySet<string>; warnings: string[] };

export function readCrmExportConfig(env: Record<string, string | undefined>): CrmExportConfig {
  const warnings: string[] = [];
  const current = env.CRM_EXPORT_SECRET?.trim() ?? "";
  const previous = env.CRM_EXPORT_SECRET_PREVIOUS?.trim() ?? "";
  const secrets: string[] = [];
  if (current) {
    if (current.length >= MIN_SECRET_LENGTH) secrets.push(current);
    else warnings.push("secret_too_short");
  }
  if (previous) {
    if (previous.length >= MIN_SECRET_LENGTH) secrets.push(previous);
    else warnings.push("previous_secret_too_short");
  }

  const storeIds = new Set<string>();
  for (const raw of (env.CRM_EXPORT_STORE_IDS ?? "").split(",")) {
    const id = raw.trim().toLowerCase();
    if (!id) continue;
    if (UUID_PATTERN.test(id)) storeIds.add(id);
    else warnings.push("invalid_store_id");
  }

  // O segredo atual é obrigatório: só o anterior não liga a exportação.
  if (!current || current.length < MIN_SECRET_LENGTH || storeIds.size === 0) return { enabled: false, warnings };
  return { enabled: true, secrets, storeIds, warnings };
}
