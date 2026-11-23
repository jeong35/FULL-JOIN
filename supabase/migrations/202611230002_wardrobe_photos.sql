alter table public.wardrobe_items
  add column if not exists photo_path text,
  add column if not exists photo_color text,
  add column if not exists photo_updated_at timestamptz;

alter table public.wardrobe_items
  drop constraint if exists wardrobe_items_photo_color_check,
  add constraint wardrobe_items_photo_color_check
    check (photo_color is null or photo_color ~ '^#[0-9A-Fa-f]{6}$'),
  drop constraint if exists wardrobe_items_photo_path_owner_check,
  add constraint wardrobe_items_photo_path_owner_check
    check (photo_path is null or photo_path like user_id || '/%');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wardrobe-photos', 'wardrobe-photos', false, 3145728, array['image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists wardrobe_photos_owner_select on storage.objects;
create policy wardrobe_photos_owner_select
on storage.objects for select to authenticated
using (
  bucket_id = 'wardrobe-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists wardrobe_photos_owner_insert on storage.objects;
create policy wardrobe_photos_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'wardrobe-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists wardrobe_photos_owner_update on storage.objects;
create policy wardrobe_photos_owner_update
on storage.objects for update to authenticated
using (
  bucket_id = 'wardrobe-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'wardrobe-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists wardrobe_photos_owner_delete on storage.objects;
create policy wardrobe_photos_owner_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'wardrobe-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

comment on column public.wardrobe_items.photo_path is
  'Private wardrobe-photos object path. Only the confirmed transparent PNG is retained; originals are not stored.';
