// 서버(Supabase Edge Function 'api') 호출. 경로와 응답 모양은 docs/API_MVP.md(PR #1)를 따른다.
// 이 주소는 누구나 부를 수 있는 공개 주소라 앱에 넣어도 된다.
// 키(service_role, OpenAI 등)는 절대 앱에 넣지 않는다 — 키는 서버(Supabase Secrets)에만 둔다.
import { Platform } from 'react-native';

import { getAccessToken } from './auth';
import { colorsForKind, fitsForKind, isKindOfSlot, isSlot, type Color, type Kind, type Slot, type Style, type VisualFit } from './catalog';
import { getSession } from './session';
import type { ArchiveImage, ChatHistoryResult, ChatResult, HeartResult, ItemDecisionResult, Season, StyleImage, StyleImageDetail, WardrobeItem } from './types';

const DEFAULT_API_URL = 'https://gctbcanltqgcymdlplyr.supabase.co/functions/v1/api';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, '');
export const CHAT_HISTORY_ENABLED = process.env.EXPO_PUBLIC_CHAT_HISTORY_ENABLED === 'true';

// 지금 로그인한 사용자(session.ts). 로그인 전에는 서버를 부르지 않는다.
function userId(): string {
  const id = getSession()?.userId;
  if (!id) throw new ApiError(401, 'login_required', '먼저 로그인해 주세요');
  return id;
}

// 첫 호출은 서버가 깨어나느라 몇 초 걸릴 수 있다.
const TIMEOUT_MS = 20_000;

// 서버 쪽 문제일 때: 사용자가 고른 값 때문이 아니라는 걸 알려 준다(동료 피드백 11/16).
const SERVER_ERROR_MESSAGE = '지금 서버에 문제가 있어요. 입력하신 내용은 괜찮아요. 잠시 후 다시 시도해 주세요';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

type ErrorBody = { error?: { code?: string; message?: string; field?: string } };

async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: object, timeoutMs = TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    const accessToken = await getAccessToken();
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (accessToken !== null) headers.authorization = `Bearer ${accessToken}`;
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: Object.keys(headers).length === 0 ? undefined : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'network_error', '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요');
  } finally {
    clearTimeout(timer);
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // 본문이 JSON이 아니면 아래에서 상태 코드로만 판단한다.
  }
  if (!response.ok) {
    const error = (data as ErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'http_error',
      // 서버가 스스로 낸 일반 오류(internal_error)와, 본문 없이 온 500번대는 같은 안내로 바꾼다.
      error?.code === 'internal_error' || (error?.message === undefined && response.status >= 500)
        ? SERVER_ERROR_MESSAGE
        : (error?.message ?? '요청을 처리하지 못했어요. 다시 시도해 주세요'),
      error?.field,
    );
  }
  return data as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '알 수 없는 문제가 생겼어요';
}

// ── 로그인 ──────────────────────────────────────────

// 로그인하기 전에, 이 계정으로 저장한 사진이나 옷장 옷이 이미 있는지(이미 쓰던 사람인지) 본다.
export async function accountHasData(id: string): Promise<boolean> {
  const query = `user_id=${encodeURIComponent(id)}`;
  const [archive, wardrobe] = await Promise.all([
    request<{ style_images: unknown[] }>('GET', `/archive?${query}`),
    request<{ wardrobe_items: unknown[] }>('GET', `/wardrobe?${query}`),
  ]);
  return archive.style_images.length > 0 || wardrobe.wardrobe_items.length > 0;
}

export async function fetchStylePreferences(id: string): Promise<Style[]> {
  const data = await request<{ styles: Style[] }>(
    'GET',
    `/style-preferences?user_id=${encodeURIComponent(id)}`,
  );
  return data.styles;
}

export async function updateStylePreferences(styles: readonly Style[]): Promise<Style[]> {
  const data = await request<{ styles: Style[] }>('PUT', '/style-preferences', {
    user_id: userId(),
    styles,
  });
  return data.styles;
}

// ── 옷장 ────────────────────────────────────────────

// 옷장 확장(소재·무늬·계절·자세한 모양, 새 종류·색·핏)이 서버에 배포됐는지.
// 11/20: 서버(main 3e2799b·7ff6d72)와 DB 마이그레이션(202611160002·202611200001) 배포 뒤 true로 바꿨다.
// false로 두면 새 칸을 서버에 보내지 않고(앱을 새로 열면 사라짐), 새 종류·색·핏은 넣지 않는다.
export const SERVER_HAS_WARDROBE_DETAILS = true;

