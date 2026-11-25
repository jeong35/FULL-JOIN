-- ODIT peer-evaluation recovery (read-only)
-- Window: [2026-11-12 00:00, 2026-11-19 00:00) Asia/Seoul
--
-- Run in the Supabase SQL editor with a role that can SELECT the listed tables.
-- This file never inserts reconstructed rows into user_events. Every statement is
-- a SELECT inside a read-only transaction.
--
-- IMPORTANT COHORT NOTE
-- The database stores pseudonymous user_id values and has no peer-evaluator roster.
-- Before using the results as a cohort report, add the *hashed IDs only* of team,
-- demo, eval, smoke and synthetic accounts to excluded_exact below in every query,
-- or wrap this file with an equivalent reviewed exclusion table. The default rules
-- are deliberately conservative but cannot identify an unlabelled team account.

begin transaction read only;

-- 1. Source inventory. chat_* is intentionally checked through information_schema
-- so this query also works when the production tables have never been deployed.
select
  wanted.table_name,
  case when actual.table_name is null then 'unavailable' else 'current_snapshot' end as evidence_class
from (values
  ('user_events'), ('wardrobe_items'), ('hearts'),
  ('user_style_preferences'), ('style_images'),
  ('chat_conversations'), ('chat_messages'), ('llm_operation_metrics')
) wanted(table_name)
left join information_schema.tables actual
  using (table_name)
where actual.table_schema is null or actual.table_schema = 'public'
order by wanted.table_name;

-- 2. user_events coverage. A row can be inside the analysis window by client_ts or,
-- when client_ts is absent, received_at. Smoke rows are shown separately and are
-- never treated as peer activity.
with bounds as (
  select
    timestamptz '2026-11-12 00:00:00+09' as from_ts,
    timestamptz '2026-11-19 00:00:00+09' as to_ts
), classified as (
  select *,
    coalesce(client_ts, received_at) as effective_ts,
    (
      coalesce(user_id, '') ~* '(^|[-_])(eval|test|smoke|synthetic|demo)([-_]|$)'
      or coalesce(props->>'app_version', '') = 'analytics-smoke'
      or lower(coalesce(props->>'environment', '')) in ('test', 'smoke', 'synthetic')
      or lower(coalesce(props->>'is_test', 'false')) = 'true'
      or lower(coalesce(props->>'smoke_test', 'false')) = 'true'
    ) as is_synthetic
  from public.user_events
)
select
  count(*) as all_time_rows,
  min(received_at) as first_received_at,
  max(received_at) as last_received_at,
  count(*) filter (where effective_ts >= bounds.from_ts and effective_ts < bounds.to_ts) as window_rows,
  count(*) filter (
    where effective_ts >= bounds.from_ts and effective_ts < bounds.to_ts and is_synthetic
  ) as window_synthetic_rows,
  count(*) filter (
    where effective_ts >= bounds.from_ts and effective_ts < bounds.to_ts and not is_synthetic
  ) as window_eligible_rows,
  count(distinct user_id) filter (
    where effective_ts >= bounds.from_ts and effective_ts < bounds.to_ts
      and not is_synthetic and user_id is not null
  ) as window_eligible_identified_users
from classified cross join bounds;

-- Shared exclusion pattern used below:
--   1) obvious labelled test/demo IDs,
--   2) reviewed exact pseudonymous IDs.
-- Add rows to excluded_exact as needed, for example:
--   values ('reviewed-hash-1'), ('reviewed-hash-2')

-- 3. Provisional identifiable actors and surviving persisted actions.
with bounds as (
  select timestamptz '2026-11-12 00:00:00+09' from_ts,
         timestamptz '2026-11-19 00:00:00+09' to_ts
), excluded_exact(user_id) as (values (''::text)),
eligible_wardrobe as (
  select w.* from public.wardrobe_items w, bounds b
  where w.created_at >= b.from_ts and w.created_at < b.to_ts
    and w.user_id !~* '(^|[-_])(eval|test|smoke|synthetic|demo)([-_]|$)'
    and not exists (select 1 from excluded_exact x where x.user_id = w.user_id)
), eligible_hearts as (
  select h.* from public.hearts h, bounds b
  where h.saved_at >= b.from_ts and h.saved_at < b.to_ts
    and h.user_id !~* '(^|[-_])(eval|test|smoke|synthetic|demo)([-_]|$)'
    and not exists (select 1 from excluded_exact x where x.user_id = h.user_id)
), actors as (
  select user_id from eligible_wardrobe union select user_id from eligible_hearts
)
select
  (select count(*) from actors) as provisional_identifiers,
  (select count(distinct user_id) from eligible_wardrobe) as wardrobe_users,
  (select count(*) from eligible_wardrobe) as surviving_wardrobe_rows,
  (select count(distinct user_id) from eligible_hearts) as heart_users,
  (select count(*) from eligible_hearts) as surviving_heart_rows,
  (select count(*) from (
    select distinct w.user_id from eligible_wardrobe w
    join eligible_hearts h using (user_id)
  ) overlap) as both_users;

