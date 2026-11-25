import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_QUERY,
  applySuggestion,
  dropOneOptions,
  hasItemTags,
  matchesQuery,
  presentColors,
  presentKinds,
  presentStyles,
  queryParts,
  searchImages,
  suggest,
  withoutPart,
  type SearchVocab,
} from "../mobile/src/data/feedFilterCore.ts";

const tag = (kind: string, color: string | null, slot = "상의") => ({ slot, kind, color });
const imageA = { id: "a", style: ["미니멀"], items: [tag("니트", "베이지"), tag("슬랙스", "블랙", "하의")] };
const imageB = { id: "b", style: ["캐주얼", "미니멀"], items: [tag("니트", "블랙"), tag("데님팬츠", "중청", "하의")] };
const imageC = { id: "c", style: ["스포티"], items: [tag("후드", "그레이")] };
const imageD = { id: "d", style: ["시크"], items: [tag("니트", "베이지")] };
const images = [imageA, imageB, imageC, imageD];
const label = (kind: string) => (kind === "반소매티셔츠" ? "반소매티" : kind);

test("스타일은 하나라도 맞으면, 종류·색은 한 벌에 둘 다 맞아야 한다", () => {
  assert.equal(matchesQuery(imageA, { styles: ["시크", "미니멀"], kind: null, color: null }), true);
  assert.equal(matchesQuery(imageA, { styles: [], kind: "니트", color: "베이지" }), true);
  // b에는 니트(블랙)와 중청 데님이 있지만 '베이지 니트'는 없다.
  assert.equal(matchesQuery(imageB, { styles: [], kind: "니트", color: "베이지" }), false);
  assert.equal(matchesQuery(imageC, { styles: ["미니멀"], kind: null, color: null }), false);
});

test("결과는 받은 순서(홈의 취향 순서)를 그대로 둔다", () => {
  const result = searchImages(images, { styles: [], kind: "니트", color: null });
  assert.deepEqual(result.map((image) => image.id), ["a", "b", "d"]);
});

test("서버가 옷 정보를 안 주면 옷·색 검색은 0장이고, 스타일 검색은 된다", () => {
  const styleOnly = images.map(({ items: _ignored, ...rest }) => rest);
  assert.equal(hasItemTags(styleOnly), false);
  assert.equal(searchImages(styleOnly, { styles: [], kind: "니트", color: null }).length, 0);
  assert.equal(searchImages(styleOnly, { styles: ["미니멀"], kind: null, color: null }).length, 2);
  assert.equal(hasItemTags(images), true);
});

test("딱지는 스타일 하나씩, 옷은 '색 종류' 한 덩어리로 묶고 빼기도 그 단위다", () => {
  const query = { styles: ["미니멀"], kind: "니트", color: "베이지" };
  assert.deepEqual(queryParts(query, label).map((part) => part.label), ["미니멀", "베이지 니트"]);
  assert.deepEqual(withoutPart(query, "clothes"), { styles: ["미니멀"], kind: null, color: null });
  assert.deepEqual(withoutPart(query, "style:미니멀"), { styles: [], kind: "니트", color: "베이지" });
});

test("0장일 때 하나 빼고 보기는 사진이 생기는 조건만 보여 준다", () => {
  const query = { styles: ["스포티"], kind: "니트", color: "베이지" };
  assert.equal(searchImages(images, query).length, 0);
  const options = dropOneOptions(images, query, label);
  assert.deepEqual(options.map((option) => [option.label, option.count]), [["스포티", 2], ["베이지 니트", 1]]);
  assert.deepEqual(dropOneOptions(images, { styles: ["글램"], kind: null, color: null }, label), []);
});

test("고를 수 있는 값은 피드 사진에 실제로 있는 것만, 목록 순서대로", () => {
  assert.deepEqual(presentStyles(images, ["캐주얼", "미니멀", "러블리", "시크", "스포티"]), ["캐주얼", "미니멀", "시크", "스포티"]);
  assert.deepEqual(presentKinds(images, ["반소매티셔츠", "니트", "후드", "슬랙스", "데님팬츠"]), ["니트", "후드", "슬랙스", "데님팬츠"]);
  assert.deepEqual(presentColors(images, ["블랙", "그레이", "베이지", "중청"], "니트"), ["블랙", "베이지"]);
  assert.deepEqual(presentColors(images, ["블랙", "그레이", "베이지", "중청"], null), ["블랙", "그레이", "베이지", "중청"]);
});

const vocab: SearchVocab = {
  styles: [{ value: "미니멀", label: "미니멀" }, { value: "스포티", label: "스포티" }],
  kinds: [
    { value: "니트", label: "니트" },
    { value: "반소매티셔츠", label: "반소매티", aliases: ["반팔", "티셔츠"] },
    { value: "데님팬츠", label: "데님팬츠", aliases: ["청바지"] },
    { value: "미니스커트", label: "미니스커트", aliases: ["치마"] },
    { value: "숏패딩", label: "숏패딩" },
    { value: "롱패딩", label: "롱패딩" },
  ],
  colors: [{ value: "베이지", label: "베이지" }, { value: "블랙", label: "블랙", aliases: ["검정"] }],
};

test("'베이지 니'를 치면 베이지 니트 → 니트 → 베이지 순으로 추천한다", () => {
  assert.deepEqual(suggest("베이지 니", vocab).map((s) => [s.label, s.tag]), [
    ["베이지 니트", "색 + 옷"],
    ["니트", "옷"],
    ["베이지", "색"],
  ]);
});

test("동의어와 가운데 글자로도 찾는다", () => {
  assert.deepEqual(suggest("검정 청바지", vocab)[0], { label: "블랙 데님팬츠", tag: "색 + 옷", color: "블랙", kind: "데님팬츠" });
  assert.deepEqual(suggest("패딩", vocab).map((s) => s.label), ["숏패딩", "롱패딩"]);
  assert.deepEqual(suggest("미니", vocab).map((s) => s.label), ["미니멀", "미니스커트"]);
  assert.deepEqual(suggest("   ", vocab), []);
});

test("추천을 누르면 스타일은 더하고 종류·색은 바꾼다", () => {
  const current = { styles: ["미니멀"], kind: "니트", color: "블랙" };
  assert.deepEqual(applySuggestion(current, { label: "스포티", tag: "스타일", style: "스포티" }), {
    styles: ["미니멀", "스포티"],
    kind: "니트",
    color: "블랙",
  });
  assert.deepEqual(applySuggestion(current, { label: "베이지", tag: "색", color: "베이지" }), {
    styles: ["미니멀"],
    kind: null,
    color: "베이지",
  });
  assert.deepEqual(applySuggestion(EMPTY_QUERY, { label: "니트", tag: "옷", kind: "니트" }), { styles: [], kind: "니트", color: null });
});
