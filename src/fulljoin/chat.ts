import { z } from "zod";

import {
  classifyGap,
  gapMatchMetadata,
  type ItemForGapAnalysis,
  type WardrobeItemForGapAnalysis,
} from "./gap_analysis.ts";
import { findSubstitutes } from "./outfit.ts";
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

export type ChatIntent = "wardrobe_outfit" | "product_search" | "photo_item" | "general_advice";

const WARDROBE_KIND_ALIASES = new Map<string, string>([
  ["청바지", "데님팬츠"],
]);

function mentionedWardrobeKinds(message: string, wardrobe: readonly ChatWardrobeItem[]): string[] {
  const canonical = wardrobe.map((item) => item.kind).filter((kind) => message.includes(kind));
  const aliases = [...WARDROBE_KIND_ALIASES]
    .filter(([alias]) => message.includes(alias))
    .map(([, kind]) => kind);
  return unique([...canonical, ...aliases]);
}

export function classifyChatIntents(message: string): ChatIntent[] {
  const intents: ChatIntent[] = [];
  if (/(찾|구매|살|사고|쇼핑|상품|링크|비슷한\s*제품|다른\s*색)/u.test(message)) intents.push("product_search");
  if (/(내\s*옷|옷장|가지고|보유|있는\s*옷|뭐\s*입|코디|활용|대체|어울|내\s*[가-힣A-Za-z0-9]{1,12}(?:이랑|랑|하고|과|와).*(?:입|코디|어울))/u.test(message)) intents.push("wardrobe_outfit");
  if (/(사진|사진\s*속|이\s*옷|무슨\s*옷|아이템|분석)/u.test(message)) intents.push("photo_item");
  return intents.length > 0 ? intents : ["general_advice"];
}

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
  const ownedById = new Map(wardrobe.map((item) => [item.id, item]));
  const intents = classifyChatIntents(message);
  const mentionedKinds = mentionedWardrobeKinds(message, wardrobe);
  const explicitlyMentionedOwned = wardrobe.filter((item) => mentionedKinds.includes(item.kind));
  const gaps = items.map((item) => {
    const gap = classifyGap(item, wardrobe);
    const substitutes = gap.gap_status === "구매" ? findSubstitutes(item, wardrobe) : [];
    return {
      item,
      gap,
      match_metadata: gapMatchMetadata(item, wardrobe, gap),
      substitute_wardrobe_item_ids: substitutes.map((entry) => entry.wardrobe_item_id),
    };
  });
  const comparisonOwnedItemIds = unique(gaps.flatMap(({ gap, substitute_wardrobe_item_ids }) => [
    ...gap.wardrobe_item_ids,
    ...substitute_wardrobe_item_ids,
  ])).filter((id) => ownedById.has(id));
  const claimedOwnedItemIds = unique([
    ...comparisonOwnedItemIds,
    ...explicitlyMentionedOwned.map((item) => item.id),
  ]);
  const reusableLabels = claimedOwnedItemIds.flatMap((id) => {
    const item = ownedById.get(id);
    return item === undefined ? [] : [wardrobeLabel(item)];
  });
  const missingLabels = gaps
    .filter(({ gap }) => gap.gap_status === "구매")
    .map(({ item }) => itemLabel(item));

  const wantsShopping = intents.includes("product_search");
  const wantsWardrobe = intents.includes("wardrobe_outfit");
  const wantsPhoto = intents.includes("photo_item");
  const mentionedItem = items.find((item) => message.includes(item.kind));
  const shoppingItem = mentionedItem
    ?? gaps.find(({ gap }) => gap.gap_status !== "활용")?.item
    ?? items[0];

  let products: Array<{ item_id: string; platform: string; url: string; match_type: "similar" }> = [];
  const answerParts: string[] = [];
  if (wantsWardrobe) {
    if (wardrobe.length === 0) {
      answerParts.push("옷장이 비어 있어 가진 옷으로 코디를 확인할 수 없어요. 옷을 먼저 등록해 주세요.");
    } else {
      answerParts.push(reusableLabels.length > 0
        ? `옷장에 실제 등록된 ${reusableLabels.join(", ")}을 활용하거나 승인된 대체 후보로 검토할 수 있어요.`
        : "사진 속 아이템과 활용하거나 대체할 수 있는 옷이 현재 옷장에는 없어요.");
      if (missingLabels.length > 0) {
        answerParts.push(`사진의 ${missingLabels.join(", ")}은 같은 종류·색 기준으로 새로 찾기가 필요해요.`);
      }
      if (explicitlyMentionedOwned.length > 0) {
        const labels = explicitlyMentionedOwned.map(wardrobeLabel);
        answerParts.push(`질문한 ${labels.join(", ")}은 옷장에 등록돼 있어요.`);
        const outsideComparison = explicitlyMentionedOwned.filter((item) => !comparisonOwnedItemIds.includes(item.id));
        if (outsideComparison.length > 0) {
          answerParts.push("다만 현재 사진 비교의 활용 또는 승인된 대체 후보에는 포함되지 않아요.");
        }
      }
      const missingMentionedKinds = mentionedKinds.filter((kind) => !wardrobe.some((item) => item.kind === kind));
      if (missingMentionedKinds.length > 0) {
        answerParts.push(`${missingMentionedKinds.join(", ")}은 현재 옷장에 등록돼 있지 않아요.`);
      }
    }
  }
  if (wantsPhoto) {
    answerParts.push(`저장된 사진 분석에서 확인한 아이템은 ${items.map(itemLabel).join(", ")}예요.`);
  }
  if (wantsShopping && shoppingItem !== undefined) {
    const query = similarSearchQuery(shoppingItem);
    answerParts.push(`${query} 비슷한 상품 검색으로 연결해 드릴게요. 같은 상품이라고 단정하지 않아요.`);
    products = similarSearchProducts(shoppingItem);
  }
  if (answerParts.length === 0) {
    answerParts.push("저장된 사진 분석과 현재 옷장을 구분해 답변할게요.");
  }

  return {
    answer: answerParts.join(" "),
    intents,
    analysis_id_used: styleImageId,
    claimed_owned_item_ids: claimedOwnedItemIds,
    comparison: gaps.map(({ item, gap, match_metadata, substitute_wardrobe_item_ids }) => ({
      item_id: item.item_id,
      gap_status: gap.gap_status,
      wardrobe_item_ids: gap.wardrobe_item_ids,
      substitute_wardrobe_item_ids,
      match_metadata,
    })),
    products,
    image_reanalysis_count: 0,
    external_instruction_applied: false,
  };
}
