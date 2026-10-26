-- =====================================================================
-- KAPA Leads Platform — Bloqueio de CPF por dias úteis e valor ilustrativo
-- da simulação (campanha Fábrica de Aprovação / RCAR).
--
-- 1. Bloqueio de CPF (campaigns.cpf_cooldown_business_days)
--    Uma solicitação aceita numa campanha com a regra ligada impede outra do
--    mesmo CPF NA MESMA LOJA até leads.cpf_cooldown_until. Outras lojas nunca
--    são afetadas; campanhas sem a regra (ex.: Vitrine) não bloqueiam nem são
--    bloqueadas.
--      • Calendário de Brasília (America/Sao_Paulo).
--      • O dia da solicitação nunca conta (dia 0). A contagem começa no
--        primeiro dia útil seguinte.
--      • Dia útil = segunda a sexta, exceto feriados nacionais e os feriados
--        locais do DF (private.is_df_holiday). Pontos facultativos (Carnaval,
--        Quarta-feira de Cinzas, vésperas) contam como dias úteis.
--      • O bloqueio termina às 00:00 (Brasília) do dia seguinte ao N-ésimo dia
--        útil — a partir desse instante, nova solicitação é aceita.
--      Ex.: N = 10, pedido na segunda 26/10/2026 → dias úteis 27, 28, 29, 30/10,
--      03, 04, 05, 06, 09, 10/11 (02/11 é Finados) → liberado em 11/11/2026 00:00.
--    Concorrência: trava transacional (pg_advisory_xact_lock) por loja + CPF;
--    duas requisições simultâneas são serializadas e só a primeira passa.
--    Idempotência: o próprio envio (mesmos campaign_id + client_submission_id)
--    não se bloqueia; segue para a UNIQUE e a API devolve o lead original.
--
--    Registro do bloqueio (private.cpf_cooldowns), SEPARADO do lead: excluir o
--    lead no Admin NÃO libera o CPF. Minimização (LGPD): o registro guarda só a
--    loja, um código HMAC-SHA256 do CPF (chave secreta que nunca sai do banco,
--    private.secrets) e o fim do bloqueio — sem CPF, nome, telefone nem id do
--    lead. É pseudonimização (o controlador ainda consegue reidentificar), por
--    isso o registro vencido é removido por private.purge_expired_cpf_cooldowns()
--    — a cada novo lead e na limpeza diária (pg_cron, migration 20261027120000) —
--    e pode ser eliminado antes, a pedido do titular, só pela KAPA (SUPER_ADMIN),
--    com motivo, confirmação de identidade e auditoria sem CPF
--    (public.lgpd_cpf_cooldown_releases):
--      lgpd_cpf_cooldown_lookup(cpf)                        → lojas com registro
--      lgpd_release_cpf_cooldown(loja, cpf, motivo, true)   → com ou sem lead
--      delete_lead(lead, true, p_identity_verified => true) → junto com o lead
--    leads.cpf_cooldown_until fica no lead só como informação.
--
-- 2. Valor ilustrativo (campaigns.illustrative_*)
--    Definido pelo BANCO no INSERT do lead e gravado no próprio lead:
--      leads.illustrative_amount_cents  valor mostrado ao cliente
--      leads.illustrative_presented_at  início da validade (= registro do lead)
--      leads.illustrative_expires_at    fim da validade (presented_at + N horas)
--    O valor deriva só do client_submission_id (md5), dentro da faixa e do
--    passo da campanha; milhares redondos (ex.: R$ 60.000,00) são deslocados
--    em R$ 250. Nunca usa CPF, idade ou outro dado pessoal. NÃO é análise,
--    pré-aprovação nem limite de crédito. Imutável depois de criado.
--
-- Leads existentes não são alterados (colunas novas ficam null).
-- Novos códigos de erro (SQLSTATE):
--   KL005  CPF com solicitação recente na mesma loja (bloqueio vigente)
--   KL006  chave do HMAC ausente (configuração do banco; nunca deve ocorrer)
-- delete_lead ganha p_release_cpf_cooldown e p_identity_verified (padrão false;
-- liberar só SUPER_ADMIN → KL011; sem identidade verificada → 22023).
-- Funções LGPD: não SUPER_ADMIN → KL011; CPF/motivo/identidade inválidos → 22023;
-- loja inexistente → KL010.
--
-- Rollback: supabase/rollbacks/20261026120000_cpf_cooldown_illustrative_value.down.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Configuração por campanha (null = regra desligada)
-- ---------------------------------------------------------------------
alter table public.campaigns
  add column cpf_cooldown_business_days smallint,
  add column illustrative_min_cents integer,
  add column illustrative_max_cents integer,
  add column illustrative_step_cents integer,
  add column illustrative_validity_hours smallint,
  add constraint campaigns_cpf_cooldown_range check (
    cpf_cooldown_business_days is null or cpf_cooldown_business_days between 1 and 60
  ),
  add constraint campaigns_illustrative_config check (
    (illustrative_min_cents is null and illustrative_max_cents is null
      and illustrative_step_cents is null and illustrative_validity_hours is null)
    or (illustrative_min_cents > 0
      and illustrative_max_cents > illustrative_min_cents
      and illustrative_step_cents > 0
      and (illustrative_max_cents - illustrative_min_cents) % illustrative_step_cents = 0
      and illustrative_validity_hours between 1 and 720)
  );

