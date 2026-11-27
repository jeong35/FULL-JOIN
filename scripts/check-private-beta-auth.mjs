import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { betaLoginInputSchema, normalizeBetaNickname } from "../src/fulljoin/beta_auth.ts";
import { requestedUserIds, userRouteRequiresAuth } from "../src/fulljoin/api_auth.ts";

assert.equal(normalizeBetaNickname("  테스트  계정 "), "테스트 계정");
assert.equal(betaLoginInputSchema.safeParse({ nickname: "베타계정", pin: "0427" }).success, true);
assert.equal(betaLoginInputSchema.safeParse({ nickname: "베타계정", pin: "12345" }).success, false);
assert.equal(userRouteRequiresAuth("/beta-auth/login", "POST"), false);
assert.equal(userRouteRequiresAuth("/wardrobe", "GET"), true);
assert.deepEqual(requestedUserIds({ path: "/wardrobe", method: "GET", queryUserId: "AUTH-B" }), ["AUTH-B"]);

const session = await readFile(new URL("../mobile/src/data/session.ts", import.meta.url), "utf8");
assert.doesNotMatch(session, /URLSearchParams\([^)]*\)\.get\(['"]user['"]\)/u);
assert.doesNotMatch(session, /function cyrb53|userIdFor/u);
assert.match(session, /accessToken/u);
const api = await readFile(new URL("../mobile/src/data/api.ts", import.meta.url), "utf8");
assert.match(api, /authorization: `Bearer \$\{token\}`/u);
assert.match(api, /grant_type=refresh_token/u);
const events = await readFile(new URL("../mobile/src/data/events.ts", import.meta.url), "utf8");
assert.match(events, /authorization: `Bearer \$\{accessToken\}`/u);
const notifications = await readFile(new URL("../supabase/functions/notifications/index.ts", import.meta.url), "utf8");
const notificationMigration = await readFile(
  new URL("../supabase/migrations/202611250001_web_push_notifications.sql", import.meta.url),
  "utf8",
);
assert.match(notifications, /supabase\.auth\.getUser/u);
assert.match(notifications, /user_id_mismatch/u);
assert.match(notificationMigration, /endpoint_url is not null/u);
assert.doesNotMatch(notificationMigration, /gctbcanltqgcymdlplyr/u);
const migration = await readFile(new URL("../supabase/migrations/202611270001_private_beta_accounts.sql", import.meta.url), "utf8");
assert.match(migration, /crypt\(p_pin/u);
assert.match(migration, /interval '15 minutes'/u);
assert.match(migration, /revoke all on table public\.beta_accounts from public, anon, authenticated/u);
console.log("Private Beta auth checks passed: server-issued session, token attachment, rate-limited PIN verification, and no URL user override.");
