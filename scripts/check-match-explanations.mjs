import assert from "node:assert/strict";

import { explainGarmentMatch } from "../src/fulljoin/garment_similarity.ts";

const source = { slot: "하의", kind: "슬랙스", color: "블랙", visual_fit: "와이드" };

const exact = explainGarmentMatch(source, { ...source });
assert.equal(exact.code, "exact");
assert.match(exact.summary, /활용/);

const colorAndFit = explainGarmentMatch(source, { ...source, color: "차콜", visual_fit: "일자" });
assert.equal(colorAndFit.code, "color_similar");
assert.match(colorAndFit.summary, /가까운 색 계열/);
assert.match(colorAndFit.summary, /실루엣/);
assert.deepEqual(colorAndFit.evidence.map(({ feature, status }) => [feature, status]), [
  ["kind", "same"],
  ["color", "similar"],
  ["visual_fit", "different"],
]);

const substitute = explainGarmentMatch(source, { ...source, kind: "코튼팬츠" });
assert.equal(substitute.code, "kind_substitute");
assert.match(substitute.summary, /대체 후보/);

const missing = explainGarmentMatch(source, null);
assert.equal(missing.code, "no_candidate");
assert.match(missing.summary, /후보가 없어요/);

const purchase = explainGarmentMatch(source, { ...source, color: "레드" }, "구매");
assert.equal(purchase.code, "attribute_difference");
assert.match(purchase.summary, /새로 찾기/);

console.log("Human-readable exact, color, fit, substitute, and no-candidate explanations are valid.");

