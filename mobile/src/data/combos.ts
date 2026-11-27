// 옷 하나로 만드는 조합: 고른 옷에 내 옷장의 다른 옷을 맞춰 입을 수 있는 조합을 고른다.
// 옷장에 있는 옷만 쓴다(AGENTS.md 절대 규칙 5). 규칙은 세 가지다.
// 1) 자리: 상의+하의 또는 원피스(점프수트 포함), 쌀쌀한 날(아침 14° 이하)엔 겉옷, 있으면 신발·가방.
// 2) 기온: 고른 날의 기온별 옷차림 표(weather.ts KIND_TEMP)에 맞는 옷만 같이 쓴다.
// 3) 색: 포인트 색(뉴트럴이 아닌 색)은 한 가지까지. 같은 계열(예: 스카이블루+블루)은 한 가지로 본다.
// 같은 입력에 같은 결과: 점수가 같으면 옷 id 순서로 정한다.
import { kindLabel, type Color } from './catalog';
import type { WardrobeItem } from './types';
import { NO_RECENT_WEAR, wearPenalty, type RecentWear } from './recentWear';
import { fitsTemp, needsOuter, type DayWeather } from './weather';

// 어디에나 받쳐 입기 쉬운 색(데님 포함).
const NEUTRALS: ReadonlySet<Color> = new Set<Color>([
  '블랙', '화이트', '아이보리', '그레이', '차콜', '베이지', '브라운', '네이비', '카키', '연청', '중청', '진청', '흑청',
]);
const MONO: ReadonlySet<Color> = new Set<Color>(['블랙', '화이트', '그레이', '차콜']);
// 톤온톤으로 볼 색 계열.
const FAMILY: Partial<Record<Color, string>> = {
  아이보리: '웜', 베이지: '웜', 브라운: '웜', 카키: '웜', 골드: '웜',
  화이트: '그레이', 그레이: '그레이', 차콜: '그레이', 블랙: '그레이', 실버: '그레이',
  네이비: '블루', 블루: '블루', 스카이블루: '블루', 연청: '블루', 중청: '블루', 진청: '블루', 흑청: '그레이',
  민트: '그린', 그린: '그린',
  핑크: '핑크', 라벤더: '핑크', 퍼플: '핑크', 레드: '레드', 와인: '레드',
  옐로우: '옐로우', 오렌지: '옐로우',
};

const isAccent = (color: Color) => !NEUTRALS.has(color);
export const isOnePiece = (item: WardrobeItem) => item.slot === '원피스' || item.kind === '점프수트';
const isTop = (item: WardrobeItem) => item.slot === '상의';
const isBottom = (item: WardrobeItem) => item.slot === '하의' && item.kind !== '점프수트';

export function itemName(item: WardrobeItem): string {
  return item.color === '기타' ? kindLabel(item.kind) : `${item.color} ${kindLabel(item.kind)}`;
}

export type Combo = {
  id: string; // 옷 id를 이어 붙인 것
  items: WardrobeItem[]; // 아우터 → 상의/원피스 → 하의 → 신발 → 가방 순서
  tags: string[]; // 예: ['톤온톤', '기온 맞춤']
  score: number;
};

const ORDER: readonly string[] = ['아우터', '상의', '원피스', '하의', '신발', '가방', '잡화'];
// 몸에 입는 옷이 아니라 곁들이는 것(색 규칙에서 '포인트를 받아 주는' 쪽).
const ACCESSORY: readonly string[] = ['신발', '가방', '잡화'];
const isAccessory = (item: WardrobeItem) => ACCESSORY.includes(item.slot);
const slotIndex = (item: WardrobeItem) => (isOnePiece(item) ? 2 : ORDER.indexOf(item.slot));
const byId = (a: WardrobeItem, b: WardrobeItem) => a.id.localeCompare(b.id);

