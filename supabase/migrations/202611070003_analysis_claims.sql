-- Prevent concurrent import processes from calling OpenAI for the same image.
-- Claims older than five minutes are considered abandoned; /analyze itself has
-- a 75-second OpenAI timeout.

create table public.style_image_analysis_claims (
  image_id text primary key,
  claimed_at timestamptz not null default now()
);

alter table public.style_image_analysis_claims enable row level security;

grant select, insert, delete on table public.style_image_analysis_claims to service_role;

create or replace function public.claim_style_image_analysis(p_image_id text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted_count integer;
begin
  delete from public.style_image_analysis_claims
  where image_id = p_image_id
    and claimed_at < now() - interval '5 minutes';

  insert into public.style_image_analysis_claims (image_id)
  values (p_image_id)
  on conflict (image_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count = 1;
end;
$$;

create or replace function public.release_style_image_analysis(p_image_id text)
returns void
language sql
security invoker
set search_path = public
as $$
  delete from public.style_image_analysis_claims where image_id = p_image_id
$$;

revoke all on function public.claim_style_image_analysis(text) from public, anon, authenticated;
revoke all on function public.release_style_image_analysis(text) from public, anon, authenticated;
grant execute on function public.claim_style_image_analysis(text) to service_role;
grant execute on function public.release_style_image_analysis(text) to service_role;

comment on table public.style_image_analysis_claims is
  'Short-lived per-image claims preventing duplicate OpenAI analysis calls.';
