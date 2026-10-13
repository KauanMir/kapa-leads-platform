/**
 * Compara a ESTRUTURA (tabelas, colunas, enums, RLS, policies, funções,
 * triggers, constraints, índices e GRANTs) do Supabase DEV com a de PRODUÇÃO.
 * Somente leitura nos dois projetos. Sai com código 1 se houver diferença.
 *
 *   npm run db:compare
 */
import { fileURLToPath } from "node:url";

import { queryFile } from "./lib/supabase-cli.mjs";
import { PRODUCTION_SUPABASE_REF, devRef } from "./lib/projects.mjs";

const SNAPSHOT = fileURLToPath(new URL("./sql/schema-snapshot.sql", import.meta.url));
const snapshot = (ref) => new Set(queryFile(ref, SNAPSHOT).map((r) => `${r.kind} | ${r.item}`));

const dev = devRef(process.argv[2]);
const prod = snapshot(PRODUCTION_SUPABASE_REF);
const devSnap = snapshot(dev);

const onlyProd = [...prod].filter((x) => !devSnap.has(x));
const onlyDev = [...devSnap].filter((x) => !prod.has(x));

console.log(`Estrutura: produção ${prod.size} itens, DEV (${dev}) ${devSnap.size} itens.`);
if (onlyProd.length === 0 && onlyDev.length === 0) {
  console.log("OK: DEV e PRODUÇÃO têm a mesma estrutura.");
} else {
  for (const x of onlyProd) console.log(`  só em PRODUÇÃO: ${x}`);
  for (const x of onlyDev) console.log(`  só no DEV:      ${x}`);
  process.exitCode = 1;
}
