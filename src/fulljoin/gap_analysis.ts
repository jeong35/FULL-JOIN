import { explainGarmentMatch, rankWardrobeCandidates } from "./garment_similarity.ts";

export type GapStatus = "활용" | "비슷함" | "구매";

export type ItemForGapAnalysis = {
  slot: string;
  kind: string;
  color: string | null;
  visual_fit: string | null;
  visibility: "전체" | "일부" | "판단불가";
};

export type WardrobeItemForGapAnalysis = {
  id: string;
  slot: string;
  kind: string;
  color: string;
  visual_fit: string | null;
  material?: readonly string[];
  pattern?: string | null;
  seasons?: readonly string[];
  details?: Readonly<Record<string, string | readonly string[] | undefined>>;
};

export type GapAnalysisResult = {
  gap_status: GapStatus;
  wardrobe_item_ids: string[];
};

export type GapMatchMetadata = {
  wardrobe_item_id: string | null;
  reason_code: "no_candidate" | "exact" | "color_similar" | "fit_difference" | "kind_substitute" | "attribute_difference";
  reason: string;
};

const CROSS_SLOT_KINDS = new Set(["카디건", "후드집업", "베스트", "점프수트"]);

const COLOR_FAMILY_BY_COLOR = new Map<string, string>();

for (const family of [
  ["화이트", "아이보리"],
  ["베이지", "브라운", "모카"],
  ["블랙", "차콜", "그레이"],
  ["네이비", "블루", "스카이블루"],
  ["연청", "중청"],
  ["진청", "흑청"],
  ["그린", "카키", "민트"],
  ["레드", "와인", "핑크", "연핑크"],
  ["퍼플", "라벤더"],
  ["옐로우", "오렌지", "살구"],
  ["실버", "골드"],
] as const) {
  const familyId = family.join("/");
  for (const color of family) {
    COLOR_FAMILY_BY_COLOR.set(color, familyId);
  }
}

function hasMatchingKindAndSlot(
  item: ItemForGapAnalysis,
  wardrobeItem: WardrobeItemForGapAnalysis,
): boolean {
  if (item.kind !== wardrobeItem.kind) {
    return false;
  }

  return item.slot === wardrobeItem.slot || CROSS_SLOT_KINDS.has(item.kind);
}

export function isSameColorFamily(itemColor: string, wardrobeColor: string): boolean {
  const itemFamily = COLOR_FAMILY_BY_COLOR.get(itemColor);
  return itemFamily !== undefined && itemFamily === COLOR_FAMILY_BY_COLOR.get(wardrobeColor);
}

export function isComparableColor(color: string | null): color is string {
  return color !== null && color !== "멀티" && color !== "기타";
}

export function classifyGap(
  item: ItemForGapAnalysis,
  wardrobe: readonly WardrobeItemForGapAnalysis[],
): GapAnalysisResult {
  const itemColor = item.color;
  const comparableItems = wardrobe.filter((wardrobeItem) =>
    hasMatchingKindAndSlot(item, wardrobeItem),
  );

  if (isComparableColor(itemColor)) {
    const exactColorItems = comparableItems.filter(
      (wardrobeItem) => wardrobeItem.color === itemColor,
    );

    if (exactColorItems.length > 0) {
      return {
        gap_status: "활용",
        wardrobe_item_ids: orderBySimilarity(item, exactColorItems),
      };
    }

    const sameFamilyItems = comparableItems.filter((wardrobeItem) =>
      isSameColorFamily(itemColor, wardrobeItem.color),
    );

    if (sameFamilyItems.length > 0) {
      return {
        gap_status: "비슷함",
        wardrobe_item_ids: orderBySimilarity(item, sameFamilyItems),
      };
    }
  } else if (comparableItems.length > 0) {
    return {
      gap_status: "비슷함",
      wardrobe_item_ids: orderBySimilarity(item, comparableItems),
    };
  }

  return { gap_status: "구매", wardrobe_item_ids: [] };
}

// AC9가 만든 후보 버킷의 구성은 바꾸지 않고 그 버킷 안에서만 정렬한다.
// 점수를 계산할 정보가 부족한 후보는 뒤에서 id 오름차순으로 두어 결정성을 유지한다.
function orderBySimilarity(
  item: ItemForGapAnalysis,
  candidates: readonly WardrobeItemForGapAnalysis[],
): string[] {
  const scoreById = new Map(
    rankWardrobeCandidates(item, candidates)
      .map((candidate) => [candidate.wardrobe_item_id, candidate.similarity] as const),
  );
  return [...candidates]
    .sort((left, right) =>
      (scoreById.get(right.id) ?? -1) - (scoreById.get(left.id) ?? -1) ||
      left.id.localeCompare(right.id))
    .map((candidate) => candidate.id);
}

// 공개 메타데이터는 AC9 결과의 첫 후보만 참조한다. 유사도 수치는 제품 UI에 노출하지 않는다.
export function gapMatchMetadata(
  item: ItemForGapAnalysis,
  wardrobe: readonly WardrobeItemForGapAnalysis[],
  gap: GapAnalysisResult,
): GapMatchMetadata {
  const wardrobeItemId = gap.wardrobe_item_ids[0] ?? null;
  const candidate = wardrobeItemId === null
    ? null
    : wardrobe.find((wardrobeItem) => wardrobeItem.id === wardrobeItemId) ?? null;
  const explanation = explainGarmentMatch(item, candidate, gap.gap_status);
  return {
    wardrobe_item_id: candidate?.id ?? null,
    reason_code: explanation.code,
    reason: explanation.summary,
  };
}
