-- Edge Functions access these tables with SUPABASE_SERVICE_ROLE_KEY.
-- RLS bypass alone does not grant table privileges, so keep the grants explicit.
grant usage on schema public to service_role;

grant select, insert, update, delete on table
  public.wardrobe_items,
  public.style_images,
  public.style_image_items,
  public.user_style_preferences,
  public.hearts
to service_role;
