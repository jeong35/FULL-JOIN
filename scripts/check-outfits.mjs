import assert from "node:assert/strict";

import { buildPhotoOutfits } from "../src/fulljoin/outfit.ts";

const items = [
  { item_id: "IMG-001-ITEM-01", gap_status: "활용", wardrobe_item_ids: ["W-SHIRT-2", "W-SHIRT-1"] },
  { item_id: "IMG-001-ITEM-02", gap_status: "활용", wardrobe_item_ids: ["W-DENIM-1"] },
  { item_id: "IMG-001-ITEM-03", gap_status: "구매", wardrobe_item_ids: [] },
  { item_id: "IMG-001-ITEM-04", gap_status: "비슷함", wardrobe_item_ids: ["W-BAG-1"] },
];

// 사진 구성을 부위별로 내 옷장 옷으로 채운다. 셔츠가 2벌이면 코디도 2개다.
assert.deepEqual(buildPhotoOutfits("IMG-001", items), [
  {
    outfit_id: "IMG-001-OUTFIT-01",
    wardrobe_item_ids: ["W-SHIRT-1", "W-DENIM-1"],
    item_ids: ["IMG-001-ITEM-01", "IMG-001-ITEM-02"],
  },
  {
    outfit_id: "IMG-001-OUTFIT-02",
    wardrobe_item_ids: ["W-SHIRT-2", "W-DENIM-1"],
    item_ids: ["IMG-001-ITEM-01", "IMG-001-ITEM-02"],
  },
]);

// 최대 3개, 한 코디에 같은 옷을 두 번 넣지 않는다.
const many = [
  { item_id: "A", gap_status: "활용", wardrobe_item_ids: ["W1", "W2", "W3"] },
  { item_id: "B", gap_status: "활용", wardrobe_item_ids: ["W4", "W5"] },
];
const outfits = buildPhotoOutfits("IMG-002", many);
assert.equal(outfits.length, 3);
for (const outfit of outfits) {
  assert.equal(new Set(outfit.wardrobe_item_ids).size, outfit.wardrobe_item_ids.length);
}
assert.deepEqual(
  buildPhotoOutfits("IMG-003", [
    { item_id: "A", gap_status: "활용", wardrobe_item_ids: ["W1"] },
    { item_id: "B", gap_status: "활용", wardrobe_item_ids: ["W1"] },
  ]),
  [{ outfit_id: "IMG-003-OUTFIT-01", wardrobe_item_ids: ["W1"], item_ids: ["A"] }],
);

// '활용'이 하나도 없거나 옷장이 비어 있으면 코디를 만들지 않는다(옷장에 없는 옷을 넣지 않는다, AC11).
assert.deepEqual(buildPhotoOutfits("IMG-004", [{ item_id: "A", gap_status: "구매", wardrobe_item_ids: [] }]), []);
assert.deepEqual(buildPhotoOutfits("IMG-005", [{ item_id: "A", gap_status: null, wardrobe_item_ids: [] }]), []);

console.log("Outfit checks passed.");
