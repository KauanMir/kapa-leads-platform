-- Retrato da estrutura dos schemas public e private (somente leitura). Usado por
-- scripts/db-compare.mjs para provar que DEV e PRODUÇÃO têm a mesma estrutura.
select kind, item from (
  select 'column' as kind,
         format('%s.%s %s null=%s default=%s generated=%s', table_name, column_name, data_type, is_nullable, coalesce(column_default, '-'), is_generated) as item
    from information_schema.columns where table_schema = 'public'
  union all
  select 'enum', format('%s: %s', t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder))
    from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' group by t.typname
  union all
  select 'rls', format('%s enabled=%s forced=%s', c.relname, c.relrowsecurity, c.relforcerowsecurity)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'
  union all
  select 'policy', format('%s.%s %s %s using=%s check=%s', tablename, policyname, cmd, roles::text, coalesce(qual, '-'), coalesce(with_check, '-'))
    from pg_policies where schemaname = 'public'
  union all
  select 'function', format('%s.%s(%s) secdef=%s vol=%s src=%s config=%s', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef, p.provolatile, md5(p.prosrc), coalesce(array_to_string(p.proconfig, ','), '-'))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private')
  union all
  select 'trigger', format('%s: %s', c.relname, pg_get_triggerdef(t.oid))
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal
  union all
  select 'trigger-auth', format('%s: %s', c.relname, pg_get_triggerdef(t.oid))
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'auth' and not t.tgisinternal and pg_get_triggerdef(t.oid) like '%private.%'
  union all
  select 'constraint', format('%s.%s %s', c.relname, k.conname, pg_get_constraintdef(k.oid))
    from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
  union all
  select 'index', format('%s', indexdef) from pg_indexes where schemaname = 'public'
  union all
  select 'grant-table', format('%s %s %s', table_name, grantee, privilege_type)
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role', 'public')
  union all
  select 'grant-column', format('%s.%s %s %s', table_name, column_name, grantee, privilege_type)
    from information_schema.column_privileges
   where table_schema = 'public' and grantee in ('anon', 'authenticated')
  union all
  select 'grant-function', format('%s.%s %s %s', n.nspname, p.proname, r.rolname, has_function_privilege(r.oid, p.oid, 'EXECUTE'))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    cross join (select oid, rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) r
   where n.nspname in ('public', 'private')
  union all
  select 'grant-schema', format('%s %s usage=%s', s.nspname, r.rolname, has_schema_privilege(r.oid, s.oid, 'USAGE'))
    from pg_namespace s cross join (select oid, rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) r
   where s.nspname in ('public', 'private')
) s
order by kind, item;
