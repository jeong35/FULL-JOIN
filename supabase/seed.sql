-- Local development only. Synthetic users and events make the local dashboard useful
-- without copying any production account, photo, chat text, or other personal data.

insert into public.style_images (
  id, image_path, source, permission, uploaded_at, style, tagging, published, reviewed_at
) values (
  'local-seed-look', 'local/seed-look.jpg', '자체_촬영', '필요 없음',
  '2026-11-18T01:00:00Z', array['미니멀'], '{}'::jsonb, true, '2026-11-18T01:05:00Z'
) on conflict (id) do update set published = excluded.published;

insert into public.style_image_items (
  item_id, style_image_id, slot, kind, color, visual_fit, visibility, brand, product_name, brand_source
) values
  ('local-seed-top', 'local-seed-look', '상의', '니트', '아이보리', '레귤러', '전체', null, null, '없음'),
  ('local-seed-bottom', 'local-seed-look', '하의', '데님팬츠', '진청', '일자', '전체', null, null, '없음')
on conflict (item_id) do nothing;

insert into public.wardrobe_items (user_id, slot, kind, color, visual_fit) values
  ('demo-analytics-a', '상의', '니트', '아이보리', '레귤러'),
  ('demo-analytics-a', '상의', '셔츠', '화이트', '레귤러'),
  ('demo-analytics-a', '하의', '데님팬츠', '진청', '일자'),
  ('demo-analytics-a', '아우터', '카디건', '그레이', '레귤러'),
  ('demo-analytics-a', '신발', '스니커즈', '화이트', null),
  ('demo-analytics-b', '상의', '맨투맨', '그레이', '오버사이즈');

insert into public.hearts (user_id, style_image_id, saved_at) values
  ('demo-analytics-a', 'local-seed-look', '2026-11-19T03:00:00Z')
on conflict (user_id, style_image_id) do nothing;

insert into public.user_events (
  received_at, client_ts, device_id, session_id, platform, user_id, name, props
) values
  ('2026-11-18T00:00:00Z', '2026-11-18T00:00:00Z', 'device-demo-a', 'session-demo-a1', 'web', 'demo-analytics-a', 'intro_view', '{"step":1,"app_version":"local","analytics_version":"2026-11-11-v4"}'),
  ('2026-11-18T00:01:00Z', '2026-11-18T00:01:00Z', 'device-demo-a', 'session-demo-a1', 'web', 'demo-analytics-a', 'intro_done', '{"app_version":"local","analytics_version":"2026-11-11-v4"}'),
  ('2026-11-18T00:02:00Z', '2026-11-18T00:02:00Z', 'device-demo-a', 'session-demo-a1', 'web', 'demo-analytics-a', 'login_success', '{"returning":false,"app_version":"local","analytics_version":"2026-11-11-v4"}'),
  ('2026-11-18T00:04:00Z', '2026-11-18T00:04:00Z', 'device-demo-a', 'session-demo-a1', 'web', 'demo-analytics-a', 'taste_done', '{"count":2,"app_version":"local","analytics_version":"2026-11-11-v4"}'),
  ('2026-11-18T00:10:00Z', '2026-11-18T00:10:00Z', 'device-demo-a', 'session-demo-a1', 'web', 'demo-analytics-a', 'wardrobe_add_done', '{"slot":"상의","kind":"니트","wardrobe_size":5,"app_version":"local","analytics_version":"2026-11-11-v4"}'),
  ('2026-11-19T03:00:00Z', '2026-11-19T03:00:00Z', 'device-demo-a', 'session-demo-a2', 'web', 'demo-analytics-a', 'photo_save_done', '{"style_image_id":"local-seed-look","place":"compare","app_version":"local","analytics_version":"2026-11-11-v4"}'),
  ('2026-11-19T03:00:02Z', '2026-11-19T03:00:02Z', 'device-demo-a', 'session-demo-a2', 'web', 'demo-analytics-a', 'result_view', '{"style_image_id":"local-seed-look","items":2,"use":2,"similar":0,"need":0,"wardrobe_size":5,"outfits":1,"app_version":"local","analytics_version":"2026-11-11-v4"}'),
  ('2026-11-19T03:03:00Z', '2026-11-19T03:03:00Z', 'device-demo-a', 'session-demo-a2', 'web', 'demo-analytics-a', 'chat_send', '{"style_image_id":"local-seed-look","turn":1,"app_version":"local","analytics_version":"2026-11-11-v4"}'),
  ('2026-11-19T03:04:00Z', '2026-11-19T03:04:00Z', 'device-demo-a', 'session-demo-a2', 'web', 'demo-analytics-a', 'screen_leave', '{"screen":"result","next_screen":"chat","duration_ms":118000,"app_version":"local","analytics_version":"2026-11-11-v4"}'),
  ('2026-11-19T04:00:00Z', '2026-11-19T04:00:00Z', 'device-demo-b', 'session-demo-b1', 'ios', 'demo-analytics-b', 'login_success', '{"returning":false,"app_version":"local","analytics_version":"2026-11-11-v4"}'),
  ('2026-11-19T04:04:00Z', '2026-11-19T04:04:00Z', 'device-demo-b', 'session-demo-b1', 'ios', 'demo-analytics-b', 'taste_later', '{"app_version":"local","analytics_version":"2026-11-11-v4"}'),
  ('2026-11-19T04:08:00Z', '2026-11-19T04:08:00Z', 'device-demo-b', 'session-demo-b1', 'ios', 'demo-analytics-b', 'wardrobe_add_done', '{"slot":"상의","kind":"맨투맨","wardrobe_size":1,"app_version":"local","analytics_version":"2026-11-11-v4"}'),
  ('2026-11-19T05:00:00Z', '2026-11-19T05:00:00Z', 'device-smoke-1', 'session-smoke-1', 'web', 'smoke-api-check', 'app_open', '{"smoke_test":true,"app_version":"local","analytics_version":"2026-11-11-v4"}');

insert into public.llm_operation_metrics (
  feature, response_mode, llm_called, model, prompt_version, release_git_sha, status,
  error_type, input_tokens, cached_input_tokens, output_tokens, pricing_version,
  estimated_cost_usd, latency_ms, fallback_used, fallback_reason, created_at
) values
  ('chat', 'grounded', false, null, 'chat-general-v2', '097d7b3', 'grounded', null, 0, 0, 0, null, null, 42, false, null, '2026-11-19T03:03:01Z'),
  ('chat', 'llm', true, 'gpt-4.1-mini-2025-04-14', 'chat-general-v2', '097d7b3', 'success', null, 180, 0, 44, 'openai-2026-11-20', 0.00014240, 810, false, null, '2026-11-19T03:05:00Z'),
  ('chat', 'fallback', false, 'gpt-4.1-mini-2025-04-14', 'chat-general-v2', '097d7b3', 'fallback', 'configuration', 0, 0, 0, 'openai-2026-11-20', 0, 8, true, 'configuration', '2026-11-19T03:06:00Z');
