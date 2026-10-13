/**
 * Refs DEV x PRODUÇÃO lidos da fonte única (src/lib/supabase/project.ts).
 * Node 22.18+/24 importa o .ts direto (só remove os tipos).
 */
import { readFileSync } from "node:fs";

import { DEV_MARKER_STORE_SLUG, DEV_SUPABASE_REFS, PRODUCTION_SUPABASE_REF } from "../../src/lib/supabase/project.ts";

export { DEV_MARKER_STORE_SLUG, DEV_SUPABASE_REFS, PRODUCTION_SUPABASE_REF };

/** Ref do DEV: argumento opcional, senão o primeiro de DEV_SUPABASE_REFS. Nunca o de produção. */
export function devRef(arg) {
  const ref = arg ?? DEV_SUPABASE_REFS[0];
  if (!ref) throw new Error("Nenhum Supabase DEV cadastrado em DEV_SUPABASE_REFS (src/lib/supabase/project.ts).");
  if (ref === PRODUCTION_SUPABASE_REF) throw new Error("Esse é o ref de PRODUÇÃO. Abortado.");
  if (!DEV_SUPABASE_REFS.includes(ref)) throw new Error(`${ref} não está em DEV_SUPABASE_REFS. Abortado.`);
  return ref;
}

/** Projeto vinculado ao Supabase CLI (supabase/.temp/project-ref), ou null. */
export function linkedRef() {
  try {
    return readFileSync(new URL("../../supabase/.temp/project-ref", import.meta.url), "utf8").trim() || null;
  } catch {
    return null;
  }
}
