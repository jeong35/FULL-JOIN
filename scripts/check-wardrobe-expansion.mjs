import assert from "node:assert/strict";

import { wardrobeInputSchema } from "../src/fulljoin/catalog.ts";

const legacy = wardrobeInputSchema.parse({
  user_id: "legacy-user",
  slot: "하의",
  kind: "슬랙스",
  color: "블랙",
  visual_fit: "와이드",
});
assert.deepEqual(legacy.material, []);
assert.equal(legacy.pattern, null);
assert.deepEqual(legacy.seasons, []);
assert.deepEqual(legacy.details, {});

assert.equal(wardrobeInputSchema.safeParse({
  user_id: "demo-user",
  slot: "하의",
  kind: "카고팬츠",
  color: "모카",
  visual_fit: "벌룬",
  material: ["면"],
  pattern: "무지",
  seasons: ["가을"],
  details: { "디테일": ["카고 주머니"] },
}).success, true);

assert.equal(wardrobeInputSchema.safeParse({
  user_id: "demo-user",
  slot: "잡화",
  kind: "모자",
  color: "살구",
  visual_fit: null,
  details: { "모양": "캡" },
}).success, true);

assert.equal(wardrobeInputSchema.safeParse({
  user_id: "demo-user",
  slot: "아우터",
  kind: "트위드자켓",
  color: "연핑크",
  visual_fit: null,
}).success, true);

assert.equal(wardrobeInputSchema.safeParse({
  user_id: "demo-user",
  slot: "하의",
  kind: "숏팬츠",
  color: "블랙",
  visual_fit: "버뮤다",
}).success, true);

assert.equal(wardrobeInputSchema.safeParse({
  user_id: "demo-user",
  slot: "하의",
  kind: "숏팬츠",
  color: "블랙",
  visual_fit: "와이드",
}).success, true);

assert.equal(wardrobeInputSchema.safeParse({
  user_id: "demo-user",
  slot: "잡화",
  kind: "모자",
  color: "블랙",
  visual_fit: null,
  details: { "모양": "페도라" },
}).success, false);

assert.equal(wardrobeInputSchema.safeParse({
  user_id: "demo-user",
  slot: "상의",
  kind: "카고팬츠",
  color: "블랙",
  visual_fit: "일자",
}).success, false);

console.log("Wardrobe expansion checks passed.");
