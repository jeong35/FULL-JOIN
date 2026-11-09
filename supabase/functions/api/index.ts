import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  analyzeInputSchema,
  normalizeAnalysis,
  productLinkInputSchema,
  styleImageAnalysisSchema,
  type StyleImageAnalysis,
} from "../../../src/fulljoin/analysis.ts";
import { invalidEnumField, STYLES, wardrobeInputSchema } from "../../../src/fulljoin/catalog.ts";
import { filterFeed, orderHomeFeed, type FeedImage } from "../../../src/fulljoin/feed.ts";
import { classifyGap, type ItemForGapAnalysis, type WardrobeItemForGapAnalysis } from "../../../src/fulljoin/gap_analysis.ts";
import { heartItemResponse, representativeProductFields, type HeartItemRow } from "../../../src/fulljoin/heart.ts";
import { extractProductMetadata, type ProductMetadata } from "../../../src/fulljoin/product_metadata.ts";
import { styleImagePublishInputSchema, styleImageReviewInputSchema } from "../../../src/fulljoin/review.ts";
import { ANALYSIS_JSON_SCHEMA, ANALYSIS_SYSTEM_PROMPT } from "./generated_analysis_contract.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-admin-token, x-client-info",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
};

type JsonObject = Record<string, unknown>;

const MAX_ANALYSIS_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PRODUCT_PAGE_BYTES = 2 * 1024 * 1024;
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini-2025-04-14";

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

function adminTokenIsValid(request: Request): boolean {
  const expected = Deno.env.get("ANALYZE_ADMIN_TOKEN");
  const actual = request.headers.get("x-admin-token");
  return expected !== undefined && expected.length >= 24 && actual === expected;
}

function imageMimeType(blob: Blob, imagePath: string): string | null {
  if (["image/jpeg", "image/png", "image/webp"].includes(blob.type)) return blob.type;
  const extension = imagePath.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function escapeCaption(caption: string): string {
  return caption.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function productUrlIsPublic(url: URL): boolean {
  if (!(["http:", "https:"] as string[]).includes(url.protocol) || url.username || url.password) return false;
  if (url.port && !["80", "443"].includes(url.port)) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.includes(":")) return false;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a = 0, b = 0] = parts;
  return !(a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168));
}

async function limitedResponseText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_PRODUCT_PAGE_BYTES) throw new Error("Product page is too large");
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_PRODUCT_PAGE_BYTES) {
      await reader.cancel();
      throw new Error("Product page is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}

async function fetchProductMetadata(productUrl: string): Promise<ProductMetadata> {
  let current = new URL(productUrl);
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    if (!productUrlIsPublic(current)) throw new Error("Product URL is not public");
    const response = await fetch(current, {
      redirect: "manual",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "FULL-JOIN-MVP/1.0 product-metadata",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (location === null || redirectCount === 5) throw new Error("Invalid product page redirect");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`Product page returned HTTP ${response.status}`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error("Product URL did not return HTML");
    }
    return extractProductMetadata(await limitedResponseText(response), current.toString());
  }
  throw new Error("Too many product page redirects");
}

function keepOnlyCaptionEvidence(analysis: StyleImageAnalysis, caption: string): StyleImageAnalysis {
  const normalizedCaption = caption.toLocaleLowerCase("ko-KR").replaceAll(/\s+/g, "");
  return {
    ...analysis,
    items: analysis.items.map((item) => {
      if (item.brand_source !== "캡션") return item;
      const hasEvidence = (value: string | null): boolean => value === null || normalizedCaption.includes(
        value.toLocaleLowerCase("ko-KR").replaceAll(/\s+/g, ""),
      );
      const brand = hasEvidence(item.brand) ? item.brand : null;
      const productName = hasEvidence(item.product_name) ? item.product_name : null;
      return brand === null && productName === null
        ? { ...item, brand, product_name: productName, brand_source: "없음" }
        : { ...item, brand, product_name: productName };
    }),
  };
}

async function requestOpenAiAnalysis(
  image: Blob,
  mimeType: string,
  caption: string,
): Promise<{ analysis: StyleImageAnalysis; model: string }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const model = Deno.env.get("OPENAI_MODEL") ?? DEFAULT_OPENAI_MODEL;
  const imageBytes = new Uint8Array(await image.arrayBuffer());
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_output_tokens: 2_000,
      input: [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "input_image", image_url: `data:${mimeType};base64,${bytesToBase64(imageBytes)}` },
            { type: "input_text", text: caption ? `<caption>${escapeCaption(caption)}</caption>` : "캡션 없음" },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "style_image_analysis",
          schema: ANALYSIS_JSON_SCHEMA,
          strict: true,
        },
      },
    }),
    signal: AbortSignal.timeout(75_000),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = typeof payload === "object" && payload !== null && "error" in payload
      ? JSON.stringify((payload as { error: unknown }).error)
      : `OpenAI HTTP ${response.status}`;
    throw new Error(message);
  }

  const output = typeof payload === "object" && payload !== null && "output" in payload && Array.isArray(payload.output)
    ? payload.output
    : [];
  const content = output.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null || !("content" in entry) || !Array.isArray(entry.content)) return [];
    return entry.content as unknown[];
  });
  const refusal = content.find((entry) => typeof entry === "object" && entry !== null && "type" in entry && entry.type === "refusal");
  if (refusal !== undefined) throw new Error("OpenAI refused to analyze this image");
  const text = content.find((entry) => typeof entry === "object" && entry !== null && "type" in entry && entry.type === "output_text");
  if (typeof text !== "object" || text === null || !("text" in text) || typeof text.text !== "string") {
    throw new Error("OpenAI response did not contain a completed structured output");
  }

  const parsed = styleImageAnalysisSchema.safeParse(JSON.parse(text.text));
  if (!parsed.success) throw new Error(`OpenAI output validation failed: ${parsed.error.message}`);
  return { analysis: keepOnlyCaptionEvidence(normalizeAnalysis(parsed.data), caption), model };
}