-- 4. Daily persisted activity. This is not DAU: a user who did neither surviving
-- action can still have used the app.
with bounds as (
  select timestamptz '2026-11-12 00:00:00+09' from_ts,
         timestamptz '2026-11-19 00:00:00+09' to_ts
), excluded_exact(user_id) as (values (''::text)),
days as (
  select generate_series(date '2026-11-12', date '2026-11-18', interval '1 day')::date day
), actions as (
  select user_id, created_at ts, 'wardrobe' action from public.wardrobe_items, bounds b
  where created_at >= b.from_ts and created_at < b.to_ts
  union all
  select user_id, saved_at, 'heart' from public.hearts, bounds b
  where saved_at >= b.from_ts and saved_at < b.to_ts
), eligible as (
  select * from actions a
  where a.user_id !~* '(^|[-_])(eval|test|smoke|synthetic|demo)([-_]|$)'
    and not exists (select 1 from excluded_exact x where x.user_id = a.user_id)
)
select d.day,
  count(*) filter (where action = 'wardrobe') as wardrobe_rows,
  count(distinct user_id) filter (where action = 'wardrobe') as wardrobe_users,
  count(*) filter (where action = 'heart') as heart_rows,
  count(distinct user_id) filter (where action = 'heart') as heart_users,
  count(distinct user_id) as either_action_users
from days d left join eligible e
  on (e.ts at time zone 'Asia/Seoul')::date = d.day
group by d.day order by d.day;

-- 5. Hour-of-day distribution for surviving persisted actions.
with bounds as (
  select timestamptz '2026-11-12 00:00:00+09' from_ts,
         timestamptz '2026-11-19 00:00:00+09' to_ts
), excluded_exact(user_id) as (values (''::text)),
actions as (
  select user_id, created_at ts from public.wardrobe_items, bounds b
  where created_at >= b.from_ts and created_at < b.to_ts
  union all
  select user_id, saved_at from public.hearts, bounds b
  where saved_at >= b.from_ts and saved_at < b.to_ts
), eligible as (
  select * from actions a
  where a.user_id !~* '(^|[-_])(eval|test|smoke|synthetic|demo)([-_]|$)'
    and not exists (select 1 from excluded_exact x where x.user_id = a.user_id)
)
select extract(hour from ts at time zone 'Asia/Seoul')::int as kst_hour,
       count(distinct user_id) as users, count(*) as actions
from eligible group by 1 order by 1;

-- 6. Wardrobe counts, milestones, and first-to-fifth surviving-row time.
with bounds as (
  select timestamptz '2026-11-12 00:00:00+09' from_ts,
         timestamptz '2026-11-19 00:00:00+09' to_ts
), excluded_exact(user_id) as (values (''::text)),
eligible as (
  select w.* from public.wardrobe_items w, bounds b
  where w.created_at >= b.from_ts and w.created_at < b.to_ts
    and w.user_id !~* '(^|[-_])(eval|test|smoke|synthetic|demo)([-_]|$)'
    and not exists (select 1 from excluded_exact x where x.user_id = w.user_id)
), ranked as (
  select *, row_number() over (partition by user_id order by created_at, id) rn
  from eligible
), per_user as (
  select user_id, count(*) item_count,
         min(created_at) filter (where rn = 1) first_at,
         min(created_at) filter (where rn = 5) fifth_at
  from ranked group by user_id
)
select
  count(*) filter (where item_count >= 1) as reached_1,
  count(*) filter (where item_count >= 3) as reached_3,
  count(*) filter (where item_count >= 5) as reached_5,
  count(*) filter (where item_count >= 10) as reached_10,
  count(*) filter (where fifth_at is not null) as first_to_fifth_samples,
  percentile_cont(0.5) within group (order by extract(epoch from (fifth_at - first_at)))
    filter (where fifth_at is not null) as median_first_to_fifth_seconds
from per_user;

with bounds as (
  select timestamptz '2026-11-12 00:00:00+09' from_ts,
         timestamptz '2026-11-19 00:00:00+09' to_ts
), excluded_exact(user_id) as (values (''::text)),
counts as (
  select user_id, count(*) item_count from public.wardrobe_items w, bounds b
  where w.created_at >= b.from_ts and w.created_at < b.to_ts
    and w.user_id !~* '(^|[-_])(eval|test|smoke|synthetic|demo)([-_]|$)'
    and not exists (select 1 from excluded_exact x where x.user_id = w.user_id)
  group by user_id
)
select item_count, count(*) users from counts group by item_count order by item_count;

