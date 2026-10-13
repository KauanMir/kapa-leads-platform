-- =====================================================================
-- KAPA Leads Platform — Fase 9: responsável (SDR) pelo lead, revelação
-- auditada do CPF, diretório da equipe e KPIs operacionais.
--
-- O responsável tem efeito real (RLS): o SDR só TRABALHA (status,
-- observação, CPF) os leads atribuídos a ele; gerente e KAPA, qualquer lead
-- da loja. Regra única em private.can_work_lead().
--
-- Escrita sensível só por funções com regras explícitas:
--   assign_lead      → atribui/reatribui/assume (evento ASSIGNED)
--   reveal_lead_cpf  → devolve o CPF de UM lead (evento CPF_REVEALED)
-- Leitura auxiliar:
--   store_team       → nome/papel dos membros das lojas do usuário (sem e-mail)
--   lead_kpis        → contagens por responsável/status (RLS do usuário)
--
-- Novos códigos de erro (SQLSTATE):
--   KL010  lead inexistente ou fora do alcance do usuário
--   KL011  sem permissão (atribuição, ou CPF de lead que não é do SDR)
--   KL012  lead já tem outro responsável (SDR não pode tomar)
--   KL013  responsável inválido (não é membro ativo da loja do lead)
--
-- Rollback: supabase/rollbacks/20261014120000_lead_assignment_cpf_kpis.down.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- leads.assigned_to: responsável pelo lead (null = sem responsável).
-- A FK composta garante que o responsável é membro DA MESMA loja do lead;
-- se o vínculo for removido, só o responsável volta a null.
-- ---------------------------------------------------------------------
alter table public.leads
  add column assigned_to uuid,
  add constraint leads_assignee_member_fkey foreign key (store_id, assigned_to)
    references public.store_members (store_id, user_id)
    on update restrict on delete set null (assigned_to);

create index leads_store_assignee_created_idx on public.leads (store_id, assigned_to, created_at desc);

-- Leitura do responsável pelo Admin. Escrita: somente via assign_lead()
-- (nenhum GRANT de UPDATE nesta coluna para authenticated).
grant select (assigned_to) on public.leads to authenticated;

-- ---------------------------------------------------------------------
-- Quem pode TRABALHAR um lead (alterar status, observar, revelar CPF):
--   SUPER_ADMIN ativo                       → qualquer lead
--   STORE_ADMIN ativo da loja do lead       → qualquer lead da loja
--   STORE_USER (SDR) ativo da loja do lead  → só se for o responsável atual
-- Ver o lead continua igual (todos os membros da loja), para a fila e a
-- coluna "Responsável". SECURITY DEFINER: lê o lead sem depender do RLS.
-- ---------------------------------------------------------------------
create function private.can_work_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.leads l
    where l.id = p_lead_id
      and (
        (select private.is_super_admin())
        or l.store_id in (select private.admin_store_ids())
        or (l.store_id in (select private.user_store_ids()) and l.assigned_to = (select auth.uid()))
      )
  );
$$;

-- Status (único campo editável por GRANT): SDR só no próprio lead. Lead de
-- outro SDR ou sem responsável → o UPDATE não encontra a linha (0 linhas).
drop policy leads_update on public.leads;

create policy leads_update on public.leads
  for update to authenticated
  using (
    (select private.is_super_admin())
    or store_id in (select private.admin_store_ids())
    or (store_id in (select private.user_store_ids()) and assigned_to = (select auth.uid()))
  )
  with check (
    (select private.is_super_admin())
    or store_id in (select private.admin_store_ids())
    or (store_id in (select private.user_store_ids()) and assigned_to = (select auth.uid()))
  );

-- Observações: mesma regra (o SDR precisa assumir o lead antes).
drop policy lead_notes_insert on public.lead_notes;

create policy lead_notes_insert on public.lead_notes
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select private.can_work_lead(lead_id))
  );

-- ---------------------------------------------------------------------
-- Evento ASSIGNED a cada troca de responsável (inclusive pelo servidor).
-- Payload só com ids de usuários: nenhum dado do lead.
-- ---------------------------------------------------------------------
create function private.log_lead_assigned()
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
    'ASSIGNED',
    (select auth.uid()),
    jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to)
  );
  return null;
