-- =====================================================================
-- ROLLBACK da migration 20261026120000_cpf_cooldown_illustrative_value.sql
--
-- NÃO é migration (fica fora de supabase/migrations). Executar só com
-- autorização, num único bloco. ATENÇÃO: apaga o valor ilustrativo e a
-- validade gravados nos leads criados depois da migration (o lead continua)
-- e o registro de bloqueios de CPF (os CPFs ficam liberados), além da auditoria
-- dos pedidos LGPD (public.lgpd_cpf_cooldown_releases) — exporte-a antes, se
-- precisar guardá-la. Antes, faça deploy do código anterior (que não lê essas
-- colunas) e o rollback de 20261027120000 (limpeza diária).
-- =====================================================================
begin;

-- Pedidos LGPD (funções e auditoria).
drop function if exists public.lgpd_release_cpf_cooldown(uuid, text, text, boolean);
drop function if exists public.lgpd_cpf_cooldown_lookup(text);
drop function if exists private.assert_lgpd_operator(text);

-- delete_lead como era (20261016120000).
drop function if exists public.delete_lead(uuid, boolean, boolean);
drop function if exists public.delete_lead(uuid, boolean);

create or replace function public.delete_lead(p_lead_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_store_id  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Trava a linha: atribuição/status simultâneos esperam a exclusão.
  select l.store_id into v_store_id
  from public.leads l
  where l.id = p_lead_id
  for update;

  -- store_id é NOT NULL: null aqui = lead inexistente.
  if v_store_id is null or not ((select private.is_super_admin()) or v_store_id in (select private.user_store_ids())) then
    raise exception 'lead not found' using errcode = 'KL010';
  end if;

  if not ((select private.is_super_admin()) or v_store_id in (select private.admin_store_ids())) then
    raise exception 'forbidden' using errcode = 'KL011';
  end if;

  delete from public.leads where id = p_lead_id;
end;
$$;

revoke all on function public.delete_lead(uuid) from public, anon, authenticated;
grant execute on function public.delete_lead(uuid) to authenticated;

-- Funções dos triggers como eram (20261010120200).
create or replace function private.leads_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id         uuid;
  v_consent_version  text;
  v_campaign_active  boolean;
  v_store_active     boolean;
begin
  select c.store_id, c.consent_version, c.is_active, s.is_active
    into v_store_id, v_consent_version, v_campaign_active, v_store_active
  from public.campaigns c
  join public.stores s on s.id = c.store_id
  where c.id = new.campaign_id;

  if not found then
    raise exception 'campaign not found' using errcode = 'KL001';
  end if;

  if not (v_campaign_active and v_store_active) then
    raise exception 'campaign inactive' using errcode = 'KL002';
  end if;

  if new.consent_version is distinct from v_consent_version then
    raise exception 'consent version mismatch' using errcode = 'KL003';
  end if;

  -- Valores sempre definidos pelo banco, ignorando o que foi enviado.
  new.store_id   := v_store_id;
  new.consent_at := now();
  new.status     := 'NEW';
  new.created_at := now();
  new.updated_at := now();

  return new;
end;
$$;

create or replace function private.leads_guard_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.store_id             is distinct from old.store_id
  or new.campaign_id          is distinct from old.campaign_id
  or new.client_submission_id is distinct from old.client_submission_id
  or new.consent_version      is distinct from old.consent_version
  or new.consent_at           is distinct from old.consent_at
  or new.created_at           is distinct from old.created_at then
    raise exception 'immutable lead field' using errcode = 'KL004';
  end if;
  return new;
end;
$$;

drop function if exists private.release_cpf_cooldown(uuid, text, text, text, uuid);
drop table if exists public.lgpd_cpf_cooldown_releases;
drop function if exists private.purge_expired_cpf_cooldowns();
drop table if exists private.cpf_cooldowns;
drop function if exists private.cpf_cooldown_key(text);
drop table if exists private.secrets;

drop function if exists private.cpf_cooldown_end(timestamptz, integer);
drop function if exists private.is_business_day_df(date);
drop function if exists private.is_df_holiday(date);
drop function if exists private.easter_sunday(integer);

alter table public.leads
  drop constraint if exists leads_illustrative_consistent,
  drop column if exists illustrative_amount_cents,
  drop column if exists illustrative_presented_at,
  drop column if exists illustrative_expires_at,
  drop column if exists cpf_cooldown_until;

alter table public.campaigns
  drop constraint if exists campaigns_cpf_cooldown_range,
  drop constraint if exists campaigns_illustrative_config,
  drop column if exists cpf_cooldown_business_days,
  drop column if exists illustrative_min_cents,
  drop column if exists illustrative_max_cents,
  drop column if exists illustrative_step_cents,
  drop column if exists illustrative_validity_hours;

delete from supabase_migrations.schema_migrations where version = '20261026120000';

commit;