-- 7. Wardrobe attribute distributions. visual_fit null is retained as its own value.
with bounds as (
  select timestamptz '2026-11-12 00:00:00+09' from_ts,
         timestamptz '2026-11-19 00:00:00+09' to_ts
), excluded_exact(user_id) as (values (''::text)),
eligible as (
  select w.* from public.wardrobe_items w, bounds b
  where w.created_at >= b.from_ts and w.created_at < b.to_ts
    and w.user_id !~* '(^|[-_])(eval|test|smoke|synthetic|demo)([-_]|$)'
    and not exists (select 1 from excluded_exact x where x.user_id = w.user_id)
)
select 'slot' dimension, slot value, count(*) rows from eligible group by slot
union all select 'color', color, count(*) from eligible group by color
union all select 'visual_fit', coalesce(visual_fit, '(null)'), count(*) from eligible group by visual_fit
order by dimension, rows desc, value;

-- 8. Saved photos, popular surviving catalogue images, and style distribution.
with bounds as (
  select timestamptz '2026-11-12 00:00:00+09' from_ts,
         timestamptz '2026-11-19 00:00:00+09' to_ts
), excluded_exact(user_id) as (values (''::text)),
eligible as (
  select h.* from public.hearts h, bounds b
  where h.saved_at >= b.from_ts and h.saved_at < b.to_ts
    and h.user_id !~* '(^|[-_])(eval|test|smoke|synthetic|demo)([-_]|$)'
    and not exists (select 1 from excluded_exact x where x.user_id = h.user_id)
), counts as (
  select user_id, count(*) saved_count from eligible group by user_id
)
select saved_count, count(*) users from counts group by saved_count order by saved_count;

with bounds as (
  select timestamptz '2026-11-12 00:00:00+09' from_ts,
         timestamptz '2026-11-19 00:00:00+09' to_ts
), excluded_exact(user_id) as (values (''::text)),
eligible as (
  select h.* from public.hearts h, bounds b
  where h.saved_at >= b.from_ts and h.saved_at < b.to_ts
    and h.user_id !~* '(^|[-_])(eval|test|smoke|synthetic|demo)([-_]|$)'
    and not exists (select 1 from excluded_exact x where x.user_id = h.user_id)
)
select e.style_image_id, count(*) surviving_saves
from eligible e group by e.style_image_id
order by surviving_saves desc, style_image_id limit 20;

with bounds as (
  select timestamptz '2026-11-12 00:00:00+09' from_ts,
         timestamptz '2026-11-19 00:00:00+09' to_ts
), excluded_exact(user_id) as (values (''::text)),
eligible as (
  select h.* from public.hearts h, bounds b
  where h.saved_at >= b.from_ts and h.saved_at < b.to_ts
    and h.user_id !~* '(^|[-_])(eval|test|smoke|synthetic|demo)([-_]|$)'
    and not exists (select 1 from excluded_exact x where x.user_id = h.user_id)
)
select style, count(*) surviving_saves
from eligible e join public.style_images i on i.id = e.style_image_id
cross join lateral unnest(i.style) style
group by style order by surviving_saves desc, style;

-- 9. Cross-action order and distinct-day persistence.
with bounds as (
  select timestamptz '2026-11-12 00:00:00+09' from_ts,
         timestamptz '2026-11-19 00:00:00+09' to_ts
), excluded_exact(user_id) as (values (''::text)),
w as (
  select user_id, min(created_at) first_at, count(distinct (created_at at time zone 'Asia/Seoul')::date) days
  from public.wardrobe_items, bounds b
  where created_at >= b.from_ts and created_at < b.to_ts
    and user_id !~* '(^|[-_])(eval|test|smoke|synthetic|demo)([-_]|$)'
    and not exists (select 1 from excluded_exact x where x.user_id = wardrobe_items.user_id)
  group by user_id
), h as (
  select user_id, min(saved_at) first_at, count(distinct (saved_at at time zone 'Asia/Seoul')::date) days
  from public.hearts, bounds b
  where saved_at >= b.from_ts and saved_at < b.to_ts
    and user_id !~* '(^|[-_])(eval|test|smoke|synthetic|demo)([-_]|$)'
    and not exists (select 1 from excluded_exact x where x.user_id = hearts.user_id)
  group by user_id
), actors as (
  select user_id from w union select user_id from h
)
select
  count(*) filter (where w.user_id is not null and h.user_id is not null) as both_users,
  count(*) filter (where w.first_at < h.first_at) as wardrobe_first,
  count(*) filter (where h.first_at < w.first_at) as heart_first,
  count(*) filter (where h.first_at = w.first_at) as same_timestamp,
  count(*) filter (where coalesce(w.days, 0) >= 2) as wardrobe_multi_day_users,
  count(*) filter (where coalesce(h.days, 0) >= 2) as heart_multi_day_users
