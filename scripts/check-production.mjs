/**
 * Conferência do Supabase de PRODUÇÃO — SOMENTE LEITURA (um SELECT).
 * Mostra contagens agregadas, sem nenhum dado pessoal.
 *
 *   npm run prod:check
 */
import { query } from "./lib/supabase-cli.mjs";
import { PRODUCTION_SUPABASE_REF } from "./lib/projects.mjs";

const [row] = query(
  PRODUCTION_SUPABASE_REF,
  `select
     (select count(*) from public.leads) as leads,
     (select count(*) from public.profiles where is_super_admin and is_active) as super_admins_ativos,
     (select count(*) from auth.users) as usuarios,
     (select count(*) from public.store_members where is_active) as vinculos_ativos,
     (select is_active from public.stores where slug = 'vitrine-veiculos') as vitrine_ativa,
     (select c.is_active from public.campaigns c join public.stores s on s.id = c.store_id
       where s.slug = 'vitrine-veiculos' and c.slug = 'duelo-de-aprovacoes') as duelo_ativa,
     (select count(*) from public.stores where slug ~ '(-test-|-dev$)') as lojas_de_teste_ou_dev`,
);

console.log(`PRODUÇÃO (${PRODUCTION_SUPABASE_REF}) — somente leitura`);
for (const [key, value] of Object.entries(row)) console.log(`  ${key.padEnd(24)} ${value}`);

const problems = [];
if (Number(row.super_admins_ativos) < 1) problems.push("nenhum SUPER_ADMIN ativo");
if (row.vitrine_ativa !== true) problems.push("Vitrine Veículos não está ativa");
if (row.duelo_ativa !== true) problems.push("campanha Duelo de Aprovações não está ativa");
if (Number(row.lojas_de_teste_ou_dev) > 0) problems.push("há lojas de teste/DEV em produção");
if (problems.length) {
  console.error(`ATENÇÃO: ${problems.join("; ")}.`);
  process.exitCode = 1;
} else {
  console.log("OK");
}
