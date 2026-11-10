import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { EVENT_NAMES, eventBatchSchema, eventRows } from "../src/fulljoin/events.ts";

const valid = {
  device_id: "d2f1c7a0-1b2c-4d5e-8f90-123456789abc",
  session_id: "s-0123456789",
  platform: "web",
  events: [
    { name: "intro_view", ts: "2026-11-10T14:00:00.000Z", user_id: null, props: { step: 1 } },
    { name: "result_view", user_id: "u-0123abcd", props: { style_image_id: "IMG-001", need: 2, outfits: 1 } },
  ],
};

// 정상 묶음은 받고, 행으로 바꿀 때 기기·세션 ID를 이벤트마다 붙인다.
const parsed = eventBatchSchema.parse(valid);
assert.deepEqual(eventRows(parsed)[1], {
  device_id: valid.device_id,
  session_id: valid.session_id,
  platform: "web",
  user_id: "u-0123abcd",
  name: "result_view",
  client_ts: null,
  props: { style_image_id: "IMG-001", need: 2, outfits: 1 },
});

// 목록에 없는 이벤트, 닉네임 같은 알 수 없는 칸, 너무 큰 묶음·속성은 받지 않는다.
const reject = (batch) => assert.equal(eventBatchSchema.safeParse(batch).success, false);
reject({ ...valid, events: [{ name: "hack" }] });
reject({ ...valid, nickname: "은재" });
reject({ ...valid, events: [{ name: "app_open", nickname: "은재" }] });
reject({ ...valid, events: Array.from({ length: 21 }, () => ({ name: "app_open" })) });
reject({ ...valid, events: [] });
reject({ ...valid, device_id: "x" });
reject({ ...valid, events: [{ name: "app_open", props: Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`p_${String.fromCharCode(97 + i)}`, 1])) }] });
reject({ ...valid, events: [{ name: "app_open", props: { step: { nested: true } } }] });
reject({ ...valid, events: [{ name: "app_open", props: { step: "x".repeat(81) } }] });

// 앱과 서버의 이벤트 이름 목록이 같아야 한다.
const mobile = readFileSync(new URL("../mobile/src/data/events.ts", import.meta.url), "utf8");
const mobileNames = [...mobile.matchAll(/^\s+'([a-z_]+)',$/gm)].map((match) => match[1]);
assert.deepEqual(mobileNames, [...EVENT_NAMES]);

console.log("Event checks passed.");
