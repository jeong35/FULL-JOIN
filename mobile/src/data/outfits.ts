// 코디 조합(SPEC AC11). 저장한 사진은 이미 어울리게 입혀진 한 벌이라, 사진 속 옷 자리를
// 부위별로 내 옷장 옷으로 채운 것을 코디로 보여 준다(docs/ontology.yaml Outfit).
// 서버 src/fulljoin/outfit.ts와 같은 규칙이고, 화면에서는 '비슷함' 옷도 넣는다.
// 사용자가 '새로 찾기'를 고른 비슷함 옷은 '필요' 자리로 돌린다.
// 옷장에 실제로 있는 옷만 넣고(AGENTS.md 절대 규칙 5), 한 코디에 같은 옷을 두 번 넣지 않는다.
import { SLOTS } from './catalog';
import type { HeartItem, WardrobeItem } from './types';

export const MAX_OUTFITS = 3;

export type OutfitPiece =
  | { type: 'owned'; item: HeartItem; wardrobeItem: WardrobeItem; similar: boolean }
  | { type: 'missing'; item: HeartItem };

export type OutfitSuggestion = {
  id: string;
  pieces: OutfitPiece[];
};

const SLOT_ORDER = ['아우터', '상의', '원피스', '하의', '신발', '가방'] as const;

function slotRank(item: HeartItem): number {
  const index = item.slot === undefined ? -1 : SLOT_ORDER.indexOf(item.slot);
  return index === -1 ? SLOTS.length : index;
}

export function buildOutfits(
  items: readonly HeartItem[],
  wardrobe: readonly WardrobeItem[],
  similarChoices: Readonly<Record<string, '활용' | '구매'>>,
  max = MAX_OUTFITS,
): OutfitSuggestion[] {
  const byId = new Map(wardrobe.map((item) => [item.id, item]));
  const slots = [...items]
    .filter((item) => item.gap_status !== null)
    .sort((a, b) => slotRank(a) - slotRank(b))
    .map((item) => {
      const usable = item.gap_status === '활용'
        || (item.gap_status === '비슷함' && similarChoices[item.item_id] !== '구매');
      const candidates = usable
        ? item.wardrobe_item_ids
          .map((id) => byId.get(id))
          .filter((candidate): candidate is WardrobeItem => candidate !== undefined)
        : [];
      return { item, candidates, similar: item.gap_status === '비슷함' };
    });
  if (!slots.some((slot) => slot.candidates.length > 0)) return [];

  // 고를 옷이 많은 자리가 먼저 바뀌도록 후보가 적은 자리부터 정한다.
  const order = slots.map((_, index) => index)
    .sort((a, b) => slots[a].candidates.length - slots[b].candidates.length || a - b);

  const picks: Map<number, WardrobeItem>[] = [];
  const walk = (depth: number, used: Set<string>, chosen: Map<number, WardrobeItem>) => {
    if (picks.length >= max) return;
    if (depth === order.length) {
      picks.push(new Map(chosen));
      return;
    }
    const slotIndex = order[depth];
    let placed = false;
    for (const candidate of slots[slotIndex].candidates) {
      if (used.has(candidate.id)) continue;
      placed = true;
      chosen.set(slotIndex, candidate);
      used.add(candidate.id);
      walk(depth + 1, used, chosen);
      used.delete(candidate.id);
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
        const wardrobeItem = pick.get(slotIndex);
        return wardrobeItem === undefined
          ? { type: 'missing', item: slot.item }
          : { type: 'owned', item: slot.item, wardrobeItem, similar: slot.similar };
      }),
    }));
}
