// 코디 조합(AC11). 저장한 사진은 이미 어울리게 입혀진 한 벌이므로, 사진 속 옷 자리를
// 부위별로 내 옷장 옷으로 채운 것을 코디 조합으로 본다(docs/ontology.yaml Outfit).
// 옷장에 실제로 등록된 id만 쓰고(AGENTS.md 절대 규칙 5), 한 코디에 같은 옷을 두 번 넣지 않는다.

export const MAX_OUTFITS = 3;

export type OutfitSourceItem = {
  item_id: string;
  gap_status: "활용" | "비슷함" | "구매" | null;
  wardrobe_item_ids: string[];
};

export type PhotoOutfit = {
  outfit_id: string;
  wardrobe_item_ids: string[];
  item_ids: string[];
};

// 하트 응답용. '활용' 아이템만 채운다. '비슷함'은 사용자가 활용을 고를 때
// 아이템 선택 응답(itemDecisionResponse)에서 따로 돌려준다.
export function buildPhotoOutfits(
  styleImageId: string,
  items: readonly OutfitSourceItem[],
  max = MAX_OUTFITS,
): PhotoOutfit[] {
  const slots = items
    .filter((item) => item.gap_status === "활용" && item.wardrobe_item_ids.length > 0)
    .map((item) => ({ item_id: item.item_id, candidates: [...item.wardrobe_item_ids].sort() }));
  if (slots.length === 0) return [];

  // 고를 옷이 많은 자리가 먼저 바뀌도록 후보가 적은 자리부터 정한다.
  const ordered = slots.map((slot, index) => ({ slot, index }))
    .sort((a, b) => a.slot.candidates.length - b.slot.candidates.length || a.index - b.index);

  const picks: Map<number, string>[] = [];
  const walk = (depth: number, used: Set<string>, chosen: Map<number, string>) => {
    if (picks.length >= max) return;
    const next = ordered[depth];
    if (next === undefined) {
      picks.push(new Map(chosen));
      return;
    }
    let placed = false;
    for (const id of next.slot.candidates) {
      if (used.has(id)) continue;
      placed = true;
      chosen.set(next.index, id);
      used.add(id);
      walk(depth + 1, used, chosen);
      used.delete(id);
      chosen.delete(next.index);
      if (picks.length >= max) return;
    }
    // 후보가 모두 다른 자리에 쓰였으면 이 자리는 비워 둔다.
    if (!placed) walk(depth + 1, used, chosen);
  };
  walk(0, new Set(), new Map());

  return picks
    .filter((pick) => pick.size > 0)
    .map((pick, index) => {
      const covered = slots.map((slot, slotIndex) => ({ slot, id: pick.get(slotIndex) }))
        .filter((entry): entry is { slot: { item_id: string; candidates: string[] }; id: string } => entry.id !== undefined);
      return {
        outfit_id: `${styleImageId}-OUTFIT-${String(index + 1).padStart(2, "0")}`,
        wardrobe_item_ids: covered.map((entry) => entry.id),
        item_ids: covered.map((entry) => entry.slot.item_id),
      };
    });
}
