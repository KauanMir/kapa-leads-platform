-- =====================================================================
-- KAPA Leads Platform — Fase 2 / 3: funções de autorização e triggers
--
-- Todas as funções ficam no schema "private" (não exposto pela API),
-- com search_path vazio e nomes totalmente qualificados.
--
-- Códigos de erro próprios (SQLSTATE) usados pela API na Fase 3:
--   KL001  campanha inexistente
--   KL002  campanha ou loja inativa
--   KL003  consent_version diferente da versão vigente da campanha
--   KL004  tentativa de alterar campo imutável do lead
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funções auxiliares de autorização (usadas pelas policies de RLS)
-- SECURITY DEFINER: leem profiles/store_members sem passar pelo RLS,
-- evitando recursão entre policies.
-- ---------------------------------------------------------------------

-- Usuário atual é SUPER_ADMIN ativo?
create function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_super_admin
      and p.is_active
  );
$$;

-- Lojas às quais o usuário atual pertence (vínculo e perfil ativos).
create function private.user_store_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select sm.store_id
  from public.store_members sm
  join public.profiles p on p.id = sm.user_id
  where sm.user_id = (select auth.uid())
    and sm.is_active
    and p.is_active;
$$;

-- Lojas em que o usuário atual é STORE_ADMIN (vínculo e perfil ativos).
create function private.admin_store_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select sm.store_id
  from public.store_members sm
  join public.profiles p on p.id = sm.user_id
  where sm.user_id = (select auth.uid())
    and sm.role = 'STORE_ADMIN'
    and sm.is_active
    and p.is_active;
$$;

-- ---------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.stores
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.campaigns
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.leads
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- profiles: criado/sincronizado a partir de auth.users
-- ---------------------------------------------------------------------
create function private.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (id, email, full_name)
    values (
      new.id,
      new.email,
      left(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 150)
    )
    on conflict (id) do nothing;
  elsif new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_auth_user_change();

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function private.handle_auth_user_change();

-- Usuários que já existiam antes desta migration.
insert into public.profiles (id, email)
select u.id, u.email
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- leads: regras de inserção (defesa em profundidade além da API)
-- ---------------------------------------------------------------------
create function private.leads_before_insert()
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

create trigger leads_before_insert
  before insert on public.leads
  for each row execute function private.leads_before_insert();

-- Campos que nunca mudam depois da criação do lead.
create function private.leads_guard_immutable()
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

create trigger leads_guard_immutable
  before update on public.leads
  for each row execute function private.leads_guard_immutable();

-- ---------------------------------------------------------------------
-- lead_notes: loja e autor definidos pelo banco
-- ---------------------------------------------------------------------
create function private.lead_notes_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Se o lead não existir, store_id fica null e a FK/NOT NULL rejeita.
  select l.store_id into new.store_id
  from public.leads l
  where l.id = new.lead_id;

  new.author_id  := (select auth.uid());
  new.created_at := now();
  return new;
end;
$$;

create trigger lead_notes_before_insert
  before insert on public.lead_notes
  for each row execute function private.lead_notes_before_insert();

-- ---------------------------------------------------------------------
-- lead_events: CREATED, STATUS_CHANGED, NOTE_ADDED
-- actor_id = auth.uid() (null quando a ação vem da API/servidor).
-- ---------------------------------------------------------------------
create function private.log_lead_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.lead_events (lead_id, store_id, type, actor_id, payload)
  values (new.id, new.store_id, 'CREATED', (select auth.uid()), '{}');
  return null;
end;
$$;

create trigger log_lead_created
  after insert on public.leads
  for each row execute function private.log_lead_created();

create function private.log_lead_status_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.lead_events (lead_id, store_id, type, actor_id, payload)
  values (
    new.id,
    new.store_id,
    'STATUS_CHANGED',
    (select auth.uid()),
    jsonb_build_object('from', old.status, 'to', new.status)
  );
  return null;
end;
$$;

create trigger log_lead_status_changed
  after update of status on public.leads
  for each row
  when (old.status is distinct from new.status)
  execute function private.log_lead_status_changed();

create function private.log_lead_note_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.lead_events (lead_id, store_id, type, actor_id, payload)
  values (
    new.lead_id,
    new.store_id,
    'NOTE_ADDED',
    new.author_id,
    jsonb_build_object('note_id', new.id)
  );
  return null;
end;
$$;

create trigger log_lead_note_added
  after insert on public.lead_notes
  for each row execute function private.log_lead_note_added();
