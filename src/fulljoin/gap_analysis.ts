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
};

export type GapAnalysisResult = {
  gap_status: GapStatus;
  wardrobe_item_ids: string[];
};

const CROSS_SLOT_KINDS = new Set(["카디건", "후드집업", "베스트", "점프수트"]);

const COLOR_FAMILY_BY_COLOR = new Map<string, string>();

for (const family of [
  ["화이트", "아이보리"],
  ["베이지", "브라운"],
  ["블랙", "차콜", "그레이"],
  ["네이비", "블루", "스카이블루"],
  ["연청", "중청"],
  ["진청", "흑청"],
  ["그린", "카키", "민트"],
  ["레드", "와인", "핑크"],
  ["퍼플", "라벤더"],
  ["옐로우", "오렌지"],
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

function isSameColorFamily(itemColor: string, wardrobeColor: string): boolean {
  const itemFamily = COLOR_FAMILY_BY_COLOR.get(itemColor);
  return itemFamily !== undefined && itemFamily === COLOR_FAMILY_BY_COLOR.get(wardrobeColor);
}

function isComparableColor(color: string | null): color is string {
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
        wardrobe_item_ids: exactColorItems.map((wardrobeItem) => wardrobeItem.id),
      };
    }

    const sameFamilyItems = comparableItems.filter((wardrobeItem) =>
      isSameColorFamily(itemColor, wardrobeItem.color),
    );

    if (sameFamilyItems.length > 0) {
      return {
        gap_status: "비슷함",
        wardrobe_item_ids: sameFamilyItems.map((wardrobeItem) => wardrobeItem.id),
      };
    }
  } else if (comparableItems.length > 0) {
    return {
      gap_status: "비슷함",
      wardrobe_item_ids: comparableItems.map((wardrobeItem) => wardrobeItem.id),
    };
  }

  return { gap_status: "구매", wardrobe_item_ids: [] };
}
