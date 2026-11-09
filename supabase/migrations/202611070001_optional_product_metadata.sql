-- An exact product URL is sufficient evidence for an operator-verified link.
-- Shop, product name, and brand are optional enrichment and may be populated
-- later from page metadata. A representative link is optional and, when set,
-- must point to an exact product URL.

alter table public.style_image_items
  drop constraint if exists exact_product_link_is_complete;

alter table public.style_image_items
  add constraint exact_product_link_is_complete check (
    (product_url is null or brand_source = '쇼핑몰_상품정보') and
    (is_representative_product = false or product_url is not null)
  );

comment on column public.style_image_items.shop is
  'Optional seller/platform name; may be enriched from the verified product URL.';
comment on column public.style_image_items.product_name is
  'Optional evidence-backed name; exact product links remain valid when extraction fails.';
