-- =====================================================================
-- ROLLBACK da migration 20261016120000_delete_lead.sql
--
-- NÃO é migration (fica fora de supabase/migrations). Executar só com
-- autorização, num único bloco. Remove apenas a função; leads já excluídos
-- NÃO voltam.
-- =====================================================================
begin;

drop function if exists public.delete_lead(uuid);

delete from supabase_migrations.schema_migrations where version = '20261016120000';

commit;
