import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json" } });
}

function error(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function userId(body: Record<string, unknown>): string | null {
  const value = body.user_id;
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
}

function accessToken(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function validPushEndpoint(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com" ||
        url.hostname.endsWith(".push.apple.com") || url.hostname === "web.push.apple.com" ||
        url.hostname.endsWith(".notify.windows.com"));
  } catch { return false; }
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

const supabase = createClient(requiredEnvironment("SUPABASE_URL"), requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

async function bodyOf(request: Request): Promise<Record<string, unknown> | null> {
  return record(await request.json().catch(() => null));
}

async function handleSubscribe(request: Request): Promise<Response> {
  const body = await bodyOf(request);
  if (body === null) return error(400, "invalid_request", "알림 구독 정보를 확인해 주세요");
  const id = userId(body);
  const subscription = record(body.subscription);
  const keys = record(subscription?.keys);
  if (id === null || typeof subscription?.endpoint !== "string" || subscription.endpoint.length > 2_048 || !validPushEndpoint(subscription.endpoint) ||
      typeof keys?.p256dh !== "string" || typeof keys?.auth !== "string") {
    return error(400, "invalid_subscription", "알림 구독 정보를 확인해 주세요");
  }
  const { data: previous } = await supabase.from("notification_subscriptions")
    .select("id,user_id").eq("endpoint", subscription.endpoint).maybeSingle();
  if (previous !== null && previous.user_id !== id) {
    await supabase.from("notification_schedules").update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("subscription_id", previous.id).eq("status", "pending");
  }
  const { data, error: databaseError } = await supabase.from("notification_subscriptions").upsert({
    user_id: id,
    endpoint: subscription.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: typeof body.user_agent === "string" ? body.user_agent.slice(0, 240) : null,
    revoked_at: null,
    updated_at: new Date().toISOString(),
    access_token: crypto.randomUUID(),
  }, { onConflict: "endpoint" }).select("id,access_token").single();
  if (databaseError !== null) throw databaseError;
  return json({ subscription_id: data.id, access_token: data.access_token });
}

async function handleSchedule(request: Request): Promise<Response> {
  const body = await bodyOf(request);
  if (body === null) return error(400, "invalid_request", "알림 예약 정보를 확인해 주세요");
  const id = userId(body);
  const token = accessToken(body.access_token);
  const scheduledFor = typeof body.scheduled_for === "string" ? Date.parse(body.scheduled_for) : Number.NaN;
  const now = Date.now();
  const timezone = typeof body.timezone === 'string' ? body.timezone : 'Asia/Seoul';
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); } catch { return error(400, 'invalid_timezone', '시간대를 확인해 주세요'); }
  if (id === null || token === null || typeof body.subscription_id !== "string" || typeof body.look_id !== "string" ||
      body.look_id.length < 1 || body.look_id.length > 128 || !Number.isFinite(scheduledFor) ||
      scheduledFor <= now || scheduledFor > now + 48 * 60 * 60 * 1_000) {
    return error(400, "invalid_schedule", "내일 같은 시간의 알림만 예약할 수 있어요");
  }
  const { data: subscription, error: subscriptionError } = await supabase.from("notification_subscriptions")
    .select("id").eq("id", body.subscription_id).eq("user_id", id).eq("access_token", token).is("revoked_at", null).maybeSingle();
  if (subscriptionError !== null) throw subscriptionError;
  if (subscription === null) return error(404, "subscription_not_found", "알림 구독을 다시 설정해 주세요");

  const { data, error: insertError } = await supabase.rpc('replace_notification_schedule', {
    p_user: id, p_subscription: subscription.id, p_token: token, p_look: body.look_id,
    p_time: new Date(scheduledFor).toISOString(), p_timezone: timezone,
  }).select('id,scheduled_for,status').single();
  if (insertError !== null) throw insertError;
  return json({ schedule: data }, 201);
}

async function handleCancel(request: Request): Promise<Response> {
  const body = await bodyOf(request);
  if (body === null) return error(400, "invalid_request", "취소 정보를 확인해 주세요");
  const id = userId(body);
  const token = accessToken(body.access_token);
  if (id === null || token === null) return error(400, "invalid_user", "사용자 식별자를 확인해 주세요");
  const { data: owned } = await supabase.from("notification_subscriptions")
    .select("id").eq("user_id", id).eq("access_token", token).maybeSingle();
  if (owned === null) return error(404, "subscription_not_found", "알림 구독을 다시 설정해 주세요");
  let query = supabase.from("notification_schedules").update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("user_id", id).eq("subscription_id", owned.id).in("status", ["pending", "sending"]);
  if (typeof body.schedule_id === "string") query = query.eq("id", body.schedule_id);
  const { error: databaseError } = await query;
  if (databaseError !== null) throw databaseError;
  return json({ cancelled: true });
}

