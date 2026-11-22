import assert from "node:assert/strict";

import {
  buildWeather,
  earlyShortBase,
  kmaItemsFrom,
  latestShortBase,
  midDays,
  midTmFcCandidates,
  nearestMidRegion,
  shortDay,
  shortGrid,
  skyOf,
  toGrid,
  weatherQuerySchema,
  wfToSky,
  windChill,
} from "../src/fulljoin/weather.ts";

// 격자: 기상청 안내서의 서울(시청) 좌표는 60, 127이다.
assert.deepEqual(toGrid(37.5665, 126.978), { nx: 60, ny: 127 });
assert.equal(nearestMidRegion(37.2596, 127.0465).taRegId, "11B20601"); // 수원 영통구 → 수원
assert.equal(nearestMidRegion(35.1631, 129.1636).landRegId, "11H20000"); // 부산 해운대구 → 부산·울산·경남
assert.equal(nearestMidRegion(33.4996, 126.5312).taRegId, "11G00201");

// 발표 시각(한국 시간). 16:11에는 14시 단기예보, 새벽 값은 02시 발표, 중기는 오늘 06시(없으면 어제 18시).
const afternoon = new Date("2026-11-20T07:11:00Z");
assert.deepEqual(latestShortBase(afternoon), { date: "20261120", time: "1400" });
assert.deepEqual(earlyShortBase(afternoon), { date: "20261120", time: "0200" });
assert.deepEqual(midTmFcCandidates(afternoon), ["202611200600", "202611191800"]);
// 02:05에는 02시 발표가 아직 없어 어제 23시를 쓰고, 02시 발표를 따로 받지 않는다.
const dawn = new Date("2026-11-19T17:05:00Z");
assert.deepEqual(latestShortBase(dawn), { date: "20261119", time: "2300" });
assert.equal(earlyShortBase(dawn), null);
assert.deepEqual(midTmFcCandidates(dawn), ["202611191800", "202611190600"]);
assert.deepEqual(midTmFcCandidates(new Date("2026-11-20T09:30:00Z")), ["202611201800", "202611200600"]);

// 요청 값: 한국 밖 좌표와 너무 긴 기간은 받지 않는다.
assert.equal(weatherQuerySchema.safeParse({ lat: "37.5", lon: "127" }).data?.days, 7);
assert.equal(weatherQuerySchema.safeParse({ lat: "48.85", lon: "2.35" }).success, false);
assert.equal(weatherQuerySchema.safeParse({ lat: "37.5", lon: "127", days: "30" }).success, false);

// 기상청 응답 봉투: 정상, 결과 없음(03), 키 오류(XML), 빈 items.
const envelope = (code, items) => JSON.stringify({ response: { header: { resultCode: code, resultMsg: "x" }, body: { items } } });
assert.deepEqual(kmaItemsFrom(envelope("00", { item: [{ a: 1 }] })), { ok: true, items: [{ a: 1 }] });
assert.deepEqual(kmaItemsFrom(envelope("03", "")), { ok: true, items: [] });
assert.deepEqual(kmaItemsFrom(envelope("10", "")), { ok: false, code: "10" });
assert.deepEqual(
  kmaItemsFrom("<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>"),
  { ok: false, code: "gateway_30" },
);

// 하늘 글자.
assert.equal(skyOf("1", "0"), "맑음");
assert.equal(skyOf("3", "0"), "구름 많음");
assert.equal(skyOf("4", "0"), "흐림");
assert.equal(skyOf("4", "1"), "비");
assert.equal(skyOf("4", "3"), "눈");
assert.equal(wfToSky("구름많고 비/눈"), "비/눈");
assert.equal(wfToSky("흐리고 소나기"), "소나기");
assert.equal(wfToSky("흐리고 눈"), "눈");
assert.equal(wfToSky("구름많음"), "구름 많음");
assert.equal(wfToSky("흐림"), "흐림");
assert.equal(wfToSky("맑음"), "맑음");

