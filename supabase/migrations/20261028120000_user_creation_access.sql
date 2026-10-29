-- =====================================================================
-- KAPA Leads Platform — Acesso inicial do usuário criado pelo Admin
-- (inclusive Administrador Geral / SUPER_ADMIN) + auditoria de criação.
--
-- Fluxo (Configurações → Usuários → Novo usuário):
--   1. O servidor confere a sessão (SUPER_ADMIN) e cria a conta pela API
--      oficial do Supabase Auth (chave secreta; nada é gravado direto em auth.*).
--   2. Com o cliente DA SESSÃO, chama grant_new_user_access: o banco confere
--      de novo que quem chama é SUPER_ADMIN ativo e, numa única transação,
--      define o acesso (global OU vínculo com uma loja) e grava a auditoria.
--   3. Se o passo 2 falhar, o servidor apaga a conta recém-criada (nada fica
--      pela metade).
--
-- Proteções:
--   - Só SUPER_ADMIN ativo (Gerente/SDR → KL011, inclusive chamando a API REST).
--   - Só a conta RECÉM-CRIADA (10 min), ativa, sem acesso ainda (não é
--     SUPER_ADMIN, sem vínculo, sem auditoria) e que não é quem chama: a função
--     não serve para promover contas existentes nem a si mesmo (KL010).
--   - is_super_admin continua sem GRANT de UPDATE para authenticated: ninguém
--     se promove alterando o perfil pela API.
--
-- Erros (SQLSTATE):
--   42501  sem sessão
--   KL010  conta não elegível (inexistente, antiga, já com acesso) ou loja inexistente
--   KL011  quem chama não é SUPER_ADMIN ativo
--   22023  tipo de acesso inválido ou loja incompatível com o tipo
--
-- Rollback: supabase/rollbacks/20261028120000_user_creation_access.down.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Auditoria: quem criou cada usuário, com qual acesso. Sem senha, nunca.
-- ---------------------------------------------------------------------
create table public.user_creation_audit (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles (id) on delete set null,
  -- E-mail no momento da criação (o registro continua legível se a conta sair).
  email       text not null,
  access      text not null,
  store_id    uuid references public.stores (id) on delete set null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint user_creation_audit_access check (access in ('SUPER_ADMIN', 'STORE_ADMIN', 'STORE_USER')),
  constraint user_creation_audit_global check (access <> 'SUPER_ADMIN' or store_id is null)
);
-- Um registro de criação por conta (a função recusa a segunda chamada).
create unique index user_creation_audit_user_idx on public.user_creation_audit (user_id) where user_id is not null;
create index user_creation_audit_created_idx on public.user_creation_audit (created_at desc);

alter table public.user_creation_audit enable row level security;
revoke all on public.user_creation_audit from public, anon, authenticated;
-- Só leitura, só KAPA. Escrita apenas pela função abaixo (SECURITY DEFINER).
-- service_role (só servidor): leitura e remoção (limpeza dos testes no DEV).
grant select on public.user_creation_audit to authenticated;
grant select, delete on public.user_creation_audit to service_role;
create policy user_creation_audit_select on public.user_creation_audit
  for select to authenticated using ((select private.is_super_admin()));

-- ---------------------------------------------------------------------
-- grant_new_user_access(usuário, acesso, loja)
--   SUPER_ADMIN              → acesso global (sem loja)
--   STORE_ADMIN / STORE_USER → vínculo ativo com a loja informada
-- ---------------------------------------------------------------------
create function public.grant_new_user_access(p_user_id uuid, p_access text, p_store_id uuid default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not (select private.is_super_admin()) then
    raise exception 'forbidden' using errcode = 'KL011';
  end if;
  if p_access is null or p_access not in ('SUPER_ADMIN', 'STORE_ADMIN', 'STORE_USER') then
    raise exception 'invalid access' using errcode = '22023';
  end if;
  if (p_access = 'SUPER_ADMIN') <> (p_store_id is null) then
    raise exception 'store does not match access' using errcode = '22023';
  end if;

  select p.email into v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = p_user_id
    and p.id <> v_uid
    and u.created_at > now() - interval '10 minutes'
    and p.is_active
    and not p.is_super_admin
    and not exists (select 1 from public.store_members m where m.user_id = p.id)
    and not exists (select 1 from public.user_creation_audit a where a.user_id = p.id)
  for update of p;
  if not found then
    raise exception 'user not eligible' using errcode = 'KL010';
  end if;

  if p_access = 'SUPER_ADMIN' then
    update public.profiles set is_super_admin = true where id = p_user_id;
  else
    if not exists (select 1 from public.stores s where s.id = p_store_id) then
      raise exception 'store not found' using errcode = 'KL010';
    end if;
    insert into public.store_members (store_id, user_id, role, is_active)
    values (p_store_id, p_user_id, p_access::public.store_member_role, true);
  end if;

  insert into public.user_creation_audit (user_id, email, access, store_id, created_by)
  values (p_user_id, coalesce(v_email, ''), p_access, p_store_id, v_uid);
end;
$$;

revoke all on function public.grant_new_user_access(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.grant_new_user_access(uuid, text, uuid) to authenticated;
