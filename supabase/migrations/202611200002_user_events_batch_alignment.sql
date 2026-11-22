-- Align the production analytics prototype table with the canonical batched
-- /events contract without discarding previously collected events.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_events'
      and column_name = 'event_id'
  ) then
    alter table public.user_events
      add column if not exists device_id text;

    update public.user_events
    set
      device_id = coalesce(nullif(user_id, ''), 'legacy_' || session_id),
      properties = coalesce(properties, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'screen', screen_name,
        'duration_ms', duration_ms,
        'app_version', app_version
      ));

    alter table public.user_events
      rename column event_id to id;
    alter table public.user_events
      rename column occurred_at to client_ts;
    alter table public.user_events
      rename column event_name to name;
    alter table public.user_events
      rename column properties to props;

    alter table public.user_events
      drop column screen_name,
      drop column duration_ms,
      drop column app_version;

    alter table public.user_events
      alter column id set default gen_random_uuid(),
      alter column client_ts drop not null,
      alter column device_id set not null,
      alter column platform drop not null,
      alter column user_id drop not null;
  end if;
end
$$;

create index if not exists user_events_name_received_at_idx
  on public.user_events (name, received_at);
create index if not exists user_events_device_received_at_idx
  on public.user_events (device_id, received_at);
create index if not exists user_events_user_received_at_idx
  on public.user_events (user_id, received_at);

alter table public.user_events enable row level security;

revoke all on table public.user_events from public, anon, authenticated;
grant select, insert on table public.user_events to service_role;

comment on table public.user_events is
  'Anonymous batched app usage events for drop-off and goal metrics; see docs/EVENTS.md.';
