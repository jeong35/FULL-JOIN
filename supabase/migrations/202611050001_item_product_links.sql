-- Exact shopping links belong to the clothing item they identify, not to the
-- whole style image. MVP marks at most one linked item as representative;
-- later every item may carry its own exact product link.

alter table public.style_image_items
  add column shop text,
  add column product_url text,
  add column is_representative_product boolean not null default false;

alter table public.style_image_items
  drop constraint if exists style_image_items_brand_source_check,
  drop constraint if exists product_identity_has_evidence;

alter table public.style_image_items
  add constraint style_image_items_brand_source_check check (
    brand_source = any (array['쇼핑몰_상품정보', '캡션', '이미지_글자', '없음'])
  ),
  add constraint product_identity_has_evidence check (
    brand_source <> '없음' or
    (brand is null and product_name is null and shop is null and product_url is null)
  ),
  add constraint exact_product_link_is_complete check (
    (
      product_url is null and
      shop is null and
      is_representative_product = false
    ) or (
      product_url is not null and
      shop is not null and
      product_name is not null and
      brand_source = '쇼핑몰_상품정보'
    )
  );

create unique index style_image_items_one_representative_product_idx
  on public.style_image_items (style_image_id)
  where is_representative_product;

comment on column public.style_image_items.product_url is
  'Exact product page verified by an operator; never inferred from the image.';
comment on column public.style_image_items.is_representative_product is
  'At most one exact linked item per style image is shown as the MVP representative product.';

-- Production is empty at this migration. Abort instead of silently discarding
-- legacy image-level product metadata if a different environment has data.
do $$
begin
  if exists (
    select 1
    from public.style_images
    where shop is not null or product_name is not null or product_url is not null
  ) then
    raise exception 'Move existing image-level product metadata to style_image_items before applying this migration';
  end if;
end
$$;

alter table public.style_images
  drop column shop,
  drop column product_name,
  drop column product_url;
