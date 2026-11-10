// 사용 기록(이벤트). 사람들이 어느 화면에서 멈추는지(이탈 지점)와 최종 목표(활성화·도달·재방문)를 재려고
// 서버 /events로 보낸다(docs/EVENTS.md). 닉네임·숫자는 보내지 않는다 — 사용자 ID(닉네임·숫자의 해시)와
// 이 브라우저가 만든 무작위 기기 ID만 보낸다. 보내기에 실패해도 앱 사용은 막지 않고 조용히 버린다.
import { Platform } from 'react-native';

import { API_URL } from './api';
import { getSession } from './session';

// 서버 src/fulljoin/events.ts의 EVENT_NAMES와 같아야 한다(scripts/check-events.mjs가 확인).
export const EVENT_NAMES = [
  'app_open',
  'intro_view',
  'intro_next',
  'intro_skip',
  'intro_done',
  'login_view',
  'login_success',
  'taste_view',
  'taste_done',
  'taste_later',
  'ready_view',
  'ready_choice',
  'feed_view',
  'photo_open',
  'photo_save',
  'compare_open',
  'result_view',
  'item_choice',
  'shop_link_click',
  'chat_send',
  'wardrobe_add_start',
  'wardrobe_add_done',
  'hint_view',
  'hint_click',
  'hint_close',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];
export type EventProps = Record<string, string | number | boolean | null>;

type QueuedEvent = { name: EventName; ts: string; user_id: string | null; props: EventProps };

const DEVICE_KEY = 'odit-device-v1';
const MAX_BATCH = 20;
const FLUSH_MS = 2000;

function randomId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch {
    // 아래 방식으로 만든다.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function readDeviceId(): string {
  try {
    const stored = globalThis.localStorage?.getItem(DEVICE_KEY);
    if (stored && /^[A-Za-z0-9_-]{8,64}$/.test(stored)) return stored;
    const created = randomId();
    globalThis.localStorage?.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    return randomId();
  }
}

const deviceId = typeof window === 'undefined' ? 'server-render' : readDeviceId();
const sessionId = randomId();
const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

// 서버 규칙에 맞게 속성을 다듬는다: 이름은 영소문자·밑줄, 값은 짧은 글자·숫자·참거짓만, 최대 12개.
function clean(props: EventProps): EventProps {
  const out: EventProps = {};
  for (const [key, value] of Object.entries(props).slice(0, 12)) {
    if (!/^[a-z_]{1,32}$/.test(key)) continue;
    if (typeof value === 'string') out[key] = value.slice(0, 80);
    else if (typeof value === 'number') {
      if (Number.isFinite(value)) out[key] = value;
    } else out[key] = value;
  }
  return out;
}

export function track(name: EventName, props: EventProps = {}): void {
  if (typeof window === 'undefined') return; // 서버에서 미리 그릴 때는 보내지 않는다.
  try {
    queue.push({ name, ts: new Date().toISOString(), user_id: getSession()?.userId ?? null, props: clean(props) });
    if (queue.length >= MAX_BATCH) flushEvents();
    else if (timer === null) timer = setTimeout(flushEvents, FLUSH_MS);
  } catch {
    // 기록은 앱 사용을 막지 않는다.
  }
}

export function flushEvents(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;
  const events = queue.slice(0, MAX_BATCH);
  queue = queue.slice(MAX_BATCH);
  try {
    // text/plain이면 브라우저가 사전 확인(preflight) 없이 보내고, keepalive라 페이지를 닫는 중에도 전송된다.
    void fetch(`${API_URL}/events`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ device_id: deviceId, session_id: sessionId, platform, events }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // 기록은 앱 사용을 막지 않는다.
  }
  if (queue.length > 0) timer = setTimeout(flushEvents, FLUSH_MS);
}

// 탭을 닫거나 다른 앱으로 갈 때 남은 기록을 보낸다.
if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('pagehide', flushEvents);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushEvents();
  });
}
