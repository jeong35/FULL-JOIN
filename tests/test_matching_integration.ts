import assert from "node:assert/strict";
import test from "node:test";

import { classifyGap, gapMatchMetadata, type ItemForGapAnalysis } from "../src/fulljoin/gap_analysis.ts";
import { findSubstitutes, substituteKindsFor } from "../src/fulljoin/outfit.ts";

const source: ItemForGapAnalysis = {
  slot: "하의",
  kind: "슬랙스",
  color: "블랙",
  visual_fit: "와이드",
  visibility: "전체",
};

test("A plan preserves the legacy AC9 bucket and ranks only inside it", () => {
  const wardrobe = [
    { id: "BLACK-REGULAR", slot: "하의", kind: "슬랙스", color: "블랙", visual_fit: "일자" },
    { id: "RED-WIDE", slot: "하의", kind: "슬랙스", color: "레드", visual_fit: "와이드" },
    { id: "BLACK-WIDE", slot: "하의", kind: "슬랙스", color: "블랙", visual_fit: "와이드" },
  ];

  const gap = classifyGap(source, wardrobe);
  assert.equal(gap.gap_status, "활용");
  assert.deepEqual(gap.wardrobe_item_ids, ["BLACK-WIDE", "BLACK-REGULAR"]);
  assert.ok(!gap.wardrobe_item_ids.includes("RED-WIDE"));

  const metadata = gapMatchMetadata(source, wardrobe, gap);
  assert.equal(metadata.wardrobe_item_id, "BLACK-WIDE");
  assert.equal(metadata.reason_code, "exact");
  assert.match(metadata.reason, /활용/);
});

test("same-family remains similar and unrelated colors never leak into metadata", () => {
  const wardrobe = [
    { id: "RED-WIDE", slot: "하의", kind: "슬랙스", color: "레드", visual_fit: "와이드" },
    { id: "CHARCOAL-REGULAR", slot: "하의", kind: "슬랙스", color: "차콜", visual_fit: "일자" },
  ];
  const gap = classifyGap(source, wardrobe);
  assert.equal(gap.gap_status, "비슷함");
  assert.deepEqual(gap.wardrobe_item_ids, ["CHARCOAL-REGULAR"]);
  const metadata = gapMatchMetadata(source, wardrobe, gap);
  assert.equal(metadata.wardrobe_item_id, "CHARCOAL-REGULAR");
  assert.equal(metadata.reason_code, "color_similar");
});

test("purchase has no wardrobe match metadata even when a different-color same kind exists", () => {
  const wardrobe = [
    { id: "RED-WIDE", slot: "하의", kind: "슬랙스", color: "레드", visual_fit: "와이드" },
  ];
  const gap = classifyGap(source, wardrobe);
  assert.deepEqual(gap, { gap_status: "구매", wardrobe_item_ids: [] });
  assert.deepEqual(gapMatchMetadata(source, wardrobe, gap), {
    wardrobe_item_id: null,
    reason_code: "no_candidate",
    reason: "옷장에 등록된 옷 중 활용할 만한 아이템을 찾지 못했어요.",
  });
});

test("approved substitute buckets use cosine only as a deterministic tie breaker", () => {
  const denim = { slot: "하의", kind: "데님팬츠", color: "블랙", visual_fit: "와이드" };
  const substitutes = findSubstitutes(denim, [
    { id: "COTTON-REGULAR", slot: "하의", kind: "코튼팬츠", color: "블랙", visual_fit: "일자" },
    { id: "COTTON-WIDE", slot: "하의", kind: "코튼팬츠", color: "블랙", visual_fit: "와이드" },
  ]);
  assert.deepEqual(substitutes.map((entry) => entry.wardrobe_item_id), ["COTTON-WIDE", "COTTON-REGULAR"]);
});

test("denim pants and slacks are not an approved substitute relationship", () => {
  assert.ok(!substituteKindsFor("데님팬츠").includes("슬랙스"));
  assert.deepEqual(findSubstitutes(
    { slot: "하의", kind: "데님팬츠", color: "블랙", visual_fit: "일자" },
    [{ id: "SLACKS", slot: "하의", kind: "슬랙스", color: "블랙", visual_fit: "일자" }],
  ), []);
});