async function handleAnalyze(request: Request, db: SupabaseClient): Promise<Response> {
  if (request.method !== "POST") return apiError(405, "method_not_allowed", "지원하지 않는 요청 방식이에요");
  if (!adminTokenIsValid(request)) return apiError(401, "admin_token_required", "분석 관리자 토큰을 확인해 주세요");
  const body = await bodyAsObject(request);
  if (body === null) return apiError(400, "invalid_request", "요청 본문을 확인해 주세요");
  const input = analyzeInputSchema.safeParse(body);
  if (!input.success) {
    const field = input.error.issues[0]?.path[0];
    return apiError(400, "invalid_request", input.error.issues[0]?.message ?? "요청 값을 확인해 주세요", typeof field === "string" ? field : undefined);
  }
  const fileStem = input.data.image_path.split("/").at(-1)?.replace(/\.(jpe?g|png|webp)$/i, "");
  if (fileStem !== input.data.image_id) {
    return apiError(400, "image_id_path_mismatch", "image_id와 사진 파일명이 같아야 해요", "image_path");
  }

  const { data: existing, error: existingError } = await db.from("style_images")
    .select("id,image_path,source,source_url,permission,style,tagging,published")
    .eq("id", input.data.image_id).maybeSingle();
  if (existingError !== null) throw existingError;
  if (existing !== null) {
    const { data: items, error: itemsError } = await db.from("style_image_items")
      .select("item_id,slot,kind,color,visual_fit,visibility,brand,product_name,brand_source")
      .eq("style_image_id", input.data.image_id).order("item_id");
    if (itemsError !== null) throw itemsError;
    return json({ style_image: existing, items, already_analyzed: true });
  }

  const { data: claimed, error: claimError } = await db.rpc("claim_style_image_analysis", {
    p_image_id: input.data.image_id,
  });
  if (claimError !== null) throw claimError;
  if (claimed !== true) {
    return apiError(409, "analysis_in_progress", "같은 사진을 이미 분석하고 있어요");
  }

  try {
    const { data: image, error: imageError } = await db.storage.from("feed-images").download(input.data.image_path);
    if (imageError !== null || image === null) {
      return apiError(404, "storage_image_not_found", "Storage에서 사진을 찾을 수 없어요", "image_path");
    }
    if (image.size === 0 || image.size > MAX_ANALYSIS_IMAGE_BYTES) {
      return apiError(400, "invalid_image_size", "사진은 0바이트보다 크고 10MB 이하여야 해요", "image_path");
    }
    const mimeType = imageMimeType(image, input.data.image_path);
    if (mimeType === null) return apiError(400, "invalid_image_type", "JPG, PNG 또는 WebP 사진만 분석할 수 있어요", "image_path");

    let result: Awaited<ReturnType<typeof requestOpenAiAnalysis>>;
    try {
      result = await requestOpenAiAnalysis(image, mimeType, input.data.caption ?? "");
    } catch (error) {
      console.error("OpenAI analysis failed", error);
      return apiError(502, "analysis_failed", "AI 사진 분석에 실패했어요. 잠시 후 다시 시도해 주세요");
    }
    if (result.analysis.items.length === 0) {
      return apiError(422, "no_clothing_items", "사진에서 옷을 찾지 못했어요");
    }
    const style = input.data.approved_style ?? result.analysis.style;
    if (style.length === 0) return apiError(422, "style_not_found", "사진의 스타일을 정하지 못했어요");

    const uploadedAt = new Date().toISOString();
    const items = result.analysis.items.map((item, index) => ({
      item_id: `${input.data.image_id}-ITEM-${String(index + 1).padStart(2, "0")}`,
      ...item,
    }));
    const imageRow = {
      id: input.data.image_id,
      image_path: input.data.image_path,
      source: input.data.source,
      source_url: input.data.source_url ?? null,
      permission: input.data.permission,
      uploaded_at: uploadedAt,
      style,
      tagging: result.analysis,
    };
    const { error: saveError } = await db.rpc("save_style_image_analysis", { p_image: imageRow, p_items: items });
    if (saveError !== null) {
      console.error("Analysis persistence failed", saveError);
      return apiError(422, "analysis_persistence_failed", saveError.message);
    }
    return json({
      style_image: { ...imageRow, published: false },
      items,
      model: result.model,
      style_review_required: input.data.approved_style === undefined,
      already_analyzed: false,
    }, 201);
  } finally {
    const { error: releaseError } = await db.rpc("release_style_image_analysis", {
      p_image_id: input.data.image_id,
    });
    if (releaseError !== null) console.error("Analysis claim release failed", releaseError);
  }
}