-- ---------------------------------------------------------------------
-- Dados gravados no lead (preenchidos só pelo trigger)
-- ---------------------------------------------------------------------
alter table public.leads
  add column illustrative_amount_cents integer,
  add column illustrative_presented_at timestamptz,
  add column illustrative_expires_at timestamptz,
  add column cpf_cooldown_until timestamptz,
  add constraint leads_illustrative_consistent check (
    (illustrative_amount_cents is null and illustrative_presented_at is null and illustrative_expires_at is null)
    or (illustrative_amount_cents > 0
      and illustrative_presented_at is not null
      and illustrative_expires_at > illustrative_presented_at)
  );

-- Admin lê o valor e a validade. cpf_cooldown_until fica sem GRANT (uso interno).
grant select (illustrative_amount_cents, illustrative_presented_at, illustrative_expires_at)
  on public.leads to authenticated;

-- ---------------------------------------------------------------------
-- Registro do bloqueio de CPF (sobrevive à exclusão operacional do lead)
-- ---------------------------------------------------------------------

-- Segredos internos do banco (nunca expostos: schema private, sem GRANT).
create table private.secrets (
  name   text primary key,
  value  bytea not null
);
alter table private.secrets enable row level security;
revoke all on private.secrets from public, anon, authenticated;

-- Chave do HMAC do CPF: aleatória, própria de cada banco (DEV ≠ produção).
insert into private.secrets (name, value)
values ('cpf_cooldown_hmac', extensions.gen_random_bytes(32));

create table private.cpf_cooldowns (
  store_id       uuid not null references public.stores (id) on delete cascade,
  -- HMAC-SHA256(CPF só dígitos, private.secrets 'cpf_cooldown_hmac'). Nunca o CPF.
  cpf_key        bytea not null,
  blocked_until  timestamptz not null,
  primary key (store_id, cpf_key),
  constraint cpf_cooldowns_key_length check (octet_length(cpf_key) = 32)
);
create index cpf_cooldowns_blocked_until_idx on private.cpf_cooldowns (blocked_until);
alter table private.cpf_cooldowns enable row level security;
revoke all on private.cpf_cooldowns from public, anon, authenticated;

-- Limpeza dos registros vencidos (só blocked_until <= agora). Uma única lógica,
-- usada a cada novo lead (trigger) e pela limpeza diária (pg_cron, migration
-- 20261027120000). Devolve quantos registros saíram.
create function private.purge_expired_cpf_cooldowns()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with removed as (
    delete from private.cpf_cooldowns where blocked_until <= now() returning 1
  )
  select count(*)::integer from removed;
$$;

-- Código do CPF para o registro (mesmo CPF → mesmo código neste banco).
create function private.cpf_cooldown_key(p_cpf text)
returns bytea
language sql
stable
strict
set search_path = ''
as $$
  select extensions.hmac(convert_to(p_cpf, 'UTF8'), s.value, 'sha256')
  from private.secrets s
  where s.name = 'cpf_cooldown_hmac';