end;
$$;

create trigger log_lead_assigned
  after update of assigned_to on public.leads
  for each row
  when (old.assigned_to is distinct from new.assigned_to)
  execute function private.log_lead_assigned();

-- ---------------------------------------------------------------------
-- assign_lead(lead, responsável | null)
--
--   SUPER_ADMIN          → qualquer lead; responsável = membro ativo da loja do lead.
--   STORE_ADMIN da loja  → atribui, reatribui ou devolve para a fila (null).
--   STORE_USER (SDR)     → só ASSUMIR para si um lead SEM responsável.
--
-- Usuário/vínculo inativo não passa (user_store_ids/admin_store_ids e
-- is_super_admin já exigem perfil e vínculo ativos). Lead de outra loja
-- responde como inexistente (KL010), sem revelar que existe.
-- ---------------------------------------------------------------------
create function public.assign_lead(p_lead_id uuid, p_assignee_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_store_id  uuid;
  v_current   uuid;
  v_is_super  boolean;
  v_is_admin  boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Trava a linha: duas tentativas simultâneas de assumir não passam juntas.
  select l.store_id, l.assigned_to into v_store_id, v_current
  from public.leads l
  where l.id = p_lead_id
  for update;

  -- store_id é NOT NULL: null aqui = lead inexistente (sem depender de FOUND).
  v_is_super := (select private.is_super_admin());
  if v_store_id is null or not (v_is_super or v_store_id in (select private.user_store_ids())) then
    raise exception 'lead not found' using errcode = 'KL010';
  end if;

  v_is_admin := v_is_super or v_store_id in (select private.admin_store_ids());

  if not v_is_admin then
    if p_assignee_id is distinct from v_uid then
      raise exception 'forbidden' using errcode = 'KL011';
    end if;
    if v_current = v_uid then
      return; -- já é dele
    end if;
    if v_current is not null then
      raise exception 'lead already assigned' using errcode = 'KL012';
    end if;
  end if;

  if p_assignee_id is not null and not exists (
    select 1
    from public.store_members sm
    join public.profiles p on p.id = sm.user_id
    where sm.store_id = v_store_id
      and sm.user_id = p_assignee_id
      and sm.is_active
      and p.is_active
  ) then
    raise exception 'invalid assignee' using errcode = 'KL013';
  end if;

  if v_current is not distinct from p_assignee_id then
    return; -- nada muda, nenhum evento
  end if;

  update public.leads set assigned_to = p_assignee_id where id = p_lead_id;
end;
$$;

-- ---------------------------------------------------------------------
-- reveal_lead_cpf(lead): CPF completo de UM lead, sempre auditado.
-- Quem pode: SUPER_ADMIN; STORE_ADMIN ativo da loja do lead; SDR ativo só
-- se for o responsável atual (lead sem responsável: assumir antes).
-- Fora da loja → KL010 (como inexistente); da loja, sem permissão → KL011.
-- O evento CPF_REVEALED nunca contém o CPF.
-- ---------------------------------------------------------------------
create function public.reveal_lead_cpf(p_lead_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_store_id  uuid;
  v_cpf       text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select l.store_id, l.cpf into v_store_id, v_cpf
  from public.leads l
  where l.id = p_lead_id;

  if v_store_id is null or not ((select private.is_super_admin()) or v_store_id in (select private.user_store_ids())) then
    raise exception 'lead not found' using errcode = 'KL010';
  end if;

  if not (select private.can_work_lead(p_lead_id)) then
    raise exception 'forbidden' using errcode = 'KL011';
  end if;

  insert into public.lead_events (lead_id, store_id, type, actor_id, payload)
  values (p_lead_id, v_store_id, 'CPF_REVEALED', v_uid, '{}');

  return v_cpf;
end;
$$;

-- ---------------------------------------------------------------------
-- store_team(): equipe das lojas do usuário — só nome, papel e se está
-- ativo (sem e-mail). Serve para mostrar o responsável/autor e montar a
-- lista de SDRs; o RLS de profiles continua restrito.
-- ---------------------------------------------------------------------
create function public.store_team()
returns table (store_id uuid, user_id uuid, full_name text, role public.store_member_role, is_active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    sm.store_id,
    sm.user_id,
    coalesce(nullif(btrim(p.full_name), ''), 'Sem nome'),
    sm.role,
    sm.is_active and p.is_active
  from public.store_members sm
  join public.profiles p on p.id = sm.user_id
  where (select private.is_super_admin())
     or sm.store_id in (select private.user_store_ids());
$$;

-- ---------------------------------------------------------------------
-- lead_kpis(filtros): contagens por (responsável, status) + tempo até o
-- primeiro atendimento registrado (primeiro STATUS_CHANGED saindo de NEW).
--
-- SECURITY INVOKER: o RLS do usuário vale normalmente. Além disso, o SDR
-- (sem papel de admin na loja) só agrega os PRÓPRIOS leads e a fila sem
-- responsável — nunca a carteira de outro SDR.
-- ---------------------------------------------------------------------
create function public.lead_kpis(
  p_store_id    uuid default null,
  p_campaign_id uuid default null,
  p_from        timestamptz default null,
  p_to          timestamptz default null
)
returns table (
  assigned_to           uuid,
  status                public.lead_status,
  leads                 bigint,
  first_contact_leads   bigint,
  first_contact_seconds numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with scoped as (
    select l.id, l.assigned_to, l.status, l.created_at
    from public.leads l
    where (p_store_id is null or l.store_id = p_store_id)
      and (p_campaign_id is null or l.campaign_id = p_campaign_id)
      and (p_from is null or l.created_at >= p_from)
      and (p_to is null or l.created_at < p_to)
      and (
        (select private.is_super_admin())
        or l.store_id in (select private.admin_store_ids())
        or l.assigned_to = (select auth.uid())
        or l.assigned_to is null
      )
  ),
  first_contact as (
    select e.lead_id, min(e.created_at) as at
    from public.lead_events e
    where e.type = 'STATUS_CHANGED'
      and e.payload ->> 'from' = 'NEW'
      and e.lead_id in (select s.id from scoped s)
    group by e.lead_id
  )
  select
    s.assigned_to,
    s.status,
    count(*),
    count(f.at),
    coalesce(sum(extract(epoch from (f.at - s.created_at))), 0)
  from scoped s
  left join first_contact f on f.lead_id = s.id
  group by s.assigned_to, s.status;
$$;

-- ---------------------------------------------------------------------
-- lead_events: CPF_REVEALED (auditoria) visível só para STORE_ADMIN da
-- loja e SUPER_ADMIN. SDR continua vendo os demais eventos da loja.
-- ---------------------------------------------------------------------
drop policy lead_events_select on public.lead_events;

create policy lead_events_select on public.lead_events
  for select to authenticated
  using (
    (select private.is_super_admin())
    or store_id in (select private.admin_store_ids())
    or (store_id in (select private.user_store_ids()) and type <> 'CPF_REVEALED')
  );

-- ---------------------------------------------------------------------
-- GRANTs: as funções nascem sem EXECUTE para PUBLIC/anon/authenticated
-- (default privileges da Fase 2); libera só para usuários logados.
-- ---------------------------------------------------------------------
revoke all on function
  public.assign_lead(uuid, uuid),
  public.reveal_lead_cpf(uuid),
  public.store_team(),
  public.lead_kpis(uuid, uuid, timestamptz, timestamptz),
  private.log_lead_assigned(),
  private.can_work_lead(uuid)
from public, anon, authenticated;

-- Avaliada dentro da policy de lead_notes (executa com o papel do usuário).
grant execute on function private.can_work_lead(uuid) to authenticated, service_role;

grant execute on function
  public.assign_lead(uuid, uuid),
  public.reveal_lead_cpf(uuid),
  public.store_team(),
  public.lead_kpis(uuid, uuid, timestamptz, timestamptz)
to authenticated;