// 색 규칙을 지키면 [점수, 태그], 포인트 색이 둘 이상이면 null.
export function harmony(items: readonly WardrobeItem[]): { score: number; tags: string[] } | null {
  const colors = items.map((item) => item.color);
  const accents = [...new Set(colors.filter(isAccent))];
  if (accents.length > 1) {
    const families = new Set(accents.map((color) => FAMILY[color] ?? color));
    if (families.size > 1) return null;
  }
  const main = items.filter((item) => !isAccessory(item));
  const mainColors = [...new Set(main.map((item) => item.color))];
  const tags: string[] = [];
  let score = 0;
  if (mainColors.every((color) => MONO.has(color))) {
    tags.push('무채색');
    score += 2;
  } else if (mainColors.length >= 2 && new Set(mainColors.map((color) => FAMILY[color] ?? color)).size === 1) {
    tags.push('톤온톤');
    score += 2;
  } else if (accents.length > 0) {
    tags.push('포인트 컬러 하나');
    score += 1;
    // 신발·가방이 포인트 색을 한 번 더 받아 주면 더 정돈돼 보인다.
    const echo = items.some((item) => isAccessory(item) && accents.includes(item.color));
    const inMain = main.some((item) => accents.includes(item.color));
    if (echo && inMain) score += 1;
  } else {
    tags.push('기본 뉴트럴');
    score += 1;
  }
  // 상의와 하의가 같은 색이면(무채색 제외) 한 덩어리로 보이기 쉽다.
  const top = main.find(isTop);
  const bottom = main.find(isBottom);
  if (top !== undefined && bottom !== undefined) {
    if (top.color === bottom.color && !MONO.has(top.color)) score -= 1;
    // 핏: 위가 넉넉하면 아래는 붙게, 아래가 넓으면 위는 정돈되게.
    const loose = top.visual_fit === '오버사이즈';
    const wide = bottom.visual_fit === '와이드' || bottom.visual_fit === '부츠컷' || bottom.visual_fit === '플레어';
    if (loose && wide) score -= 1;
    else if ((loose && (bottom.visual_fit === '스키니' || bottom.visual_fit === '일자' || bottom.visual_fit === 'H라인'))
      || (wide && (top.visual_fit === '슬림' || top.visual_fit === '레귤러'))) {
      tags.push('핏 밸런스');
      score += 1;
    }
  }
  return { score, tags };
}

// 조합 하나에 한 자리(겉옷·신발·가방)를 가장 잘 어울리는 옷으로 채운다. 맞는 옷이 없으면 그대로 둔다.
function addBest(items: WardrobeItem[], candidates: readonly WardrobeItem[]): WardrobeItem[] {
  let best: WardrobeItem[] = items;
  let bestScore = -Infinity;
  for (const candidate of [...candidates].sort(byId)) {
    const next = [...items, candidate];
    const result = harmony(next);
    if (result !== null && result.score > bestScore) {
      best = next;
      bestScore = result.score;
    }
  }
  return best;
}

type BuildInput = {
  wardrobe: readonly WardrobeItem[];
  day?: DayWeather | undefined;
  anchor?: WardrobeItem; // 이 옷을 꼭 넣는다
  max?: number;
  maxUses?: number; // 같은 옷(고른 옷 제외)이 결과에 나오는 최대 횟수
  recent?: RecentWear; // 최근 입기로 한 옷(11/27) — 최근에 입은 상의·하의가 든 조합은 뒤로
  outer?: WardrobeItem; // 이 겉옷을 그대로 쓴다(11/27: 조합 만들기에서 옷을 골라도 보던 룩의 겉옷은 그대로)
};

