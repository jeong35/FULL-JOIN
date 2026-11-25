create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists public.notification_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  access_token uuid not null default gen_random_uuid(),
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.notification_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  subscription_id uuid not null references public.notification_subscriptions(id) on delete cascade,
  look_id text not null,
  scheduled_for timestamptz not null,
  timezone text not null default 'Asia/Seoul',
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'cancelled', 'failed')),
  error_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  provider_accepted_at timestamptz
);

create index if not exists notification_schedules_due_idx
  on public.notification_schedules (scheduled_for, id) where status = 'pending';
create index if not exists notification_schedules_user_idx
  on public.notification_schedules (user_id, created_at desc);
create unique index if not exists notification_schedules_one_pending_per_user
  on public.notification_schedules (user_id) where status = 'pending';

create table if not exists public.notification_dispatch_config (
  singleton boolean primary key default true check (singleton),
  token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);
insert into public.notification_dispatch_config (singleton) values (true) on conflict (singleton) do nothing;

alter table public.notification_subscriptions enable row level security;
alter table public.notification_schedules enable row level security;
alter table public.notification_dispatch_config enable row level security;

revoke all on public.notification_subscriptions, public.notification_schedules, public.notification_dispatch_config from anon, authenticated;
grant all on public.notification_subscriptions, public.notification_schedules, public.notification_dispatch_config to service_role;

create or replace function public.replace_notification_schedule(p_user text, p_subscription uuid, p_token uuid, p_look text, p_time timestamptz, p_timezone text)
returns setof public.notification_schedules language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user, 0));
  if not exists(select 1 from notification_subscriptions where id=p_subscription and user_id=p_user and access_token=p_token and revoked_at is null) then
    raise exception 'subscription_not_found';
  end if;
  update notification_schedules set status='cancelled', updated_at=now() where user_id=p_user and status in ('pending','sending');
  return query insert into notification_schedules(user_id,subscription_id,look_id,scheduled_for,timezone)
    values(p_user,p_subscription,p_look,p_time,p_timezone) returning *;
end $$;
revoke all on function public.replace_notification_schedule(text,uuid,uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.replace_notification_schedule(text,uuid,uuid,text,timestamptz,text) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'odit-notification-dispatch') then
    perform cron.unschedule('odit-notification-dispatch');
  end if;
  perform cron.schedule(
    'odit-notification-dispatch',
    '* * * * *',
    $cron$
      select net.http_post(
        url := 'https://gctbcanltqgcymdlplyr.supabase.co/functions/v1/notifications/dispatch',
        headers := jsonb_build_object('content-type', 'application/json'),
        body := jsonb_build_object(
          'token', (select token::text from public.notification_dispatch_config where singleton = true)
        ),
        timeout_milliseconds := 10000
      );
    $cron$
  );
end
$$;

comment on table public.notification_schedules is
  'Daily recommendation reminders. provider_accepted_at does not prove device delivery.';
