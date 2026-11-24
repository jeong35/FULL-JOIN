// 추천 탭 계산: 저장한 사진마다 옷장 대조 결과(하트 응답)로 코디를 만들고(outfits.ts),
// 필요한 옷이 0개면 '오늘의 룩', 1개면 '하나만 더하면 완성'으로 나눈다.
// 날씨가 있으면 기온별 옷차림 표(weather.ts)에 맞는 룩을 먼저, 약속이 있으면 그 무드(스타일)의 사진을 먼저 둔다.
// 옷장에 없는 옷은 룩에 넣지 않는다(AGENTS.md 절대 규칙 5) — 룩의 옷은 모두 buildOutfits가 고른 내 옷이다.
import { kindLabel, type Slot, type Style } from './catalog';
import { buildOutfits, type OutfitPiece } from './outfits';
import type { Plan } from './plans';
import { compareSaved, rankAlmostLooks, rankCompleteLooks } from './recommendCore';
import { heartStyleImage, type HeartState } from './store';
import type { ArchiveImage, HeartItem, WardrobeItem } from './types';
import { fitsTemp, needsOuter, type DayWeather } from './weather';

export type OwnedPiece = Extract<OutfitPiece, { type: 'owned' }>;
export type Match = '같은 옷' | '비슷한 옷' | '대신 입기';

export function matchOf(piece: OwnedPiece): Match {
  if (piece.substitute) return '대신 입기';
  return piece.similar ? '비슷한 옷' : '같은 옷';
}

export type Look = {
  image: ArchiveImage;
  pieces: OwnedPiece[];
  weatherFit: boolean;
  styleMatch: boolean;
};

export type AlmostLook = {
  image: ArchiveImage;
  owned: OwnedPiece[];
  missing: HeartItem;
  pieces: OutfitPiece[];
  styleMatch: boolean;
};

export type Recommendation = {
  looks: Look[];
  almost: AlmostLook[];
  // 아직 옷장 대조 결과를 받는 중인 사진 수.
  pending: number;
};

export const MAX_LOOKS = 3;
// 추천 탭을 열 때 옷장 대조를 새로 받는 최근 저장 사진 수(서버 부담을 줄이려고 제한한다).
export const RECENT_PHOTOS = 8;

const SLOT_ORDER: readonly Slot[] = ['아우터', '상의', '원피스', '하의', '신발', '가방', '잡화'];

function weatherFits(pieces: readonly OwnedPiece[], day: DayWeather | undefined): boolean {
  if (day === undefined) return true;
  return pieces.every((piece) => fitsTemp(piece.wardrobeItem.kind, piece.wardrobeItem.slot, day));
}

function styleMatches(image: ArchiveImage, styles: readonly Style[]): boolean {
  return styles.length > 0 && image.style.some((style) => styles.includes(style));
}

export function recommend(input: {
  archive: readonly ArchiveImage[];
  hearts: Readonly<Record<string, HeartState>>;
  wardrobe: readonly WardrobeItem[];
  day?: DayWeather;
  plan?: Plan;
  tasteStyles?: readonly Style[];
}): Recommendation {
  const { archive, hearts, wardrobe, day, plan } = input;
  // 약속 무드가 있으면 그것을, 없으면 처음 고른 취향 스타일을 먼저 본다.
  const styles = plan !== undefined && plan.styles.length > 0 ? plan.styles : input.tasteStyles ?? [];
  const looks: Look[] = [];
  const almost: AlmostLook[] = [];
  let pending = 0;
  for (const image of [...archive].sort(compareSaved)) {
    const heart = hearts[image.id];
    const result = heart?.result ?? null;
    if (result === null) {
      if (heart === undefined || heart.status === 'loading') pending += 1;
      continue;
    }
    const [outfit] = buildOutfits(result.items, wardrobe, {}, 1);
    if (outfit === undefined) continue;
    const owned = outfit.pieces.filter((piece): piece is OwnedPiece => piece.type === 'owned');
    const missing = outfit.pieces.filter((piece) => piece.type === 'missing');
    const styleMatch = styleMatches(image, styles);
    if (missing.length === 0 && owned.length >= 2) {
      looks.push({ image, pieces: owned, weatherFit: weatherFits(owned, day), styleMatch });
    } else if (missing.length === 1 && owned.length >= 1) {
      almost.push({ image, owned, missing: missing[0].item, pieces: outfit.pieces, styleMatch });
    }
  }
  return {
    looks: rankCompleteLooks(looks, MAX_LOOKS),
    almost: rankAlmostLooks(almost, MAX_LOOKS),
    pending,
  };
}

// 추천 탭을 열 때 최근 저장 사진의 옷장 대조 결과가 없으면 받아 온다(한 장씩 차례로).
let ensuring = false;
export async function ensureHearts(archive: readonly ArchiveImage[], hearts: Readonly<Record<string, HeartState>>) {
  if (ensuring) return;
  ensuring = true;
  try {
    const targets = [...archive].sort(compareSaved).slice(0, RECENT_PHOTOS).filter((image) => hearts[image.id] === undefined);
    for (const image of targets) await heartStyleImage(image.id);
  } finally {
    ensuring = false;
  }
}

export function sortPieces<T extends { wardrobeItem: WardrobeItem }>(pieces: readonly T[]): T[] {
  return [...pieces].sort((a, b) => SLOT_ORDER.indexOf(a.wardrobeItem.slot) - SLOT_ORDER.indexOf(b.wardrobeItem.slot));
}

// ── 오늘 기온에 맞는 내 옷 ──────────────────────────

const CLOTHING: readonly Slot[] = ['아우터', '상의', '원피스', '하의'];

export function clothesForWeather(wardrobe: readonly WardrobeItem[], day: DayWeather | undefined): WardrobeItem[] {
  return wardrobe
    .filter((item) => CLOTHING.includes(item.slot) && (day === undefined || fitsTemp(item.kind, item.slot, day, 0)))
    .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || a.id.localeCompare(b.id));
}

// ── 시간대별 입는 법 ─────────────────────────────────

// 받침이 있으면 '을', 없으면 '를'.
export function objectParticle(word: string): '을' | '를' {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '을' : '를';
}

export type LookTip = { label: string; text: string };

export function lookTips(pieces: readonly OwnedPiece[], day: DayWeather | undefined): LookTip[] {
  if (day === undefined) return [];
  const outer = pieces.find((piece) => piece.wardrobeItem.slot === '아우터')?.wardrobeItem;
  const top = pieces.find((piece) => piece.wardrobeItem.slot === '상의' || piece.wardrobeItem.slot === '원피스')?.wardrobeItem;
  const morning = `아침 ${day.min}°`;
  const noon = `낮 ${day.max}°`;
  if (outer !== undefined) {
    const lines: LookTip[] = [{ label: morning, text: `나갈 땐 ${kindLabel(outer.kind)}까지 입어요` }];
    if (day.max - day.min >= 8 && top !== undefined) {
      lines.push({ label: noon, text: `${kindLabel(outer.kind)}${objectParticle(kindLabel(outer.kind))} 벗어도 ${kindLabel(top.kind)} 한 장이면 충분해요` });
    } else {
      lines.push({ label: noon, text: `${kindLabel(outer.kind)}${objectParticle(kindLabel(outer.kind))} 입은 채로 괜찮아요` });
    }
    return lines;
  }
  if (needsOuter(day)) return [{ label: morning, text: '쌀쌀해요. 아래 기온에 맞는 내 옷에서 겉옷을 하나 챙기세요' }];
  return [{ label: noon, text: '겉옷 없이 입기 좋아요' }];
}