export function buildCombos({ wardrobe, day, anchor, max = 6, maxUses = 2, recent = NO_RECENT_WEAR, outer }: BuildInput): Combo[] {
  const fits = (item: WardrobeItem) => day === undefined || fitsTemp(item, day);
  const pool = wardrobe.filter((item) => item.id !== anchor?.id && fits(item));
  const tops = pool.filter(isTop);
  const bottoms = pool.filter(isBottom);
  const onePieces = pool.filter(isOnePiece);
  const outers = pool.filter((item) => item.slot === '아우터');
  const shoes = pool.filter((item) => item.slot === '신발');
  const bags = pool.filter((item) => item.slot === '가방');

  // 1) 몸판(상의+하의 또는 원피스).
  let bases: WardrobeItem[][] = [];
  if (anchor !== undefined && isOnePiece(anchor)) bases = [[anchor]];
  else if (anchor !== undefined && isTop(anchor)) bases = bottoms.map((bottom) => [anchor, bottom]);
  else if (anchor !== undefined && isBottom(anchor)) bases = tops.map((top) => [top, anchor]);
  else {
    bases = [...tops.flatMap((top) => bottoms.map((bottom) => [top, bottom])), ...onePieces.map((piece) => [piece])];
    if (anchor !== undefined) bases = bases.map((base) => [...base, anchor]);
  }

  // 2) 겉옷·신발·가방을 차례로 채운다.
  const wantsOuter = anchor?.slot !== '아우터' && day !== undefined && needsOuter(day);
  const keepOuter = anchor?.slot !== '아우터' && outer !== undefined && outer.id !== anchor?.id ? outer : undefined;
  const combos: Combo[] = [];
  for (const base of bases) {
    let items = base;
    // 정해 둔 겉옷이 있으면 그대로(색이 너무 안 맞아 조합이 안 되면 그때만 다른 겉옷).
    if (keepOuter !== undefined && harmony([...items, keepOuter]) !== null) items = [...items, keepOuter];
    else if (wantsOuter) items = addBest(items, outers);
    if (anchor?.slot !== '신발') items = addBest(items, shoes);
    if (anchor?.slot !== '가방') items = addBest(items, bags);
    const result = harmony(items);
    if (result === null) continue;
    const sorted = [...items].sort((a, b) => slotIndex(a) - slotIndex(b) || byId(a, b));
    const tags = [...result.tags];
    if (day !== undefined) tags.push('기온 맞춤');
    combos.push({ id: sorted.map((item) => item.id).join('+'), items: sorted, tags, score: result.score });
  }
  // 최근에 입은 옷이 적은 조합 → 어울림 점수 → id 순서(11/27).
  const penalty = new Map(combos.map((combo) => [combo.id, wearPenalty(combo.items, combo.id, recent)]));
  combos.sort((a, b) => (penalty.get(a.id) ?? 0) - (penalty.get(b.id) ?? 0) || b.score - a.score || a.id.localeCompare(b.id));

  // 3) 같은 옷만 계속 나오지 않게(상의·하의·원피스 하나당 최대 maxUses번) 고른다. 겉옷·신발·가방은 세지 않는다.
  const uses = new Map<string, number>();
  const picked: Combo[] = [];
  for (const combo of combos) {
    if (picked.length >= max) break;
    const counted = combo.items.filter((item) => item.id !== anchor?.id && (isTop(item) || isBottom(item) || isOnePiece(item)));
    if (counted.some((item) => (uses.get(item.id) ?? 0) >= maxUses)) continue;
    for (const item of counted) uses.set(item.id, (uses.get(item.id) ?? 0) + 1);
    picked.push(combo);
  }
  return picked;
}

// ── 여러 벌 고르기 ──────────────────────────────────
// 날씨·약속(또는 여행 종류)으로 옷 여러 벌을 먼저 골라 두고, 사용자가 더하고 빼면 그 옷들로 만들 수 있는 조합을 다시 센다.

// 처음 골라 둘 옷: 이 옷이 들어간 가장 좋은 조합 세 개에 나온 옷을 모은다.
export function suggestSet(anchor: WardrobeItem, wardrobe: readonly WardrobeItem[], day: DayWeather | undefined): WardrobeItem[] {
  const best = buildCombos({ wardrobe, day, anchor, max: 3 });
  const ids = new Set([anchor.id, ...best.flatMap((combo) => combo.items.map((item) => item.id))]);
  return sortItems(wardrobe.filter((item) => ids.has(item.id)));
}

