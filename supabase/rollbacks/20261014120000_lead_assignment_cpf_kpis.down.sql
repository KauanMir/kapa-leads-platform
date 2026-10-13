-- =====================================================================
-- ROLLBACK da migration 20261014120000_lead_assignment_cpf_kpis.sql
--
-- NÃO é migration (fica fora de supabase/migrations). Executar só com
-- autorização, num único bloco (o próprio script também remove a versão
-- de supabase_migrations.schema_migrations).
--
-- Perde: os responsáveis atribuídos (coluna assigned_to). Os eventos
-- ASSIGNED e CPF_REVEALED já gravados permanecem no histórico.
-- =====================================================================
begin;

drop function if exists public.lead_kpis(uuid, uuid, timestamptz, timestamptz);
drop function if exists public.store_team();
drop function if exists public.reveal_lead_cpf(uuid);
drop function if exists public.assign_lead(uuid, uuid);

drop trigger if exists log_lead_assigned on public.leads;
drop function if exists private.log_lead_assigned();

-- Policy original da Fase 2 (todos os membros veem todos os eventos da loja).
drop policy if exists lead_events_select on public.lead_events;
create policy lead_events_select on public.lead_events
  for select to authenticated
  using (
    (select private.is_super_admin())
    or store_id in (select private.user_store_ids())
  );

revoke select (assigned_to) on public.leads from authenticated;
drop index if exists public.leads_store_assignee_created_idx;
alter table public.leads drop constraint if exists leads_assignee_member_fkey;
alter table public.leads drop column if exists assigned_to;

delete from supabase_migrations.schema_migrations where version = '20261014120000';

commit;
