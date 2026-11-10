// 코디 조합(SPEC AC11). 저장한 사진은 이미 어울리게 입혀진 한 벌이라, 사진 속 옷 자리를
// 부위별로 내 옷장 옷으로 채운 것을 코디로 보여 준다(docs/ontology.yaml Outfit).
// 서버 src/fulljoin/outfit.ts와 같은 규칙이고, 화면에서는 '비슷함' 옷도 넣는다.
// 자리마다 활용 → 비슷함 → 대체 순서로 채운다(11/10 팀 결정). 대체는 같은 자리에 입는 가까운 종류의
// 내 옷(같은 색·같은 계열 색)이다. 비슷함 옷이 있으면 그걸 먼저 넣고, 다음 코디나 비슷함이 없는 자리에 대체 옷을 넣는다.
// 채울 옷이 없으면 '필요'로 두고 쇼핑 링크를 단다. 비슷함·대체 옷은 사용자가 '새로 찾기'를 고르면 '필요' 자리로 돌린다.
// 옷장에 실제로 있는 옷만 넣고(AGENTS.md 절대 규칙 5), 한 코디에 같은 옷을 두 번 넣지 않는다.
import { SLOTS } from './catalog';
import type { HeartItem, WardrobeItem } from './types';

export const MAX_OUTFITS = 3;

// 대체할 수 있는 가까운 종류 짝(양쪽 방향). 서버 src/fulljoin/outfit.ts의 SUBSTITUTE_KIND_PAIRS와 같아야 한다.
const SUBSTITUTE_KIND_PAIRS: readonly (readonly [string, string])[] = [
  ['민소매', '반소매티셔츠'],
  ['반소매티셔츠', '긴소매티셔츠'],
  ['셔츠', '블라우스'],
  ['니트', '맨투맨'],
  ['맨투맨', '후드'],
  ['슬랙스', '코튼팬츠'],
  ['데님팬츠', '코튼팬츠'],
  ['미디스커트', '롱스커트'],
  ['미니원피스', '미디원피스'],
  ['미디원피스', '롱원피스'],
  ['트렌치코트', '코트'],
  ['점퍼', '야상'],
  ['숏패딩', '롱패딩'],
  ['샌들', '슬리퍼'],
  ['숄더백', '토트백'],
  ['숄더백', '크로스백'],
  ['토트백', '에코백'],
];

// 색 계열(SPEC AC9). 서버 src/fulljoin/gap_analysis.ts와 같다.
const COLOR_FAMILIES: readonly (readonly string[])[] = [
  ['화이트', '아이보리'],
  ['베이지', '브라운'],
  ['블랙', '차콜', '그레이'],
  ['네이비', '블루', '스카이블루'],
  ['연청', '중청'],
  ['진청', '흑청'],
  ['그린', '카키', '민트'],
  ['레드', '와인', '핑크'],
  ['퍼플', '라벤더'],
  ['옐로우', '오렌지'],
  ['실버', '골드'],
];

const SUBSTITUTE_KINDS = new Map<string, Set<string>>();
for (const [a, b] of SUBSTITUTE_KIND_PAIRS) {
  SUBSTITUTE_KINDS.set(a, (SUBSTITUTE_KINDS.get(a) ?? new Set()).add(b));
  SUBSTITUTE_KINDS.set(b, (SUBSTITUTE_KINDS.get(b) ?? new Set()).add(a));
}

const FAMILY_BY_COLOR = new Map<string, number>();
COLOR_FAMILIES.forEach((family, index) => family.forEach((color) => FAMILY_BY_COLOR.set(color, index)));

export type OutfitPiece =
  | { type: 'owned'; item: HeartItem; wardrobeItem: WardrobeItem; similar: boolean; substitute: boolean }
  | { type: 'missing'; item: HeartItem };

export type OutfitSuggestion = {
  id: string;
  pieces: OutfitPiece[];
};

type Candidate = { wardrobeItem: WardrobeItem; similar: boolean; substitute: boolean };

const SLOT_ORDER = ['아우터', '상의', '원피스', '하의', '신발', '가방'] as const;

function slotRank(item: HeartItem): number {
  const index = item.slot === undefined ? -1 : SLOT_ORDER.indexOf(item.slot);
  return index === -1 ? SLOTS.length : index;
}