export function sortItems(items: readonly WardrobeItem[]): WardrobeItem[] {
  return [...items].sort((a, b) => slotIndex(a) - slotIndex(b) || byId(a, b));
}

// 고른 옷으로 만들 수 있는 조합 전부(점수 순). 사용자가 직접 고른 옷이라 기온으로 거르지 않고,
// 겉옷을 여러 벌 골랐으면 겉옷마다 따로 조합을 만든다. 신발·가방은 그 조합에 가장 어울리는 것.
// fixed 옷과 같은 자리라 같이 못 입는 옷인지(11/27): 상의를 정했으면 다른 상의·원피스, 원피스면 상의·하의·다른 원피스,
// 겉옷·신발·가방이면 같은 부위의 다른 옷.
export function competesWith(fixed: WardrobeItem, item: WardrobeItem): boolean {
  if (item.id === fixed.id) return false;
  if (isOnePiece(fixed)) return isTop(item) || isBottom(item) || isOnePiece(item);
  if (isTop(fixed)) return isTop(item) || isOnePiece(item);
  if (isBottom(fixed)) return isBottom(item) || isOnePiece(item);
  return item.slot === fixed.slot;
}

// fixed: 꼭 넣을 옷(11/27: 코디 탭 '내 옷으로 조합 만들기'에서 고른 옷). 그 자리는 이 옷만 쓴다.
export function combosFromSet(selected: readonly WardrobeItem[], day: DayWeather | undefined, fixed?: WardrobeItem): Combo[] {
  const only = (items: WardrobeItem[], pick: (item: WardrobeItem) => boolean) =>
    fixed !== undefined && pick(fixed) ? [fixed] : items;
  const fixedBody = fixed !== undefined && (isTop(fixed) || isBottom(fixed) || isOnePiece(fixed));
  const tops = only(selected.filter(isTop), isTop);
  const bottoms = only(selected.filter(isBottom), isBottom);
  const onePieces = fixedBody && !isOnePiece(fixed) ? [] : only(selected.filter(isOnePiece), isOnePiece);
  const outers = only(selected.filter((item) => item.slot === '아우터'), (item) => item.slot === '아우터');
  const shoes = only(selected.filter((item) => item.slot === '신발'), (item) => item.slot === '신발');
  const bags = only(selected.filter((item) => item.slot === '가방'), (item) => item.slot === '가방');
  const bodies = fixed !== undefined && isOnePiece(fixed)
    ? [[fixed]]
    : [...tops.flatMap((top) => bottoms.map((bottom) => [top, bottom])), ...onePieces.map((piece) => [piece])];
  const outerChoices: WardrobeItem[][] = outers.length === 0 ? [[]] : outers.map((outer) => [outer]);
  const combos: Combo[] = [];
  for (const body of bodies) {
    for (const outer of outerChoices) {
      let items = [...body, ...outer];
      items = addBest(items, shoes);
      items = addBest(items, bags);
      const result = harmony(items);
      if (result === null) continue;
      const sorted = sortItems(items);
      const tags = [...result.tags];
      if (day !== undefined && sorted.every((item) => fitsTemp(item, day))) tags.push('기온 맞춤');
      combos.push({ id: sorted.map((item) => item.id).join('+'), items: sorted, tags, score: result.score + (tags.includes('기온 맞춤') ? 1 : 0) });
    }
  }
  return combos.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

// 고른 옷으로 조합이 하나도 안 나올 때 무엇이 모자란지.
export function setGap(selected: readonly WardrobeItem[]): string | null {
  const top = selected.some(isTop);
  const bottom = selected.some(isBottom);
  if (selected.some(isOnePiece) || (top && bottom)) return null;
  if (top) return '하의를 하나 더하면 조합이 생겨요';
  if (bottom) return '상의를 하나 더하면 조합이 생겨요';
  return '상의와 하의(또는 원피스)를 골라 주세요';
}
