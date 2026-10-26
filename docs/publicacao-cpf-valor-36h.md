# Publicação — bloqueio de CPF (10 dias úteis), valor ilustrativo e validade de 36 h

Roteiro para levar à produção a migration `20261026120000_cpf_cooldown_illustrative_value`, o KAPA Leads e a
Fábrica de Aprovação. **Cada etapa só começa com autorização explícita do responsável e com a anterior verificada.**
Regras completas: [`integracao-landing-page.md` §5.1–5.2](integracao-landing-page.md).

## Por que esta ordem

| Situação durante a publicação | Efeito |
|---|---|
| Banco novo + API antiga | Vitrine/Duelo normais. RCAR: lead criado (o banco já grava valor/validade); CPF bloqueado recebe `500` em vez de `409` (a LP mostra o erro genérico). `delete_lead` compatível. **Janela curta, aceitável.** |
| API nova + banco antigo | **Quebra TODOS os leads, inclusive Vitrine** (colunas inexistentes). Nunca publicar a API antes da migration. |
| API nova + LP antiga | Funciona: a LP antiga ignora `simulation` e mostra o valor local; `409` vira erro genérico. |
| LP nova + API antiga | Tela final sem o cartão do valor. Nunca publicar a LP antes da API. |

Ordem: **1. migration → 2. KAPA Leads (logo em seguida) → 3. Fábrica de Aprovação.**

## 0. Antes de começar (somente leitura, com autorização explícita)

Nada aqui escreve em produção. O classificador de segurança do agente bloqueia leituras de produção: a etapa é feita
pelo responsável (SQL Editor do Supabase de produção) ou pelo agente com autorização explícita para estas consultas.

1. Código final commitado nos dois repositórios; suítes do DEV verdes (unit, api, rls, admin, e2e; LP unit + E2E);
   Política e Termos com `approved: true` e `effectiveDate` real (senão o build da LP falha de propósito).
2. **Vercel (só leitura):** anotar o deployment de produção atual de `kapa-leads-platform` e de `fabrica-de-aprovacao`
   (alvos de rollback) e conferir que as variáveis de produção não mudaram — na LP, `NEXT_PUBLIC_KAPA_CONSENT_VERSION`
   continua `2026-10-v1` e a API é `https://leads.assessoriakapa.com.br`.
3. **Linha de base:** `npm run prod:check` (contagens, sem dados pessoais) — guardar a saída.
4. **Pré-requisitos do banco de produção** — colar no SQL Editor de produção (transação somente leitura):

```sql
begin;
set transaction read only;
select
  -- Banco e extensões
  current_setting('server_version')                                                      as pg_versao,          -- 15+ (DEV: 17)
  (select extnamespace::regnamespace::text from pg_extension where extname = 'pgcrypto') as pgcrypto_schema,    -- extensions
  to_regprocedure('extensions.hmac(bytea,bytea,text)') is not null                       as hmac_ok,            -- true
  to_regprocedure('extensions.gen_random_bytes(integer)') is not null                    as random_ok,          -- true
  (select count(*) from pg_available_extensions where name = 'pg_cron')                  as pg_cron_disponivel, -- 1 (obrigatório: limpeza diária)
  -- Histórico de migrations
  (select max(version) from supabase_migrations.schema_migrations)                       as ultima_migration,   -- 20261016120000
  (select count(*) from supabase_migrations.schema_migrations)                           as qtd_migrations,     -- 7
  -- Nomes que a migration cria não podem existir
  to_regclass('private.secrets') is null and to_regclass('private.cpf_cooldowns') is null
    and to_regclass('public.lgpd_cpf_cooldown_releases') is null                    as tabelas_livres,     -- true
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name in ('leads', 'campaigns')
      and (column_name like 'illustrative%' or column_name like 'cpf_cooldown%'))         as colunas_existentes, -- 0
  -- Funções que a migration substitui
  (select string_agg(oid::regprocedure::text, ', ') from pg_proc where proname = 'delete_lead')          as delete_lead,     -- delete_lead(uuid)
  (select string_agg(proowner::regrole::text, ', ') from pg_proc
    where proname in ('leads_before_insert', 'leads_guard_immutable'))                                   as dono_triggers,   -- postgres, postgres
  (select count(*) from pg_trigger where tgrelid = 'public.leads'::regclass and not tgisinternal
    and tgname in ('leads_before_insert', 'leads_guard_immutable'))                                      as triggers_leads,  -- 2
  -- Campanha que a migration configura (e nenhuma outra)
  (select count(*) from public.campaigns c join public.stores s on s.id = c.store_id
    where (s.slug, c.slug) in (('rcar-seminovos', 'fabrica-de-aprovacao'), ('rcar-seminovos-dev', 'fabrica-de-aprovacao-dev'))) as campanhas_alvo, -- 1
  (select c.is_active and s.is_active from public.campaigns c join public.stores s on s.id = c.store_id
    where s.slug = 'rcar-seminovos' and c.slug = 'fabrica-de-aprovacao')                                 as fabrica_ativa,   -- true
  (select c.consent_version from public.campaigns c join public.stores s on s.id = c.store_id
    where s.slug = 'rcar-seminovos' and c.slug = 'fabrica-de-aprovacao')                                 as consent_fabrica, -- 2026-10-v1
  (select 'https://fabricadeaprovacao.assessoriakapa.com.br' = any(c.allowed_origins)
     from public.campaigns c join public.stores s on s.id = c.store_id
    where s.slug = 'rcar-seminovos' and c.slug = 'fabrica-de-aprovacao')                                 as origem_fabrica,  -- true
  (select c.is_active from public.campaigns c join public.stores s on s.id = c.store_id
    where s.slug = 'vitrine-veiculos' and c.slug = 'duelo-de-aprovacoes')                                as duelo_ativa,     -- true
  -- Linha de base de dados (só contagens)
  (select count(*) from public.leads)                                                                    as leads_total,
  (select count(*) from public.leads l join public.stores s on s.id = l.store_id where s.slug = 'rcar-seminovos')   as leads_rcar,
  (select count(*) from public.leads l join public.stores s on s.id = l.store_id where s.slug = 'vitrine-veiculos') as leads_vitrine;
rollback;
```

