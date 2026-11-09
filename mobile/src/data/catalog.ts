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

// 칩·옷 그림 색값. 11/9 옷 그림 v4(가는 선 · 차분한 색)에 맞춰 7절 색을 조금 차분하게 낮췄다.
export const COLOR_HEX: Record<Exclude<Color, '멀티' | '기타'>, string> = {
  블랙: '#2B2A2B',
  화이트: '#FBFAF7',
  아이보리: '#F1EADB',
  그레이: '#A3A2A2',
  차콜: '#4B4A50',
  베이지: '#D7C5AA',
  브라운: '#7E5B42',
  카키: '#807D5C',
  네이비: '#2D3651',
  블루: '#46689F',
  스카이블루: '#9DBDD8',
  민트: '#ABD1C3',
  그린: '#587E60',
  레드: '#B9524B',
  와인: '#6F2F3D',
  핑크: '#E9BAC3',
  라벤더: '#C4B8DE',
  퍼플: '#6F5590',
  옐로우: '#EBD27C',
  오렌지: '#D98B52',
  실버: '#C4C5CB',
  골드: '#C4A65C',
  연청: '#A0B7D2',
  중청: '#6784AD',
  진청: '#35476B',
  흑청: '#2C2F37',
};

// 멀티 칩의 4색 칸(21-add-item-2-color-fit.html).
export const MULTI_SWATCH = ['#B9524B', '#46689F', '#EBD27C', '#587E60'] as const;

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
