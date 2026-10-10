-- =====================================================================
-- KAPA Leads Platform — Fase 2 / 1: extensões, schema privado, enums
-- e funções utilitárias puras (usadas por constraints e defaults).
-- =====================================================================

-- pgcrypto fornece gen_random_bytes (geração da campaign_key).
create extension if not exists pgcrypto with schema extensions;

-- Schema "private": NÃO é exposto pela Data API (PostgREST).
-- Guarda funções auxiliares de autorização e triggers.
create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

-- Papel do usuário dentro de uma loja. SUPER_ADMIN não é papel de loja:
-- fica em profiles.is_super_admin (acima de todas as lojas).
create type public.store_member_role as enum ('STORE_ADMIN', 'STORE_USER');

-- Nomes genéricos: servem a qualquer loja/campanha.
create type public.lead_status as enum ('NEW', 'CONTACTED', 'IN_PROGRESS', 'WON', 'LOST');

-- CREATED, STATUS_CHANGED e NOTE_ADDED são gerados nesta fase.
-- Os demais ficam preparados para fases futuras.
create type public.lead_event_type as enum (
  'CREATED',
  'STATUS_CHANGED',
  'NOTE_ADDED',
  'WHATSAPP_OPENED',
  'PHONE_CLICKED',
  'CPF_REVEALED',
  'ASSIGNED'
);

-- ---------------------------------------------------------------------
-- Funções utilitárias puras
-- ---------------------------------------------------------------------

-- Valida CPF (11 dígitos, sem máscara) incluindo dígitos verificadores.
-- Rejeita sequências repetidas (000..., 111..., ...).
create function private.is_valid_cpf(p_cpf text)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_digits int[];
  v_sum int;
  v_check int;
begin
  if p_cpf !~ '^[0-9]{11}$' or p_cpf = repeat(left(p_cpf, 1), 11) then
    return false;
  end if;

  for i in 1..11 loop
    v_digits[i] := substr(p_cpf, i, 1)::int;
  end loop;

  -- 1º dígito verificador: pesos 10..2
  v_sum := 0;
  for i in 1..9 loop
    v_sum := v_sum + v_digits[i] * (11 - i);
  end loop;
  v_check := (v_sum * 10) % 11;
  if v_check = 10 then v_check := 0; end if;
  if v_check <> v_digits[10] then
    return false;
  end if;

  -- 2º dígito verificador: pesos 11..2
  v_sum := 0;
  for i in 1..10 loop
    v_sum := v_sum + v_digits[i] * (12 - i);
  end loop;
  v_check := (v_sum * 10) % 11;
  if v_check = 10 then v_check := 0; end if;

  return v_check = v_digits[11];
end;
$$;

-- Gera a campaign_key pública: camp_pk_ + 32 caracteres [a-z0-9]
-- (~165 bits de entropia). Identificador público, não segredo.
-- Bytes >= 252 são descartados para evitar viés do módulo (252 = 7 * 36).
create function private.generate_campaign_key()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  c_alphabet constant text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  v_key text := '';
  v_bytes bytea;
  v_byte int;
begin
  while char_length(v_key) < 32 loop
    v_bytes := extensions.gen_random_bytes(32);
    for i in 0..31 loop
      v_byte := get_byte(v_bytes, i);
      if v_byte < 252 and char_length(v_key) < 32 then
        v_key := v_key || substr(c_alphabet, (v_byte % 36) + 1, 1);
      end if;
    end loop;
  end loop;

  return 'camp_pk_' || v_key;
end;
$$;