5. **Critério:** qualquer valor diferente do comentado → **parar** e analisar antes da etapa 1. Guardar `leads_total`,
   `leads_rcar` e `leads_vitrine` para comparar depois de cada etapa (só podem crescer por leads reais).
6. `npm run db:compare` (DEV x produção, só leitura): a única diferença esperada é o conjunto de objetos da migration
   `20261026120000` e `20261027120000` (colunas novas, `private.secrets`, `private.cpf_cooldowns`, funções do calendário,
   `cpf_cooldown_key`, `purge_expired_cpf_cooldowns`, `lgpd_*`, `public.lgpd_cpf_cooldown_releases`,
   `delete_lead(uuid, boolean, boolean)`, extensão `pg_cron`).

## 1. Migration em produção

1. `npx supabase link --project-ref <ref de produção>`.
2. `npx supabase db push --linked --dry-run` → deve listar **somente** `20261026120000_cpf_cooldown_illustrative_value.sql`
   e `20261027120000_cpf_cooldown_daily_cleanup.sql` (nessa ordem).
3. `npx supabase db push --linked` (com autorização).
4. Voltar o CLI ao DEV: `npx supabase link --project-ref esnyxwtyrciiaspgpsch`.
5. Verificar (SELECT):

```sql
select
  (select max(version) from supabase_migrations.schema_migrations) as ultima,               -- 20261027120000
  (select count(*) from private.secrets) as chave_hmac,                                      -- 1
  (select string_agg(s.slug || '/' || c.slug, ', ') from public.campaigns c join public.stores s on s.id = c.store_id
    where c.cpf_cooldown_business_days is not null or c.illustrative_min_cents is not null) as campanhas_com_regra,
                                                                                              -- só rcar-seminovos/fabrica-de-aprovacao
  (select count(*) from public.leads where illustrative_amount_cents is not null) as leads_com_valor, -- 0 (antigos intocados)
  (select string_agg(oid::regprocedure::text, ', ') from pg_proc where proname = 'delete_lead') as delete_lead,
                                                                                              -- delete_lead(uuid,boolean,boolean)
  (select count(*) from cron.job where jobname = 'kapa_purge_expired_cpf_cooldowns'
    and schedule = '17 6 * * *' and active) as job_limpeza,                                 -- 1
  (select count(*) from public.lgpd_cpf_cooldown_releases) as auditoria_lgpd;                -- 0
```

6. `npm run db:compare` (DEV x produção) → estruturas iguais. `npm run prod:check` → mesmos números da linha de base.