$$;

-- ---------------------------------------------------------------------
-- Calendário (Brasília / Distrito Federal)
-- ---------------------------------------------------------------------

-- Domingo de Páscoa (calendário gregoriano; algoritmo de Meeus/Jones/Butcher).
create function private.easter_sunday(p_year integer)
returns date
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  a int := p_year % 19;
  b int := p_year / 100;
  c int := p_year % 100;
  d int := b / 4;
  e int := b % 4;
  f int := (b + 8) / 25;
  g int := (b - f + 1) / 3;
  h int := (19 * a + b - d - g + 15) % 30;
  i int := c / 4;
  k int := c % 4;
  l int := (32 + 2 * e + 2 * i - h - k) % 7;
  m int := (a + 11 * h + 22 * l) / 451;
  v_month int := (h + l - 7 * m + 114) / 31;
  v_day int := ((h + l - 7 * m + 114) % 31) + 1;
begin
  return make_date(p_year, v_month, v_day);
end;
$$;

-- Feriados nacionais e locais do DF (Decreto distrital nº 48.117/2025):
--   01/01 Confraternização Universal · Sexta-feira da Paixão (Páscoa − 2)
--   21/04 Tiradentes e Aniversário de Brasília · 01/05 Dia do Trabalho
--   Corpus Christi (Páscoa + 60, local — Lei distrital nº 72/1989)
--   07/09 Independência · 12/10 N. Sra. Aparecida · 02/11 Finados
--   15/11 Proclamação da República · 20/11 Consciência Negra (Lei 14.759/2023)
--   30/11 Dia do Evangélico (local — Lei distrital nº 963/1995) · 25/12 Natal
-- Pontos facultativos NÃO entram. Feriado novo/extraordinário → nova migration.
create function private.is_df_holiday(p_day date)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_easter date := private.easter_sunday(extract(year from p_day)::int);
begin
  return to_char(p_day, 'MM-DD') in (
           '01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '11-30', '12-25'
         )
      or p_day = v_easter - 2
      or p_day = v_easter + 60;
end;
$$;

create function private.is_business_day_df(p_day date)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select extract(isodow from p_day) < 6 and not private.is_df_holiday(p_day);
$$;

-- Fim do bloqueio: 00:00 de Brasília do dia seguinte ao N-ésimo dia útil
-- contado a partir do dia seguinte ao da solicitação (regra no cabeçalho).
create function private.cpf_cooldown_end(p_requested_at timestamptz, p_business_days integer)
returns timestamptz
language plpgsql
stable
strict
set search_path = ''
as $$
declare
  v_day date := (p_requested_at at time zone 'America/Sao_Paulo')::date;
  v_counted int := 0;
begin
  if p_business_days < 1 then
    raise exception 'business days must be positive' using errcode = '22023';
  end if;
  while v_counted < p_business_days loop
    v_day := v_day + 1;
    if private.is_business_day_df(v_day) then
      v_counted := v_counted + 1;
    end if;
  end loop;
  return (v_day + 1)::timestamp at time zone 'America/Sao_Paulo';
end;
$$;

-- ---------------------------------------------------------------------
-- leads_before_insert: regras anteriores + bloqueio de CPF + valor ilustrativo
-- ---------------------------------------------------------------------
create or replace function private.leads_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id         uuid;
  v_consent_version  text;
  v_campaign_active  boolean;
  v_store_active     boolean;
  v_cooldown_days    smallint;
  v_min_cents        integer;
  v_max_cents        integer;
  v_step_cents       integer;
  v_validity_hours   smallint;
  v_steps            bigint;
  v_amount           integer;
  v_cpf_key          bytea;
