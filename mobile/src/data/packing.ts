// 여행 코디·짐 고르기(시험판). 내 옷장 옷만 쓴다(AGENTS.md 절대 규칙 5).
// 1) 짐: 여행 날씨(예보가 없는 날은 평년 기온)와 여행 종류에 맞는 옷 중에서, 서로 많이 맞춰 입을 수 있는 옷을 적게 고른다.
//    가볍게면 상의는 날 수보다 적게, 하의는 2~3일에 한 벌. 겉옷은 쌀쌀한 날이 있을 때 하나(넉넉하게면 둘까지).
//    비 오는 날이 있으면 부츠·스니커즈와 백팩을 먼저 챙긴다.
// 2) 날마다 코디: 고른 짐 안에서 그날 기온·비에 맞고 색이 어울리는(combos.ts harmony) 조합을, 같은 상의가 이어지지 않게 고른다.
// 같은 입력에 같은 결과: 점수가 같으면 옷 id 순서로 정한다.
import { kindLabel, type Kind, type Slot } from './catalog';
import { combosFromSet, harmony, isOnePiece, setGap, type Combo } from './combos';
import { parseKey } from './dates';
import type { TripType, Packing } from './trips';
import type { WardrobeItem } from './types';
import { fitsTemp, needsOuter, type DayWeather, type Region, type Sky } from './weather';

export type TripWeather = Pick<DayWeather, 'min' | 'max' | 'sky' | 'pop'>;
export type TripDay = { index: number; date: string; weather: TripWeather; forecast: boolean; schedule: string };
export type DayOutfit = { day: TripDay; items: WardrobeItem[]; tip: string };
export type ReuseLine = { item: WardrobeItem; days: number[]; note: string };
export type PackPlan = {
  capsule: WardrobeItem[]; // 챙길 옷(아우터 → 상의 → 원피스 → 하의 → 신발 → 가방)
  uses: Record<string, number>; // 옷 id → 여행 동안 입는 횟수
  outfits: DayOutfit[];
  reuse: ReuseLine[]; // 두 번 이상 입는 옷
  combos: Combo[]; // 이 짐으로 만들 수 있는 코디(점수 순)
  notes: string[]; // 옷장에 없어서 아쉬운 것
};

// ── 평년 기온(예보가 없는 먼 날) ─────────────────────
// 중부 지방 달마다 평균 아침 최저·낮 최고(°C, 대략값). 남부·제주는 조금 올린다.
const MONTHLY: readonly (readonly [number, number])[] = [
  [-6, 2], [-4, 5], [1, 11], [7, 18], [13, 23], [18, 27], [22, 29], [23, 31], [17, 26], [10, 20], [3, 12], [-3, 4],
];

export function climateWeather(region: Pick<Region, 'lat'>, date: string): TripWeather {
  const [min, max] = MONTHLY[parseKey(date).getMonth()] ?? [10, 20];
  const [warmMin, warmMax] = region.lat < 34 ? [4, 3] : region.lat < 35.6 ? [2, 1] : [0, 0];
  return { min: min + warmMin, max: max + warmMax, sky: '구름 많음', pop: 0 };
}

