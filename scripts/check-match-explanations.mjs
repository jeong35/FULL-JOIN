import assert from "node:assert/strict";

import { KINDS, VISUAL_FITS } from "../src/fulljoin/catalog.ts";
import { explainGarmentMatch } from "../src/fulljoin/garment_similarity.ts";
import { koreanParticle, withKoreanParticle } from "../src/fulljoin/korean.ts";
import { resolveMatchReason } from "../mobile/src/data/matchReasonCore.ts";

const source = { slot: "하의", kind: "슬랙스", color: "블랙", visual_fit: "와이드" };

const exact = explainGarmentMatch(source, { ...source });
assert.equal(exact.code, "exact");
assert.equal(exact.summary, "종류와 색, 핏이 모두 같아 활용할 수 있어요.");

const colorAndFit = explainGarmentMatch(source, { ...source, color: "차콜", visual_fit: "일자" });
assert.equal(colorAndFit.code, "color_similar");
assert.match(colorAndFit.summary, /^종류가 같고 색상도 비슷해요\./u);
assert.match(colorAndFit.summary, /차콜이에요/);
assert.match(colorAndFit.summary, /실루엣/);
assert.deepEqual(colorAndFit.evidence.map(({ feature, status }) => [feature, status]), [
  ["kind", "same"],
  ["color", "similar"],
  ["visual_fit", "different"],
]);

const substitute = explainGarmentMatch(source, { ...source, kind: "코튼팬츠" });
assert.equal(substitute.code, "kind_substitute");
assert.equal(substitute.summary, "종류는 다르지만 대신 활용할 수 있는 옷이에요.");

const unapprovedSubstitute = explainGarmentMatch(source, { ...source, kind: "데님팬츠" });
assert.equal(unapprovedSubstitute.code, "kind_substitute");
assert.equal(unapprovedSubstitute.summary, "종류가 달라 같은 용도로 활용할 수 있는지 확인이 필요해요.");

const missing = explainGarmentMatch(source, null);
assert.equal(missing.code, "no_candidate");
assert.equal(missing.summary, "옷장에 등록된 옷 중 활용할 만한 아이템을 찾지 못했어요.");

const purchase = explainGarmentMatch(source, { ...source, color: "레드" }, "구매");
assert.equal(purchase.code, "attribute_difference");
assert.equal(purchase.summary, "종류와 핏은 같지만, 내 옷은 레드라 색상이 달라요.");

const fitDifference = explainGarmentMatch(source, { ...source, visual_fit: "부츠컷" });
assert.equal(fitDifference.code, "fit_difference");
assert.equal(fitDifference.summary, "종류와 색은 같지만, 내 옷은 부츠컷이라 실루엣이 달라질 수 있어요.");

const colorFitDifference = explainGarmentMatch(source, { ...source, color: "레드", visual_fit: "부츠컷" }, "구매");
assert.equal(colorFitDifference.summary, "같은 종류의 옷이 있지만, 내 옷은 레드·부츠컷이라 색상과 핏이 달라요.");

const expectedIGa = new Map([
  ["데님팬츠", "데님팬츠가"], ["니트", "니트가"], ["셔츠", "셔츠가"], ["코트", "코트가"],
  ["가방", "가방이"], ["재킷", "재킷이"], ["숄더백", "숄더백이"], ["슬랙스", "슬랙스가"],
  ["카디건", "카디건이"], ["스니커즈", "스니커즈가"],
]);
for (const [kind, expected] of expectedIGa) assert.equal(withKoreanParticle(kind, "이/가"), expected);

assert.equal(withKoreanParticle("가방", "은/는"), "가방은");
assert.equal(withKoreanParticle("니트", "은/는"), "니트는");
assert.equal(withKoreanParticle("가방", "을/를"), "가방을");
assert.equal(withKoreanParticle("니트", "을/를"), "니트를");
assert.equal(withKoreanParticle("가방", "과/와"), "가방과");
assert.equal(withKoreanParticle("니트", "과/와"), "니트와");
assert.equal(withKoreanParticle("가방", "으로/로"), "가방으로");
assert.equal(withKoreanParticle("코트", "으로/로"), "코트로");
assert.equal(withKoreanParticle("가방", "이랑/랑"), "가방이랑");
assert.equal(withKoreanParticle("니트", "이랑/랑"), "니트랑");
assert.equal(withKoreanParticle("가방", "이라/라"), "가방이라");
assert.equal(withKoreanParticle("니트", "이라/라"), "니트라");
assert.equal(withKoreanParticle("가방", "이에요/예요"), "가방이에요");
assert.equal(withKoreanParticle("니트", "이에요/예요"), "니트예요");
assert.equal(withKoreanParticle("니트  ", "이/가"), "니트가");
assert.equal(withKoreanParticle("코트(울)", "으로/로"), "코트(울)로");
assert.equal(withKoreanParticle("룩2", "이/가"), "룩2가");
assert.equal(koreanParticle("LOOK", "이/가"), null);
assert.equal(withKoreanParticle("LOOK", "이/가"), "LOOK");

for (const kind of KINDS) {
  assert.notEqual(koreanParticle(kind, "이/가"), null, `${kind}: catalog kind particle must be decidable`);
  const catalogSource = { slot: "상의", kind, color: "블랙", visual_fit: "레귤러" };
  const combinations = [
    explainGarmentMatch(catalogSource, { ...catalogSource }),
    explainGarmentMatch(catalogSource, { ...catalogSource, color: "레드" }, "구매"),
    explainGarmentMatch(catalogSource, { ...catalogSource, visual_fit: "오버사이즈" }),
    explainGarmentMatch(catalogSource, { ...catalogSource, color: "레드", visual_fit: "오버사이즈" }, "구매"),
  ];
  assert.deepEqual(combinations.map(({ code }) => code), ["exact", "attribute_difference", "fit_difference", "attribute_difference"]);
  for (const explanation of combinations) {
    assert.doesNotMatch(explanation.summary, new RegExp(`${kind}이 있어요`, "u"), `${kind}: fixed particle must not leak`);
  }
}

for (const fit of VISUAL_FITS) {
  assert.notEqual(koreanParticle(fit, "이라/라"), null, `${fit}: catalog fit particle must be decidable`);
  const explanation = explainGarmentMatch(
    { slot: "하의", kind: "슬랙스", color: "블랙", visual_fit: "와이드" },
    { slot: "하의", kind: "슬랙스", color: "블랙", visual_fit: fit === "와이드" ? "일자" : fit },
  );
  assert.match(explanation.summary, /실루엣|모두 같/u);
}

const serverReason = "종류와 색은 같지만, 내 옷은 부츠컷이라 실루엣이 달라질 수 있어요.";
const displayed = resolveMatchReason(
  { wardrobe_item_ids: ["wardrobe-1"], match_metadata: { wardrobe_item_id: "wardrobe-1", reason: serverReason } },
  [{ id: "wardrobe-1" }],
  "fallback",
);
assert.equal(displayed.text, serverReason);
assert.equal(displayed.source, "server");

console.log(`Korean particles and concise match explanations are valid for ${KINDS.length} catalog kinds.`);