const OLD_SERVER_NEW_VALUES: ReadonlySet<string> = new Set([
  '잡화', '트레이닝상의', '카고팬츠', '트위드자켓', '퍼자켓', '퍼코트', '무스탕', '숏코트', '하프코트', '롱코트',
  '스타킹', '양말', '모자', '벨트', '연핑크', '모카', '살구', '벌룬', '조거', '버뮤다', '테니스', '캉캉', '플리츠',
]);

export type NewWardrobeItem = Omit<WardrobeItem, 'id'>;

/** 옛 서버가 받지 못하는 옷이면 true(새 종류·색·핏, 숏팬츠 핏). */
export function needsWardrobeUpdate(input: NewWardrobeItem): boolean {
  if (SERVER_HAS_WARDROBE_DETAILS) return false;
  if ([input.slot, input.kind, input.color, input.visual_fit ?? ''].some((v) => OLD_SERVER_NEW_VALUES.has(v))) return true;
  return input.kind === '숏팬츠' && input.visual_fit !== null;
}

export const WARDROBE_UPDATE_MESSAGE = '이 옷은 곧 넣을 수 있어요. 지금 옷장 업데이트를 준비하고 있어요.';

type ServerWardrobeItem = WardrobeItem & { user_id: string; created_at?: string };

function toWardrobeItem({ id, slot, kind, color, visual_fit, material, pattern, seasons, details }: ServerWardrobeItem): WardrobeItem {
  return { id, slot, kind, color, visual_fit, material, pattern, seasons, details };
}

export async function fetchWardrobe(): Promise<WardrobeItem[]> {
  const data = await request<{ wardrobe_items: ServerWardrobeItem[] }>(
    'GET',
    `/wardrobe?user_id=${encodeURIComponent(userId())}`,
  );
  return data.wardrobe_items.map(toWardrobeItem);
}

export async function createWardrobeItem(input: NewWardrobeItem): Promise<WardrobeItem> {
  if (needsWardrobeUpdate(input)) throw new Error(WARDROBE_UPDATE_MESSAGE);
  const { slot, kind, color, visual_fit, material, pattern, seasons, details } = input;
  const body = SERVER_HAS_WARDROBE_DETAILS
    ? { slot, kind, color, visual_fit, material: material ?? [], pattern: pattern ?? null, seasons: seasons ?? [], details: details ?? {} }
    : { slot, kind, color, visual_fit };
  const data = await request<{ wardrobe_item: ServerWardrobeItem }>('POST', '/wardrobe', {
    user_id: userId(),
    ...body,
  });
  const saved = toWardrobeItem(data.wardrobe_item);
  // 서버 배포 전: 고른 모양은 이번에 앱을 켜 둔 동안만 옷장 그림에 보인다.
  return SERVER_HAS_WARDROBE_DETAILS ? saved : { ...saved, material, pattern, seasons, details };
}

export function deleteWardrobeItem(id: string): Promise<{ wardrobe_item_id: string; deleted: true }> {
  return request('DELETE', `/wardrobe/${encodeURIComponent(id)}`, { user_id: userId() });
}

// 옷 사진 배경 지우기(누끼, 11/22). 서버 POST /wardrobe/cutout(파이썬 u2net 서버를 부름)이 배포되면 true로 바꾼다.
// false면 서버를 부르지 않고 네모로 자른 사진을 그대로 쓴다.
export const SERVER_HAS_PHOTO_CUTOUT = false;

export type CutoutResult = { image: string; color: string | null };

