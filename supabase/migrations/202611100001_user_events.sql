-- 사용 기록(이벤트). 이탈 지점과 최종 목표(활성화·도달·재방문)를 재기 위해 앱이 /events로 보낸다.
-- 닉네임·숫자는 저장하지 않는다: user_id는 닉네임·숫자의 해시, device_id·session_id는 브라우저가 만든 무작위 값.
-- 이벤트 이름과 속성은 src/fulljoin/events.ts가 검사한다. 조회 쿼리는 docs/EVENTS.md.

create table public.user_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  client_ts timestamptz,
  device_id text not null,
  session_id text not null,
  platform text,
  user_id text,
  name text not null,
  props jsonb not null default '{}'::jsonb
);

create index user_events_name_received_at_idx on public.user_events (name, received_at);
create index user_events_device_received_at_idx on public.user_events (device_id, received_at);
create index user_events_user_received_at_idx on public.user_events (user_id, received_at);

alter table public.user_events enable row level security;

grant select, insert on table public.user_events to service_role;

comment on table public.user_events is
  'Anonymous app usage events (no nickname or PIN) for drop-off and goal metrics; see docs/EVENTS.md.';
