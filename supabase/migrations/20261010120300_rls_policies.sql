-- =====================================================================
-- KAPA Leads Platform — Fase 2 / 4: Row Level Security
--
-- RLS habilitado EXPLICITAMENTE em todas as tabelas (não depende da
-- configuração do painel).
--
--   anon           → nenhuma policy (nenhum acesso).
--   authenticated  → somente dados das próprias lojas; SUPER_ADMIN vê tudo.
--   service_role   → ignora RLS (usado apenas no servidor, Fase 3+).
--
-- Chamadas a auth.uid()/funções ficam dentro de (select ...) para o
-- Postgres avaliar uma vez por consulta, não por linha.
-- =====================================================================

alter table public.stores        enable row level security;
alter table public.campaigns     enable row level security;
alter table public.profiles      enable row level security;
alter table public.store_members enable row level security;
alter table public.leads         enable row level security;
alter table public.lead_notes    enable row level security;
alter table public.lead_events   enable row level security;

-- ---------------------------------------------------------------------
-- stores
-- ---------------------------------------------------------------------
create policy stores_select on public.stores
  for select to authenticated
  using (
    (select private.is_super_admin())
    or id in (select private.user_store_ids())
  );

create policy stores_insert_super_admin on public.stores
  for insert to authenticated
  with check ((select private.is_super_admin()));

create policy stores_update_super_admin on public.stores
  for update to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

-- ---------------------------------------------------------------------
-- campaigns (STORE_USER e STORE_ADMIN leem as da própria loja)
-- ---------------------------------------------------------------------
create policy campaigns_select on public.campaigns
  for select to authenticated
  using (
    (select private.is_super_admin())
    or store_id in (select private.user_store_ids())
  );

create policy campaigns_insert_super_admin on public.campaigns
  for insert to authenticated
  with check ((select private.is_super_admin()));

create policy campaigns_update_super_admin on public.campaigns
  for update to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_super_admin())
    -- STORE_ADMIN vê os perfis dos membros das lojas que administra.
    or id in (
      select sm.user_id
      from public.store_members sm
      where sm.store_id in (select private.admin_store_ids())
    )
  );

-- A coluna editável é limitada por GRANT (somente full_name).
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select private.is_super_admin()))
  with check (id = (select auth.uid()) or (select private.is_super_admin()));

-- ---------------------------------------------------------------------
-- store_members
-- ---------------------------------------------------------------------
create policy store_members_select on public.store_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_super_admin())
    or store_id in (select private.admin_store_ids())
  );

create policy store_members_insert_super_admin on public.store_members
  for insert to authenticated
  with check ((select private.is_super_admin()));

create policy store_members_update_super_admin on public.store_members
  for update to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

create policy store_members_delete_super_admin on public.store_members
  for delete to authenticated
  using ((select private.is_super_admin()));

-- ---------------------------------------------------------------------
-- leads (sem INSERT/DELETE para usuários: leads entram só pela API)
-- ---------------------------------------------------------------------
create policy leads_select on public.leads
  for select to authenticated
  using (
    (select private.is_super_admin())
    or store_id in (select private.user_store_ids())
  );

-- Coluna editável limitada por GRANT (somente status).
create policy leads_update on public.leads
  for update to authenticated
  using (
    (select private.is_super_admin())
    or store_id in (select private.user_store_ids())
  )
  with check (
    (select private.is_super_admin())
    or store_id in (select private.user_store_ids())
  );

-- ---------------------------------------------------------------------
-- lead_notes (inclusão por membros da loja; sem edição/remoção)
-- store_id e author_id são definidos pelo trigger antes desta checagem.
-- ---------------------------------------------------------------------
create policy lead_notes_select on public.lead_notes
  for select to authenticated
  using (
    (select private.is_super_admin())
    or store_id in (select private.user_store_ids())
  );

create policy lead_notes_insert on public.lead_notes
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (select private.is_super_admin())
      or store_id in (select private.user_store_ids())
    )
  );

-- ---------------------------------------------------------------------
-- lead_events (somente leitura; escrita apenas por triggers)
-- ---------------------------------------------------------------------
create policy lead_events_select on public.lead_events
  for select to authenticated
  using (
    (select private.is_super_admin())
    or store_id in (select private.user_store_ids())
  );
