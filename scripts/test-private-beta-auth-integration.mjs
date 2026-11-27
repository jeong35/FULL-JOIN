import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = fileURLToPath(new URL("..", import.meta.url));
const target = process.env.FULL_JOIN_INTEGRATION_TARGET ?? "local";

function environment() {
  if (target === "staging") {
    const projectRef = process.env.FULL_JOIN_STAGING_PROJECT_REF;
    const apiUrl = process.env.FULL_JOIN_STAGING_URL;
    const serviceRoleKey = process.env.FULL_JOIN_STAGING_SERVICE_ROLE_KEY;
    const anonKey = process.env.FULL_JOIN_STAGING_ANON_KEY;
    if (!projectRef || !apiUrl || !serviceRoleKey || !anonKey) {
      throw new Error("Staging integration requires the FULL_JOIN_STAGING_* environment variables");
    }
    if (projectRef === "gctbcanltqgcymdlplyr" || new URL(apiUrl).hostname !== `${projectRef}.supabase.co`) {
      throw new Error("Refusing to run Private Beta fixtures outside the configured staging project");
    }
    return { apiUrl, serviceRoleKey, anonKey };
  }
  const output = execFileSync(`${root}/node_modules/.bin/supabase`, ["status", "-o", "env"], {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  });
  const values = new Map([...output.matchAll(/^([A-Z_]+)="([^"]*)"$/gmu)].map((match) => [match[1], match[2]]));
  const apiUrl = values.get("API_URL");
  const serviceRoleKey = values.get("SERVICE_ROLE_KEY");
  const anonKey = values.get("ANON_KEY");
  if (!apiUrl || !serviceRoleKey || !anonKey || !["127.0.0.1", "localhost"].includes(new URL(apiUrl).hostname)) {
    throw new Error("Private Beta integration requires a local Supabase stack");
  }
  return { apiUrl, serviceRoleKey, anonKey };
}

const { apiUrl, serviceRoleKey, anonKey } = environment();
const admin = createClient(apiUrl, serviceRoleKey, { auth: { persistSession: false } });
const suffix = randomUUID().slice(0, 8);
const functionUrl = `${apiUrl}/functions/v1/api`;
const notificationUrl = `${apiUrl}/functions/v1/notifications`;
const pushEndpoint = `https://fcm.googleapis.com/fcm/send/private-beta-${suffix}`;
const accounts = [];

async function api(path, { token, body, method = "GET" } = {}) {
  const response = await fetch(`${functionUrl}${path}`, {
    method,
    headers: { apikey: anonKey, ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function provision(label, pin) {
  const email = `beta-${accounts.length}-${suffix}@accounts.odit.test`;
  const password = randomBytes(32).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(error, null);
  accounts.push(data.user.id);
  const nickname = `베타${label}${suffix.slice(0, 2)}`;
  const { error: rpcError } = await admin.rpc("provision_beta_account", {
    p_auth_user_id: data.user.id,
    p_nickname_normalized: nickname.toLocaleLowerCase("ko-KR"),
    p_nickname_display: nickname,
    p_pin: pin,
  });
  assert.equal(rpcError, null);
  const direct = await admin.auth.signInWithPassword({ email, password: pin });
  assert.notEqual(direct.error, null, "four-digit PIN must not be the Supabase Auth password");
  return { id: data.user.id, nickname, pin };
}

try {
  const owner = await provision("주인", "0427");
  const attacker = await provision("공격", "7319");
  const lockedAccount = await provision("잠금", "2580");
  const concurrentAccount = await provision("동시", "8642");
  assert.equal((await api("/beta-auth/login", { method: "POST", body: { nickname: `미등록${suffix.slice(0, 2)}`, pin: "1111" } })).status, 401);
  const invalid = await api("/beta-auth/login", { method: "POST", body: { nickname: owner.nickname, pin: "0000" } });
  assert.equal(invalid.status, 401);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await api("/beta-auth/login", { method: "POST", body: { nickname: lockedAccount.nickname, pin: "0000" } })).status, 401);
  }
  assert.equal((await api("/beta-auth/login", { method: "POST", body: { nickname: lockedAccount.nickname, pin: lockedAccount.pin } })).status, 401);
  const { error: unlockError } = await admin.from("beta_accounts").update({ locked_until: new Date(Date.now() - 1_000).toISOString() })
    .eq("auth_user_id", lockedAccount.id);
  assert.equal(unlockError, null);
  assert.equal((await api("/beta-auth/login", { method: "POST", body: { nickname: lockedAccount.nickname, pin: lockedAccount.pin } })).status, 200);

  const concurrentFailures = await Promise.all(Array.from({ length: 5 }, () => api("/beta-auth/login", {
    method: "POST", body: { nickname: concurrentAccount.nickname, pin: "0000" },
  })));
  assert.ok(concurrentFailures.every((result) => result.status === 401));
  assert.equal((await api("/beta-auth/login", { method: "POST", body: { nickname: concurrentAccount.nickname, pin: concurrentAccount.pin } })).status, 401);

  const login = await api("/beta-auth/login", { method: "POST", body: { nickname: owner.nickname, pin: owner.pin } });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, owner.id);
  assert.equal(typeof login.body.session.access_token, "string");
  const ownerToken = login.body.session.access_token;
  const weather = await api("/weather?lat=37.2749&lon=127.0567&days=3", { token: ownerToken });
  const weatherConfigured = weather.status !== 503;
  if (weatherConfigured) {
    assert.equal(weather.status, 200);
    assert.equal(Array.isArray(weather.body.days), true);
    assert.equal(weather.body.days.length > 0, true);
    assert.equal(weather.body.source, "기상청");
  } else {
    assert.equal(weather.body.error.code, "weather_not_configured");
    console.log("Staging weather provider is not configured; authenticated 503 was distinguished from auth failure.");
  }
  assert.equal((await api("/weather?lat=37.2749&lon=127.0567&days=1")).status, 401);
  const sessionClient = createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: refreshed, error: refreshError } = await sessionClient.auth.refreshSession({ refresh_token: login.body.session.refresh_token });
  assert.equal(refreshError, null);
  assert.equal(refreshed.session?.user.id, owner.id);
  const refreshedWeather = await api("/weather?lat=37.2749&lon=127.0567&days=1", { token: refreshed.session.access_token });
  assert.equal(refreshedWeather.status, weatherConfigured ? 200 : 503);

  const attackerLogin = await api("/beta-auth/login", { method: "POST", body: { nickname: attacker.nickname, pin: attacker.pin } });
  assert.equal(attackerLogin.status, 200);
  const attackerToken = attackerLogin.body.session.access_token;

  const created = await api("/wardrobe", {
    method: "POST", token: ownerToken,
    body: { user_id: owner.id, slot: "상의", kind: "니트", color: "아이보리", visual_fit: "레귤러", material: [], pattern: null, seasons: [], details: {} },
  });
  assert.equal(created.status, 201);
  const ownerRead = await api(`/wardrobe?user_id=${owner.id}`, { token: ownerToken });
  assert.equal(ownerRead.status, 200);
  assert.equal(ownerRead.body.wardrobe_items.length, 1);
  assert.equal((await api(`/wardrobe?user_id=${owner.id}`, { token: attackerToken })).status, 403);
  assert.equal((await api(`/wardrobe?user_id=${attacker.id}`, { token: ownerToken })).status, 403);
  assert.equal((await api(`/wardrobe?user_id=${owner.id}`)).status, 401);
  assert.equal((await api(`/wardrobe?user_id=${owner.id}`, { token: "invalid-token" })).status, 401);

  const eventResult = await api("/events", {
    method: "POST", token: ownerToken,
    body: { device_id: `device_${suffix}`, session_id: `session_${suffix}`, platform: "web", events: [{ name: "login_success", user_id: owner.id }] },
  });
  assert.equal(eventResult.status, 200);
  const subscribe = await fetch(`${notificationUrl}/subscribe`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json", authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ user_id: owner.id, subscription: { endpoint: pushEndpoint, keys: { p256dh: "test-p256dh", auth: "test-auth" } } }),
  });
  assert.equal(subscribe.status, 200);
  const subscription = await subscribe.json();
  const schedule = await fetch(`${notificationUrl}/schedule`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json", authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({
      user_id: owner.id,
      subscription_id: subscription.subscription_id,
      access_token: subscription.access_token,
      look_id: "synthetic-private-beta-look",
      scheduled_for: new Date(Date.now() + 25 * 60 * 60 * 1_000).toISOString(),
      timezone: "Asia/Seoul",
    }),
  });
  assert.equal(schedule.status, 201);
  const scheduleBody = await schedule.json();
  const status = await fetch(`${notificationUrl}/status?user_id=${owner.id}&access_token=${subscription.access_token}`, {
    headers: { apikey: anonKey, authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(status.status, 200);
  assert.equal((await status.json()).schedule.id, scheduleBody.schedule.id);
  const crossSubscribe = await fetch(`${notificationUrl}/subscribe`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json", authorization: `Bearer ${attackerToken}` },
    body: JSON.stringify({ user_id: owner.id, subscription: { endpoint: `${pushEndpoint}-cross`, keys: { p256dh: "test-p256dh", auth: "test-auth" } } }),
  });
  assert.equal(crossSubscribe.status, 403);
  const crossCancel = await fetch(`${notificationUrl}/cancel`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json", authorization: `Bearer ${attackerToken}` },
    body: JSON.stringify({ user_id: owner.id, access_token: subscription.access_token, schedule_id: scheduleBody.schedule.id }),
  });
  assert.notEqual(crossCancel.status, 200);
  const cancelled = await fetch(`${notificationUrl}/cancel`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json", authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ user_id: owner.id, access_token: subscription.access_token, schedule_id: scheduleBody.schedule.id }),
  });
  assert.equal(cancelled.status, 200);
  const invalidDispatch = await fetch(`${notificationUrl}/dispatch`, {
    method: "POST", headers: { apikey: anonKey, "content-type": "application/json" }, body: JSON.stringify({ token: "invalid" }),
  });
  assert.equal(invalidDispatch.status, 401);

  assert.equal((await sessionClient.auth.setSession({ access_token: refreshed.session.access_token, refresh_token: refreshed.session.refresh_token })).error, null);
  assert.equal((await sessionClient.auth.signOut({ scope: "global" })).error, null);
  const afterLogout = await sessionClient.auth.refreshSession({ refresh_token: refreshed.session.refresh_token });
  assert.notEqual(afterLogout.error, null);
  console.log(`Private Beta ${target} integration passed: provisioning, login, lock/unlock, concurrent failures, refresh/logout, A/B isolation, wardrobe, events, and notification schedule/cancel ownership.`);
} finally {
  await admin.from("notification_schedules").delete().in("user_id", accounts);
  await admin.from("notification_subscriptions").delete().in("user_id", accounts);
  for (const id of accounts) {
    await admin.from("user_events").delete().eq("user_id", id);
    await admin.from("wardrobe_items").delete().eq("user_id", id);
    await admin.from("beta_accounts").delete().eq("auth_user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
}
