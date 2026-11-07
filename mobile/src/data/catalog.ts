// design/DESIGN.md 7절 옷 등록 값. slot·kind·color·visual_fit 값은
// src/fulljoin/schemas/style_image.schema.json(PR #1 반영본)의 enum과 같아야 한다(AGENTS.md 절대 규칙 1).

export const SLOTS = ['상의', '하의', '원피스', '아우터', '신발', '가방'] as const;
export type Slot = (typeof SLOTS)[number];

export const KINDS_BY_SLOT = {
  상의: ['반소매티셔츠', '긴소매티셔츠', '민소매', '셔츠', '블라우스', '니트', '맨투맨', '후드', '카디건', '후드집업', '베스트'],
  하의: ['데님팬츠', '슬랙스', '코튼팬츠', '조거팬츠', '숏팬츠', '레깅스', '미니스커트', '미디스커트', '롱스커트', '점프수트'],
  원피스: ['미니원피스', '미디원피스', '롱원피스', '점프수트'],
  아우터: ['카디건', '재킷', '레더재킷', '데님재킷', '점퍼', '후드집업', '야상', '플리스', '베스트', '트렌치코트', '코트', '숏패딩', '롱패딩', '경량패딩'],
  신발: ['스니커즈', '로퍼', '플랫슈즈', '힐', '부츠', '샌들', '슬리퍼'],
  가방: ['숄더백', '크로스백', '토트백', '백팩', '에코백', '클러치'],
} as const satisfies Record<Slot, readonly string[]>;

export type Kind = (typeof KINDS_BY_SLOT)[Slot][number];

export function isSlot(value: unknown): value is Slot {
  return typeof value === 'string' && (SLOTS as readonly string[]).includes(value);
}

export function isKindOfSlot(slot: Slot, value: unknown): value is Kind {
  return typeof value === 'string' && (KINDS_BY_SLOT[slot] as readonly string[]).includes(value);
}

// ── 색 ──────────────────────────────────────────────

export const BASE_COLORS = [
  '블랙', '화이트', '아이보리', '그레이', '차콜', '베이지', '브라운', '카키', '네이비', '블루', '스카이블루',
  '민트', '그린', '레드', '와인', '핑크', '라벤더', '퍼플', '옐로우', '오렌지', '실버', '골드', '멀티', '기타',
] as const;
export const DENIM_COLORS = ['연청', '중청', '진청', '흑청'] as const;
export type Color = (typeof BASE_COLORS)[number] | (typeof DENIM_COLORS)[number];

// 7절 칩 색값. 데님 4색은 7절에 값이 없어 임시로 정함(중청만 22-tab-closet.html의 #5B7DB1).
export const COLOR_HEX: Record<Exclude<Color, '멀티' | '기타'>, string> = {
  블랙: '#1E1E1E',
  화이트: '#FFFFFF',
  아이보리: '#F3EBDD',
  그레이: '#9E9E9E',
  차콜: '#3F3F46',
  베이지: '#D8C3A5',
  브라운: '#7A5235',
  카키: '#7D7A4F',
  네이비: '#1F2A4D',
  블루: '#2F5DB8',
  스카이블루: '#8EC1E8',
  민트: '#A8DCCB',
  그린: '#3E7D4F',
  레드: '#C83A3A',
  와인: '#6E1F33',
  핑크: '#F2B5C4',
  라벤더: '#C9B8EC',
  퍼플: '#6B3FA0',
  옐로우: '#F2D45C',
  오렌지: '#E8853A',
  실버: '#C0C0C8',
  골드: '#C9A94E',
  연청: '#9DB8DA',
  중청: '#5B7DB1',
  진청: '#2C3E66',
  흑청: '#23262E',
};

// 멀티 칩의 4색 칸(21-add-item-2-color-fit.html).
export const MULTI_SWATCH = ['#C83A3A', '#2F5DB8', '#F2D45C', '#3E7D4F'] as const;

// 흰 바탕에서 칩 경계가 안 보이는 밝은 색.
export const LIGHT_COLORS: ReadonlySet<Color> = new Set<Color>(['화이트', '아이보리']);

const DENIM_KINDS: ReadonlySet<Kind> = new Set<Kind>(['데님팬츠', '데님재킷']);

// 데님 색은 데님팬츠·데님재킷일 때만 앞쪽에 보인다(7절).
export function colorsForKind(kind: Kind): readonly Color[] {
  return DENIM_KINDS.has(kind) ? [...DENIM_COLORS, ...BASE_COLORS] : BASE_COLORS;
}

// ── 핏 ──────────────────────────────────────────────

export const FITS = ['슬림', '레귤러', '오버사이즈', '스키니', '일자', '와이드', '부츠컷', 'A라인', 'H라인', '플레어'] as const;
export type VisualFit = (typeof FITS)[number];

const LONG_PANTS: ReadonlySet<Kind> = new Set<Kind>(['데님팬츠', '슬랙스', '코튼팬츠', '조거팬츠']);
const SKIRTS: ReadonlySet<Kind> = new Set<Kind>(['미니스커트', '미디스커트', '롱스커트']);
const NO_FIT_KINDS: ReadonlySet<Kind> = new Set<Kind>(['숏팬츠', '레깅스']);

// 종류별 핏 보기(7절). 빈 배열이면 핏 단계를 건너뛰고 visual_fit은 null.
export function fitsForKind(slot: Slot, kind: Kind): readonly VisualFit[] {
  if (slot === '신발' || slot === '가방' || NO_FIT_KINDS.has(kind)) return [];
  if (LONG_PANTS.has(kind)) return ['스키니', '일자', '와이드', '부츠컷'];
  if (SKIRTS.has(kind)) return ['A라인', 'H라인', '플레어'];
  return ['슬림', '레귤러', '오버사이즈'];
}

// 피드 사진 스타일 11개(스키마 style 값).
export const STYLES = ['캐주얼', '미니멀', '러블리', '청순', '엘레강스', '시크', '스트릿', '레트로', '프레피', '스포티', '글램'] as const;
export type Style = (typeof STYLES)[number];
