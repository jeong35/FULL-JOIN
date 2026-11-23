-- Supabase Auth 사용자 격리 기반. 운영 적용 전 모바일 Auth와 데모 계정 이전 정책을 별도로 승인한다.
-- Edge Function은 JWT subject와 요청 user_id 일치를 먼저 검사하고, 이 정책은 향후 anon client 사용을 위한 방어선이다.

grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  public.wardrobe_items,
  public.user_style_preferences,
  public.hearts
to authenticated;

drop policy if exists wardrobe_items_owner_all on public.wardrobe_items;
create policy wardrobe_items_owner_all
on public.wardrobe_items
for all
to authenticated
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

drop policy if exists user_style_preferences_owner_all on public.user_style_preferences;
create policy user_style_preferences_owner_all
on public.user_style_preferences
for all
to authenticated
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

drop policy if exists hearts_owner_all on public.hearts;
create policy hearts_owner_all
on public.hearts
for all
to authenticated
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

comment on table public.wardrobe_items is
  'User wardrobe. User API identity comes from a verified Supabase Auth JWT; demo user_id is not trusted.';
