-- Save one model analysis and all detected items in a single transaction.
-- The Edge Function calls this only after validating the structured output.

create or replace function public.save_style_image_analysis(
  p_image jsonb,
  p_items jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.style_images (
    id,
    image_path,
    source,
    source_url,
    permission,
    uploaded_at,
    style,
    tagging,
    published
  ) values (
    p_image->>'id',
    p_image->>'image_path',
    p_image->>'source',
    nullif(p_image->>'source_url', ''),
    p_image->>'permission',
    (p_image->>'uploaded_at')::timestamptz,
    array(select jsonb_array_elements_text(p_image->'style')),
    p_image->'tagging',
    false
  );

  insert into public.style_image_items (
    item_id,
    style_image_id,
    slot,
    kind,
    color,
    visual_fit,
    visibility,
    brand,
    product_name,
    brand_source
  )
  select
    item->>'item_id',
    p_image->>'id',
    item->>'slot',
    item->>'kind',
    nullif(item->>'color', ''),
    nullif(item->>'visual_fit', ''),
    item->>'visibility',
    nullif(item->>'brand', ''),
    nullif(item->>'product_name', ''),
    item->>'brand_source'
  from jsonb_array_elements(p_items) as item;
end;
$$;

revoke all on function public.save_style_image_analysis(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_style_image_analysis(jsonb, jsonb) to service_role;

comment on function public.save_style_image_analysis(jsonb, jsonb) is
  'Atomically persists one validated OpenAI image analysis as an unpublished feed image.';