// ── 여행 종류별로 먼저 고를 옷·피할 옷 ─────────────────
const DRESSY: readonly Kind[] = ['셔츠', '블라우스', '니트', '슬랙스', '미디스커트', '재킷', '트위드자켓', '트렌치코트', '코트', '숏코트', '하프코트', '롱코트', '로퍼', '플랫슈즈', '힐', '토트백', '숄더백'];
const ACTIVE: readonly Kind[] = ['반소매티셔츠', '긴소매티셔츠', '맨투맨', '후드', '트레이닝상의', '후드집업', '플리스', '점퍼', '야상', '경량패딩', '숏패딩', '데님팬츠', '코튼팬츠', '카고팬츠', '조거팬츠', '레깅스', '스니커즈', '백팩', '크로스백', '모자'];
const PREFER: Record<TripType, { like: readonly Kind[]; avoid: readonly Kind[] }> = {
  휴양: { like: ['반소매티셔츠', '민소매', '블라우스', '미디원피스', '롱원피스', '숏팬츠', '샌들', '에코백', '숄더백'], avoid: ['힐', '클러치'] },
  '도시 구경': { like: ['니트', '맨투맨', '데님팬츠', '스니커즈', '로퍼', '크로스백', '숄더백'], avoid: ['힐', '슬리퍼', '클러치'] },
  '캠핑·등산': { like: ACTIVE, avoid: ['블라우스', '미니스커트', '롱스커트', '롱원피스', '힐', '로퍼', '플랫슈즈', '클러치', '숄더백', '레더재킷', '코트'] },
  출장: { like: DRESSY, avoid: ['후드', '조거팬츠', '숏팬츠', '레깅스', '슬리퍼', '백팩', '에코백', '민소매'] },
  '촬영 여행': { like: ['블라우스', '니트', '미디원피스', '롱원피스', '미디스커트', '트렌치코트', '로퍼', '숄더백'], avoid: ['조거팬츠', '레깅스', '슬리퍼'] },
  MT: { like: ACTIVE, avoid: ['블라우스', '미니스커트', '롱스커트', '롱원피스', '힐', '클러치', '레더재킷'] },
  '새내기 배움터': { like: ACTIVE, avoid: ['미니스커트', '롱원피스', '힐', '클러치', '슬리퍼'] },
  워크숍: { like: ['셔츠', '니트', '맨투맨', '카디건', '슬랙스', '코튼팬츠', '데님팬츠', '재킷', '스니커즈', '로퍼', '백팩', '토트백'], avoid: ['민소매', '숏팬츠', '미니스커트', '힐', '클러치', '슬리퍼'] },
};
const ACTIVE_TYPES: readonly TripType[] = ['캠핑·등산', 'MT', '새내기 배움터'];

function typeScore(item: WardrobeItem, types: readonly TripType[]): number {
  let score = 0;
  for (const type of types) {
    if (PREFER[type].like.includes(item.kind)) score += 1;
    if (PREFER[type].avoid.includes(item.kind)) score -= 2;
  }
  return score;
}

const NEUTRAL_COLORS = new Set(['블랙', '화이트', '아이보리', '그레이', '차콜', '베이지', '브라운', '네이비', '카키', '연청', '중청', '진청', '흑청']);
const neutral = (item: WardrobeItem) => (NEUTRAL_COLORS.has(item.color) ? 1 : 0);
const WET: readonly Sky[] = ['비', '비/눈', '눈', '소나기'];
export const isWet = (weather: TripWeather) => WET.includes(weather.sky) || weather.pop >= 60;
const RAIN_SHOES: readonly Kind[] = ['부츠', '스니커즈'];
const ORDER: readonly Slot[] = ['아우터', '상의', '원피스', '하의', '신발', '가방', '잡화'];
const slotIndex = (item: WardrobeItem) => (isOnePiece(item) ? 2 : ORDER.indexOf(item.slot));
const isTop = (item: WardrobeItem) => item.slot === '상의';
const isBottom = (item: WardrobeItem) => item.slot === '하의' && item.kind !== '점프수트';
// 짐은 겹쳐 입을 수 있어 기온 표보다 3° 넉넉하게 본다.
const fitsDay = (item: WardrobeItem, weather: TripWeather) => fitsTemp(item, weather, 3);

// 점수 배열을 앞에서부터 비교(큰 값이 먼저), 같으면 id 순서.
function pickBest<T extends { id: string }>(items: readonly T[], key: (item: T) => readonly number[]): T | undefined {
  let best: T | undefined;
  let bestKey: readonly number[] = [];
  for (const item of items) {
    const k = key(item);
    if (best === undefined) {
      best = item;
      bestKey = k;
      continue;
    }
    let cmp = 0;
    for (let i = 0; i < k.length && cmp === 0; i += 1) cmp = (k[i] ?? 0) - (bestKey[i] ?? 0);
    if (cmp > 0 || (cmp === 0 && item.id < best.id)) {
      best = item;
      bestKey = k;
    }
  }
  return best;
}

// '와'/'과', '로'/'으로'.
function andParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return `${word}${code >= 0 && code <= 11171 && code % 28 !== 0 ? '과' : '와'}`;
}
function withRo(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const final = code >= 0 && code <= 11171 ? code % 28 : 0;
  return `${word}${final === 0 || final === 8 ? '로' : '으로'}`;
}

