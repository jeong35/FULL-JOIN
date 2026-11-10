import { z } from "zod";

import { classifyGap, type ItemForGapAnalysis, type WardrobeItemForGapAnalysis } from "./gap_analysis.ts";
import { similarSearchProducts, similarSearchQuery } from "./shopping.ts";

export const chatHistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1_000),
}).strict();

export const chatInputSchema = z.object({
  user_id: z.string().trim().min(1),
  style_image_id: z.string().trim().min(1),
  message: z.string().trim().min(1).max(500),
  history: z.array(chatHistoryMessageSchema).max(8).optional(),
}).strict();

export const chatModelOutputSchema = z.object({
  answer: z.string().trim().min(1).max(1_200),
}).strict();

export type ChatItem = ItemForGapAnalysis & {
  item_id: string;
  brand: string | null;
  brand_source: "쇼핑몰_상품정보" | "캡션" | "이미지_글자" | "없음";
};

export type ChatWardrobeItem = WardrobeItemForGapAnalysis & {
  kind: string;
  color: string;
  visual_fit: string | null;
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function wardrobeLabel(item: ChatWardrobeItem): string {
  return [item.kind, item.color, item.visual_fit].filter((value) => value !== null).join(" · ");
}

function itemLabel(item: ChatItem): string {
  return [item.color, item.visual_fit, item.kind].filter((value) => value !== null).join(" ");
}

export function buildChatResponse(
  styleImageId: string,
  message: string,
  items: readonly ChatItem[],
  wardrobe: readonly ChatWardrobeItem[],
) {
  const gaps = items.map((item) => ({ item, gap: classifyGap(item, wardrobe) }));
  const claimedOwnedItemIds = unique(gaps.flatMap(({ gap }) => gap.wardrobe_item_ids));
  const ownedById = new Map(wardrobe.map((item) => [item.id, item]));
  const reusableLabels = claimedOwnedItemIds.flatMap((id) => {
    const item = ownedById.get(id);
    return item === undefined ? [] : [wardrobeLabel(item)];
  });
  const missingLabels = gaps
    .filter(({ gap }) => gap.gap_status === "구매")
    .map(({ item }) => itemLabel(item));

  const wantsShopping = /(찾|구매|살|사고|쇼핑|비슷|다른\s*색)/u.test(message);
  const mentionedItem = items.find((item) => message.includes(item.kind));
  const shoppingItem = mentionedItem
    ?? gaps.find(({ gap }) => gap.gap_status !== "활용")?.item
    ?? items[0];

  let answer: string;
  let products: Array<{ item_id: string; platform: string; url: string; match_type: "similar" }> = [];
  if (wantsShopping && shoppingItem !== undefined) {
    const query = similarSearchQuery(shoppingItem);
    answer = `${query} 비슷한 상품 검색으로 연결해 드릴게요. 같은 상품이라고 단정하지 않아요.`;
    products = similarSearchProducts(shoppingItem);
  } else if (wardrobe.length === 0) {
    answer = "옷장이 비어 있어 가진 옷으로 코디를 확인할 수 없어요. 옷을 먼저 등록해 주세요.";
  } else {
    const parts = reusableLabels.length > 0
      ? [`옷장에 등록된 ${reusableLabels.join(", ")}을 활용할 수 있어요.`]
      : ["사진 속 아이템과 같은 종류의 옷이 현재 옷장에는 없어요."];
    if (missingLabels.length > 0) parts.push(`사진의 ${missingLabels.join(", ")}은 옷장에 대응하는 옷이 없어요.`);
    answer = parts.join(" ");
  }

  return {
    answer,
    analysis_id_used: styleImageId,
    claimed_owned_item_ids: claimedOwnedItemIds,
    products,
    image_reanalysis_count: 0,
    external_instruction_applied: false,
  };
}