begin
  select c.store_id, c.consent_version, c.is_active, s.is_active, c.cpf_cooldown_business_days,
         c.illustrative_min_cents, c.illustrative_max_cents, c.illustrative_step_cents, c.illustrative_validity_hours
    into v_store_id, v_consent_version, v_campaign_active, v_store_active, v_cooldown_days,
         v_min_cents, v_max_cents, v_step_cents, v_validity_hours
  from public.campaigns c
  join public.stores s on s.id = c.store_id
  where c.id = new.campaign_id;

  if not found then
    raise exception 'campaign not found' using errcode = 'KL001';
  end if;

  if not (v_campaign_active and v_store_active) then
    raise exception 'campaign inactive' using errcode = 'KL002';
  end if;

  if new.consent_version is distinct from v_consent_version then
    raise exception 'consent version mismatch' using errcode = 'KL003';
  end if;

  -- Retenção mínima: registros de bloqueio vencidos saem a cada novo lead
  -- (além da limpeza diária).
  perform private.purge_expired_cpf_cooldowns();

  -- Bloqueio de CPF por loja. A trava vale até o fim da transação: um INSERT
  -- concorrente do mesmo CPF na mesma loja espera e então enxerga o registro.
  if v_cooldown_days is not null then
    perform pg_advisory_xact_lock(hashtextextended('kapa:cpf-cooldown:' || v_store_id::text || ':' || new.cpf, 0));
    v_cpf_key := private.cpf_cooldown_key(new.cpf);
    if v_cpf_key is null then
      raise exception 'cpf cooldown key missing' using errcode = 'KL006';
    end if;
    new.cpf_cooldown_until := private.cpf_cooldown_end(now(), v_cooldown_days);

    -- Reenvio do mesmo pedido (lead ainda existe): não é bloqueio; a UNIQUE
    -- responde e a API devolve o lead original.
    if not exists (
      select 1 from public.leads l
      where l.campaign_id = new.campaign_id and l.client_submission_id = new.client_submission_id
    ) then
      if exists (
        select 1 from private.cpf_cooldowns c
        where c.store_id = v_store_id and c.cpf_key = v_cpf_key and c.blocked_until > now()
      ) then
        raise exception 'cpf cooldown' using errcode = 'KL005';
      end if;
      -- Se o INSERT do lead falhar depois daqui, a transação desfaz este registro.
      insert into private.cpf_cooldowns (store_id, cpf_key, blocked_until)
      values (v_store_id, v_cpf_key, new.cpf_cooldown_until)
      on conflict (store_id, cpf_key) do update set blocked_until = excluded.blocked_until;
    end if;
  else
    new.cpf_cooldown_until := null;
  end if;

  -- Valor ilustrativo: derivado só do identificador do pedido.
  if v_min_cents is not null then
    v_steps  := (v_max_cents - v_min_cents) / v_step_cents + 1;
    v_amount := v_min_cents
      + ((('x' || substr(md5(new.client_submission_id::text), 1, 15))::bit(60)::bigint % v_steps) * v_step_cents)::int;
    if v_amount % 100000 = 0 then
      v_amount := case when v_amount + 25000 <= v_max_cents then v_amount + 25000 else v_amount - 25000 end;
    end if;
    new.illustrative_amount_cents := v_amount;
    new.illustrative_presented_at := now();
    new.illustrative_expires_at   := now() + make_interval(hours => v_validity_hours);
  else
    new.illustrative_amount_cents := null;
    new.illustrative_presented_at := null;
    new.illustrative_expires_at   := null;
  end if;

  -- Valores sempre definidos pelo banco, ignorando o que foi enviado.
  new.store_id   := v_store_id;
  new.consent_at := now();
  new.status     := 'NEW';
  new.created_at := now();
  new.updated_at := now();

  return new;
end;
$$;

-- Campos que nunca mudam depois da criação do lead (+ valor, validade e bloqueio).
create or replace function private.leads_guard_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.store_id                  is distinct from old.store_id
  or new.campaign_id               is distinct from old.campaign_id
  or new.client_submission_id      is distinct from old.client_submission_id
  or new.consent_version           is distinct from old.consent_version
  or new.consent_at                is distinct from old.consent_at
  or new.created_at                is distinct from old.created_at
  or new.illustrative_amount_cents is distinct from old.illustrative_amount_cents
  or new.illustrative_presented_at is distinct from old.illustrative_presented_at
  or new.illustrative_expires_at   is distinct from old.illustrative_expires_at
  or new.cpf_cooldown_until        is distinct from old.cpf_cooldown_until then
    raise exception 'immutable lead field' using errcode = 'KL004';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Pedidos do titular (LGPD) sobre o registro de bloqueio — só SUPER_ADMIN.
