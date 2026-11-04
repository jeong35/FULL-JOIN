import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { invalidEnumField, STYLES, wardrobeInputSchema } from "../../../src/fulljoin/catalog.ts";
import { filterFeed, orderHomeFeed, type FeedImage } from "../../../src/fulljoin/feed.ts";
import { classifyGap, type ItemForGapAnalysis, type WardrobeItemForGapAnalysis } from "../../../src/fulljoin/gap_analysis.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
};

type JsonObject = Record<string, unknown>;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

function apiError(status: number, code: string, message: string, field?: string): Response {
  return json({ error: { code, message, ...(field === undefined ? {} : { field }) } }, status);
}

function routePath(url: URL): string {
  return url.pathname.replace(/^\/functions\/v1\/api/, "").replace(/^\/api/, "") || "/";
}

async function bodyAsObject(request: Request): Promise<JsonObject | null> {
  try {
    const value: unknown = await request.json();
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as JsonObject
      : null;
  } catch {
    return null;
  }
}

async function styleImageExists(db: SupabaseClient, styleImageId: string): Promise<boolean> {
  const { data, error } = await db.from("style_images").select("id").eq("id", styleImageId).maybeSingle();
  if (error !== null) throw error;
  return data !== null;
}

async function signedThumbnail(db: SupabaseClient, imagePath: string): Promise<string> {
  const { data, error } = await db.storage.from("feed-images").createSignedUrl(imagePath, 3600);
  if (error !== null) throw error;
  return data.signedUrl;
}

