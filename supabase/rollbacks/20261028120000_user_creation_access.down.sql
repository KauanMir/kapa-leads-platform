-- =====================================================================
-- ROLLBACK da migration 20261028120000_user_creation_access.sql
--
-- NÃO é migration (fica fora de supabase/migrations). Executar só com
-- autorização, num único bloco. Remove a função e a auditoria de criação.
-- Usuários, perfis e vínculos já criados NÃO são alterados (o acesso deles
-- continua como está). O código do Admin que chama a função precisa voltar
-- junto (sem ela, "Novo usuário" passa a falhar e desfaz a conta).
-- =====================================================================
begin;

drop function if exists public.grant_new_user_access(uuid, text, uuid);
drop table if exists public.user_creation_audit;

delete from supabase_migrations.schema_migrations where version = '20261028120000';

commit;