async function handleProductLink(
  request: Request,
  styleImageId: string,
  itemId: string,
  db: SupabaseClient,
): Promise<Response> {
  if (request.method !== "PUT") return apiError(405, "method_not_allowed", "지원하지 않는 요청 방식이에요");
  if (!adminTokenIsValid(request)) return apiError(401, "admin_token_required", "분석 관리자 토큰을 확인해 주세요");
  const body = await bodyAsObject(request);
  if (body === null) return apiError(400, "invalid_request", "요청 본문을 확인해 주세요");
  const input = productLinkInputSchema.safeParse(body);
  if (!input.success) {
    const field = input.error.issues[0]?.path[0];
    return apiError(400, "invalid_request", input.error.issues[0]?.message ?? "요청 값을 확인해 주세요", typeof field === "string" ? field : undefined);
  }

  const [{ data: styleImage, error: imageError }, { data: item, error: itemError }] = await Promise.all([
    db.from("style_images").select("id,source,source_url").eq("id", styleImageId).maybeSingle(),
    db.from("style_image_items").select("item_id").eq("style_image_id", styleImageId).eq("item_id", itemId).maybeSingle(),
  ]);
  if (imageError !== null) throw imageError;
  if (itemError !== null) throw itemError;
  if (styleImage === null) return apiError(404, "style_image_not_found", "해당 피드 사진을 찾을 수 없어요");
  if (item === null) return apiError(404, "style_image_item_not_found", "해당 사진에서 아이템을 찾을 수 없어요");

  const productUrl = input.data.product_url ?? (styleImage.source === "쇼핑몰" ? styleImage.source_url : null);
  if (typeof productUrl !== "string") {
    return apiError(400, "product_url_required", "쇼핑몰 상품 주소가 필요해요", "product_url");
  }
  const parsedUrl = new URL(productUrl);
  if (!productUrlIsPublic(parsedUrl)) return apiError(400, "invalid_product_url", "공개된 상품 페이지 주소만 사용할 수 있어요", "product_url");

  let metadata: ProductMetadata = {
    shop: parsedUrl.hostname.replace(/^www\./, ""),
    brand: null,
    product_name: null,
  };
  let metadataStatus: "extracted" | "unavailable" = "extracted";
  try {
    metadata = await fetchProductMetadata(parsedUrl.toString());
  } catch (error) {
    metadataStatus = "unavailable";
    console.warn("Product metadata extraction failed", { styleImageId, itemId, error });
  }

  const { error: saveError } = await db.rpc("set_style_image_item_product", {
    p_style_image_id: styleImageId,
    p_item_id: itemId,
    p_product_url: parsedUrl.toString(),
    p_shop: metadata.shop,
    p_brand: metadata.brand,
    p_product_name: metadata.product_name,
    p_is_representative_product: input.data.is_representative_product,
  });
  if (saveError !== null) throw saveError;
  const { data: updated, error: updatedError } = await db.from("style_image_items")
    .select("item_id,style_image_id,shop,brand,product_name,product_url,brand_source,is_representative_product")
    .eq("item_id", itemId).single();
  if (updatedError !== null) throw updatedError;
  return json({ item: updated, metadata_status: metadataStatus });
}

