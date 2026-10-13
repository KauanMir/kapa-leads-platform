/**
 * Executa SQL num projeto Supabase pela Management API (`supabase db query`),
 * com o login do Supabase CLI — sem senha do banco e sem chaves no disco.
 * O projeto é SEMPRE informado pelo ref (nunca o "vinculado" implícito).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Supabase CLI do projeto (devDependency), chamado direto pelo Node: sem shell.
const SUPABASE_CLI = fileURLToPath(new URL("../../node_modules/supabase/dist/supabase.js", import.meta.url));

/** Roda um arquivo SQL (caminho) no projeto `ref` e devolve as linhas. */
export function queryFile(ref, file) {
  if (!/^[a-z0-9]{20}$/.test(ref)) throw new Error(`ref inválido: ${ref}`);
  const result = spawnSync(process.execPath, [SUPABASE_CLI, "db", "query", "--linked", "--project-ref", ref, "-o", "json", "-f", file], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`supabase db query falhou (${ref}):\n${(result.stderr || result.stdout).trim()}`);
  const start = result.stdout.indexOf("{");
  const parsed = JSON.parse(result.stdout.slice(start));
  return parsed.rows ?? [];
}

/** Roda um texto SQL no projeto `ref` e devolve as linhas. */
export function query(ref, sql) {
  const dir = mkdtempSync(join(tmpdir(), "kapa-sql-"));
  try {
    const file = join(dir, "query.sql");
    writeFileSync(file, sql, "utf8");
    return queryFile(ref, file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