--
-- Auditoria mínima: quem, quando, loja, motivo, canal, confirmação de identidade
-- e se havia registro. NUNCA o CPF, o código do CPF ou dados do lead.
-- ---------------------------------------------------------------------
create table public.lgpd_cpf_cooldown_releases (
  id                 bigint generated always as identity primary key,
  store_id           uuid not null references public.stores (id) on delete cascade,
  performed_by       uuid references public.profiles (id) on delete set null,
  -- ELIMINACAO / OPOSICAO: pedidos do art. 18; USO_INDEVIDO_TERCEIRO: CPF usado por outra pessoa.
  reason             text not null,
  -- PAINEL_LGPD: tela "Pedidos LGPD"; EXCLUSAO_LEAD: exclusão do lead com a opção LGPD.
  channel            text not null,
  identity_verified  boolean not null,
  record_found       boolean not null,
  created_at         timestamptz not null default now(),
  constraint lgpd_releases_reason check (reason in ('ELIMINACAO', 'OPOSICAO', 'USO_INDEVIDO_TERCEIRO')),
  constraint lgpd_releases_channel check (channel in ('PAINEL_LGPD', 'EXCLUSAO_LEAD')),
  constraint lgpd_releases_identity check (identity_verified)
);
create index lgpd_releases_created_idx on public.lgpd_cpf_cooldown_releases (created_at desc);

alter table public.lgpd_cpf_cooldown_releases enable row level security;
revoke all on public.lgpd_cpf_cooldown_releases from public, anon, authenticated;
-- Só leitura, só KAPA. Escrita apenas pelas funções abaixo (SECURITY DEFINER).
-- service_role: leitura no servidor, como nas demais tabelas (20261010120400).
grant select on public.lgpd_cpf_cooldown_releases to authenticated, service_role;
create policy lgpd_releases_select on public.lgpd_cpf_cooldown_releases
  for select to authenticated using ((select private.is_super_admin()));

