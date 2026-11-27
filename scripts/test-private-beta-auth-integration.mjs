import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = execFileSync(`${root}/node_modules/.bin/supabase`, ["status", "-o", "env"], { cwd: root, encoding: "utf8" });
const env = new Map([...output.matchAll(/^([A-Z_]+)="([^"]*)"$/gmu)].map((match) => [match[1], match[2]]));
const apiUrl = env.get("API_URL");
const serviceRoleKey = env.get("SERVICE_ROLE_KEY");
const anonKey = env.get("ANON_KEY");
if (!apiUrl || !serviceRoleKey || !anonKey || !["127.0.0.1", "localhost"].includes(new URL(apiUrl).hostname)) {
  throw new Error("Private Beta integration requires a local Supabase stack");
}
const admin = createClient(apiUrl, serviceRoleKey, { auth: { persistSession: false } });
const suffix = randomUUID().slice(0, 8);
const functionUrl = `${apiUrl}/functions/v1/api`;
const notificationUrl = `${apiUrl}/functions/v1/notifications`;
const pushEndpoint = `https://fcm.googleapis.com/fcm/send/private-beta-${suffix}`;
const accounts = [];

async function api(path, { token, body, method = "GET" } = {}) {
  const response = await fetch(`${functionUrl}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function provision(label, pin) {
  const email = `beta-${label}-${suffix}@accounts.odit.invalid`;
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
  const invalid = await api("/beta-auth/login", { method: "POST", body: { nickname: owner.nickname, pin: "0000" } });
  assert.equal(invalid.status, 401);
  const login = await api("/beta-auth/login", { method: "POST", body: { nickname: owner.nickname, pin: owner.pin } });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, owner.id);
  assert.equal(typeof login.body.session.access_token, "string");
  const ownerToken = login.body.session.access_token;

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
    headers: { "content-type": "application/json", authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ user_id: owner.id, subscription: { endpoint: pushEndpoint, keys: { p256dh: "test-p256dh", auth: "test-auth" } } }),
  });
  assert.equal(subscribe.status, 200);
  const crossSubscribe = await fetch(`${notificationUrl}/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${attackerToken}` },
    body: JSON.stringify({ user_id: owner.id, subscription: { endpoint: `${pushEndpoint}-cross`, keys: { p256dh: "test-p256dh", auth: "test-auth" } } }),
  });
  assert.equal(crossSubscribe.status, 403);
  console.log("Private Beta auth integration passed: login/session, PIN separation, A/B isolation, invalid token, wardrobe, events, and notification ownership.");
} finally {
  await admin.from("notification_subscriptions").delete().eq("endpoint", pushEndpoint);
  for (const id of accounts) {
    await admin.from("user_events").delete().eq("user_id", id);
    await admin.from("wardrobe_items").delete().eq("user_id", id);
    await admin.from("beta_accounts").delete().eq("auth_user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
}
