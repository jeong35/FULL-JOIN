// 사용 기록(이벤트). 사람들이 어느 화면에서 멈추는지(이탈 지점)와 최종 목표(활성화·도달·재방문)를 재려고
// 서버 /events로 보낸다(docs/EVENTS.md). 닉네임·숫자는 보내지 않는다 — 사용자 ID(닉네임·숫자의 해시)와
// 이 브라우저가 만든 무작위 기기 ID만 보낸다. 보내기에 실패해도 앱 사용은 막지 않고 조용히 버린다.
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { API_URL } from './api';
import { getSession } from './session';

// 서버 src/fulljoin/events.ts의 EVENT_NAMES와 같아야 한다(scripts/check-events.mjs가 확인).
export const EVENT_NAMES = [
  'app_open',
  'app_background',
  'screen_view',
  'screen_leave',
  'tab_click',
  'back_click',
  'error_shown',
  'intro_prev',
  'login_nickname_start',
  'login_pin_start',
  'login_submit',
  'login_validation_failed',
  'login_failed',
  'taste_select',
  'taste_deselect',
  'taste_limit_reached',
  'taste_save_failed',
  'wardrobe_slot_select',
  'wardrobe_kind_select',
  'wardrobe_color_select',
  'wardrobe_fit_select',
  'wardrobe_add_submit',
  'wardrobe_add_failed',
  'wardrobe_milestone',
  'wardrobe_edit_start',
  'wardrobe_delete_select',
  'wardrobe_delete_done',
  'wardrobe_delete_failed',
  'feed_load_done',
  'feed_load_failed',
  'feed_scroll',
  'feed_card_impression',
  'photo_save_done',
  'photo_save_failed',
  'style_detail_item_view',
  'comparison_done',
  'comparison_failed',
  'comparison_empty_wardrobe',
  'comparison_reopened',
  'result_scroll',
  'gap_item_impression',
  'outfit_section_view',
  'outfit_view',
  'wardrobe_return_click',
  'archive_image_open',
  'archive_filter_apply',
  'archive_filter_clear',
  'archive_zero_result',
  'chat_picker_open',
  'chat_image_select',
  'chat_input_start',
  'chat_response_done',
  'chat_response_failed',
  'chat_no_saved',
  'chat_go_feed_click',
  'taste_edit_start',
  'tutorial_replay_start',
  'logout_click',
  'intro_view',
  'intro_next',
  'intro_skip',
  'intro_done',
  'login_success',
  'taste_done',
  'taste_later',
  'ready_choice',
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
const appVersion = Constants.expoConfig?.version ?? 'unknown';
const analyticsVersion = process.env.EXPO_PUBLIC_ANALYTICS_VERSION ?? '2026-11-11-v3';
let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

type ScreenVisit = { screen: string; startedAt: number };
type HomeAnalyticsScreen = 'feed' | 'archive';
let currentScreenVisit: ScreenVisit | null = null;
let homeAnalyticsScreen: HomeAnalyticsScreen = 'feed';

// 화면마다 feed_view/login_view 같은 이벤트를 만들지 않고 공통 screen_view/screen_leave로 기록한다.
// 홈의 피드/모든 저장은 같은 URL(/)을 쓰므로 현재 논리 화면을 별도로 기억한다.
export function getHomeAnalyticsScreen(): HomeAnalyticsScreen {
  return homeAnalyticsScreen;
}

export function enterAnalyticsScreen(screen: string, props: EventProps = {}): void {
  const now = Date.now();
  const previous = currentScreenVisit;
  if (previous?.screen === screen) return;

  if (previous !== null) {
    track('screen_leave', {
      screen: previous.screen,
      next_screen: screen,
      duration_ms: Math.max(0, now - previous.startedAt),
    });
  }

  track('screen_view', { screen, previous_screen: previous?.screen ?? null, ...props });
  currentScreenVisit = { screen, startedAt: now };
}

export function setHomeAnalyticsScreen(screen: HomeAnalyticsScreen, props: EventProps = {}): void {
  homeAnalyticsScreen = screen;
  enterAnalyticsScreen(screen, props);
}

export function recordAnalyticsBackground(): boolean {
  const current = currentScreenVisit;
  if (current === null) return false;
  track('app_background', {
    screen: current.screen,
    duration_ms: Math.max(0, Date.now() - current.startedAt),
  });
  return true;
}

export function resumeAnalyticsScreen(): void {
  if (currentScreenVisit !== null) currentScreenVisit.startedAt = Date.now();
}

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
    queue.push({
      name,
      ts: new Date().toISOString(),
      user_id: getSession()?.userId ?? null,
      props: clean({ app_version: appVersion, analytics_version: analyticsVersion, ...props }),
    });
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
