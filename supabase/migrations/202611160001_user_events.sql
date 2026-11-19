create table public.user_events (
  event_id uuid primary key,
  user_id text not null,
  session_id text not null,
  event_name text not null check (event_name = any (array[
    'app_open', 'screen_view', 'screen_leave', 'app_background', 'tab_click', 'back_click', 'error_shown',
    'intro_view', 'intro_next', 'intro_prev', 'intro_skip', 'intro_done',
    'login_nickname_start', 'login_pin_start', 'login_submit', 'login_validation_failed', 'login_failed', 'login_success',
    'taste_select', 'taste_deselect', 'taste_limit_reached', 'taste_done', 'taste_later', 'taste_save_failed', 'ready_choice',
    'wardrobe_add_start', 'wardrobe_slot_select', 'wardrobe_kind_select', 'wardrobe_color_select', 'wardrobe_fit_select',
    'wardrobe_add_submit', 'wardrobe_add_done', 'wardrobe_add_failed', 'wardrobe_milestone', 'wardrobe_edit_start',
    'wardrobe_delete_select', 'wardrobe_delete_done', 'wardrobe_delete_failed',
    'feed_load_done', 'feed_load_failed', 'feed_scroll', 'feed_card_impression', 'photo_open', 'photo_save',
    'photo_save_done', 'photo_save_failed', 'archive_image_open', 'archive_filter_apply', 'archive_filter_clear',
    'archive_zero_result', 'style_detail_item_view', 'compare_open', 'comparison_done', 'comparison_failed',
    'comparison_reopened', 'comparison_empty_wardrobe', 'result_view', 'result_scroll', 'gap_item_impression',
    'item_choice', 'outfit_section_view', 'outfit_view', 'shop_link_click', 'wardrobe_return_click',
    'hint_view', 'hint_click', 'hint_close', 'chat_no_saved', 'chat_go_feed_click', 'chat_picker_open',
    'chat_image_select', 'chat_input_start', 'chat_send', 'chat_response_done', 'chat_response_failed',
    'taste_edit_start', 'tutorial_replay_start', 'logout_click'
  ])),
  screen_name text not null check (screen_name = any (array[
    'unknown', 'onboarding_intro', 'onboarding_login', 'onboarding_taste', 'onboarding_ready',
    'home', 'closet', 'recommend', 'chat', 'my', 'add_item_kind', 'add_item_color_fit',
    'style_detail', 'comparison_result'
  ])),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 86400000),
  platform text not null check (platform = any (array['ios', 'android', 'web', 'unknown'])),
  app_version text not null,
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
  constraint duration_matches_event check (
    (event_name = any (array['screen_leave', 'comparison_done', 'chat_response_done']) and duration_ms is not null)
    or
    (not (event_name = any (array['screen_leave', 'comparison_done', 'chat_response_done'])) and duration_ms is null)
  )
);

create index user_events_user_time_idx
  on public.user_events (user_id, occurred_at, event_id);

create index user_events_name_time_idx
  on public.user_events (event_name, occurred_at, user_id);

create index user_events_session_time_idx
  on public.user_events (session_id, occurred_at, event_id);

alter table public.user_events enable row level security;

revoke all on table public.user_events from public, anon, authenticated;
grant select, insert, update on table public.user_events to service_role;

comment on table public.user_events is
  'Pseudonymous product analytics events. Mobile writes only through the Edge Function; dashboard reads require the admin token.';

