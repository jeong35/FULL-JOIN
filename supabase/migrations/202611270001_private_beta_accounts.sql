-- Private Beta nickname+PIN credential boundary.
-- The four-digit PIN is verified only through a rate-limited bcrypt comparison.
-- Supabase Auth receives a random internal password; the PIN is never an Auth password.

create extension if not exists pgcrypto with schema extensions;

create table public.beta_accounts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  nickname_normalized text not null unique check (char_length(nickname_normalized) between 2 and 12),
  nickname_display text not null check (char_length(nickname_display) between 2 and 12),
  pin_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  last_failed_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.beta_accounts enable row level security;
revoke all on table public.beta_accounts from public, anon, authenticated;
grant all on table public.beta_accounts to service_role;

create or replace function public.provision_beta_account(
  p_auth_user_id uuid,
  p_nickname_normalized text,
  p_nickname_display text,
  p_pin text
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if char_length(p_nickname_normalized) not between 2 and 12
    or char_length(p_nickname_display) not between 2 and 12
    or p_pin !~ '^[0-9]{4}$' then
    raise exception 'invalid_beta_account';
  end if;
  insert into public.beta_accounts (
    auth_user_id, nickname_normalized, nickname_display, pin_hash
  ) values (
    p_auth_user_id, p_nickname_normalized, p_nickname_display,
    crypt(p_pin, gen_salt('bf', 11))
  );
end;
$$;

revoke all on function public.provision_beta_account(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.provision_beta_account(uuid, text, text, text) to service_role;

create or replace function public.verify_beta_login(
  p_nickname_normalized text,
  p_pin text
)
returns table (auth_user_id uuid, nickname text, outcome text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_account public.beta_accounts%rowtype;
  v_now timestamptz := now();
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_pin !~ '^[0-9]{4}$' then return; end if;

  select * into v_account
  from public.beta_accounts
  where nickname_normalized = p_nickname_normalized
  for update;
  if not found then
    perform crypt(p_pin, gen_salt('bf', 11));
    return;
  end if;
  if v_account.locked_until is not null and v_account.locked_until > v_now then return; end if;

  if crypt(p_pin, v_account.pin_hash) = v_account.pin_hash then
    update public.beta_accounts
    set failed_attempts = 0, last_failed_at = null, locked_until = null, updated_at = v_now
    where beta_accounts.auth_user_id = v_account.auth_user_id;
    return query select v_account.auth_user_id, v_account.nickname_display, 'ok'::text;
    return;
  end if;

  update public.beta_accounts
  set failed_attempts = least(5, case
        when last_failed_at is null or last_failed_at < v_now - interval '15 minutes' then 1
        else failed_attempts + 1 end),
      last_failed_at = v_now,
      locked_until = case
        when (case when last_failed_at is null or last_failed_at < v_now - interval '15 minutes' then 1 else failed_attempts + 1 end) >= 5
          then v_now + interval '15 minutes'
        else null end,
      updated_at = v_now
  where beta_accounts.auth_user_id = v_account.auth_user_id;
  return;
end;
$$;

revoke all on function public.verify_beta_login(text, text) from public, anon, authenticated;
grant execute on function public.verify_beta_login(text, text) to service_role;

comment on table public.beta_accounts is
  'Private Beta credentials. PINs are bcrypt hashes; access is service-role only.';
