-- =====================================================================
-- KAPA Leads Platform — Fase 2 / 5: GRANTs (privilégio mínimo)
--
-- Revoga o acesso de anon/authenticated APENAS nos objetos da KAPA e
-- concede de volta só o necessário. O RLS continua decidindo QUAIS
-- linhas. Objetos gerenciados pelo Supabase não são tocados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Objetos FUTUROS criados pelo role postgres nascem sem acesso público.
--
-- Funções: o Postgres concede EXECUTE a PUBLIC por padrão GLOBAL. Um
-- ALTER DEFAULT PRIVILEGES ... IN SCHEMA só soma privilégios ao padrão
-- global e não consegue removê-lo; por isso a revogação de PUBLIC é
-- global (sem IN SCHEMA). Vale só para funções criadas pelo role
-- postgres; funções do Supabase (supabase_admin) não são afetadas.
--
-- Tabelas/sequências: o padrão global já é "só o dono"; os acessos de
-- anon/authenticated vêm da regra do schema public, revogada aqui.
-- ---------------------------------------------------------------------
alter default privileges for role postgres
  revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

-- ---------------------------------------------------------------------
-- Revogação explícita nos objetos da KAPA
-- ---------------------------------------------------------------------
revoke all on public.stores, public.campaigns, public.profiles, public.store_members,
              public.leads, public.lead_notes, public.lead_events
  from anon, authenticated;
revoke all on sequence public.lead_events_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------
-- Schema private (criado e usado só pela KAPA): policies, constraints,
-- defaults e triggers.
-- ---------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

grant execute on function
  private.is_super_admin(),
  private.user_store_ids(),
  private.admin_store_ids(),
  private.is_valid_cpf(text),          -- avaliada pela CHECK de leads.cpf
  private.generate_campaign_key()      -- default de campaigns.campaign_key
to authenticated, service_role;

-- ---------------------------------------------------------------------
-- service_role (servidor; ignora RLS). Explícito para não depender de
-- defaults do projeto.
-- ---------------------------------------------------------------------
grant select, insert, update, delete
  on public.stores, public.campaigns, public.profiles, public.store_members,
     public.leads, public.lead_notes, public.lead_events
  to service_role;
grant usage, select on sequence public.lead_events_id_seq to service_role;

-- ---------------------------------------------------------------------
-- authenticated (usuários do Admin)
-- ---------------------------------------------------------------------

-- Leitura (linhas filtradas pelo RLS).
grant select on public.stores, public.campaigns, public.profiles,
                public.store_members, public.lead_notes, public.lead_events
  to authenticated;

-- leads: todas as colunas EXCETO cpf. O CPF completo só será exposto
-- por função controlada e auditada (evento CPF_REVEALED), fase futura.
-- Consequência: consultas devem listar colunas explicitamente (select=* falha).
grant select (
  id, store_id, campaign_id,
  full_name, cpf_masked, birth_date, phone, email,
  form_data, status,
  consent_version, consent_at, client_submission_id,
  utm_source, utm_medium, utm_campaign, utm_content, utm_term,
  page_url, referrer,
  created_at, updated_at
) on public.leads to authenticated;

-- Usuário da loja só altera o status do lead.
grant update (status) on public.leads to authenticated;

-- Notas: o cliente envia apenas lead_id e body.
grant insert (lead_id, body) on public.lead_notes to authenticated;

-- Perfil: só o nome. is_super_admin / is_active não são editáveis aqui.
grant update (full_name) on public.profiles to authenticated;

-- Escrita estrutural: concedida, mas o RLS só permite ao SUPER_ADMIN.
grant insert, update on public.stores, public.campaigns to authenticated;
grant insert (store_id, user_id, role, is_active) on public.store_members to authenticated;
grant update (role, is_active) on public.store_members to authenticated;
grant delete on public.store_members to authenticated;