async function reviewSnapshot(styleImageId: string, db: SupabaseClient): Promise<{
  style_image: Record<string, unknown>;
  items: Record<string, unknown>[];
} | null> {
  const [{ data: styleImage, error: imageError }, { data: items, error: itemsError }] = await Promise.all([
    db.from("style_images")
      .select("id,image_path,source,source_url,permission,style,tagging,reviewed_at,published")
      .eq("id", styleImageId).maybeSingle(),
    db.from("style_image_items")
      .select("item_id,slot,kind,color,visual_fit,visibility,shop,brand,product_name,product_url,is_representative_product")
      .eq("style_image_id", styleImageId).order("item_id"),
  ]);
  if (imageError !== null) throw imageError;
  if (itemsError !== null) throw itemsError;
  return styleImage === null ? null : { style_image: styleImage, items: items ?? [] };
}

async function handleStyleImageReview(
  request: Request,
  styleImageId: string,
  db: SupabaseClient,
): Promise<Response> {
  if (!["GET", "PUT"].includes(request.method)) return apiError(405, "method_not_allowed", "지원하지 않는 요청 방식이에요");
  if (!adminTokenIsValid(request)) return apiError(401, "admin_token_required", "분석 관리자 토큰을 확인해 주세요");

  const before = await reviewSnapshot(styleImageId, db);
  if (before === null) return apiError(404, "style_image_not_found", "해당 피드 사진을 찾을 수 없어요");
  if (request.method === "GET") return json(before);

  const body = await bodyAsObject(request);
  if (body === null) return apiError(400, "invalid_request", "요청 본문을 확인해 주세요");
  const input = styleImageReviewInputSchema.safeParse(body);
  if (!input.success) {
    const field = input.error.issues[0]?.path[0];
    return apiError(400, "invalid_review", input.error.issues[0]?.message ?? "검수 값을 확인해 주세요", typeof field === "string" ? field : undefined);
  }

  const knownItemIds = new Set(before.items.map((item) => item.item_id));
  const unknownItem = input.data.items?.find((item) => !knownItemIds.has(item.item_id));
  if (unknownItem !== undefined) {
    return apiError(400, "review_item_not_found", "해당 사진에 없는 아이템이에요", "items");
  }

  const { error } = await db.rpc("review_style_image", {
    p_style_image_id: styleImageId,
    p_style: input.data.style ?? null,
    p_items: input.data.items ?? null,
  });
  if (error !== null) throw error;
  const reviewed = await reviewSnapshot(styleImageId, db);
  if (reviewed === null) throw new Error("Reviewed style image disappeared");
  return json(reviewed);
}

