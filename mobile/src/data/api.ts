// 서버(Supabase Edge Function 'api') 호출. 경로와 응답 모양은 docs/API_MVP.md(PR #1)를 따른다.
// 이 주소는 누구나 부를 수 있는 공개 주소라 앱에 넣어도 된다.
// 키(service_role, OpenAI 등)는 절대 앱에 넣지 않는다 — 키는 서버(Supabase Secrets)에만 둔다.
import type { Color, Kind, Slot, VisualFit } from './catalog';
import { getSession } from './session';
import type { ArchiveImage, ChatResult, HeartResult, ItemDecisionResult, Season, StyleImage, WardrobeItem } from './types';

const DEFAULT_API_URL = 'https://gctbcanltqgcymdlplyr.supabase.co/functions/v1/api';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, '');

// 지금 로그인한 사용자(session.ts). 로그인 전에는 서버를 부르지 않는다.
function userId(): string {
  const id = getSession()?.userId;
  if (!id) throw new ApiError(401, 'login_required', '먼저 로그인해 주세요');
  return id;
}

// 첫 호출은 서버가 깨어나느라 몇 초 걸릴 수 있다.
const TIMEOUT_MS = 20_000;

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

async function request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: object): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
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
      error?.message ?? '서버에서 요청을 처리하지 못했어요',
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

// ── 옷장 ────────────────────────────────────────────

type ServerWardrobeItem = WardrobeItem & { user_id: string; created_at?: string };

function toWardrobeItem({ id, slot, kind, color, visual_fit }: ServerWardrobeItem): WardrobeItem {
  return { id, slot, kind, color, visual_fit };
}

export async function fetchWardrobe(): Promise<WardrobeItem[]> {
  const data = await request<{ wardrobe_items: ServerWardrobeItem[] }>(
    'GET',
    `/wardrobe?user_id=${encodeURIComponent(userId())}`,
  );
  return data.wardrobe_items.map(toWardrobeItem);
}

export async function createWardrobeItem(input: {
  slot: Slot;
  kind: Kind;
  color: Color;
  visual_fit: VisualFit | null;
}): Promise<WardrobeItem> {
  const data = await request<{ wardrobe_item: ServerWardrobeItem }>('POST', '/wardrobe', {
    user_id: userId(),
    ...input,
  });
  return toWardrobeItem(data.wardrobe_item);
}

// ── 피드·저장 ───────────────────────────────────────

export async function fetchFeed(): Promise<StyleImage[]> {
  const data = await request<{ style_images: StyleImage[] }>(
    'GET',
    `/feed?user_id=${encodeURIComponent(userId())}`,
  );
  return data.style_images;
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

export function postChat(styleImageId: string, message: string): Promise<ChatResult> {
  return request<ChatResult>('POST', '/chat', {
    user_id: userId(),
    style_image_id: styleImageId,
    message,
  });
}
