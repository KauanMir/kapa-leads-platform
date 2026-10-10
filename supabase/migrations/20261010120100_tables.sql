-- =====================================================================
-- KAPA Leads Platform — Fase 2 / 2: tabelas, FKs, constraints e índices
--
-- Hierarquia multi-tenant:  stores → campaigns → leads
-- store_id dos leads é SEMPRE derivado da campanha (trigger), nunca
-- confiado ao que a LP envia.
-- =====================================================================

-- ---------------------------------------------------------------------
-- stores
-- ---------------------------------------------------------------------
create table public.stores (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  name        text not null,
  logo_url    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint stores_slug_key unique (slug),
  constraint stores_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 64),
  constraint stores_name_length check (char_length(btrim(name)) between 1 and 150),
  constraint stores_logo_url_format check (logo_url is null or (logo_url ~ '^https://' and char_length(logo_url) <= 2048))
);

-- ---------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------
create table public.campaigns (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores (id) on update restrict on delete restrict,
  slug             text not null,
  name             text not null,
  -- Identificador público usado pela LP (campaignKey). Não é segredo.
  campaign_key     text not null default private.generate_campaign_key(),
  -- Versão do texto de consentimento vigente; a LP precisa enviar a mesma.
  consent_version  text not null,
  -- Origens (scheme://host[:port]) autorizadas a enviar leads (Fase 3).
  allowed_origins  text[] not null default '{}',
  -- Descreve como o Admin deve rotular/formatar as chaves de leads.form_data.
  -- Ex.: {"downPaymentCents": {"label": "Valor da entrada", "format": "money"}}
  form_schema      jsonb not null default '{}',
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint campaigns_campaign_key_key unique (campaign_key),
  constraint campaigns_store_slug_key unique (store_id, slug),
  -- Alvo da FK composta de leads (garante lead.store_id = campaign.store_id).
  constraint campaigns_id_store_key unique (id, store_id),
  constraint campaigns_campaign_key_format check (campaign_key ~ '^camp_pk_[a-z0-9]{32}$'),
  constraint campaigns_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 64),
  constraint campaigns_name_length check (char_length(btrim(name)) between 1 and 150),
  constraint campaigns_consent_version_format check (consent_version ~ '^[A-Za-z0-9._-]{1,32}$'),
  constraint campaigns_allowed_origins_valid check (
    array_position(allowed_origins, null) is null and cardinality(allowed_origins) <= 20
  ),
  constraint campaigns_form_schema_object check (
    jsonb_typeof(form_schema) = 'object' and octet_length(form_schema::text) <= 65536
  )
);

-- ---------------------------------------------------------------------
-- profiles (1:1 com auth.users, criado por trigger)
-- ---------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text,
  full_name       text,
  -- SUPER_ADMIN (KAPA): acima de todas as lojas.
  is_super_admin  boolean not null default false,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint profiles_full_name_length check (full_name is null or char_length(full_name) <= 150)
);

-- ---------------------------------------------------------------------
-- store_members (usuário ↔ loja; um usuário pode ter várias lojas)
-- ---------------------------------------------------------------------
create table public.store_members (
  store_id    uuid not null references public.stores (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.store_member_role not null default 'STORE_USER',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),

  primary key (store_id, user_id)
);

create index store_members_user_id_idx on public.store_members (user_id);