export function planTrip(input: {
  wardrobe: readonly WardrobeItem[];
  days: readonly TripDay[];
  types: readonly TripType[];
  packing: Packing;
  chosen?: readonly WardrobeItem[] | undefined; // 사용자가 더하고 뺀 짐. 있으면 이 옷만으로 날마다 코디를 짠다
}): PackPlan {
  const { wardrobe, days, types, packing, chosen } = input;
  const n = days.length;
  const light = packing === '가볍게';
  const active = types.some((type) => ACTIVE_TYPES.includes(type));
  const wetDays = days.filter((day) => isWet(day.weather));
  const coldDays = days.filter((day) => needsOuter(day.weather));
  const daysFit = (item: WardrobeItem) => days.filter((day) => fitsDay(item, day.weather)).length;
  const usable = wardrobe.filter((item) => daysFit(item) > 0);
  const notes: string[] = [];

  type Capsule = { outers: WardrobeItem[]; tops: WardrobeItem[]; bottoms: WardrobeItem[]; onePieces: WardrobeItem[]; shoes: WardrobeItem[]; bags: WardrobeItem[] };
  const autoPick = (): Capsule => {
    // ── 1) 짐 고르기 ──
    // 겉옷: 쌀쌀한 날에 가장 많이 맞는 것.
    const outers: WardrobeItem[] = [];
    if (coldDays.length > 0) {
      const pool = wardrobe.filter((item) => item.slot === '아우터');
      const coldFit = (item: WardrobeItem) => coldDays.filter((day) => fitsDay(item, day.weather)).length;
      const first = pickBest(pool, (item) => [coldFit(item), typeScore(item, types), neutral(item)]);
      if (first !== undefined) outers.push(first);
      else notes.push('쌀쌀한 날 입을 겉옷이 옷장에 없어요');
      if (!light && first !== undefined && coldDays.length >= 3) {
        const second = pickBest(pool.filter((item) => item.id !== first.id && item.kind !== first.kind && coldFit(item) > 0), (item) => [coldFit(item), typeScore(item, types), neutral(item)]);
        if (second !== undefined) outers.push(second);
      }
    }
    const outerForHarmony = outers[0];

    // 하의: 날씨에 많이 맞고, 여행 종류에 맞고, 무난한 색. 같은 종류는 뒤로.
    const bottomTarget = light ? (n <= 2 ? 1 : n <= 5 ? 2 : 3) : Math.min(n, Math.ceil((n + 1) / 2));
    const topCandidates = usable.filter(isTop);
    const bottoms: WardrobeItem[] = [];
    for (let i = 0; i < bottomTarget; i += 1) {
      const pool = usable.filter((item) => isBottom(item) && !bottoms.includes(item));
      const pairs = (item: WardrobeItem) => topCandidates.filter((top) => harmony([top, item, ...(outerForHarmony ? [outerForHarmony] : [])]) !== null).length;
      const next = pickBest(pool, (item) => [
        bottoms.some((b) => b.kind === item.kind) ? 0 : 1,
        daysFit(item),
        typeScore(item, types),
        neutral(item),
        pairs(item),
      ]);
      if (next === undefined) break;
      bottoms.push(next);
    }

    // 상의: 고른 하의와 많이 맞춰 입을 수 있는 것부터.
    const topTarget = light ? (n <= 3 ? n : Math.min(n, 3 + Math.floor((n - 3) / 2))) : n;
    const tops: WardrobeItem[] = [];
    for (let i = 0; i < topTarget; i += 1) {
      const pool = topCandidates.filter((item) => !tops.includes(item));
      const pairs = (item: WardrobeItem) => bottoms.filter((bottom) => harmony([item, bottom, ...(outerForHarmony ? [outerForHarmony] : [])]) !== null).length;
      const next = pickBest(pool, (item) => [
        Math.min(pairs(item), 1),
        tops.some((t) => t.kind === item.kind && t.color === item.color) ? 0 : 1,
        daysFit(item),
        typeScore(item, types),
        pairs(item),
        tops.some((t) => t.kind === item.kind) ? 0 : 1,
        neutral(item),
      ]);
      if (next === undefined) break;
      tops.push(next);
    }

    // 원피스: 휴양·촬영 여행이거나 상·하의로 날을 다 못 채우면 하나 더.
    const onePieces: WardrobeItem[] = [];
    const wantsDress = types.includes('휴양') || types.includes('촬영 여행') || tops.length === 0 || bottoms.length === 0;
    if (wantsDress) {
      const dress = pickBest(usable.filter(isOnePiece), (item) => [daysFit(item), typeScore(item, types), neutral(item)]);
      if (dress !== undefined) onePieces.push(dress);
    }
    if (onePieces.length === 0 && (tops.length === 0 || bottoms.length === 0)) {
      notes.push(tops.length === 0 ? '여행 날씨에 맞는 상의가 옷장에 없어요' : '여행 날씨에 맞는 하의가 옷장에 없어요');
    }

    // 신발: 가장 두루 맞는 한 켤레 + 비 오는 날이 있으면 부츠·스니커즈.
    const shoes: WardrobeItem[] = [];
    const shoePool = wardrobe.filter((item) => item.slot === '신발' && daysFit(item) > 0);
    const baseShoe = pickBest(shoePool, (item) => [daysFit(item), typeScore(item, types) + (active && item.kind === '스니커즈' ? 2 : 0), neutral(item)]);
    if (baseShoe !== undefined) shoes.push(baseShoe);
    if (wetDays.length > 0 && baseShoe !== undefined && !RAIN_SHOES.includes(baseShoe.kind)) {
      const rain = pickBest(shoePool.filter((item) => RAIN_SHOES.includes(item.kind)), (item) => [item.kind === '부츠' ? 1 : 0, neutral(item)]);
      if (rain !== undefined) shoes.push(rain);
    }

    // 가방: 하나 + 비 오는 날이나 활동 많은 여행이면 백팩.
    const bags: WardrobeItem[] = [];
    const bagPool = wardrobe.filter((item) => item.slot === '가방');
    const baseBag = pickBest(bagPool, (item) => [typeScore(item, types), item.kind === '숄더백' || item.kind === '크로스백' ? 1 : 0, neutral(item)]);
    if (baseBag !== undefined) bags.push(baseBag);
    if ((wetDays.length > 0 || active) && baseBag !== undefined && baseBag.kind !== '백팩') {
      const pack = bagPool.find((item) => item.kind === '백팩');
      if (pack !== undefined) bags.push(pack);
    }
    return { outers, tops, bottoms, onePieces, shoes, bags };
  };

  // 사용자가 고친 짐: 고른 옷을 자리별로 나누고, 날씨에 비해 빠진 것만 알려 준다.
  const fromChosen = (items: readonly WardrobeItem[]): Capsule => {
    const coldFit = (item: WardrobeItem) => coldDays.filter((day) => fitsDay(item, day.weather)).length;
    const bySlot = (test: (item: WardrobeItem) => boolean) => items.filter(test);
    const outers = bySlot((item) => item.slot === '아우터').sort((a, b) => coldFit(b) - coldFit(a) || a.id.localeCompare(b.id));
    const shoes = bySlot((item) => item.slot === '신발');
    const picked: Capsule = {
      outers,
      tops: bySlot(isTop),
      bottoms: bySlot(isBottom),
      onePieces: bySlot(isOnePiece),
      shoes,
      bags: bySlot((item) => item.slot === '가방'),
    };
    const gap = setGap(items);
    if (gap !== null) notes.push(gap);
    if (coldDays.length > 0 && outers.length === 0) notes.push('쌀쌀한 날이 있어요. 겉옷을 하나 더해 보세요');
    if (wetDays.length > 0 && !shoes.some((item) => RAIN_SHOES.includes(item.kind))) notes.push('비 오는 날이 있어요. 부츠나 스니커즈가 있으면 좋아요');
    return picked;
  };

  const { outers, tops, bottoms, onePieces, shoes, bags } = chosen === undefined ? autoPick() : fromChosen(chosen);

  // ── 2) 날마다 코디 ──
  const bodies: WardrobeItem[][] = [...tops.flatMap((top) => bottoms.map((bottom) => [top, bottom])), ...onePieces.map((piece) => [piece])];
  const uses: Record<string, number> = {};
  const outfits: DayOutfit[] = [];
  let previousTop: string | undefined;
  for (const day of days) {
    const w = day.weather;
    const wet = isWet(w);
    const outer = needsOuter(w) ? pickBest(outers, (item) => [fitsDay(item, w) ? 1 : 0]) : undefined;
    const shoe = wet ? (shoes.find((item) => RAIN_SHOES.includes(item.kind)) ?? shoes[0]) : shoes[0];
    const bag = (wet || active) ? (bags.find((item) => item.kind === '백팩') ?? bags[0]) : bags[0];
    const extras = [outer, shoe, bag].filter((item): item is WardrobeItem => item !== undefined);
    let best: { items: WardrobeItem[]; score: number; id: string } | undefined;
    for (const body of bodies) {
      const full = [...body, ...extras];
      const h = harmony(full) ?? harmony([...body, ...(outer ? [outer] : [])]);
      if (h === null) continue;
      let score = h.score;
      for (const piece of body) {
        score += fitsDay(piece, w) ? 2 : -3;
        const worn = uses[piece.id] ?? 0;
        score -= isTop(piece) || isOnePiece(piece) ? worn * 3 : worn;
      }
      if (body[0]?.id === previousTop) score -= 3;
      const id = full.map((item) => item.id).join('+');
      if (best === undefined || score > best.score || (score === best.score && id < best.id)) best = { items: full, score, id };
    }
    if (best === undefined) continue;
    const items = [...best.items].sort((a, b) => slotIndex(a) - slotIndex(b) || a.id.localeCompare(b.id));
    for (const item of items) uses[item.id] = (uses[item.id] ?? 0) + 1;
    previousTop = items.find((item) => isTop(item) || isOnePiece(item))?.id;
    outfits.push({ day, items, tip: dayTip(w, items) });
  }

  // 추천 짐은 실제로 한 번이라도 입는 옷만, 사용자가 고친 짐은 고른 옷 전부(안 입는 옷은 ×0).
  const capsule = [...outers, ...tops, ...onePieces, ...bottoms, ...shoes, ...bags]
    .filter((item) => chosen !== undefined || (uses[item.id] ?? 0) > 0)
    .sort((a, b) => slotIndex(a) - slotIndex(b) || (uses[b.id] ?? 0) - (uses[a.id] ?? 0) || a.id.localeCompare(b.id));
  const combos = combosFromSet(capsule, undefined);

  // ── 3) 하나로 여러 번 ──
  const reuse: ReuseLine[] = capsule
    .filter((item) => (uses[item.id] ?? 0) >= 2)
    .sort((a, b) => (uses[b.id] ?? 0) - (uses[a.id] ?? 0) || slotIndex(a) - slotIndex(b) || a.id.localeCompare(b.id))
    .slice(0, 4)
    .map((item) => {
      const worn = outfits.filter((outfit) => outfit.items.some((piece) => piece.id === item.id));
      const dayNumbers = worn.map((outfit) => outfit.day.index + 1);
      let note: string;
      if (item.slot === '아우터') {
        const wetToo = worn.some((outfit) => isWet(outfit.day.weather)) && worn.some((outfit) => !isWet(outfit.day.weather));
        note = wetToo ? '맑은 날도 비 오는 날도 하나로' : `${dayNumbers.map((d) => `${d}일차`).join(' · ')} 쌀쌀한 날마다`;
      } else if (isBottom(item) || isTop(item)) {
        note = worn.map((outfit) => {
          const partner = outfit.items.find((piece) => (isBottom(item) ? isTop(piece) : isBottom(piece)));
          return `${outfit.day.index + 1}일차 ${partner ? andParticle(kindLabel(partner.kind)) : ''}`.trim();
        }).join(' · ');
      } else {
        note = worn.map((outfit) => `${outfit.day.index + 1}일차${outfit.day.schedule ? ` ${outfit.day.schedule.split(/[,·→]/)[0]?.trim() ?? ''}` : ''}`).join(' · ');
      }
      return { item, days: dayNumbers, note };
    });

  return { capsule, uses, outfits, reuse, combos, notes };
}

