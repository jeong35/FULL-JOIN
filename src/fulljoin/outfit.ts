// 코디 조합(AC11). 저장한 사진은 이미 어울리게 입혀진 한 벌이므로, 사진 속 옷 자리를
// 부위별로 내 옷장 옷으로 채운 것을 코디 조합으로 본다(docs/ontology.yaml Outfit).
// 옷장에 없는 자리('구매')는 같은 자리에 입는 가까운 종류의 내 옷으로 '대체'한다(11/10 팀 결정).
// 대체는 코디에서만 쓰고 판정(AC9 gap_status)은 바꾸지 않는다 — 종류가 다르면 다른 옷이다(10/13).
// 옷장에 실제로 등록된 id만 쓰고(AGENTS.md 절대 규칙 5), 한 코디에 같은 옷을 두 번 넣지 않는다.
import { isComparableColor, isSameColorFamily } from "./gap_analysis.ts";

export const MAX_OUTFITS = 3;

// 대체할 수 있는 가까운 종류 짝(양쪽 방향). 같은 부위 목록 안에서만 고른다.
// 재킷↔레더재킷, 로퍼↔플랫슈즈는 '서로 대신 입을 수 없어 나눈' 종류라 넣지 않는다(parse_query.md slot·kind 표).
// mobile/src/data/outfits.ts의 표와 같아야 한다.
export const SUBSTITUTE_KIND_PAIRS = [
  ["민소매", "반소매티셔츠"],
  ["반소매티셔츠", "긴소매티셔츠"],
  ["셔츠", "블라우스"],
  ["니트", "맨투맨"],
  ["맨투맨", "후드"],
  ["슬랙스", "코튼팬츠"],
  ["데님팬츠", "코튼팬츠"],
  ["미디스커트", "롱스커트"],
  ["미니원피스", "미디원피스"],
  ["미디원피스", "롱원피스"],
  ["트렌치코트", "코트"],
  ["점퍼", "야상"],
  ["숏패딩", "롱패딩"],
  ["샌들", "슬리퍼"],
  ["숄더백", "토트백"],
  ["숄더백", "크로스백"],
  ["토트백", "에코백"],
] as const;

const SUBSTITUTE_KINDS = new Map<string, Set<string>>();
for (const [a, b] of SUBSTITUTE_KIND_PAIRS) {
  SUBSTITUTE_KINDS.set(a, (SUBSTITUTE_KINDS.get(a) ?? new Set()).add(b));
  SUBSTITUTE_KINDS.set(b, (SUBSTITUTE_KINDS.get(b) ?? new Set()).add(a));
}

export function substituteKindsFor(kind: string): string[] {
  return [...(SUBSTITUTE_KINDS.get(kind) ?? [])];
}

export type SubstituteSourceItem = { kind: string; color: string | null };
export type SubstituteWardrobeItem = { id: string; kind: string; color: string };
export type Substitute = { wardrobe_item_id: string; same_color: boolean };

// 사진 속 옷을 대체할 내 옷. 가까운 종류이면서 같은 색이나 같은 계열 색이어야 한다.
// 색을 판단할 수 없으면(null·멀티·기타) 근거가 없으니 대체하지 않는다. 같은 색을 먼저 둔다.
export function findSubstitutes(
  item: SubstituteSourceItem,
  wardrobe: readonly SubstituteWardrobeItem[],
): Substitute[] {
  const kinds = SUBSTITUTE_KINDS.get(item.kind);
  const itemColor = item.color;
  if (kinds === undefined || !isComparableColor(itemColor)) return [];
  return wardrobe
    .filter((candidate) => kinds.has(candidate.kind))
    .flatMap((candidate): Substitute[] => {
      if (candidate.color === itemColor) return [{ wardrobe_item_id: candidate.id, same_color: true }];
      if (isSameColorFamily(itemColor, candidate.color)) return [{ wardrobe_item_id: candidate.id, same_color: false }];
      return [];
    })
    .sort((a, b) => Number(b.same_color) - Number(a.same_color) || a.wardrobe_item_id.localeCompare(b.wardrobe_item_id));
}

export type OutfitSourceItem = {
  item_id: string;
  gap_status: "활용" | "비슷함" | "구매" | null;
  wardrobe_item_ids: string[];
  // '구매' 아이템을 대체할 내 옷 id(findSubstitutes 순서). 없으면 그 자리는 비워 둔다.
  substitute_ids?: readonly string[];
};

export type PhotoOutfit = {
  outfit_id: string;
  wardrobe_item_ids: string[];
  item_ids: string[];
};

// 하트 응답용. '활용' 아이템과 대체할 옷이 있는 '구매' 아이템을 채운다. '비슷함'은 사용자가
// 활용을 고를 때 아이템 선택 응답(itemDecisionResponse)에서 따로 돌려준다.
export function buildPhotoOutfits(
  styleImageId: string,
  items: readonly OutfitSourceItem[],
  max = MAX_OUTFITS,
): PhotoOutfit[] {
  const slots = items
    .map((item) => ({
      item_id: item.item_id,
      candidates: item.gap_status === "활용"
        ? [...item.wardrobe_item_ids].sort()
        : item.gap_status === "구매" ? [...(item.substitute_ids ?? [])] : [],
    }))
    .filter((slot) => slot.candidates.length > 0);
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