// 네모로 자른 사진(data:image/jpeg) 한 장 → 배경 지운 정사각 PNG(data:image/png)와 옷 색.
export async function cutoutPhoto(dataUrl: string): Promise<CutoutResult> {
  const form = new FormData();
  form.append('user_id', userId());
  if (Platform.OS === 'web') {
    form.append('file', await (await fetch(dataUrl)).blob(), 'photo.jpg');
  } else {
    form.append('file', { uri: dataUrl, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40_000);
  let response: Response;
  try {
    const accessToken = await getAccessToken();
    response = await fetch(`${API_URL}/wardrobe/cutout`, {
      method: 'POST',
      headers: accessToken === null ? undefined : { authorization: `Bearer ${accessToken}` },
      body: form,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'network_error', '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요');
  } finally {
    clearTimeout(timer);
  }
  const data = (await response.json().catch(() => null)) as (Partial<CutoutResult> & ErrorBody) | null;
  if (!response.ok || typeof data?.image !== 'string') {
    throw new ApiError(response.status, data?.error?.code ?? 'cutout_failed', data?.error?.message ?? '배경을 지우지 못했어요');
  }
  return { image: data.image, color: typeof data.color === 'string' ? data.color : null };
}

// 옷 사진 AI 태깅(11/22). 서버 POST /wardrobe/tag가 배포되면 true로 바꾼다.
// 사진(배경 지운 옷 한 벌)을 보내면 부위 · 종류 · 색 · 핏을 미리 채워 주고, 사람은 틀린 칸만 고친다.
export const SERVER_HAS_PHOTO_TAGGING = false;

export type PhotoTag = { slot: Slot; kind: Kind; color: Color | null; visual_fit: VisualFit | null };

type ServerPhotoTag = { slot?: unknown; kind?: unknown; color?: unknown; visual_fit?: unknown } | null;

// 서버가 준 값도 앱의 닫힌 목록(부위별 종류, 종류별 색 · 핏)에 맞는지 다시 확인한다. 틀리면 그 칸은 비운다.
export async function tagWardrobePhoto(dataUrl: string): Promise<PhotoTag | null> {
  const data = await request<{ wardrobe_tag: ServerPhotoTag }>('POST', '/wardrobe/tag', { user_id: userId(), image: dataUrl }, 30_000);
  const tag = data.wardrobe_tag;
  if (tag === null || !isSlot(tag.slot) || !isKindOfSlot(tag.slot, tag.kind)) return null;
  const { slot, kind } = tag;
  const color = colorsForKind(kind).find((c) => c === tag.color) ?? null;
  const visual_fit = fitsForKind(slot, kind).find((f) => f === tag.visual_fit) ?? null;
  return { slot, kind, color, visual_fit };
}

// ── 피드·저장 ───────────────────────────────────────

export async function fetchFeed(): Promise<StyleImage[]> {
  const data = await request<{ style_images: StyleImage[] }>(
    'GET',
    `/feed?user_id=${encodeURIComponent(userId())}`,
  );
  return data.style_images;
}

export function fetchStyleImageDetail(styleImageId: string): Promise<StyleImageDetail> {
  return request<StyleImageDetail>('GET', `/style-images/${encodeURIComponent(styleImageId)}`);
}

export async function fetchArchive(filters: { style?: string; season?: Season } = {}): Promise<ArchiveImage[]> {
  const params = new URLSearchParams({ user_id: userId() });
  if (filters.style !== undefined) params.set('style', filters.style);
  if (filters.season !== undefined) params.set('season', filters.season);
  const data = await request<{ style_images: ArchiveImage[] }>('GET', `/archive?${params.toString()}`);
  return data.style_images;
}

export function postHeart(styleImageId: string): Promise<HeartResult> {
  return request<HeartResult>('POST', `/style-images/${encodeURIComponent(styleImageId)}/heart`, {
    user_id: userId(),
  });
}

export function deleteHeart(styleImageId: string): Promise<{ style_image_id: string; hearted: false }> {
  return request('DELETE', `/style-images/${encodeURIComponent(styleImageId)}/heart`, {
    user_id: userId(),
  });
}

export function postItemDecision(
  styleImageId: string,
  itemId: string,
  decision: '활용' | '구매',
): Promise<ItemDecisionResult> {
  return request<ItemDecisionResult>(
    'POST',
    `/style-images/${encodeURIComponent(styleImageId)}/items/${encodeURIComponent(itemId)}/decision`,
    { user_id: userId(), decision },
  );
}

export function postChat(
  styleImageId: string,
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
): Promise<ChatResult> {
  return request<ChatResult>('POST', '/chat', {
    user_id: userId(),
    style_image_id: styleImageId,
    message,
    history,
  }, 30_000);
}

export function fetchChatHistory(styleImageId: string, before?: number): Promise<ChatHistoryResult> {
  const params = new URLSearchParams({ style_image_id: styleImageId, limit: '100' });
  if (before !== undefined) params.set('before', String(before));
  return request<ChatHistoryResult>('GET', `/chat/history?${params.toString()}`);
}

export function deleteChatHistory(styleImageId: string): Promise<{ style_image_id: string; deleted: true }> {
  const params = new URLSearchParams({ style_image_id: styleImageId });
  return request('DELETE', `/chat/history?${params.toString()}`);
}