function dayTip(w: TripWeather, items: readonly WardrobeItem[]): string {
  const outer = items.find((item) => item.slot === '아우터');
  const top = items.find((item) => isTop(item) || isOnePiece(item));
  const shoe = items.find((item) => item.slot === '신발');
  const bag = items.find((item) => item.slot === '가방');
  if (isWet(w)) {
    const gear = shoe !== undefined && RAIN_SHOES.includes(shoe.kind)
      ? (bag?.kind === '백팩' ? `${andParticle(kindLabel(shoe.kind))} 백팩으로` : withRo(kindLabel(shoe.kind)))
      : bag?.kind === '백팩' ? '백팩으로' : '';
    return gear !== '' ? `비 소식이 있어 ${gear} 골랐어요. 우산도 챙겨요` : '비 소식이 있어요. 우산과 젖어도 되는 신발을 챙겨요';
  }
  if (outer !== undefined && top !== undefined && w.max - w.min >= 8) return `아침엔 ${kindLabel(outer.kind)}까지 입고, 낮엔 벗어도 ${kindLabel(top.kind)} 한 장이면 돼요`;
  if (outer !== undefined) return `쌀쌀해요. ${kindLabel(outer.kind)} 입은 채로 다니기 좋아요`;
  return '겉옷 없이 가볍게 다니기 좋아요';
}