async function handleStatus(url: URL): Promise<Response> {
  const id = url.searchParams.get("user_id") ?? "";
  const token = accessToken(url.searchParams.get("access_token"));
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || token === null) return error(400, "invalid_user", "사용자 식별자를 확인해 주세요");
  const { data: owned } = await supabase.from("notification_subscriptions")
    .select("id").eq("user_id", id).eq("access_token", token).maybeSingle();
  if (owned === null) return json({ schedule: null });
  const { data, error: databaseError } = await supabase.from("notification_schedules")
    .select("id,look_id,scheduled_for,status,provider_accepted_at")
    .eq("user_id", id).eq("subscription_id", owned.id).in("status", ["pending", "sending", "sent"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (databaseError !== null) throw databaseError;
  return json({ schedule: data });
}

async function validDispatchToken(token: unknown): Promise<boolean> {
  if (typeof token !== "string") return false;
  const { data, error: databaseError } = await supabase.from("notification_dispatch_config")
    .select("token").eq("singleton", true).maybeSingle();
  if (databaseError !== null) throw databaseError;
  return data?.token === token;
}

async function handleDispatch(request: Request): Promise<Response> {
  const body = await bodyOf(request);
  if (body === null || !await validDispatchToken(body.token)) return error(401, "invalid_dispatch_token", "발송 요청을 확인해 주세요");
  webpush.setVapidDetails(
    requiredEnvironment("VAPID_SUBJECT"),
    requiredEnvironment("VAPID_PUBLIC_KEY"),
    requiredEnvironment("VAPID_PRIVATE_KEY"),
  );
  const { data, error: databaseError } = await supabase.from("notification_schedules")
    .select("id,user_id,look_id,subscription_id,scheduled_for,timezone,notification_subscriptions!inner(user_id,endpoint,p256dh,auth)")
    .eq("status", "pending").lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true }).limit(100);
  if (databaseError !== null) throw databaseError;
  let accepted = 0;
  let failed = 0;
  for (const schedule of data ?? []) {
    const { data: claimed } = await supabase.from("notification_schedules")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .eq("id", schedule.id).eq("status", "pending").select("id").maybeSingle();
    if (claimed === null) continue;
    const joined = Array.isArray(schedule.notification_subscriptions)
      ? schedule.notification_subscriptions[0]
      : schedule.notification_subscriptions;
    if (!joined || joined.user_id !== schedule.user_id) {
      await supabase.from("notification_schedules").update({ status: "cancelled", error_type: "account_changed", updated_at: new Date().toISOString() }).eq("id", schedule.id);
      continue;
    }
    try {
      await webpush.sendNotification({
        endpoint: joined.endpoint,
        keys: { p256dh: joined.p256dh, auth: joined.auth },
      }, JSON.stringify({
        title: "오늘은 어떤 코디로 입을까요?",
        body: "오딧에서 오늘의 날씨와 내 옷장에 맞는 코디를 골라보세요.",
        url: `/recommend?notification=1&schedule_id=${encodeURIComponent(schedule.id)}`,
      }), { TTL: 60 * 60 * 6, urgency: "normal" });
      await supabase.from("notification_schedules").update({
        status: "pending", scheduled_for: nextDaily(schedule.scheduled_for, schedule.timezone), provider_accepted_at: new Date().toISOString(), updated_at: new Date().toISOString(), error_type: null,
      }).eq("id", schedule.id).eq("status", "sending");
      accepted += 1;
    } catch (sendError) {
      const statusCode = typeof sendError === "object" && sendError !== null && "statusCode" in sendError
        ? Number(sendError.statusCode) : 0;
      const errorType = statusCode === 404 || statusCode === 410 ? "subscription_expired" : `push_${statusCode || "failed"}`;
      await supabase.from("notification_schedules").update({ status: "failed", error_type: errorType, updated_at: new Date().toISOString() }).eq("id", schedule.id);
      if (errorType === "subscription_expired") {
        await supabase.from("notification_subscriptions").update({ revoked_at: new Date().toISOString() }).eq("id", schedule.subscription_id);
      }
      failed += 1;
    }
  }
  return json({ processed: accepted + failed, provider_accepted: accepted, failed });
}

// Preserve the selected wall-clock time across daylight-saving transitions.
function nextDaily(previous: string, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const target = formatter.format(new Date(previous));
  let point = Date.parse(previous) + 60_000;
  const minimum = Math.max(Date.now(), Date.parse(previous) + 20 * 3_600_000);
  point = Math.max(point, Math.floor(minimum / 60_000) * 60_000 + 60_000);
  for (let count = 0; count < 48 * 60; count++, point += 60_000) {
    if (formatter.format(new Date(point)) === target) return new Date(point).toISOString();
  }
  return new Date(minimum + 24 * 3_600_000).toISOString();
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/notifications/, "") || "/";
    if (request.method === "GET" && path === "/config") return json({ vapid_public_key: requiredEnvironment("VAPID_PUBLIC_KEY") });
    if (request.method === "GET" && path === "/status") return await handleStatus(url);
    if (request.method === "POST" && path === "/subscribe") return await handleSubscribe(request);
    if (request.method === "POST" && path === "/schedule") return await handleSchedule(request);
    if (request.method === "POST" && path === "/cancel") return await handleCancel(request);
    if (request.method === "POST" && path === "/dispatch") return await handleDispatch(request);
    return error(404, "not_found", "알림 경로를 찾지 못했어요");
  } catch (caught) {
    console.error("notification_function_error", caught instanceof Error ? caught.message : "unknown");
    return error(500, "internal_error", "알림을 처리하지 못했어요");
  }
});
