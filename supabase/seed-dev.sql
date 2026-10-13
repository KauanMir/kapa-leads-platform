-- =====================================================================
-- KAPA Leads Platform — seed do Supabase DEV (desenvolvimento/testes)
--
-- SOMENTE no projeto DEV (docs/ambientes.md). Nunca em produção: o bloco
-- abaixo aborta se encontrar a loja de produção "vitrine-veiculos".
-- Idempotente. Nenhum lead, CPF, telefone ou usuário real.
--
-- A loja "vitrine-veiculos-dev" é o MARCADOR do DEV: as suítes remotas só
-- rodam se ela existir (supabase/tests/production-guard.ts).
--
-- Aplicar (Management API, sem senha do banco):
--   npx supabase db query --linked --project-ref <ref-dev> -f supabase/seed-dev.sql
-- =====================================================================

do $$
begin
  if exists (select 1 from public.stores where slug = 'vitrine-veiculos') then
    raise exception 'seed-dev.sql: este banco tem a loja de PRODUÇÃO (vitrine-veiculos). Abortado.';
  end if;
end $$;

insert into public.stores (slug, name)
values
  ('vitrine-veiculos-dev', 'Vitrine Veículos DEV'),
  ('fortium-dev', 'Fortium DEV')
on conflict (slug) do nothing;

-- Mesmo form_schema da campanha real (supabase/seed.sql). Origens: a LP local
-- usa PUBLIC_LEADS_DEV_ORIGINS (http://localhost:3001), então a lista começa vazia.
insert into public.campaigns (store_id, slug, name, consent_version, allowed_origins, form_schema)
select s.id, 'duelo-de-aprovacoes-dev', 'Duelo de Aprovações DEV', '2026-10-v1', '{}',
  '{"hasTradeIn":{"label":"Possui veículo na troca","format":"boolean","order":1},"tradeInVehicle":{"label":"Veículo na troca","format":"text","order":2},"tradeInYear":{"label":"Ano do veículo na troca","format":"number","order":3},"hasDownPayment":{"label":"Possui entrada","format":"boolean","order":4},"downPaymentCents":{"label":"Valor da entrada","format":"money","order":5},"desiredVehicleValueCents":{"label":"Valor aproximado do veículo desejado","format":"money","order":6}}'::jsonb
from public.stores s
where s.slug = 'vitrine-veiculos-dev'
on conflict (store_id, slug) do nothing;

-- Segunda loja: só para provar isolamento entre lojas no DEV.
insert into public.campaigns (store_id, slug, name, consent_version, allowed_origins, form_schema)
select s.id, 'aprova-tudo-dev', 'Aprova Tudo DEV', '2026-10-v1', '{}', '{}'::jsonb
from public.stores s
where s.slug = 'fortium-dev'
on conflict (store_id, slug) do nothing;
