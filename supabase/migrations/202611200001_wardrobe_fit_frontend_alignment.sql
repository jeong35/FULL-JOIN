-- 11/20 프론트 옷장 칩 계약 정합화.
-- 202611160002가 이미 적용된 환경과 새로 설치하는 환경 모두에서 안전하게 실행한다.

alter table public.wardrobe_items
  drop constraint if exists wardrobe_items_visual_fit_check;

alter table public.wardrobe_items
  add constraint wardrobe_items_visual_fit_check check (visual_fit is null or visual_fit = any (array[
    '슬림','레귤러','오버사이즈','스키니','일자','와이드','부츠컷','A라인','H라인','플레어',
    '벌룬','조거','버뮤다','테니스','캉캉','플리츠']));

alter table public.style_image_items
  drop constraint if exists style_image_items_visual_fit_check;

alter table public.style_image_items
  add constraint style_image_items_visual_fit_check check (visual_fit is null or visual_fit = any (array[
    '슬림','레귤러','오버사이즈','스키니','일자','와이드','부츠컷','A라인','H라인','플레어',
    '벌룬','조거','버뮤다','테니스','캉캉','플리츠']));

create or replace function public.wardrobe_fit_is_valid(item_kind text, item_fit text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select item_fit is null or case
    when item_kind = any (array['데님팬츠','슬랙스','코튼팬츠','카고팬츠'])
      then item_fit = any (array['스키니','일자','와이드','부츠컷','벌룬'])
    when item_kind = '조거팬츠'
      then item_fit = any (array['조거','일자','와이드'])
    when item_kind = '숏팬츠'
      then item_fit = any (array['슬림','일자','와이드','버뮤다'])
    when item_kind = '미니스커트'
      then item_fit = any (array['A라인','H라인','플레어','테니스','캉캉'])
    when item_kind = any (array['미디스커트','롱스커트'])
      then item_fit = any (array['A라인','H라인','플레어','플리츠','캉캉'])
    when item_kind = any (array[
      '레깅스','스니커즈','로퍼','플랫슈즈','힐','부츠','샌들','슬리퍼',
      '숄더백','크로스백','토트백','백팩','에코백','클러치','스타킹','양말','모자','벨트'
    ]) then false
    else item_fit = any (array['슬림','레귤러','오버사이즈'])
  end
$$;