// 사진 속 옷을 대체할 내 옷: 가까운 종류이면서 같은 색(먼저) 또는 같은 계열 색.
// 색을 판단할 수 없으면(null·멀티·기타) 근거가 없으니 대체하지 않는다.
function findSubstitutes(item: HeartItem, wardrobe: readonly WardrobeItem[]): Candidate[] {
  const kinds = item.kind === undefined ? undefined : SUBSTITUTE_KINDS.get(item.kind);
  const color = item.color;
  if (kinds === undefined || color === null || color === undefined || color === '멀티' || color === '기타') return [];
  const family = FAMILY_BY_COLOR.get(color);
  return wardrobe
    .filter((candidate) => kinds.has(candidate.kind))
    .flatMap((candidate): Candidate[] => {
      if (candidate.color === color) return [{ wardrobeItem: candidate, similar: false, substitute: true }];
      if (family !== undefined && FAMILY_BY_COLOR.get(candidate.color) === family) {
        return [{ wardrobeItem: candidate, similar: true, substitute: true }];
      }
      return [];
    })
    .sort((a, b) => Number(a.similar) - Number(b.similar) || a.wardrobeItem.id.localeCompare(b.wardrobeItem.id));
}

// 목록 카드의 '대체' 태그용. '구매' 아이템만 본다(비슷함이 있는 아이템은 비슷함 태그가 먼저다).
export function substitutesFor(item: HeartItem, wardrobe: readonly WardrobeItem[]): WardrobeItem[] {
  return item.gap_status === '구매' ? findSubstitutes(item, wardrobe).map((candidate) => candidate.wardrobeItem) : [];
}

export function buildOutfits(
  items: readonly HeartItem[],
  wardrobe: readonly WardrobeItem[],
  similarChoices: Readonly<Record<string, '활용' | '구매'>>,
  max = MAX_OUTFITS,
): OutfitSuggestion[] {
  const byId = new Map(wardrobe.map((item) => [item.id, item]));
  const owned = (item: HeartItem, similar: boolean): Candidate[] => item.wardrobe_item_ids
    .map((id) => byId.get(id))
    .filter((candidate): candidate is WardrobeItem => candidate !== undefined)
    .map((wardrobeItem) => ({ wardrobeItem, similar, substitute: false }));
  const slots = [...items]
    .filter((item) => item.gap_status !== null)
    .sort((a, b) => slotRank(a) - slotRank(b))
    .map((item) => {
      let candidates: Candidate[] = [];
      if (item.gap_status === '활용') candidates = owned(item, false);
      else if (item.gap_status === '비슷함' && similarChoices[item.item_id] !== '구매') {
        candidates = [...owned(item, true), ...findSubstitutes(item, wardrobe)];
      }
      else if (item.gap_status === '구매' && similarChoices[item.item_id] !== '구매') candidates = findSubstitutes(item, wardrobe);
      return { item, candidates };
    });
  if (!slots.some((slot) => slot.candidates.length > 0)) return [];

  // 고를 옷이 많은 자리가 먼저 바뀌도록 후보가 적은 자리부터 정한다.
  const order = slots.map((_, index) => index)
    .sort((a, b) => slots[a].candidates.length - slots[b].candidates.length || a - b);

  const picks: Map<number, Candidate>[] = [];
  const walk = (depth: number, used: Set<string>, chosen: Map<number, Candidate>) => {
    if (picks.length >= max) return;
    if (depth === order.length) {
      picks.push(new Map(chosen));
      return;
    }
    const slotIndex = order[depth];
    let placed = false;
    for (const candidate of slots[slotIndex].candidates) {
      if (used.has(candidate.wardrobeItem.id)) continue;
      placed = true;
      chosen.set(slotIndex, candidate);
      used.add(candidate.wardrobeItem.id);
      walk(depth + 1, used, chosen);
      used.delete(candidate.wardrobeItem.id);
      chosen.delete(slotIndex);
      if (picks.length >= max) return;
    }
    if (!placed) walk(depth + 1, used, chosen);
  };
  walk(0, new Set(), new Map());

  return picks
    .filter((pick) => pick.size > 0)
    .map((pick, index) => ({
      id: `outfit-${index + 1}`,
      pieces: slots.map((slot, slotIndex): OutfitPiece => {
        const candidate = pick.get(slotIndex);
        return candidate === undefined
          ? { type: 'missing', item: slot.item }
          : { type: 'owned', item: slot.item, ...candidate };
      }),
    }));
}
