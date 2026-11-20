import assert from "node:assert/strict";
import test from "node:test";

import {
  bestUserWardrobeMatch,
  cosineSimilarity,
  matchOutfitItems,
  rankWardrobeCandidates,
  scoreGarmentSimilarity,
  type ComparableGarment,
  type SimilarityWardrobeItem,
} from "../src/fulljoin/garment_similarity.ts";

const source: ComparableGarment = {
  slot: "하의",
  kind: "슬랙스",
  color: "블랙",
  visual_fit: "와이드",
};

function wardrobe(id: string, overrides: Partial<SimilarityWardrobeItem> = {}): SimilarityWardrobeItem {
  return { id, ...source, ...overrides };
}

function closeTo(actual: number | null, expected: number): void {
  assert.notEqual(actual, null);
  assert.ok(Math.abs((actual ?? 0) - expected) < 1e-10, `${String(actual)} != ${expected}`);
}

test("identical kind, color, and fit has maximum cosine similarity", () => {
  const result = scoreGarmentSimilarity(source, wardrobe("W-1"));
  assert.equal(result.reason, "scored");
  closeTo(result.similarity, 1);
  assert.deepEqual(result.comparable_features, ["color", "kind", "visual_fit"]);
});

test("same-family color ranks above a different color and fit mismatch lowers the score", () => {
  const candidates = rankWardrobeCandidates(source, [
    wardrobe("different-color", { color: "레드" }),
    wardrobe("fit-mismatch", { visual_fit: "일자" }),
    wardrobe("same-family", { color: "차콜" }),
  ]);
  assert.deepEqual(candidates.map((candidate) => candidate.wardrobe_item_id), [
    "fit-mismatch",
    "same-family",
    "different-color",
  ]);
  assert.ok((candidates[0]?.similarity ?? 0) > (candidates[1]?.similarity ?? 0));
  assert.ok((candidates[1]?.similarity ?? 0) > (candidates[2]?.similarity ?? 0));
});

test("a different slot is never a candidate even when all chips match", () => {
  const wrongSlot = wardrobe("W-OUTER", { slot: "아우터" });
  assert.deepEqual(rankWardrobeCandidates(source, [wrongSlot]), []);
  assert.equal(scoreGarmentSimilarity(source, wrongSlot).reason, "incompatible_slot");
});

test("cross-slot canonical kinds remain comparable", () => {
  const cardigan = { slot: "상의", kind: "카디건", color: "블랙", visual_fit: "레귤러" };
  const result = scoreGarmentSimilarity(cardigan, wardrobe("W-CARDIGAN", {
    slot: "아우터",
    kind: "카디건",
    visual_fit: "레귤러",
  }));
  closeTo(result.similarity, 1);
});

test("missing and unknown chips are not treated as matches", () => {
  const missing = scoreGarmentSimilarity(
    { slot: "하의", kind: null, color: "블랙", visual_fit: null },
    wardrobe("W-1"),
  );
  assert.equal(missing.reason, "insufficient_information");
  assert.equal(missing.similarity, null);

  const unknown = scoreGarmentSimilarity(
    { slot: "하의", kind: "알수없음", color: "블랙", visual_fit: "와이드" },
    { ...wardrobe("W-UNKNOWN"), kind: "알수없음" },
  );
  assert.equal(unknown.reason, "insufficient_information");
  assert.equal(unknown.similarity, null);
});

test("multi and other colors are not counted as matching evidence", () => {
  for (const color of ["멀티", "기타"]) {
    const result = scoreGarmentSimilarity(
      { slot: "하의", kind: "슬랙스", color, visual_fit: null },
      { slot: "하의", kind: "슬랙스", color, visual_fit: null },
    );
    assert.equal(result.reason, "insufficient_information");
    assert.equal(result.similarity, null);
    assert.deepEqual(result.comparable_features, ["kind"]);
  }
});

test("empty vectors and empty wardrobe are explicit and safe", () => {
  assert.equal(cosineSimilarity(new Map(), new Map()), null);
  assert.deepEqual(rankWardrobeCandidates(source, []), []);
});

test("expanded canonical kinds participate in matching", () => {
  const cargo = { slot: "하의", kind: "카고팬츠", color: "카키", visual_fit: "벌룬" };
  const ranked = rankWardrobeCandidates(cargo, [{ id: "W-CARGO", ...cargo }]);
  assert.equal(ranked[0]?.wardrobe_item_id, "W-CARGO");
  closeTo(ranked[0]?.similarity ?? null, 1);
});

test("different kinds stay outside the default AC9 candidate bucket", () => {
  const cottonPants = wardrobe("W-COTTON", { kind: "코튼팬츠" });
  assert.deepEqual(rankWardrobeCandidates(source, [cottonPants]), []);
});

test("ties use wardrobe id ascending for deterministic output", () => {
  const ranked = rankWardrobeCandidates(source, [wardrobe("W-20"), wardrobe("W-10")]);
  assert.deepEqual(ranked.map((candidate) => candidate.wardrobe_item_id), ["W-10", "W-20"]);
});

test("best-match metadata is computed only from the supplied user's wardrobe", () => {
  const mixedWardrobe = [
    { ...wardrobe("OTHER-EXACT"), user_id: "other-user" },
    { ...wardrobe("OWN-2"), user_id: "demo-user" },
    { ...wardrobe("OWN-1", { visual_fit: "일자" }), user_id: "demo-user" },
  ];
  const match = bestUserWardrobeMatch("demo-user", source, mixedWardrobe);
  assert.equal(match.wardrobe_item_id, "OWN-2");
  closeTo(match.similarity, 1);
  assert.ok(!String(match.wardrobe_item_id).startsWith("OTHER-"));
});

test("threshold labels distinguish same-family and unrelated colors without changing legacy AC9", () => {
  const sameFamily = matchOutfitItems(
    [{ item_id: "I-FAMILY", ...source }],
    [wardrobe("W-FAMILY", { color: "차콜" })],
  );
  const unrelated = matchOutfitItems(
    [{ item_id: "I-OTHER", ...source }],
    [wardrobe("W-OTHER", { color: "레드" })],
  );
  assert.equal(sameFamily[0]?.match, "비슷함");
  assert.equal(unrelated[0]?.match, "구매");
});

test("outfit matching never assigns one wardrobe item twice", () => {
  const items = [
    { item_id: "I-1", ...source },
    { item_id: "I-2", ...source },
  ];
  const result = matchOutfitItems(items, [wardrobe("W-1"), wardrobe("W-2")]);
  assert.deepEqual(result.map((entry) => entry.wardrobe_item_id), ["W-1", "W-2"]);
  assert.equal(new Set(result.map((entry) => entry.wardrobe_item_id)).size, 2);
});

test("multi-value material and season blocks use overlap rather than array identity", () => {
  const detailedSource = {
    ...source,
    material: ["면", "울"],
    seasons: ["가을", "겨울"],
    pattern: "무지",
    details: { 기장: "기본", 디테일: ["벨트"] },
  };
  const overlap = scoreGarmentSimilarity(detailedSource, {
    ...wardrobe("W-OVERLAP"),
    material: ["울"],
    seasons: ["겨울"],
    pattern: "무지",
    details: { 기장: "기본" },
  });
  const disjoint = scoreGarmentSimilarity(detailedSource, {
    ...wardrobe("W-DISJOINT"),
    material: ["가죽"],
    seasons: ["여름"],
    pattern: "체크",
    details: { 기장: "크롭" },
  });
  assert.ok((overlap.similarity ?? 0) > (disjoint.similarity ?? 0));
});

