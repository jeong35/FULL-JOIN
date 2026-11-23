import assert from "node:assert/strict";
import test from "node:test";

import { chatHistoryQuerySchema, storedChatMessageSchema } from "../src/fulljoin/chat.ts";

test("chat history query applies deterministic pagination bounds", () => {
  assert.deepEqual(chatHistoryQuerySchema.parse({ style_image_id: "IMG-1" }), {
    style_image_id: "IMG-1",
    limit: 50,
  });
  assert.deepEqual(chatHistoryQuerySchema.parse({ style_image_id: "IMG-1", limit: "20", before: "42" }), {
    style_image_id: "IMG-1",
    limit: 20,
    before: 42,
  });
  assert.equal(chatHistoryQuerySchema.safeParse({ style_image_id: "IMG-1", limit: 101 }).success, false);
});

test("stored chat messages accept only validated restoration data", () => {
  const valid = {
    id: "c0a80121-0000-4000-8000-000000000001",
    ordinal: 1,
    role: "assistant",
    content: "저장 사진과 내 옷장을 기준으로 답했어요.",
    products: [{ item_id: "ITEM-1", platform: "무신사", url: "https://www.musinsa.com/search?q=니트", match_type: "similar" }],
    answer_source: "grounded",
    created_at: "2026-11-23T10:00:00.000Z",
  };
  assert.equal(storedChatMessageSchema.safeParse(valid).success, true);
  assert.equal(storedChatMessageSchema.safeParse({ ...valid, role: "system" }).success, false);
  assert.equal(storedChatMessageSchema.safeParse({ ...valid, products: [{ ...valid.products[0], match_type: "invented" }] }).success, false);
});
