-- Attach an operator-selected exact product page and optional extracted metadata
-- to one detected item. Representative selection and metadata update are atomic.

create or replace function public.set_style_image_item_product(
  p_style_image_id text,
  p_item_id text,
  p_product_url text,
  p_shop text,
  p_brand text,
  p_product_name text,
  p_is_representative_product boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.style_image_items
    where item_id = p_item_id and style_image_id = p_style_image_id
  ) then
    raise exception 'Item % does not belong to style image %', p_item_id, p_style_image_id
      using errcode = 'P0002';
  end if;

  if p_is_representative_product then
    update public.style_image_items
    set is_representative_product = false
    where style_image_id = p_style_image_id
      and item_id <> p_item_id
      and is_representative_product;
  end if;

  update public.style_image_items
  set
    product_url = p_product_url,
    shop = nullif(p_shop, ''),
    brand = nullif(p_brand, ''),
    product_name = nullif(p_product_name, ''),
    brand_source = '쇼핑몰_상품정보',
    is_representative_product = p_is_representative_product
  where item_id = p_item_id and style_image_id = p_style_image_id;
end;
$$;

revoke all on function public.set_style_image_item_product(text, text, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.set_style_image_item_product(text, text, text, text, text, text, boolean)
  to service_role;

comment on function public.set_style_image_item_product(text, text, text, text, text, text, boolean) is
  'Atomically links an operator-selected item to an exact product page and optional page metadata.';
