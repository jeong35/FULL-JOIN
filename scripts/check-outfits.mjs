import assert from "node:assert/strict";

import { buildPhotoOutfits, findSubstitutes, substituteKindsFor } from "../src/fulljoin/outfit.ts";

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

// '활용'도 대체할 옷도 없거나 옷장이 비어 있으면 코디를 만들지 않는다(옷장에 없는 옷을 넣지 않는다, AC11).
assert.deepEqual(buildPhotoOutfits("IMG-004", [{ item_id: "A", gap_status: "구매", wardrobe_item_ids: [] }]), []);
assert.deepEqual(buildPhotoOutfits("IMG-005", [{ item_id: "A", gap_status: null, wardrobe_item_ids: [] }]), []);

// 대체: 가까운 종류 + 같은 색(먼저) 또는 같은 계열 색. 판정(gap_status)은 그대로 '구매'다.
const wardrobe = [
  { id: "W-TEE-CHARCOAL", kind: "반소매티셔츠", color: "차콜" },
  { id: "W-TEE-BLACK", kind: "반소매티셔츠", color: "블랙" },
  { id: "W-TEE-RED", kind: "반소매티셔츠", color: "레드" },
  { id: "W-KNIT-BLACK", kind: "니트", color: "블랙" },
  { id: "W-FLAT-BLACK", kind: "플랫슈즈", color: "블랙" },
];
assert.deepEqual(substituteKindsFor("민소매"), ["반소매티셔츠"]);
assert.deepEqual(findSubstitutes({ kind: "민소매", color: "블랙" }, wardrobe), [
  { wardrobe_item_id: "W-TEE-BLACK", same_color: true },
  { wardrobe_item_id: "W-TEE-CHARCOAL", same_color: false },
]);
// 짝이 아닌 종류(로퍼↔플랫슈즈는 대신 신을 수 없어 나눈 종류)와 색을 모르는 옷은 대체하지 않는다.
assert.deepEqual(findSubstitutes({ kind: "로퍼", color: "블랙" }, wardrobe), []);
assert.deepEqual(findSubstitutes({ kind: "민소매", color: null }, wardrobe), []);
assert.deepEqual(findSubstitutes({ kind: "민소매", color: "멀티" }, wardrobe), []);
// 짝은 양쪽 방향이다.
assert.deepEqual(findSubstitutes({ kind: "긴소매티셔츠", color: "레드" }, wardrobe), [
  { wardrobe_item_id: "W-TEE-RED", same_color: true },
]);

// 대체할 옷이 2벌이면 사진에 없던 코디가 2개 생긴다.
assert.deepEqual(buildPhotoOutfits("IMG-006", [
  { item_id: "TOP", gap_status: "구매", wardrobe_item_ids: [], substitute_ids: ["W-TEE-BLACK", "W-TEE-CHARCOAL"] },
  { item_id: "SKIRT", gap_status: "활용", wardrobe_item_ids: ["W-SKIRT-1"] },
  { item_id: "SHOES", gap_status: "구매", wardrobe_item_ids: [], substitute_ids: [] },
]), [
  { outfit_id: "IMG-006-OUTFIT-01", wardrobe_item_ids: ["W-TEE-BLACK", "W-SKIRT-1"], item_ids: ["TOP", "SKIRT"] },
  { outfit_id: "IMG-006-OUTFIT-02", wardrobe_item_ids: ["W-TEE-CHARCOAL", "W-SKIRT-1"], item_ids: ["TOP", "SKIRT"] },
]);
// 하트 응답에서 '비슷함'은 대체 대상이 아니다(사용자가 활용/새로 찾기를 고른다).
assert.deepEqual(buildPhotoOutfits("IMG-007", [
  { item_id: "TOP", gap_status: "비슷함", wardrobe_item_ids: ["W1"], substitute_ids: ["W2"] },
]), []);

console.log("Outfit checks passed.");
