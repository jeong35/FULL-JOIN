// 홈 검색을 앱 값(catalog.ts)과 잇는 곳. 계산은 feedFilterCore.ts에 있다.
import { useSyncExternalStore } from 'react';

import { BASE_COLORS, DENIM_COLORS, KINDS_BY_SLOT, SLOTS, STYLES, kindLabel, type Color, type Kind, type Slot } from './catalog';
import { isEmptyQuery, queryParts, type FeedQuery, type SearchVocab, type SearchWord } from './feedFilterCore';

export * from './feedFilterCore';

export const SEARCH_COLORS: readonly Color[] = [...BASE_COLORS.filter((color) => color !== '기타'), ...DENIM_COLORS];

// 한 종류가 두 부위에 있으면(카디건: 상의·아우터) 앞 부위에서 한 번만 센다.
export const SEARCH_KINDS: readonly Kind[] = [...new Set(SLOTS.flatMap((slot) => KINDS_BY_SLOT[slot] as readonly Kind[]))];

export function slotOfKind(kind: string): Slot | null {
  return SLOTS.find((slot) => (KINDS_BY_SLOT[slot] as readonly string[]).includes(kind)) ?? null;
}

export function labelOfKind(kind: string): string {
  return (SEARCH_KINDS as readonly string[]).includes(kind) ? kindLabel(kind as Kind) : kind;
}

// '미니멀 · 베이지 니트'처럼 조건을 한 줄로(최근 찾은 것·안내 글).
export function queryLabel(query: FeedQuery): string {
  return queryParts(query, labelOfKind)
    .map((part) => part.label)
    .join(' · ');
}

// 동의어 초안(11/24). 서버와 합의하면 이 표만 고친다.
const KIND_ALIASES: Partial<Record<Kind, readonly string[]>> = {
  반소매티셔츠: ['반팔', '반팔티', '티셔츠', '반소매'],
  긴소매티셔츠: ['긴팔', '긴팔티', '티셔츠', '긴소매', '롱슬리브'],
  민소매: ['나시', '민소매'],
  후드: ['후디', '후드티'],
  맨투맨: ['스웻셔츠'],
  트레이닝상의: ['츄리닝'],
  조거팬츠: ['츄리닝', '조거'],
  데님팬츠: ['청바지', '데님', '진'],
  슬랙스: ['정장바지'],
  미니스커트: ['치마'],
  미디스커트: ['치마'],
  롱스커트: ['치마'],
  야상: ['야상'],
  스니커즈: ['운동화'],
  힐: ['구두'],
};

const COLOR_ALIASES: Partial<Record<Color, readonly string[]>> = {
  블랙: ['검정', '검은', '까만'],
  화이트: ['흰', '흰색', '하얀'],
  그레이: ['회색'],
  네이비: ['남색'],
  브라운: ['갈색'],
  핑크: ['분홍'],
  레드: ['빨간', '빨강'],
  그린: ['초록'],
  옐로우: ['노란', '노랑'],
  퍼플: ['보라'],
  스카이블루: ['하늘색'],
  블루: ['파란', '파랑'],
};

export const SEARCH_VOCAB: SearchVocab = {
  styles: STYLES.map((style): SearchWord => ({ value: style, label: style })),
  kinds: SEARCH_KINDS.map((kind): SearchWord => ({ value: kind, label: kindLabel(kind), aliases: KIND_ALIASES[kind] })),
  colors: SEARCH_COLORS.map((color): SearchWord => ({ value: color, label: color, aliases: COLOR_ALIASES[color] })),
};

// ── 화면 주소에 조건 싣기: /search?styles=미니멀,시크&kind=니트&color=베이지 ──
export type QueryParams = { styles?: string; kind?: string; color?: string };

export function queryToParams(query: FeedQuery): QueryParams {
  const params: QueryParams = {};
  if (query.styles.length > 0) params.styles = query.styles.join(',');
  if (query.kind !== null) params.kind = query.kind;
  if (query.color !== null) params.color = query.color;
  return params;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// 목록에 없는 값은 버린다(주소를 손으로 고쳐도 엉뚱한 값이 들어가지 않게).
export function queryFromParams(params: Record<string, string | string[] | undefined>): FeedQuery {
  const styles = (one(params.styles) ?? '')
    .split(',')
    .filter((style): style is (typeof STYLES)[number] => (STYLES as readonly string[]).includes(style));
  const kind = one(params.kind);
  const color = one(params.color);
  return {
    styles: [...new Set(styles)],
    kind: kind !== undefined && (SEARCH_KINDS as readonly string[]).includes(kind) ? kind : null,
    color: color !== undefined && (SEARCH_COLORS as readonly string[]).includes(color) ? color : null,
  };
}

// ── 최근 찾은 것: 앱을 켜 둔 동안만 기억한다(최대 5개). ──
export type RecentSearch = { label: string; query: FeedQuery };
let recent: readonly RecentSearch[] = [];
const listeners = new Set<() => void>();

export function rememberSearch(label: string, query: FeedQuery): void {
  if (label === '' || isEmptyQuery(query)) return;
  recent = [{ label, query }, ...recent.filter((entry) => entry.label !== label)].slice(0, 5);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRecentSearches(): readonly RecentSearch[] {
  return useSyncExternalStore(subscribe, () => recent, () => recent);
}
