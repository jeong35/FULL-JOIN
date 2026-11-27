import assert from "node:assert/strict";

import { buildChatResponse, classifyChatIntents } from "../src/fulljoin/chat.ts";

const items = [{
  item_id: "I-DENIM",
  slot: "하의",
  kind: "데님팬츠",
  color: "블랙",
  visual_fit: "일자",
  visibility: "전체",
  brand: null,
  brand_source: "없음",
}];
const cottonPants = [{ id: "W-COTTON", slot: "하의", kind: "코튼팬츠", color: "블랙", visual_fit: "일자" }];

assert.deepEqual(classifyChatIntents("내 옷으로 코디하고 비슷한 상품도 찾아줘"), [
  "wardrobe_outfit",
  "product_search",
  "mixed",
]);
assert.deepEqual(classifyChatIntents("이 사진이랑 비슷한 옷 내 옷장에서 찾아줘"), [
  "wardrobe_outfit",
  "saved_photo_outfit",
  "mixed",
]);

const mixed = buildChatResponse("STYLE-1", "내 옷으로 코디하고 비슷한 상품도 찾아줘", items, cottonPants);
assert.deepEqual(mixed.claimed_owned_item_ids, ["W-COTTON"]);
assert.deepEqual(mixed.comparison[0]?.substitute_wardrobe_item_ids, ["W-COTTON"]);
assert.equal(mixed.comparison[0]?.gap_status, "구매");
assert.ok(mixed.products.length > 0);
assert.match(mixed.answer, /대체 후보/);

const unapprovedSlacks = buildChatResponse("STYLE-1", "내 옷으로 코디해줘", items, [
  { id: "W-SLACKS", slot: "하의", kind: "슬랙스", color: "블랙", visual_fit: "일자" },
]);
assert.deepEqual(unapprovedSlacks.claimed_owned_item_ids, []);
assert.deepEqual(unapprovedSlacks.comparison[0]?.substitute_wardrobe_item_ids, []);

const missingJeans = buildChatResponse("STYLE-1", "내 청바지랑 같이 입어도 돼?", items, []);
assert.ok(missingJeans.intents.includes("wardrobe_outfit"));
assert.deepEqual(missingJeans.claimed_owned_item_ids, []);
assert.match(missingJeans.answer, /옷을 먼저 등록/);

const registeredButNotSubstitute = buildChatResponse("STYLE-1", "내 슬랙스랑 같이 입어도 돼?", items, [
  { id: "W-SLACKS", slot: "하의", kind: "슬랙스", color: "블랙", visual_fit: "일자" },
]);
assert.deepEqual(registeredButNotSubstitute.claimed_owned_item_ids, ["W-SLACKS"]);
assert.match(registeredButNotSubstitute.answer, /옷장에 등록돼 있어요/);
assert.match(registeredButNotSubstitute.answer, /후보에는 포함되지 않아요/);

const shoppingWithoutWardrobe = buildChatResponse("STYLE-1", "비슷한 상품을 찾아줘", items, []);
assert.ok(shoppingWithoutWardrobe.products.length > 0);
assert.doesNotMatch(shoppingWithoutWardrobe.answer, /옷을 먼저 등록/);

const ownedWithoutWardrobe = buildChatResponse("STYLE-1", "내 옷으로 코디해줘", items, []);
assert.equal(ownedWithoutWardrobe.products.length, 0);
assert.match(ownedWithoutWardrobe.answer, /옷을 먼저 등록/);
assert.deepEqual(ownedWithoutWardrobe.claimed_owned_item_ids, []);

console.log("Chat intent separation, empty-wardrobe shopping, and verified substitute grounding are valid.");

