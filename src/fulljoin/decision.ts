import { z } from "zod";

import type { GapAnalysisResult } from "./gap_analysis.ts";
import { similarSearchProducts } from "./shopping.ts";

export const itemDecisionInputSchema = z.object({
  user_id: z.string().trim().min(1),
  decision: z.enum(["활용", "구매"]),
}).strict();

export type DecisionItem = {
  item_id: string;
  shop: string | null;
  product_url: string | null;
  kind?: string;
  color?: string | null;
  visual_fit?: string | null;
  brand?: string | null;
  brand_source?: "쇼핑몰_상품정보" | "캡션" | "이미지_글자" | "없음";
};

export function itemDecisionResponse(
  item: DecisionItem,
  gap: GapAnalysisResult,
  decision: "활용" | "구매",
  includeSimilarFallback = false,
) {
  const wardrobeItemIds = [...gap.wardrobe_item_ids].sort();
  const outfits = decision === "활용"
    ? wardrobeItemIds.map((wardrobeItemId, index) => ({
      outfit_id: `${item.item_id}-OUTFIT-${String(index + 1).padStart(2, "0")}`,
      wardrobe_item_ids: [wardrobeItemId],
      item_ids: [item.item_id],
    }))
    : [];
  const exactProducts = decision === "구매" && item.product_url !== null
    ? [{
      item_id: item.item_id,
      platform: item.shop ?? new URL(item.product_url).hostname.replace(/^www\./, ""),
      url: item.product_url,
      match_type: "exact" as const,
    }]
    : [];
  const products = exactProducts.length > 0 || !includeSimilarFallback || item.kind === undefined
    ? exactProducts
    : similarSearchProducts({
      item_id: item.item_id,
      kind: item.kind,
      color: item.color ?? null,
      visual_fit: item.visual_fit ?? null,
      ...(item.brand === undefined ? {} : { brand: item.brand }),
      ...(item.brand_source === undefined ? {} : { brand_source: item.brand_source }),
    });
  return { item_id: item.item_id, decision, outfits, products };
}
