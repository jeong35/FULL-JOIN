create extension if not exists pgcrypto;

create or replace function public.wardrobe_fit_is_valid(item_kind text, item_fit text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when item_kind = any (array['데님팬츠', '슬랙스', '코튼팬츠', '조거팬츠'])
      then item_fit = any (array['스키니', '일자', '와이드', '부츠컷'])
    when item_kind = any (array['미니스커트', '미디스커트', '롱스커트'])
      then item_fit = any (array['A라인', 'H라인', '플레어'])
    when item_kind = any (array[
      '숏팬츠', '레깅스', '스니커즈', '로퍼', '플랫슈즈', '힐', '부츠', '샌들', '슬리퍼',
      '숄더백', '크로스백', '토트백', '백팩', '에코백', '클러치'
    ]) then item_fit is null
    else item_fit = any (array['슬림', '레귤러', '오버사이즈'])
  end
$$;

create table public.wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  slot text not null check (slot = any (array['상의', '하의', '원피스', '아우터', '신발', '가방'])),
  kind text not null check (kind = any (array[
    '반소매티셔츠', '긴소매티셔츠', '민소매', '셔츠', '블라우스', '니트', '맨투맨', '후드',
    '데님팬츠', '슬랙스', '코튼팬츠', '조거팬츠', '숏팬츠', '레깅스', '미니스커트', '미디스커트',
    '롱스커트', '미니원피스', '미디원피스', '롱원피스', '점프수트', '카디건', '재킷', '레더재킷',
    '데님재킷', '점퍼', '후드집업', '야상', '플리스', '베스트', '트렌치코트', '코트', '숏패딩',
    '롱패딩', '경량패딩', '스니커즈', '로퍼', '플랫슈즈', '힐', '부츠', '샌들', '슬리퍼',
    '숄더백', '크로스백', '토트백', '백팩', '에코백', '클러치'
  ])),
  color text not null check (color = any (array[
    '블랙', '화이트', '아이보리', '그레이', '차콜', '베이지', '브라운', '카키', '네이비', '블루',
    '스카이블루', '연청', '중청', '진청', '흑청', '민트', '그린', '레드', '와인', '핑크',
    '라벤더', '퍼플', '옐로우', '오렌지', '실버', '골드', '멀티', '기타'
  ])),
  visual_fit text check (visual_fit is null or visual_fit = any (array[
    '슬림', '레귤러', '오버사이즈', '스키니', '일자', '와이드', '부츠컷', 'A라인', 'H라인', '플레어'
  ])),
  created_at timestamptz not null default now(),
  constraint wardrobe_fit_matches_kind check (public.wardrobe_fit_is_valid(kind, visual_fit))
);

create index wardrobe_items_user_created_idx
  on public.wardrobe_items (user_id, created_at desc, id);

create table public.style_images (
  id text primary key,
  image_path text not null unique,
  source text not null check (source = any (array['쇼핑몰', '인플루언서', '연예인', '자체_촬영'])),
  source_url text,
  shop text,
  product_name text,
  product_url text,
  permission text not null check (permission = any (array['미요청', '요청함', '허락', '필요 없음'])),
  uploaded_at timestamptz not null,
  style text[] not null check (
    cardinality(style) between 1 and 2 and
    style <@ array['캐주얼', '미니멀', '러블리', '청순', '엘레강스', '시크', '스트릿', '레트로', '프레피', '스포티', '글램']::text[]
  ),
  tagging jsonb not null,
  published boolean not null default true
);

create index style_images_uploaded_idx on public.style_images (uploaded_at desc, id);
create index style_images_style_idx on public.style_images using gin (style);

create table public.style_image_items (
  item_id text primary key,
  style_image_id text not null references public.style_images(id) on delete cascade,
  slot text not null check (slot = any (array['상의', '하의', '원피스', '아우터', '신발', '가방'])),
  kind text not null check (kind = any (array[
    '반소매티셔츠', '긴소매티셔츠', '민소매', '셔츠', '블라우스', '니트', '맨투맨', '후드',
    '데님팬츠', '슬랙스', '코튼팬츠', '조거팬츠', '숏팬츠', '레깅스', '미니스커트', '미디스커트',
    '롱스커트', '미니원피스', '미디원피스', '롱원피스', '점프수트', '카디건', '재킷', '레더재킷',
    '데님재킷', '점퍼', '후드집업', '야상', '플리스', '베스트', '트렌치코트', '코트', '숏패딩',
    '롱패딩', '경량패딩', '스니커즈', '로퍼', '플랫슈즈', '힐', '부츠', '샌들', '슬리퍼',
    '숄더백', '크로스백', '토트백', '백팩', '에코백', '클러치'
  ])),
  color text check (color is null or color = any (array[
    '블랙', '화이트', '아이보리', '그레이', '차콜', '베이지', '브라운', '카키', '네이비', '블루',
    '스카이블루', '연청', '중청', '진청', '흑청', '민트', '그린', '레드', '와인', '핑크',
    '라벤더', '퍼플', '옐로우', '오렌지', '실버', '골드', '멀티', '기타'
  ])),
  visual_fit text check (visual_fit is null or visual_fit = any (array[
    '슬림', '레귤러', '오버사이즈', '스키니', '일자', '와이드', '부츠컷', 'A라인', 'H라인', '플레어'
  ])),
  visibility text not null check (visibility = any (array['전체', '일부', '판단불가'])),
  brand text,
  product_name text,
  brand_source text not null check (brand_source = any (array['캡션', '이미지_글자', '없음'])),
  constraint product_identity_has_evidence check (
    brand_source <> '없음' or (brand is null and product_name is null)
  )
);

create index style_image_items_image_idx on public.style_image_items (style_image_id, item_id);

create table public.user_style_preferences (
  user_id text not null,
  style text not null check (style = any (array[
    '캐주얼', '미니멀', '러블리', '청순', '엘레강스', '시크', '스트릿', '레트로', '프레피', '스포티', '글램'
  ])),
  position smallint not null check (position between 1 and 3),
  primary key (user_id, style),
  unique (user_id, position)
);

create table public.hearts (
  user_id text not null,
  style_image_id text not null references public.style_images(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, style_image_id)
);

create index hearts_archive_idx on public.hearts (user_id, saved_at desc, style_image_id);

alter table public.wardrobe_items enable row level security;
alter table public.style_images enable row level security;
alter table public.style_image_items enable row level security;
alter table public.user_style_preferences enable row level security;
alter table public.hearts enable row level security;

insert into storage.buckets (id, name, public)
values ('feed-images', 'feed-images', false)
on conflict (id) do update set public = excluded.public;

comment on table public.wardrobe_items is
  'MVP uses a demo user_id through the Edge Function. Replace with auth.uid() and RLS policies when anonymous login is approved.';
