/**
 * Prepara o Supabase DEV: aplica as migrations versionadas (as MESMAS da
 * produção, via `supabase db push`), o seed DEV (supabase/seed-dev.sql) e
 * mostra o estado final. Idempotente.
 *
 *   npm run dev:setup              # usa DEV_SUPABASE_REFS[0]
 *   npm run dev:setup -- status    # só mostra o estado do DEV (leitura)
 *
 * Travas: o ref precisa estar em DEV_SUPABASE_REFS e nunca ser o de produção;
 * o projeto vinculado ao CLI precisa ser esse DEV (o push usa --linked); o
 * banco não pode ter a loja de produção. Sem --include-seed: o seed de
 * produção (supabase/seed.sql) nunca vai para o DEV.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { query, queryFile } from "./lib/supabase-cli.mjs";
import { DEV_MARKER_STORE_SLUG, devRef, linkedRef } from "./lib/projects.mjs";

const CLI = fileURLToPath(new URL("../node_modules/supabase/dist/supabase.js", import.meta.url));
const SEED_DEV = fileURLToPath(new URL("../supabase/seed-dev.sql", import.meta.url));

const statusOnly = process.argv[2] === "status";
const ref = devRef(statusOnly ? process.argv[3] : process.argv[2]);

function supabase(...args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`supabase ${args.join(" ")} falhou.`);
}

function status() {
  const [row] = query(ref, "select to_regclass('public.stores') is not null as estrutura");
  console.log(`DEV (${ref}): estrutura=${row.estrutura}`);
  if (!row.estrutura) return;
  const [data] = query(
    ref,
    `select
       (select string_agg(version, ', ' order by version) from supabase_migrations.schema_migrations) as migrations,
       (select string_agg(name, ', ' order by name) from public.stores) as lojas,
       (select string_agg(name, ', ' order by name) from public.campaigns) as campanhas,
       (select count(*) from public.leads) as leads,
       (select count(*) from auth.users) as usuarios,
       (select count(*) from public.stores where slug ~ '-test-') as sobras_teste_lojas,
       (select count(*) from auth.users where email ~ '-test-.*@example[.]com$') as sobras_teste_usuarios`,
  );
  for (const [key, value] of Object.entries(data)) console.log(`  ${key.padEnd(22)} ${value}`);
}

if (statusOnly) {
  status();
} else {
  if (linkedRef() !== ref) {
    console.log(`Vinculando o Supabase CLI ao DEV (${ref})…`);
    supabase("link", "--project-ref", ref);
  }
  if (linkedRef() !== ref) throw new Error("O CLI não ficou vinculado ao DEV. Abortado.");

  // Duas consultas: num banco vazio, citar public.stores já dá erro de parse.
  const [{ estrutura }] = query(ref, "select to_regclass('public.stores') is not null as estrutura");
  if (estrutura) {
    const [guard] = query(ref, "select exists (select 1 from public.stores where slug = 'vitrine-veiculos') as tem_loja_de_producao");
    if (guard.tem_loja_de_producao) throw new Error("Este banco tem a loja de PRODUÇÃO. Abortado.");
  }

  console.log("Migrations (as mesmas de produção):");
  supabase("db", "push", "--linked", "--yes");

  console.log("Seed DEV:");
  queryFile(ref, SEED_DEV);
  const [marker] = query(ref, `select count(*) as n from public.stores where slug = '${DEV_MARKER_STORE_SLUG}'`);
  if (Number(marker.n) !== 1) throw new Error("Loja-marcador do DEV não foi criada.");

  status();
  console.log("Pronto. Confira a estrutura com: npm run db:compare");
}
