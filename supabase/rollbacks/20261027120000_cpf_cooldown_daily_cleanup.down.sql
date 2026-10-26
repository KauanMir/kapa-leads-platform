-- =====================================================================
-- ROLLBACK da migration 20261027120000_cpf_cooldown_daily_cleanup.sql
--
-- NÃO é migration (fica fora de supabase/migrations). Executar só com
-- autorização, num único bloco. Remove só o agendamento; os registros de
-- bloqueio continuam sendo limpos a cada novo lead. A extensão pg_cron é
-- mantida (pode ter outros jobs; removê-la é decisão à parte).
-- =====================================================================
begin;

do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'kapa_purge_expired_cpf_cooldowns';
  end if;
end;
$$;

delete from supabase_migrations.schema_migrations where version = '20261027120000';

commit;
