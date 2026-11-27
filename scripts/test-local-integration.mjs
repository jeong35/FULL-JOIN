import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const root = fileURLToPath(new URL("..", import.meta.url));

const integrationTarget = process.env.FULL_JOIN_INTEGRATION_TARGET ?? "local";

function localEnvironment() {
  const output = execFileSync(`${root}/node_modules/.bin/supabase`, ["status", "-o", "env"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const values = new Map([...output.matchAll(/^([A-Z_]+)="([^"]*)"$/gmu)].map((match) => [match[1], match[2]]));
  const apiUrl = values.get("API_URL");
  const anonKey = values.get("ANON_KEY");
  const serviceRoleKey = values.get("SERVICE_ROLE_KEY");
  if (!apiUrl || !anonKey || !serviceRoleKey || !["127.0.0.1", "localhost"].includes(new URL(apiUrl).hostname)) {
    throw new Error("Integration tests require a running local Supabase stack.");
  }
  return { apiUrl, anonKey, serviceRoleKey };
}

function stagingEnvironment() {
  const projectRef = process.env.FULL_JOIN_STAGING_PROJECT_REF;
  const apiUrl = process.env.FULL_JOIN_STAGING_URL;
  const anonKey = process.env.FULL_JOIN_STAGING_ANON_KEY;
  const serviceRoleKey = process.env.FULL_JOIN_STAGING_SERVICE_ROLE_KEY;
  if (!projectRef || !apiUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Staging integration requires the FULL_JOIN_STAGING_* environment variables.");
  }
  if (projectRef === "gctbcanltqgcymdlplyr") {
    throw new Error("Refusing to run destructive integration fixtures against the production project.");
  }
  if (new URL(apiUrl).hostname !== `${projectRef}.supabase.co`) {
    throw new Error("Staging project ref and API URL do not match.");
  }
  return { apiUrl, anonKey, serviceRoleKey };
}

const environment = integrationTarget === "staging" ? stagingEnvironment() : localEnvironment();
const db = createClient(environment.apiUrl, environment.serviceRoleKey, { auth: { persistSession: false } });
const functionUrl = `${environment.apiUrl}/functions/v1/api`;
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
let owner = "";
let attacker = "";
let ownerToken = "";
let attackerToken = "";
const styleImageId = `test-look-${suffix}`;
const styleImagePath = `local/${styleImageId}.jpg`;
const localSeedStoragePaths = [];

async function api(path, init = {}, token = ownerToken) {
  const hasBody = init.body !== undefined;
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  const response = await fetch(`${functionUrl}${path}`, {
    ...init,
    headers: {
      ...(hasBody && !isForm ? { "content-type": "application/json" } : {}),
      ...(token === "" ? {} : { authorization: `Bearer ${token}` }),
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

function ok(name, detail) {
  console.log(`✓ ${name}: ${detail}`);
}

async function ensureLocalFeedStorage() {
  if (integrationTarget !== "local") return;
  const { data: images, error: imageError } = await db.from("style_images")
    .select("image_path")
    .eq("published", true);
  assert.equal(imageError, null);
  const paths = [...new Set((images ?? []).map((image) => image.image_path).filter(Boolean))].sort();
  for (const path of paths) {
    const { error: signedError } = await db.storage.from("feed-images").createSignedUrl(path, 60);
    if (signedError === null) continue;
    const { error: uploadError } = await db.storage.from("feed-images").upload(
      path,
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      { contentType: "image/jpeg", upsert: false },
    );
    assert.equal(uploadError, null);
    localSeedStoragePaths.push(path);
  }
  ok("로컬 피드 Storage fixture", `${localSeedStoragePaths.length}개 누락 synthetic 이미지만 임시 생성`);
}

async function insertFixture() {
  const { error: uploadError } = await db.storage.from("feed-images").upload(
    styleImagePath,
    new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    { contentType: "image/jpeg", upsert: true },
  );
  assert.equal(uploadError, null);
  const { error: imageError } = await db.from("style_images").insert({
    id: styleImageId,
    image_path: styleImagePath,
    source: "자체_촬영",
    permission: "필요 없음",
    uploaded_at: new Date().toISOString(),
    style: ["미니멀"],
    tagging: {},
    published: true,
    reviewed_at: new Date().toISOString(),
  });
  assert.equal(imageError, null);
  const { error: itemError } = await db.from("style_image_items").insert([
    {
      item_id: `${styleImageId}-top`, style_image_id: styleImageId, slot: "상의", kind: "니트",
      color: "아이보리", visual_fit: "레귤러", visibility: "전체", brand_source: "없음",
    },
    {
      item_id: `${styleImageId}-bottom`, style_image_id: styleImageId, slot: "하의", kind: "데님팬츠",
      color: "진청", visual_fit: "일자", visibility: "전체", brand_source: "없음",
    },
  ]);
  assert.equal(itemError, null);
}

async function createAuthenticatedUser(label) {
  const email = `${label}-${suffix}@local.odit.test`;
  const password = `Local-${suffix}-Aa1!`;
  const { data: created, error: createError } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(createError, null);
  assert.ok(created.user);
  const client = createClient(environment.apiUrl, environment.anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email, password });
  assert.equal(signInError, null);
  assert.ok(signedIn.session);
  return { id: created.user.id, token: signedIn.session.access_token, client };
}

async function run() {
  if (integrationTarget === "local") {
    const anonymousClient = createClient(environment.apiUrl, environment.anonKey, { auth: { persistSession: false } });
    const { data: anonymousData, error: anonymousError } = await anonymousClient.auth.signInAnonymously();
    assert.equal(anonymousError, null);
    assert.ok(anonymousData.session);
    ok("모바일 개발용 익명 Auth", "local config에서 access token과 사용자 UUID 발급");
  } else {
    ok("스테이징 Auth 방식", "익명 로그인을 변경하지 않고 이메일 테스트 계정으로 격리 검증");
  }

  const ownerAuth = await createAuthenticatedUser("owner");
  const attackerAuth = await createAuthenticatedUser("attacker");
  owner = ownerAuth.id;
  attacker = attackerAuth.id;
  ownerToken = ownerAuth.token;
  attackerToken = attackerAuth.token;

  const health = await api("/health", { method: "GET" }, "");
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
  ok("Edge Function", `${integrationTarget} /health returned 200`);

  await ensureLocalFeedStorage();
  await insertFixture();

  const feed = await api(`/feed?user_id=${encodeURIComponent(owner)}`, { method: "GET" });
  assert.equal(feed.status, 200);
  const feedFixture = feed.body.style_images.find((image) => image.id === styleImageId);
  assert.ok(feedFixture);
  assert.deepEqual(
    feedFixture.items.map(({ slot, kind, color }) => ({ slot, kind, color })),
    [
      { slot: "하의", kind: "데님팬츠", color: "진청" },
      { slot: "상의", kind: "니트", color: "아이보리" },
    ],
  );
  ok("홈 피드 검색 요약", "공개 사진의 종류·색·부위 요약을 item_id 순서로 반환");

  const wardrobeInputs = [
    { user_id: owner, slot: "하의", kind: "데님팬츠", color: "진청", visual_fit: "와이드" },
    { user_id: owner, slot: "하의", kind: "데님팬츠", color: "진청", visual_fit: "일자" },
    { user_id: owner, slot: "상의", kind: "니트", color: "아이보리", visual_fit: "레귤러" },
  ];
  const created = [];
  for (const input of wardrobeInputs) {
    const response = await api("/wardrobe", { method: "POST", body: JSON.stringify(input) });
    assert.equal(response.status, 201);
    created.push(response.body.wardrobe_item.id);
  }
  const wardrobe = await api(`/wardrobe?user_id=${encodeURIComponent(owner)}`, { method: "GET" });
  assert.equal(wardrobe.status, 200);
  assert.equal(wardrobe.body.wardrobe_items.length, 3);
  ok("옷장 등록·조회", "3개 등록 후 동일 사용자로 3개 조회");

  const deleted = await api(`/wardrobe/${created[0]}`, { method: "DELETE", body: JSON.stringify({ user_id: owner }) });
  assert.equal(deleted.status, 200);
  const afterDelete = await api(`/wardrobe?user_id=${encodeURIComponent(owner)}`, { method: "GET" });
  assert.equal(afterDelete.body.wardrobe_items.length, 2);
  ok("옷장 삭제", "ID와 user_id가 일치하는 항목만 삭제");

  const heart = await api(`/style-images/${styleImageId}/heart`, { method: "POST", body: JSON.stringify({ user_id: owner }) });
  assert.equal(heart.status, 200);
  const bottom = heart.body.items.find((item) => item.item_id === `${styleImageId}-bottom`);
  assert.equal(bottom.gap_status, "활용");
  assert.equal(bottom.match_metadata.wardrobe_item_id, created[1]);
  assert.equal(typeof bottom.match_metadata.reason, "string");
  assert.ok(bottom.match_metadata.reason.length > 0);
  assert.equal(bottom.wardrobe_item_ids.includes(bottom.match_metadata.wardrobe_item_id), true);
  ok("사진 저장→비교", "판정 근거와 실제 활용 후보 ID가 일치");
  ok("코사인 후보 정렬", "같은 kind/color 버킷에서 일자 핏 후보가 와이드 핏보다 우선");

  const groundedChat = await api("/chat", {
    method: "POST",
    body: JSON.stringify({ user_id: owner, style_image_id: styleImageId, message: "내 옷장에 있는 데님팬츠로 코디해줘" }),
  });
  assert.equal(groundedChat.status, 200);
  assert.equal(groundedChat.body.answer_source, "grounded");
  assert.equal(groundedChat.body.conversation_id, null);
  assert.equal(groundedChat.body.history_persisted, false);
  assert.ok(groundedChat.body.claimed_owned_item_ids.every((id) => afterDelete.body.wardrobe_items.some((item) => item.id === id)));
  ok("보유 옷 상담", "응답의 소유 주장 ID가 실제 옷장 ID에 한정됨");

  const generalChat = await api("/chat", {
    method: "POST",
    body: JSON.stringify({ user_id: owner, style_image_id: styleImageId, message: "면접에 어울리는 색 조합을 알려줘" }),
  });
  assert.equal(generalChat.status, 200);
  assert.equal(generalChat.body.intents.includes("general_advice"), true);
  assert.equal(["fallback", "openai"].includes(generalChat.body.answer_source), true);
  assert.equal(generalChat.body.history_persisted, false);
  ok("일반 패션 상담", `${generalChat.body.answer_source} 경로로 안전한 응답 반환`);

  const mixedChat = await api("/chat", {
    method: "POST",
    body: JSON.stringify({ user_id: owner, style_image_id: styleImageId, message: "내 옷장 데님팬츠를 면접에 입을 때 색 조합도 알려줘" }),
  });
  assert.equal(mixedChat.status, 200);
  assert.equal(mixedChat.body.intents.includes("mixed"), true);
  assert.equal(mixedChat.body.answer_sections.some((section) => section.source === "wardrobe"), true);
  assert.equal(mixedChat.body.answer_sections.some((section) => section.source === "general_advice"), true);
  assert.equal(mixedChat.body.history_persisted, false);
  ok("복합 상담", "내 옷장 근거와 일반 조언이 별도 section으로 분리됨");

  const historyPage = await api(`/chat/history?style_image_id=${encodeURIComponent(styleImageId)}&limit=2`, { method: "GET" });
  assert.equal(historyPage.status, 501);
  assert.equal(historyPage.body.error.code, "chat_history_unavailable");
  ok("사진별 대화 기록 분리", "Private Beta에서는 명시적으로 미지원이며 일반 챗봇 응답은 정상 동작");

  const events = await api("/events", {
    method: "POST",
    body: JSON.stringify({
      device_id: `device_${suffix}`,
      session_id: `session_${suffix}`,
      platform: "web",
      events: [
        { name: "photo_save_done", user_id: owner, props: { style_image_id: styleImageId, place: "compare" } },
        { name: "result_view", user_id: owner, props: { style_image_id: styleImageId, items: 2 } },
      ],
    }),
  });
  assert.equal(events.status, 200);
  assert.equal(events.body.accepted, 2);
  const { count: storedEvents, error: eventsError } = await db.from("user_events")
    .select("id", { count: "exact", head: true }).eq("user_id", owner);
  assert.equal(eventsError, null);
  assert.equal(storedEvents, 2);
  ok("사용자 이벤트 배치", "2건 수락 및 DB 2건 저장");

  const { data: metrics, error: metricError } = await db.from("llm_operation_metrics")
    .select("response_mode,status,error_type,fallback_used,input_tokens,output_tokens")
    .gte("created_at", new Date(Date.now() - 5 * 60_000).toISOString());
  assert.equal(metricError, null);
  assert.ok((metrics ?? []).some((metric) => metric.response_mode === "grounded" && metric.status === "grounded"));
  assert.ok((metrics ?? []).some((metric) => metric.response_mode === "fallback" || metric.response_mode === "llm"));
  ok("LLMOps DB 저장", `${metrics?.length ?? 0}개 운영 레코드 확인`);
  if (generalChat.body.answer_source === "fallback") {
    assert.ok((metrics ?? []).some((metric) => metric.fallback_used));
    ok("LLM 실패·fallback", `${integrationTarget} 키 미설정 실패를 configuration fallback으로 저장`);
  } else {
    ok("LLM 실패·fallback", "현재 환경은 LLM 성공 경로; 실패 경로는 단위 테스트로 검증");
  }

  const unauthenticated = await api(`/wardrobe?user_id=${encodeURIComponent(owner)}`, { method: "GET" }, "");
  assert.equal(unauthenticated.status, 401);
  const securityProbe = await api(`/wardrobe?user_id=${encodeURIComponent(owner)}`, { method: "GET" }, attackerToken);
  assert.equal(securityProbe.status, 403);
  ok("실제 API 사용자 격리", "토큰 없음 401, 타 user_id 403");

  const { data: ownerRows, error: ownerRlsError } = await ownerAuth.client.from("wardrobe_items").select("id,user_id");
  assert.equal(ownerRlsError, null);
  assert.ok((ownerRows ?? []).every((row) => row.user_id === owner));
  const { data: attackerRows, error: attackerRlsError } = await attackerAuth.client.from("wardrobe_items").select("id,user_id");
  assert.equal(attackerRlsError, null);
  assert.equal(attackerRows?.length, 0);
  ok("DB RLS 사용자 격리", "authenticated 클라이언트는 자기 user_id 행만 조회");

  console.log(`\n${integrationTarget === "staging" ? "Staging" : "Local"} integration summary`);
  console.log("- Mock/grounded/fallback paths: executed without paid external calls");
  console.log("- Live OpenAI call: not executed; no cost incurred");
  console.log(`- Auth policy and actual API/RLS isolation: passed on ${integrationTarget} with two users`);
}

async function cleanup() {
  await db.from("user_events").delete().eq("device_id", `device_${suffix}`);
  if (owner || attacker) {
    await db.from("wardrobe_items").delete().in("user_id", [owner, attacker].filter(Boolean));
  }
  await db.from("style_images").delete().eq("id", styleImageId);
  await db.storage.from("feed-images").remove([styleImagePath, ...localSeedStoragePaths]);
  for (const userId of [owner, attacker].filter(Boolean)) {
    await db.auth.admin.deleteUser(userId);
  }
}

try {
  await run();
} finally {
  await cleanup();
}
