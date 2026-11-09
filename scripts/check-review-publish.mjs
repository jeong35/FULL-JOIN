import assert from "node:assert/strict";

import { styleImagePublishInputSchema, styleImageReviewInputSchema } from "../src/fulljoin/review.ts";

assert.deepEqual(styleImageReviewInputSchema.parse({}), {});
assert.equal(styleImageReviewInputSchema.safeParse({ style: ["캐주얼", "캐주얼"] }).success, false);
assert.equal(styleImageReviewInputSchema.safeParse({ style: ["캐주얼"] }).success, true);

const item = {
  item_id: "IMG-001-ITEM-01",
  slot: "아우터",
  kind: "점퍼",
  color: "브라운",
  visual_fit: "오버사이즈",
  visibility: "전체",
};
assert.equal(styleImageReviewInputSchema.safeParse({ items: [item] }).success, true);
assert.equal(styleImageReviewInputSchema.safeParse({ items: [item, item] }).success, false);
assert.equal(styleImageReviewInputSchema.safeParse({ items: [{ ...item, kind: "없는종류" }] }).success, false);
assert.deepEqual(styleImagePublishInputSchema.parse({}), { published: true });
assert.deepEqual(styleImagePublishInputSchema.parse({ published: false }), { published: false });

console.log("Style image review and publish input checks passed.");
