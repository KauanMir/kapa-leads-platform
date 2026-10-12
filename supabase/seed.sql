-- =====================================================================
-- KAPA Leads Platform — seed inicial (idempotente)
--
-- Cria SOMENTE a loja Vitrine Veículos e a campanha Duelo de Aprovações.
-- Nenhum usuário é criado aqui (o SUPER_ADMIN é criado no Auth e
-- promovido manualmente — ver docs/banco-e-seguranca.md).
--
-- campaign_key é gerada pelo banco (camp_pk_...).
-- allowed_origins começa vazio: cadastrar o domínio de produção da LP no deploy.
-- form_schema: rótulos/formatos dos campos do simulador (docs/integracao-landing-page.md, seção 10).
-- =====================================================================

insert into public.stores (slug, name)
values ('vitrine-veiculos', 'Vitrine Veículos')
on conflict (slug) do nothing;

insert into public.campaigns (store_id, slug, name, consent_version, allowed_origins, form_schema)
select s.id, 'duelo-de-aprovacoes', 'Duelo de Aprovações', '2026-10-v1', '{}',
  '{"hasTradeIn":{"label":"Possui veículo na troca","format":"boolean","order":1},"tradeInVehicle":{"label":"Veículo na troca","format":"text","order":2},"tradeInYear":{"label":"Ano do veículo na troca","format":"number","order":3},"hasDownPayment":{"label":"Possui entrada","format":"boolean","order":4},"downPaymentCents":{"label":"Valor da entrada","format":"money","order":5},"desiredVehicleValueCents":{"label":"Valor aproximado do veículo desejado","format":"money","order":6}}'::jsonb
from public.stores s
where s.slug = 'vitrine-veiculos'
on conflict (store_id, slug) do nothing;
