import assert from "node:assert/strict";

import { itemDecisionInputSchema, itemDecisionResponse } from "../src/fulljoin/decision.ts";

assert.equal(itemDecisionInputSchema.safeParse({ user_id: "demo-user", decision: "활용" }).success, true);
assert.equal(itemDecisionInputSchema.safeParse({ user_id: "demo-user", decision: "비슷함" }).success, false);
assert.equal(itemDecisionInputSchema.safeParse({ user_id: "", decision: "구매" }).success, false);

const item = {
  item_id: "IMG-001-ITEM-01",
  shop: "예시몰",
  product_url: "https://shop.example/products/1",
};
const gap = { gap_status: "비슷함", wardrobe_item_ids: ["WARDROBE-2", "WARDROBE-1"] };
assert.deepEqual(itemDecisionResponse(item, gap, "활용"), {
  item_id: "IMG-001-ITEM-01",
  decision: "활용",
  outfits: [
    { outfit_id: "IMG-001-ITEM-01-OUTFIT-01", wardrobe_item_ids: ["WARDROBE-1"], item_ids: ["IMG-001-ITEM-01"] },
    { outfit_id: "IMG-001-ITEM-01-OUTFIT-02", wardrobe_item_ids: ["WARDROBE-2"], item_ids: ["IMG-001-ITEM-01"] },
  ],
  products: [],
});
assert.deepEqual(itemDecisionResponse(item, gap, "구매"), {
  item_id: "IMG-001-ITEM-01",
  decision: "구매",
  outfits: [],
  products: [{ item_id: "IMG-001-ITEM-01", platform: "예시몰", url: "https://shop.example/products/1", match_type: "exact" }],
});
assert.deepEqual(itemDecisionResponse({ ...item, product_url: null }, gap, "구매").products, []);

console.log("Item decision checks passed.");
