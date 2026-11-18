alter table public.wardrobe_items
  add column material text[] not null default '{}'
    check (material <@ array['면','데님','니트','울','캐시미어','린넨','기모','코듀로이','플리스','나일론','가죽','스웨이드','퍼','기타']::text[]),
  add column pattern text
    check (pattern is null or pattern = any (array['무지','스트라이프','체크','도트','호피','플라워','아가일','트위드','기타'])),
  add column seasons text[] not null default '{}'
    check (seasons <@ array['봄','여름','가을','겨울']::text[]),
  add column details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object');

alter table public.wardrobe_items
  drop constraint if exists wardrobe_items_slot_check,
  drop constraint if exists wardrobe_items_kind_check,
  drop constraint if exists wardrobe_items_color_check,
  drop constraint if exists wardrobe_items_visual_fit_check;

alter table public.style_image_items
  drop constraint if exists style_image_items_slot_check,
  drop constraint if exists style_image_items_kind_check,
  drop constraint if exists style_image_items_color_check,
  drop constraint if exists style_image_items_visual_fit_check;

alter table public.wardrobe_items
  add constraint wardrobe_items_slot_check check (slot = any (array[
    '상의','하의','원피스','아우터','신발','가방','잡화'])),
  add constraint wardrobe_items_kind_check check (kind = any (array[
    '반소매티셔츠','긴소매티셔츠','민소매','셔츠','블라우스','니트','맨투맨','후드','트레이닝상의',
    '데님팬츠','슬랙스','코튼팬츠','카고팬츠','조거팬츠','숏팬츠','레깅스','미니스커트','미디스커트','롱스커트',
    '미니원피스','미디원피스','롱원피스','점프수트',
    '카디건','재킷','트위드자켓','레더재킷','데님재킷','점퍼','후드집업','야상','플리스','베스트',
    '퍼자켓','퍼코트','무스탕','트렌치코트','코트','숏코트','하프코트','롱코트','숏패딩','롱패딩','경량패딩',
    '스니커즈','로퍼','플랫슈즈','힐','부츠','샌들','슬리퍼',
    '숄더백','크로스백','토트백','백팩','에코백','클러치','스타킹','양말','모자','벨트'])),
  add constraint wardrobe_items_color_check check (color = any (array[
    '블랙','화이트','아이보리','그레이','차콜','베이지','브라운','카키','네이비','블루',
    '스카이블루','연청','중청','진청','흑청','민트','그린','레드','와인','핑크',
    '라벤더','퍼플','옐로우','오렌지','실버','골드','멀티','기타','연핑크','모카','살구'])),
  add constraint wardrobe_items_visual_fit_check check (visual_fit is null or visual_fit = any (array[
    '슬림','레귤러','오버사이즈','스키니','일자','와이드','부츠컷','A라인','H라인','플레어',
    '벌룬','조거','테니스','캉캉','플리츠']));

alter table public.style_image_items
  add constraint style_image_items_slot_check check (slot = any (array[
    '상의','하의','원피스','아우터','신발','가방','잡화'])),
  add constraint style_image_items_kind_check check (kind = any (array[
    '반소매티셔츠','긴소매티셔츠','민소매','셔츠','블라우스','니트','맨투맨','후드','트레이닝상의',
    '데님팬츠','슬랙스','코튼팬츠','카고팬츠','조거팬츠','숏팬츠','레깅스','미니스커트','미디스커트','롱스커트',
    '미니원피스','미디원피스','롱원피스','점프수트',
    '카디건','재킷','트위드자켓','레더재킷','데님재킷','점퍼','후드집업','야상','플리스','베스트',
    '퍼자켓','퍼코트','무스탕','트렌치코트','코트','숏코트','하프코트','롱코트','숏패딩','롱패딩','경량패딩',
    '스니커즈','로퍼','플랫슈즈','힐','부츠','샌들','슬리퍼',
    '숄더백','크로스백','토트백','백팩','에코백','클러치','스타킹','양말','모자','벨트'])),
  add constraint style_image_items_color_check check (color is null or color = any (array[
    '블랙','화이트','아이보리','그레이','차콜','베이지','브라운','카키','네이비','블루',
    '스카이블루','연청','중청','진청','흑청','민트','그린','레드','와인','핑크',
    '라벤더','퍼플','옐로우','오렌지','실버','골드','멀티','기타','연핑크','모카','살구'])),
  add constraint style_image_items_visual_fit_check check (visual_fit is null or visual_fit = any (array[
    '슬림','레귤러','오버사이즈','스키니','일자','와이드','부츠컷','A라인','H라인','플레어',
    '벌룬','조거','테니스','캉캉','플리츠']));

create or replace function public.wardrobe_fit_is_valid(item_kind text, item_fit text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when item_kind = any (array['데님팬츠','슬랙스','코튼팬츠','카고팬츠'])
      then item_fit = any (array['스키니','일자','와이드','부츠컷','벌룬'])
    when item_kind = '조거팬츠'
      then item_fit = any (array['조거','일자','와이드'])
    when item_kind = '숏팬츠'
      then item_fit is null
    when item_kind = '미니스커트'
      then item_fit = any (array['A라인','H라인','플레어','테니스','캉캉'])
    when item_kind = any (array['미디스커트','롱스커트'])
      then item_fit = any (array['A라인','H라인','플레어','플리츠','캉캉'])
    when item_kind = any (array[
      '레깅스','스니커즈','로퍼','플랫슈즈','힐','부츠','샌들','슬리퍼',
      '숄더백','크로스백','토트백','백팩','에코백','클러치','스타킹','양말','모자','벨트'
    ]) then item_fit is null
    else item_fit = any (array['슬림','레귤러','오버사이즈'])
  end
$$;
