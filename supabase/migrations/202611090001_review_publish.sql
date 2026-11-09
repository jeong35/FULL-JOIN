-- Preserve the original model output in style_images.tagging while recording
-- a human-reviewed operational snapshot before an image can enter the feed.

alter table public.style_images
  add column if not exists reviewed_at timestamptz;

-- Existing rows predate the review marker. Keep them private until a person
-- explicitly approves them, then enforce the invariant at the database layer.
update public.style_images
set published = false
where reviewed_at is null and published;

alter table public.style_images
  drop constraint if exists style_images_publish_requires_review,
  add constraint style_images_publish_requires_review check (
    not published or reviewed_at is not null
  );

create or replace function public.review_style_image(
  p_style_image_id text,
  p_style text[],
  p_items jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
begin
  perform 1
  from public.style_images
  where id = p_style_image_id
  for update;

  if not found then
    raise exception 'Style image % does not exist', p_style_image_id
      using errcode = 'P0002';
  end if;

  if p_style is not null then
    update public.style_images
    set style = p_style
    where id = p_style_image_id;
  end if;

  if p_items is not null then
    for v_item in select value from jsonb_array_elements(p_items)
    loop
      update public.style_image_items
      set
        slot = v_item->>'slot',
        kind = v_item->>'kind',
        color = nullif(v_item->>'color', ''),
        visual_fit = nullif(v_item->>'visual_fit', ''),
        visibility = v_item->>'visibility'
      where style_image_id = p_style_image_id
        and item_id = v_item->>'item_id';

      if not found then
        raise exception 'Item % does not belong to style image %', v_item->>'item_id', p_style_image_id
          using errcode = 'P0002';
      end if;
    end loop;
  end if;

  update public.style_images
  set reviewed_at = now(), published = false
  where id = p_style_image_id;
end;
$$;

create or replace function public.set_style_image_published(
  p_style_image_id text,
  p_published boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reviewed_at timestamptz;
begin
  select reviewed_at into v_reviewed_at
  from public.style_images
  where id = p_style_image_id
  for update;

  if not found then
    raise exception 'Style image % does not exist', p_style_image_id
      using errcode = 'P0002';
  end if;

  if p_published and v_reviewed_at is null then
    raise exception 'Style image % must be reviewed before publishing', p_style_image_id
      using errcode = '23514';
  end if;

  update public.style_images
  set published = p_published
  where id = p_style_image_id;
end;
$$;

revoke all on function public.review_style_image(text, text[], jsonb)
  from public, anon, authenticated;
grant execute on function public.review_style_image(text, text[], jsonb)
  to service_role;

revoke all on function public.set_style_image_published(text, boolean)
  from public, anon, authenticated;
grant execute on function public.set_style_image_published(text, boolean)
  to service_role;

comment on column public.style_images.reviewed_at is
  'Time at which an operator last approved the operational style and item classification; original model output remains in tagging.';
comment on function public.review_style_image(text, text[], jsonb) is
  'Applies operator corrections without changing tagging, records review, and leaves the image unpublished.';
comment on function public.set_style_image_published(text, boolean) is
  'Publishes only a reviewed style image; unpublishing is always allowed.';
