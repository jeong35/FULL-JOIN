import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChatResponse,
  chatRequiresLlm,
  classifyChatIntents,
  withGeneralAdvice,
  type ChatItem,
  type ChatWardrobeItem,
} from "../src/fulljoin/chat.ts";

const photoItems: ChatItem[] = [{
  item_id: "PHOTO-TOP",
  slot: "상의",
  kind: "니트",
  color: "아이보리",
  visual_fit: "레귤러",
  visibility: "전체",
  brand: null,
  brand_source: "없음",
}];

const wardrobe: ChatWardrobeItem[] = [{
  id: "OWNED-KNIT",
  slot: "상의",
  kind: "니트",
  color: "아이보리",
  visual_fit: "레귤러",
}];

test("general fashion advice is detected without requiring wardrobe selection", () => {
  const intents = classifyChatIntents("면접에는 어떤 색 조합으로 입는 게 좋아?");
  assert.deepEqual(intents, ["general_advice"]);
  assert.equal(chatRequiresLlm(intents), true);
});

test("empty wardrobe product search stays grounded and returns links", () => {
  const response = buildChatResponse("IMG-1", "이 옷 비슷한 상품 링크 찾아줘", photoItems, []);
  assert.ok(response.intents.includes("product_search"));
  assert.ok(response.intents.includes("saved_photo_outfit"));
  assert.equal(chatRequiresLlm(response.intents), false);
  assert.ok(response.products.length > 0);
  assert.deepEqual(response.claimed_owned_item_ids, []);
});

test("mixed consultation clearly separates owned wardrobe facts from general advice", () => {
  const base = buildChatResponse(
    "IMG-1",
    "내 옷장 니트로 이 코디를 출근용으로 바꾸려면 어떻게 입어?",
    photoItems,
    wardrobe,
  );
  assert.ok(base.intents.includes("mixed"));
  assert.deepEqual(base.claimed_owned_item_ids, ["OWNED-KNIT"]);
  const response = withGeneralAdvice(base, "출근용으로는 단정한 색 조합과 간결한 실루엣이 무난해요.");
  assert.match(response.answer, /내 옷장 기준:/);
  assert.match(response.answer, /일반 패션 조언:/);
  assert.equal(response.answer_sections.find((section) => section.source === "wardrobe")?.label, "내 옷장 기준");
});

test("an unregistered item is never claimed as owned", () => {
  const response = buildChatResponse("IMG-1", "내 옷장 청바지랑 코디해줘", photoItems, wardrobe);
  assert.ok(!response.claimed_owned_item_ids.includes("UNREGISTERED-DENIM"));
  assert.match(response.answer, /데님팬츠은 현재 옷장에 등록돼 있지 않아요/);
});

test("out-of-scope questions do not call the LLM", () => {
  const response = buildChatResponse("IMG-1", "주식 종목 추천해줘", photoItems, wardrobe);
  assert.deepEqual(response.intents, ["out_of_scope"]);
  assert.equal(chatRequiresLlm(response.intents), false);
  assert.match(response.answer, /상담 범위:/);
});
