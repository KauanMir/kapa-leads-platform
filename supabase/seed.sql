-- =====================================================================
-- KAPA Leads Platform — seed inicial (idempotente)
--
-- Cria SOMENTE a loja Vitrine Veículos e a campanha Duelo de Aprovações.
-- Nenhum usuário é criado aqui (o SUPER_ADMIN é criado no Auth e
-- promovido manualmente — ver docs/banco-e-seguranca.md).
--
-- campaign_key é gerada pelo banco (camp_pk_...).
-- allowed_origins começa vazio: será configurado na integração da LP.
-- =====================================================================

insert into public.stores (slug, name)
values ('vitrine-veiculos', 'Vitrine Veículos')
on conflict (slug) do nothing;

insert into public.campaigns (store_id, slug, name, consent_version, allowed_origins)
select s.id, 'duelo-de-aprovacoes', 'Duelo de Aprovações', '2026-10-v1', '{}'
from public.stores s
where s.slug = 'vitrine-veiculos'
on conflict (store_id, slug) do nothing;
