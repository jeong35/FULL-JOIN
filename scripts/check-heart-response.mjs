import assert from "node:assert/strict";

import { heartItemResponse, representativeProductFields } from "../src/fulljoin/heart.ts";

const row = {
  item_id: "IMG-001-ITEM-01",
  slot: "아우터",
  kind: "점퍼",
  color: "브라운",
  visual_fit: "오버사이즈",
  visibility: "전체",
  brand: null,
  product_name: "원베아 하이넥 숏 코트",
  brand_source: "쇼핑몰_상품정보",
  shop: "zigzag.kr",
  product_url: "https://zigzag.kr/catalog/products/172926070",
  is_representative_product: true,
};

assert.deepEqual(heartItemResponse(row, { gap_status: null, wardrobe_item_ids: [] }), {
  item_id: "IMG-001-ITEM-01",
  slot: "아우터",
  kind: "점퍼",
  color: "브라운",
  visual_fit: "오버사이즈",
  visibility: "전체",
  brand: null,
  product_name: "원베아 하이넥 숏 코트",
  brand_source: "쇼핑몰_상품정보",
  gap_status: null,
  wardrobe_item_ids: [],
  decision_options: [],
});
assert.deepEqual(heartItemResponse(row, { gap_status: "비슷함", wardrobe_item_ids: ["WARDROBE-1"] }).decision_options, ["활용", "구매"]);
assert.deepEqual(representativeProductFields([row]), {
  shop: "zigzag.kr",
  product_name: "원베아 하이넥 숏 코트",
  product_url: "https://zigzag.kr/catalog/products/172926070",
});
assert.deepEqual(representativeProductFields([{ ...row, is_representative_product: false }]), {});

console.log("Heart response composition checks passed.");