from actors a left join w using (user_id) left join h using (user_id);

-- Exact users active on >=2 distinct dates across either action.
with bounds as (
  select timestamptz '2026-11-12 00:00:00+09' from_ts,
         timestamptz '2026-11-19 00:00:00+09' to_ts
), excluded_exact(user_id) as (values (''::text)),
actions as (
  select user_id, (created_at at time zone 'Asia/Seoul')::date day
  from public.wardrobe_items, bounds b where created_at >= b.from_ts and created_at < b.to_ts
  union
  select user_id, (saved_at at time zone 'Asia/Seoul')::date
  from public.hearts, bounds b where saved_at >= b.from_ts and saved_at < b.to_ts
), eligible as (
  select * from actions a
  where a.user_id !~* '(^|[-_])(eval|test|smoke|synthetic|demo)([-_]|$)'
    and not exists (select 1 from excluded_exact x where x.user_id = a.user_id)
)
select count(*) as either_action_multi_day_users
from (select user_id from eligible group by user_id having count(distinct day) >= 2) x;

-- 10. Partial activation proxy. result_view is intentionally not fabricated.
with bounds as (
  select timestamptz '2026-11-12 00:00:00+09' from_ts,
         timestamptz '2026-11-19 00:00:00+09' to_ts
), excluded_exact(user_id) as (values (''::text)),
w as (
  select user_id, count(*) n from public.wardrobe_items, bounds b
  where created_at >= b.from_ts and created_at < b.to_ts
    and user_id !~* '(^|[-_])(eval|test|smoke|synthetic|demo)([-_]|$)'
    and not exists (select 1 from excluded_exact x where x.user_id = wardrobe_items.user_id)
  group by user_id
), h as (
  select distinct user_id from public.hearts, bounds b
  where saved_at >= b.from_ts and saved_at < b.to_ts
    and user_id !~* '(^|[-_])(eval|test|smoke|synthetic|demo)([-_]|$)'
    and not exists (select 1 from excluded_exact x where x.user_id = hearts.user_id)
)
select count(*) as wardrobe_5_and_saved_photo_users,
       'persisted_action; result_view unavailable, so this is not full Activation' as interpretation
from w join h using (user_id) where w.n >= 5;

-- 11. Current preference snapshot and overlap with surviving saved image styles.
-- Preferences have no created_at/updated_at; never label them as period preferences.
with bounds as (
  select timestamptz '2026-11-12 00:00:00+09' from_ts,
         timestamptz '2026-11-19 00:00:00+09' to_ts
), excluded_exact(user_id) as (values (''::text)),
actors as (
  select user_id from public.wardrobe_items, bounds b
  where created_at >= b.from_ts and created_at < b.to_ts
  union
  select user_id from public.hearts, bounds b
  where saved_at >= b.from_ts and saved_at < b.to_ts
), eligible_actors as (
  select * from actors a
  where a.user_id !~* '(^|[-_])(eval|test|smoke|synthetic|demo)([-_]|$)'
    and not exists (select 1 from excluded_exact x where x.user_id = a.user_id)
)
select p.style, count(*) current_rows
from public.user_style_preferences p join eligible_actors a using (user_id)
group by p.style order by current_rows desc, p.style;

with bounds as (
  select timestamptz '2026-11-12 00:00:00+09' from_ts,
         timestamptz '2026-11-19 00:00:00+09' to_ts
), excluded_exact(user_id) as (values (''::text)),
eligible_hearts as (
  select h.* from public.hearts h, bounds b
  where h.saved_at >= b.from_ts and h.saved_at < b.to_ts
    and h.user_id !~* '(^|[-_])(eval|test|smoke|synthetic|demo)([-_]|$)'
    and not exists (select 1 from excluded_exact x where x.user_id = h.user_id)
)
select count(*) as surviving_saved_rows,
       count(*) filter (where exists (
         select 1 from public.user_style_preferences p
         where p.user_id = h.user_id and p.style = any(i.style)
       )) as overlaps_current_preference
from eligible_hearts h join public.style_images i on i.id = h.style_image_id;

-- 12. Sources introduced after the period or without user-level linkage.
with bounds as (
  select timestamptz '2026-11-12 00:00:00+09' from_ts,
         timestamptz '2026-11-19 00:00:00+09' to_ts
)
select
  (select count(*) from public.style_images i, bounds b
    where i.uploaded_at >= b.from_ts and i.uploaded_at < b.to_ts) as style_images_uploaded_in_window,
  (select count(*) from public.llm_operation_metrics m, bounds b
    where m.created_at >= b.from_ts and m.created_at < b.to_ts) as llm_metrics_in_window,
  (select count(*) from public.llm_operation_metrics) as llm_metrics_current_all_time;

rollback;
