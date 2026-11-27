import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { betaLoginInputSchema, normalizeBetaNickname } from "../src/fulljoin/beta_auth.ts";

const [nicknameRaw, pin] = process.argv.slice(2);
const parsed = betaLoginInputSchema.safeParse({ nickname: nicknameRaw, pin });
if (!parsed.success) throw new Error("Usage: node scripts/provision-beta-account.mjs <nickname> <4-digit-pin>");
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: created, error: createError } = await db.auth.admin.createUser({
  email: `beta-${randomUUID()}@accounts.odit.invalid`,
  password: randomBytes(36).toString("base64url"),
  email_confirm: true,
  user_metadata: { account_type: "private_beta" },
});
if (createError !== null || created.user === null) throw createError ?? new Error("auth_user_not_created");
const nickname = parsed.data.nickname;
const { error: provisionError } = await db.rpc("provision_beta_account", {
  p_auth_user_id: created.user.id,
  p_nickname_normalized: normalizeBetaNickname(nickname).toLocaleLowerCase("ko-KR"),
  p_nickname_display: nickname,
  p_pin: parsed.data.pin,
});
if (provisionError !== null) {
  await db.auth.admin.deleteUser(created.user.id).catch(() => undefined);
  throw provisionError;
}
console.log(JSON.stringify({ auth_user_id: created.user.id, nickname, provisioned: true }));
