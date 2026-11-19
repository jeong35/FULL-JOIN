import Constants from 'expo-constants';
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { API_URL } from './api';
import { getSession } from './session';

export const ANALYTICS_EVENT_NAMES = [
  'app_open', 'screen_view', 'screen_leave', 'app_background', 'tab_click', 'back_click', 'error_shown',
  'intro_view', 'intro_next', 'intro_prev', 'intro_skip', 'intro_done',
  'login_nickname_start', 'login_pin_start', 'login_submit', 'login_validation_failed', 'login_failed', 'login_success',
  'taste_select', 'taste_deselect', 'taste_limit_reached', 'taste_done', 'taste_later', 'taste_save_failed', 'ready_choice',
  'wardrobe_add_start', 'wardrobe_slot_select', 'wardrobe_kind_select', 'wardrobe_color_select', 'wardrobe_fit_select',
  'wardrobe_add_submit', 'wardrobe_add_done', 'wardrobe_add_failed', 'wardrobe_milestone', 'wardrobe_edit_start',
  'wardrobe_delete_select', 'wardrobe_delete_done', 'wardrobe_delete_failed',
  'feed_load_done', 'feed_load_failed', 'feed_scroll', 'feed_card_impression', 'photo_open', 'photo_save',
  'photo_save_done', 'photo_save_failed', 'archive_image_open', 'archive_filter_apply', 'archive_filter_clear',
  'archive_zero_result', 'style_detail_item_view', 'compare_open', 'comparison_done', 'comparison_failed',
  'comparison_reopened', 'comparison_empty_wardrobe', 'result_view', 'result_scroll', 'gap_item_impression',
  'item_choice', 'outfit_section_view', 'outfit_view', 'shop_link_click', 'wardrobe_return_click',
  'hint_view', 'hint_click', 'hint_close', 'chat_no_saved', 'chat_go_feed_click', 'chat_picker_open',
  'chat_image_select', 'chat_input_start', 'chat_send', 'chat_response_done', 'chat_response_failed',
  'taste_edit_start', 'tutorial_replay_start', 'logout_click',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export type AnalyticsScreenName =
  | 'unknown'
  | 'onboarding_intro'
  | 'onboarding_login'
  | 'onboarding_taste'
  | 'onboarding_ready'
  | 'home'
  | 'closet'
  | 'recommend'
  | 'chat'
  | 'my'
  | 'add_item_kind'
  | 'add_item_color_fit'
  | 'style_detail'
  | 'comparison_result';

type PropertyValue = string | number | boolean | null;
type AnalyticsProperties = Readonly<Record<string, PropertyValue>>;

const APP_VERSION = Constants.expoConfig?.version ?? 'development';
const PLATFORM = Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'
  ? Platform.OS
  : 'unknown';

function uuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

let sessionId = uuid();

export async function track(
  eventName: AnalyticsEventName,
  options: {
    screenName?: AnalyticsScreenName;
    durationMs?: number;
    properties?: AnalyticsProperties;
  } = {},
): Promise<void> {
  const userId = getSession()?.userId ?? `anonymous:${sessionId}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    await fetch(`${API_URL}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event_id: uuid(),
        user_id: userId,
        session_id: sessionId,
        event_name: eventName,
        screen_name: options.screenName ?? 'unknown',
        occurred_at: new Date().toISOString(),
        duration_ms: options.durationMs === undefined ? null : Math.max(0, Math.round(options.durationMs)),
        platform: PLATFORM,
        app_version: APP_VERSION,
        properties: options.properties ?? {},
      }),
      signal: controller.signal,
    });
  } catch {
    // 분석 전송 실패가 사용자의 핵심 흐름을 막으면 안 된다.
  } finally {
    clearTimeout(timer);
  }
}

function screenForPath(pathname: string): AnalyticsScreenName {
  if (pathname === '/') return 'home';
  if (pathname === '/closet') return 'closet';
  if (pathname === '/recommend') return 'recommend';
  if (pathname === '/chat') return 'chat';
  if (pathname === '/my') return 'my';
  if (pathname === '/onboarding') return 'onboarding_intro';
  if (pathname === '/onboarding/login') return 'onboarding_login';
  if (pathname === '/onboarding/taste') return 'onboarding_taste';
  if (pathname === '/onboarding/ready') return 'onboarding_ready';
  if (pathname === '/add-item/kind') return 'add_item_kind';
  if (pathname === '/add-item/color-fit') return 'add_item_color_fit';
  if (pathname.startsWith('/style/')) return 'style_detail';
  if (pathname.startsWith('/result/')) return 'comparison_result';
  return 'unknown';
}

export function AnalyticsTracker() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const currentScreen = useRef<AnalyticsScreenName | null>(null);
  const enteredAt = useRef<number | null>(null);
  const appState = useRef(AppState.currentState);

  const leaveCurrent = () => {
    if (currentScreen.current === null || enteredAt.current === null) return;
    void track('screen_leave', {
      screenName: currentScreen.current,
      durationMs: Date.now() - enteredAt.current,
    });
    enteredAt.current = null;
  };

  const view = (screen: AnalyticsScreenName) => {
    currentScreen.current = screen;
    enteredAt.current = Date.now();
    void track('screen_view', { screenName: screen });
  };

  useEffect(() => {
    pathnameRef.current = pathname;
    const next = screenForPath(pathname);
    if (currentScreen.current === next && enteredAt.current !== null) return;
    leaveCurrent();
    view(next);
  }, [pathname]);

  useEffect(() => {
    void track('app_open', { screenName: screenForPath(pathnameRef.current), properties: { source: 'launch' } });
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasActive = appState.current === 'active';
      const isActive = nextState === 'active';
      if (wasActive && !isActive) {
        void track('app_background', { screenName: screenForPath(pathnameRef.current) });
        leaveCurrent();
      }
      if (!wasActive && isActive) {
        sessionId = uuid();
        const screen = screenForPath(pathnameRef.current);
        void track('app_open', { screenName: screen, properties: { source: 'resume' } });
        view(screen);
      }
      appState.current = nextState;
    });
    return () => {
      subscription.remove();
      leaveCurrent();
    };
  }, []);

  return null;
}

