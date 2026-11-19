import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { ANALYTICS_EVENT_NAMES, ANALYTICS_SCREENS } from "../src/fulljoin/analytics.ts";

const files = await Promise.all([
  readFile(new URL("../mobile/src/data/analytics.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/202611160001_user_events.sql", import.meta.url), "utf8"),
  readFile(new URL("../docs/ANALYTICS.md", import.meta.url), "utf8"),
]);

for (const eventName of ANALYTICS_EVENT_NAMES) {
  for (const [index, source] of files.entries()) {
    assert.ok(source.includes(eventName), `${eventName} is missing from analytics contract file ${index + 1}`);
  }
}

for (const screenName of ANALYTICS_SCREENS) {
  assert.ok(files[0].includes(screenName), `${screenName} is missing from the mobile tracker`);
  assert.ok(files[1].includes(screenName), `${screenName} is missing from the database constraint`);
}

console.log(`Analytics contract is aligned: ${ANALYTICS_EVENT_NAMES.length} events, ${ANALYTICS_SCREENS.length} screens.`);