-- Remove o registro de UMA loja e audita. Uso interno (funções abaixo).
create function private.release_cpf_cooldown(
  p_store_id uuid, p_cpf text, p_reason text, p_channel text, p_actor uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_found boolean;
begin
  with removed as (
    delete from private.cpf_cooldowns c
    where c.store_id = p_store_id and c.cpf_key = private.cpf_cooldown_key(p_cpf)
    returning 1
  )
  select exists (select 1 from removed) into v_found;

  insert into public.lgpd_cpf_cooldown_releases (store_id, performed_by, reason, channel, identity_verified, record_found)
  values (p_store_id, p_actor, p_reason, p_channel, true, v_found);
  return v_found;
end;
$$;

-- Valida o pedido: SUPER_ADMIN ativo, CPF normalizado (11 dígitos válidos).
create function private.assert_lgpd_operator(p_cpf text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not (select private.is_super_admin()) then
    raise exception 'forbidden' using errcode = 'KL011';
  end if;
  if p_cpf is null or p_cpf !~ '^[0-9]{11}$' or not private.is_valid_cpf(p_cpf) then
    raise exception 'invalid cpf' using errcode = '22023';
  end if;
  return v_uid;
end;
$$;

-- Em quais lojas este CPF tem registro (vigente ou vencido aguardando limpeza).
-- Devolve só loja e datas — nunca o código do CPF nem outros registros.
create function public.lgpd_cpf_cooldown_lookup(p_cpf text)
returns table (store_id uuid, store_name text, blocked_until timestamptz, active boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_lgpd_operator(p_cpf);
  return query
    select c.store_id, s.name, c.blocked_until, c.blocked_until > now()
    from private.cpf_cooldowns c
    join public.stores s on s.id = c.store_id
    where c.cpf_key = private.cpf_cooldown_key(p_cpf)
    order by s.name;
end;
$$;

-- Elimina o registro de UMA loja a pedido do titular, com ou sem lead.
-- Exige motivo válido e a confirmação de que a identidade foi verificada.
create function public.lgpd_release_cpf_cooldown(
  p_store_id uuid, p_cpf text, p_reason text, p_identity_verified boolean
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := private.assert_lgpd_operator(p_cpf);
  if p_reason is null or p_reason not in ('ELIMINACAO', 'OPOSICAO', 'USO_INDEVIDO_TERCEIRO') then
    raise exception 'invalid reason' using errcode = '22023';
  end if;
  if p_identity_verified is distinct from true then
    raise exception 'identity not verified' using errcode = '22023';
  end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id) then
    raise exception 'store not found' using errcode = 'KL010';
  end if;
  return private.release_cpf_cooldown(p_store_id, p_cpf, p_reason, 'PAINEL_LGPD', v_uid);
end;
$$;

-- ---------------------------------------------------------------------
-- delete_lead: mesmas regras de 20261016120000 + liberação opcional do
-- bloqueio de CPF, SÓ para a KAPA (SUPER_ADMIN), no atendimento a um pedido de
-- eliminação do titular (LGPD), com a identidade verificada e auditoria. A
-- exclusão operacional (gerente ou KAPA, sem o parâmetro) mantém o bloqueio.
-- Chamadas antigas (só p_lead_id) continuam valendo: os novos parâmetros têm
-- padrão false.
-- ---------------------------------------------------------------------
drop function public.delete_lead(uuid);

create function public.delete_lead(
  p_lead_id uuid, p_release_cpf_cooldown boolean default false, p_identity_verified boolean default false
)
returns void
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

  -- Trava a linha: atribuição/status simultâneos esperam a exclusão.
  select l.store_id, l.cpf into v_store_id, v_cpf
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

  if coalesce(p_release_cpf_cooldown, false) then
    if not (select private.is_super_admin()) then
      raise exception 'forbidden' using errcode = 'KL011';
    end if;
    if p_identity_verified is distinct from true then
      raise exception 'identity not verified' using errcode = '22023';
    end if;
    perform private.release_cpf_cooldown(v_store_id, v_cpf, 'ELIMINACAO', 'EXCLUSAO_LEAD', v_uid);
  end if;

  delete from public.leads where id = p_lead_id;
end;
$$;

revoke all on function public.delete_lead(uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.delete_lead(uuid, boolean, boolean) to authenticated;

revoke all on function
  public.lgpd_cpf_cooldown_lookup(text),
  public.lgpd_release_cpf_cooldown(uuid, text, text, boolean)
from public, anon, authenticated;
grant execute on function
  public.lgpd_cpf_cooldown_lookup(text),
  public.lgpd_release_cpf_cooldown(uuid, text, text, boolean)
to authenticated;

-- Funções novas: só uso interno (triggers). Sem EXECUTE para anon/authenticated.
revoke all on function
  private.easter_sunday(integer),
  private.is_df_holiday(date),
  private.is_business_day_df(date),
  private.cpf_cooldown_end(timestamptz, integer),
  private.cpf_cooldown_key(text),
  private.purge_expired_cpf_cooldowns(),
  private.release_cpf_cooldown(uuid, text, text, text, uuid),
  private.assert_lgpd_operator(text)
from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Liga as regras na campanha Fábrica de Aprovação (RCAR), produção e DEV.
-- Em bancos sem essas campanhas, nada muda. Valores em centavos:
-- R$ 35.000,00 a R$ 80.000,00, passo de R$ 50,00, validade de 36 h, 10 dias úteis.
-- ---------------------------------------------------------------------
update public.campaigns c
set cpf_cooldown_business_days  = 10,
    illustrative_min_cents      = 3500000,
    illustrative_max_cents      = 8000000,
    illustrative_step_cents     = 5000,
    illustrative_validity_hours = 36
from public.stores s
where s.id = c.store_id
  and (s.slug, c.slug) in (('rcar-seminovos', 'fabrica-de-aprovacao'), ('rcar-seminovos-dev', 'fabrica-de-aprovacao-dev'));