async function handleWardrobe(request: Request, url: URL, db: SupabaseClient): Promise<Response> {
  if (request.method === "GET") {
    const userId = url.searchParams.get("user_id")?.trim();
    if (!userId) return apiError(400, "invalid_request", "사용자 식별자가 필요해요", "user_id");
    const { data, error } = await db.from("wardrobe_items")
      .select("id,user_id,slot,kind,color,visual_fit,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });
    if (error !== null) throw error;
    return json({ wardrobe_items: data });
  }

  if (request.method !== "POST") return apiError(405, "method_not_allowed", "지원하지 않는 요청 방식이에요");
  const body = await bodyAsObject(request);
  if (body === null) return apiError(400, "invalid_request", "요청 본문을 확인해 주세요");
  const parsed = wardrobeInputSchema.safeParse(body);
  if (!parsed.success) {
    const field = invalidEnumField(parsed.error);
    const labels: Record<string, string> = { slot: "부위", kind: "종류", color: "색", visual_fit: "핏" };
    return apiError(400, "invalid_enum", `${field === undefined ? "값" : labels[field] ?? field}을(를) 고를 수 없어요`, field);
  }
  const { data, error } = await db.from("wardrobe_items").insert(parsed.data)
    .select("id,user_id,slot,kind,color,visual_fit").single();
  if (error !== null) throw error;
  return json({ wardrobe_item: data }, 201);
}

async function handleFeed(url: URL, db: SupabaseClient): Promise<Response> {
  const selectedStyle = url.searchParams.get("style");
  if (selectedStyle !== null && !STYLES.includes(selectedStyle as (typeof STYLES)[number])) {
    return apiError(400, "invalid_enum", `스타일 '${selectedStyle}'은 고를 수 있는 값이 아니에요`, "style");
  }
  const { data, error } = await db.from("style_images")
    .select("id,image_path,style,source,uploaded_at")
    .eq("published", true);
  if (error !== null) throw error;
  const images = (data ?? []) as Array<FeedImage & { image_path: string; source: string }>;

  let ordered: typeof images;
  if (selectedStyle !== null) {
    ordered = filterFeed(images, selectedStyle) as typeof images;
  } else {
    const userId = url.searchParams.get("user_id")?.trim();
    if (!userId) return apiError(400, "invalid_request", "홈 피드에는 사용자 식별자가 필요해요", "user_id");
    const { data: preferences, error: preferenceError } = await db.from("user_style_preferences")
      .select("style,position").eq("user_id", userId).order("position");
    if (preferenceError !== null) throw preferenceError;
    ordered = orderHomeFeed(images, (preferences ?? []).map((entry) => String(entry.style))) as typeof images;
  }

  const styleImages = await Promise.all(ordered.map(async (image) => ({
    id: image.id,
    thumbnail_url: await signedThumbnail(db, image.image_path),
    style: image.style,
    source: image.source,
  })));
  return json({ style_images: styleImages });
}

async function handleHeart(
  request: Request,
  styleImageId: string,
  db: SupabaseClient,
): Promise<Response> {
  const body = await bodyAsObject(request);
  const userId = typeof body?.user_id === "string" ? body.user_id.trim() : "";
  if (!userId) return apiError(400, "invalid_request", "사용자 식별자가 필요해요", "user_id");
  if (!await styleImageExists(db, styleImageId)) {
    return apiError(404, "style_image_not_found", "해당 피드 사진을 찾을 수 없어요");
  }

  if (request.method === "DELETE") {
    const { error } = await db.from("hearts").delete().eq("user_id", userId).eq("style_image_id", styleImageId);
    if (error !== null) throw error;
    return json({ style_image_id: styleImageId, hearted: false });
  }
  if (request.method !== "POST") return apiError(405, "method_not_allowed", "지원하지 않는 요청 방식이에요");

  const [{ data: itemRows, error: itemError }, { data: wardrobeRows, error: wardrobeError }] = await Promise.all([
    db.from("style_image_items").select("item_id,slot,kind,color,visual_fit,visibility").eq("style_image_id", styleImageId),
    db.from("wardrobe_items").select("id,slot,kind,color,visual_fit").eq("user_id", userId),
  ]);
  if (itemError !== null) throw itemError;
  if (wardrobeError !== null) throw wardrobeError;

  const { data: heart, error: heartError } = await db.from("hearts")
    .upsert({ user_id: userId, style_image_id: styleImageId }, { onConflict: "user_id,style_image_id" })
    .select("saved_at").single();
  if (heartError !== null) throw heartError;

  if ((wardrobeRows ?? []).length === 0) {
    return json({
      style_image_id: styleImageId,
      saved_at: heart.saved_at,
      items: (itemRows ?? []).map((item) => ({ item_id: item.item_id, gap_status: null, wardrobe_item_ids: [], decision_options: [] })),
      outfits: [],
      products: [],
      message: "옷장을 등록하면 가진 옷과 맞춰 드려요",
    });
  }

  const wardrobe = (wardrobeRows ?? []) as WardrobeItemForGapAnalysis[];
  const items = (itemRows ?? []).map((row) => {
    const result = classifyGap(row as ItemForGapAnalysis, wardrobe);
    return {
      item_id: row.item_id,
      ...result,
      decision_options: result.gap_status === "비슷함" ? ["활용", "구매"] : [],
    };
  });
  return json({ style_image_id: styleImageId, saved_at: heart.saved_at, items, outfits: [], products: [] });
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return apiError(500, "server_misconfigured", "서버 환경 설정을 확인해 주세요");
    }
    const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const url = new URL(request.url);
    const path = routePath(url);

    try {
      if (path === "/health" && request.method === "GET") return json({ ok: true });
      if (path === "/wardrobe") return await handleWardrobe(request, url, db);
      if (path === "/feed" && request.method === "GET") return await handleFeed(url, db);
      const heartMatch = path.match(/^\/style-images\/([^/]+)\/heart$/);
      if (heartMatch?.[1] !== undefined) return await handleHeart(request, decodeURIComponent(heartMatch[1]), db);
      return apiError(404, "route_not_found", "요청한 API를 찾을 수 없어요");
    } catch (error) {
      console.error(error);
      return apiError(500, "internal_error", "서버에서 요청을 처리하지 못했어요");
    }
  },
};