-- ---------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------
create table public.leads (
  id                    uuid primary key default gen_random_uuid(),
  -- Preenchido pelo trigger a partir da campanha (valor enviado é ignorado).
  store_id              uuid not null,
  campaign_id           uuid not null,

  full_name             text not null,
  -- CPF completo, só dígitos. Usuários do Admin NÃO têm SELECT nesta coluna.
  cpf                   text not null,
  -- Versão mascarada para leitura comum: ***.456.789-**
  cpf_masked            text generated always as (
                          '***.' || substr(cpf, 4, 3) || '.' || substr(cpf, 7, 3) || '-**'
                        ) stored,
  birth_date            date not null,
  phone                 text not null,
  email                 text,

  -- Campos específicos da campanha (interpretados via campaigns.form_schema).
  form_data             jsonb not null default '{}',

  status                public.lead_status not null default 'NEW',

  -- consent_at é definido pelo banco (trigger), nunca pelo cliente.
  consent_version       text not null,
  consent_at            timestamptz not null default now(),

  -- Idempotência: gerado pela LP a cada envio de formulário.
  client_submission_id  uuid not null,

  -- Tracking (colunas reais para filtros/relatórios futuros).
  utm_source            text,
  utm_medium            text,
  utm_campaign          text,
  utm_content           text,
  utm_term              text,
  page_url              text,
  referrer              text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- FK composta: o lead só existe se (campanha, loja) baterem.
  -- (campaigns.store_id já referencia stores, então a loja também é garantida.)
  constraint leads_campaign_store_fkey foreign key (campaign_id, store_id)
    references public.campaigns (id, store_id) on update restrict on delete restrict,

  -- Mesma submissão não gera dois leads na mesma campanha.
  -- (Intencionalmente NÃO existe unique por CPF.)
  constraint leads_campaign_submission_key unique (campaign_id, client_submission_id),
  -- Alvo das FKs compostas de lead_notes / lead_events.
  constraint leads_id_store_key unique (id, store_id),

  constraint leads_full_name_length check (char_length(btrim(full_name)) between 2 and 150),
  constraint leads_cpf_valid check (private.is_valid_cpf(cpf)),
  constraint leads_birth_date_range check (birth_date > date '1900-01-01'),
  constraint leads_phone_format check (phone ~ '^[0-9]{10,11}$'),
  constraint leads_email_format check (
    email is null or (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(email) <= 254)
  ),
  constraint leads_form_data_object check (
    jsonb_typeof(form_data) = 'object' and octet_length(form_data::text) <= 16384
  ),
  constraint leads_consent_version_format check (consent_version ~ '^[A-Za-z0-9._-]{1,32}$'),
  constraint leads_utm_length check (
    coalesce(char_length(utm_source), 0)   <= 255 and
    coalesce(char_length(utm_medium), 0)   <= 255 and
    coalesce(char_length(utm_campaign), 0) <= 255 and
    coalesce(char_length(utm_content), 0)  <= 255 and
    coalesce(char_length(utm_term), 0)     <= 255
  ),
  constraint leads_url_length check (
    coalesce(char_length(page_url), 0) <= 2048 and
    coalesce(char_length(referrer), 0)  <= 2048
  )
);

create index leads_store_created_idx on public.leads (store_id, created_at desc);
create index leads_campaign_created_idx on public.leads (campaign_id, created_at desc);
create index leads_store_status_created_idx on public.leads (store_id, status, created_at desc);

-- ---------------------------------------------------------------------
-- lead_notes (apenas inclusão; sem edição/remoção no MVP)
-- ---------------------------------------------------------------------
create table public.lead_notes (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null,
  -- Copiado do lead pelo trigger (RLS sem join).
  store_id    uuid not null,
  -- Definido pelo trigger como auth.uid().
  author_id   uuid references public.profiles (id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now(),

  constraint lead_notes_lead_store_fkey foreign key (lead_id, store_id)
    references public.leads (id, store_id) on update restrict on delete cascade,
  constraint lead_notes_body_length check (char_length(btrim(body)) between 1 and 5000)
);

create index lead_notes_lead_created_idx on public.lead_notes (lead_id, created_at);

-- ---------------------------------------------------------------------
-- lead_events (append-only; escrito somente por triggers/servidor)
-- ---------------------------------------------------------------------
create table public.lead_events (
  id          bigint generated always as identity primary key,
  lead_id     uuid not null,
  store_id    uuid not null,
  type        public.lead_event_type not null,
  -- null = sistema / API pública.
  actor_id    uuid references public.profiles (id) on delete set null,
  -- Nunca colocar CPF ou outros dados pessoais aqui.
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now(),

  constraint lead_events_lead_store_fkey foreign key (lead_id, store_id)
    references public.leads (id, store_id) on update restrict on delete cascade,
  constraint lead_events_payload_object check (jsonb_typeof(payload) = 'object')
);

create index lead_events_lead_created_idx on public.lead_events (lead_id, created_at);
