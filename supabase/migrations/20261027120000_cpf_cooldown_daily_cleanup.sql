-- =====================================================================
-- KAPA Leads Platform — Limpeza diária dos registros de bloqueio de CPF.
--
-- Agenda no pg_cron (extensão do Supabase) a mesma limpeza usada a cada novo
-- lead: private.purge_expired_cpf_cooldowns() (migration 20261026120000), que
-- remove SÓ registros com bloqueio vencido (blocked_until <= agora). Não muda o
-- prazo de 10 dias úteis nem o bloqueio vigente.
--
-- Todo dia às 06:17 UTC (03:17 em Brasília): um registro vencido fica guardado
-- no máximo cerca de 24 h depois do vencimento (ou menos, se chegar um lead).
--
-- Idempotente: a extensão só é criada se faltar e o job é recriado pelo nome
-- (nunca fica duplicado). Histórico de execuções: cron.job_run_details.
--
-- Separada da 20261026120000 de propósito: se o pg_cron não estiver disponível,
-- esta falha sozinha (transação) sem impedir o restante.
--
-- Rollback: supabase/rollbacks/20261027120000_cpf_cooldown_daily_cleanup.down.sql
-- =====================================================================

create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'kapa_purge_expired_cpf_cooldowns';
end;
$$;

select cron.schedule(
  'kapa_purge_expired_cpf_cooldowns',
  '17 6 * * *',
  'select private.purge_expired_cpf_cooldowns()'
);
