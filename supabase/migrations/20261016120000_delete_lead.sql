-- =====================================================================
-- KAPA Leads Platform — Excluir lead (Admin).
--
-- Quem pode:
--   SUPER_ADMIN ativo                  → qualquer lead
--   STORE_ADMIN ativo da loja do lead  → leads da própria loja
--   STORE_USER (SDR)                   → nunca
--
-- Só por esta função (UM lead por chamada). Continua SEM GRANT de DELETE em
-- public.leads para authenticated: DELETE direto pela API REST segue negado.
--
-- Observações (lead_notes) e histórico (lead_events) saem junto pelas FKs
-- ON DELETE CASCADE já existentes, na mesma transação (tudo ou nada).
-- Campanha, loja e usuários não são tocados.
--
-- Erros (SQLSTATE), os mesmos de assign_lead/reveal_lead_cpf:
--   KL010  lead inexistente ou fora do alcance (outra loja, usuário/vínculo inativo)
--   KL011  sem permissão (membro da loja que não é gerente)
--
-- Rollback: supabase/rollbacks/20261016120000_delete_lead.down.sql
-- =====================================================================

create function public.delete_lead(p_lead_id uuid)
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

-- Nasce sem EXECUTE para PUBLIC/anon (default privileges da Fase 2); explícito.
revoke all on function public.delete_lead(uuid) from public, anon, authenticated;
grant execute on function public.delete_lead(uuid) to authenticated;