**Falhou?** O `db push` roda em transação: erro = nada aplicado. Aplicada mas com problema → (a) API ainda é a antiga,
basta rodar no SQL Editor, nesta ordem, `supabase/rollbacks/20261027120000_cpf_cooldown_daily_cleanup.down.sql` e
`supabase/rollbacks/20261026120000_cpf_cooldown_illustrative_value.down.sql` (um bloco cada). Testado no DEV em
26/10/2026 (rollback e reaplicação completos): volta exatamente ao estado anterior, sem perder leads. Se só a
`20261027120000` falhar (ex.: pg_cron indisponível), a `20261026120000` pode seguir sozinha: a limpeza continua a
cada novo lead, mas a Política ("limpeza automática executada diariamente") deixaria de ser fiel — **não publicar a
LP** até resolver.

## 2. KAPA Leads (logo depois da migration)

1. Push da `main` do KAPA Leads (deploy automático na Vercel). Acompanhar até `Ready`.
2. Verificações:
   - `POST /api/public/leads` com `{}` → `400 INVALID_PAYLOAD`.
   - `OPTIONS` com `Origin: https://duelo.assessoriakapa.com.br` e `https://fabricadeaprovacao.assessoriakapa.com.br` → `204`.
   - `npm run check:campaign -- --site https://fabricadeaprovacao.assessoriakapa.com.br` (no repositório da LP) → OK, sem lead.
   - Admin: abrir um lead da Vitrine (sem o cartão novo) e a tela de exclusão (gerente vê o aviso do bloqueio só em campanhas com a regra).
   - Admin (KAPA): Configurações KAPA → **Pedidos LGPD** abre; gerente/SDR recebem "não encontrado".
   - Logs da Vercel: nenhum `5xx`/`INTERNAL_ERROR` em `/api/public/leads`.
   - `npm run prod:check` → igual à linha de base.

**Falhou?** Promover na Vercel o deployment anterior (anotado no passo 0). A API antiga funciona com o banco novo
(janela da tabela acima). Se for preciso desfazer também o banco: primeiro o rollback da API, depois o script de
rollback da migration — nunca o contrário.

## 3. Fábrica de Aprovação

0. **Pré-requisito:** Política e Termos aprovados em `lib/legal.ts` da LP (`approved: true` e `effectiveDate` = data da
   publicação nos dois; hoje estão em minuta e o build de produção **falha de propósito** até isso).
1. Push da `main` da LP (deploy automático). Acompanhar até `Ready`.
2. Verificações:
   - `npm run check:campaign -- --site https://fabricadeaprovacao.assessoriakapa.com.br` → OK.
   - Bundle sem DEV/E2E/localhost (mesma conferência das publicações anteriores).
   - Playwright 1440/390/360 com a API bloqueada: página, formulário, aviso `409` simulado e tela final com valor e
     cronômetro (API simulada), sem lead real.
   - Primeiro lead real (ou teste controlado autorizado, com CPF fictício válido): valor da LP = valor no Admin;
     cronômetro igual nos dois; nova tentativa do mesmo CPF → aviso dos 10 dias úteis. Depois do teste controlado, a
     KAPA exclui o lead marcando "Pedido de eliminação do titular (LGPD)" (remove também o bloqueio).

**Falhou?** Promover o deployment anterior da LP (a LP antiga funciona com a API e o banco novos).

## Plano de recuperação — resumo

| Falha em | Ação | Impacto |
|---|---|---|
| Migration | Transação desfaz sozinha; se aplicada com problema e API antiga → script de rollback | Nenhum lead perdido |
| KAPA Leads | Vercel: promover deployment anterior | API antiga funciona com o banco novo |
| Fábrica | Vercel: promover deployment anterior | LP antiga funciona com API/banco novos |
| Limpeza diária | `20261027120000...down.sql` (desagenda o job; a limpeza por novo lead continua) | Ajustar a Política antes de publicar a LP |
| Banco + API | Rollback da API **antes** do rollback do banco (2 → 1) | O rollback do banco apaga valores/validades, libera os CPFs bloqueados e apaga a auditoria LGPD (exportar antes) |

## Depois da publicação

- Avaliação de legítimo interesse (`fabrica-de-aprovacao/docs/avaliacao-legitimo-interesse-cpf-10-dias.md`): concluir a
  revisão jurídica e arquivar com a controladora.
- Feriado extraordinário no DF → nova migration ajustando `private.is_df_holiday`.