// 체감: 10°C 이하에 바람이 있으면 기온보다 낮다. 따뜻하거나 바람이 없으면 기온 그대로.
assert.ok(windChill(2, 4) < 0);
assert.equal(windChill(15, 6), 15);
assert.equal(windChill(2, 1), 2);

// 단기예보 한 날 만들기. 02시 발표(새벽~)와 14시 발표(오후~)를 합쳐 뒤의 발표가 덮는다.
const rows = (date, hours, values) =>
  hours.flatMap((h) => Object.entries(values(h)).map(([category, fcstValue]) => ({
    baseDate: "20261120", baseTime: "0200", category, fcstDate: date, fcstTime: `${String(h).padStart(2, "0")}00`, fcstValue, nx: 61, ny: 120,
  })));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const early = [
  ...rows("20261120", range(3, 23), (h) => ({ TMP: String(4 + Math.max(0, 8 - Math.abs(h - 15))), SKY: "3", PTY: "0", POP: "20", WSD: "4.2" })),
  ...rows("20261120", [6], () => ({ TMN: "2.0" })),
  ...rows("20261120", [15], () => ({ TMX: "12.0" })),
];
const late = rows("20261120", range(15, 23), (h) => ({ TMP: String(13 - (h - 15)), SKY: "4", PTY: h === 16 || h === 17 ? "1" : "0", POP: h === 16 ? "70" : "30", WSD: "2" }));
const grid = shortGrid(early, late);
const today = shortDay(grid, "20261120");
assert.ok(today !== null);
assert.equal(today.date, "2026-11-20");
assert.equal(today.min, 2); // TMN
assert.equal(today.max, 12); // TMX
assert.equal(today.sky, "비"); // 낮에 비가 한 시간이라도 있으면 비
assert.equal(today.pop, 70);
assert.equal(today.feels_like, Math.round(windChill(4, 4.2)));
assert.deepEqual(today.hourly.map((h) => h.time), ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"]);
assert.equal(today.hourly[4].sky, "비"); // 16시는 14시 발표 값
// 시간이 너무 적게 남은 날은 만들지 않는다.
assert.equal(shortDay(shortGrid(rows("20261124", range(0, 5), () => ({ TMP: "5" }))), "20261124"), null);

// 중기예보: 06시 발표 기준 n일 뒤. 오전·오후 중 비가 있으면 비로, 확률은 큰 값.
const land = [{ regId: "11B00000", rnSt4Am: 20, rnSt4Pm: 60, wf4Am: "구름많음", wf4Pm: "흐리고 비", rnSt8: 30, wf8: "맑음" }];
const ta = [{ regId: "11B20601", taMin4: 1, taMax4: 9, taMin8: -2, taMax8: 7 }];
const mid = midDays("202611200600", land, ta);
assert.deepEqual(mid, [
  { date: "2026-11-24", min: 1, max: 9, sky: "비", pop: 60, hourly: [] },
  { date: "2026-11-28", min: -2, max: 7, sky: "맑음", pop: 30, hourly: [] },
]);
assert.deepEqual(midDays("202611200600", land, []), []);

// 합치기: 오늘은 단기예보, 4일 뒤는 중기예보. 1~3일 뒤가 비면 거기서 멈춘다.
const fullDay = (date) => rows(date, range(0, 23), () => ({ TMP: "6", SKY: "1", PTY: "0", POP: "0", WSD: "1" }));
const shortAll = shortGrid(early, late, fullDay("20261121"), fullDay("20261122"), fullDay("20261123"));
const weather = buildWeather({ now: afternoon, days: 7, short: shortAll, mid, issuedBase: { date: "20261120", time: "1400" } });
assert.deepEqual(weather.days.map((d) => d.date), ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24"]);
assert.equal(weather.days[4].hourly.length, 0);
assert.equal(weather.issued_at, "2026-11-20T14:00:00+09:00");
assert.equal(weather.source, "기상청");
assert.deepEqual(buildWeather({ now: afternoon, days: 3, short: shortGrid(), mid, issuedBase: { date: "20261120", time: "1400" } }).days, []);

console.log("Weather checks passed.");