async function handleStyleImagePublish(
  request: Request,
  styleImageId: string,
  db: SupabaseClient,
): Promise<Response> {
  if (request.method !== "PUT") return apiError(405, "method_not_allowed", "지원하지 않는 요청 방식이에요");
  if (!adminTokenIsValid(request)) return apiError(401, "admin_token_required", "분석 관리자 토큰을 확인해 주세요");
  const body = await bodyAsObject(request);
  if (body === null) return apiError(400, "invalid_request", "요청 본문을 확인해 주세요");
  const input = styleImagePublishInputSchema.safeParse(body);
  if (!input.success) return apiError(400, "invalid_publish", input.error.issues[0]?.message ?? "공개 값을 확인해 주세요", "published");

  const { data: styleImage, error: findError } = await db.from("style_images")
    .select("id,reviewed_at,published").eq("id", styleImageId).maybeSingle();
  if (findError !== null) throw findError;
  if (styleImage === null) return apiError(404, "style_image_not_found", "해당 피드 사진을 찾을 수 없어요");
  if (input.data.published && styleImage.reviewed_at === null) {
    return apiError(409, "review_required", "사진을 먼저 검수해야 공개할 수 있어요");
  }

  const { error: publishError } = await db.rpc("set_style_image_published", {
    p_style_image_id: styleImageId,
    p_published: input.data.published,
  });
  if (publishError !== null) throw publishError;
  return json({
    style_image: {
      id: styleImageId,
      reviewed_at: styleImage.reviewed_at,
      published: input.data.published,
    },
  });
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
    db.from("style_image_items")
      .select("item_id,slot,kind,color,visual_fit,visibility,brand,product_name,brand_source,shop,product_url,is_representative_product")
      .eq("style_image_id", styleImageId).order("item_id"),
    db.from("wardrobe_items").select("id,slot,kind,color,visual_fit").eq("user_id", userId),
  ]);
  if (itemError !== null) throw itemError;
  if (wardrobeError !== null) throw wardrobeError;

  const { data: heart, error: heartError } = await db.from("hearts")
    .upsert({ user_id: userId, style_image_id: styleImageId }, { onConflict: "user_id,style_image_id" })
    .select("saved_at").single();
  if (heartError !== null) throw heartError;
  const itemDetails = (itemRows ?? []) as HeartItemRow[];
  const representativeProduct = representativeProductFields(itemDetails);

  if ((wardrobeRows ?? []).length === 0) {
    return json({
      style_image_id: styleImageId,
      saved_at: heart.saved_at,
      items: itemDetails.map((item) => heartItemResponse(item, { gap_status: null, wardrobe_item_ids: [] })),
      outfits: [],
      products: [],
      message: "옷장을 등록하면 가진 옷과 맞춰 드려요",
      ...representativeProduct,
    });
  }

  const wardrobe = (wardrobeRows ?? []) as WardrobeItemForGapAnalysis[];
  const items = itemDetails.map((row) => {
    const result = classifyGap(row as ItemForGapAnalysis, wardrobe);
    return heartItemResponse(row, result);
  });
  return json({ style_image_id: styleImageId, saved_at: heart.saved_at, items, outfits: [], products: [], ...representativeProduct });
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
      if (path === "/analyze") return await handleAnalyze(request, db);
      if (path === "/wardrobe") return await handleWardrobe(request, url, db);
      if (path === "/feed" && request.method === "GET") return await handleFeed(url, db);
      const productMatch = path.match(/^\/style-images\/([^/]+)\/items\/([^/]+)\/product$/);
      if (productMatch?.[1] !== undefined && productMatch[2] !== undefined) {
        return await handleProductLink(request, decodeURIComponent(productMatch[1]), decodeURIComponent(productMatch[2]), db);
      }
      const reviewMatch = path.match(/^\/style-images\/([^/]+)\/review$/);
      if (reviewMatch?.[1] !== undefined) {
        return await handleStyleImageReview(request, decodeURIComponent(reviewMatch[1]), db);
      }
      const publishMatch = path.match(/^\/style-images\/([^/]+)\/publish$/);
      if (publishMatch?.[1] !== undefined) {
        return await handleStyleImagePublish(request, decodeURIComponent(publishMatch[1]), db);
      }
      const heartMatch = path.match(/^\/style-images\/([^/]+)\/heart$/);
      if (heartMatch?.[1] !== undefined) return await handleHeart(request, decodeURIComponent(heartMatch[1]), db);
      return apiError(404, "route_not_found", "요청한 API를 찾을 수 없어요");
    } catch (error) {
      console.error(error);
      return apiError(500, "internal_error", "서버에서 요청을 처리하지 못했어요");
    }
  },
};
