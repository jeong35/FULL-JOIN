import { cancelWithAdapter, scheduleWithAdapter, webNotificationSupport, type ScheduledNotification, type ScheduleResult } from './notificationCore';
import { saveNotificationSettings } from './notificationSettings';

const BASE = 'https://gctbcanltqgcymdlplyr.supabase.co/functions/v1/notifications';
const ACCOUNT_KEY = 'odit-notification-account-v1';

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function jsonRequest(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE}${path}`, init);
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === 'object' ? 'notification_request_failed' : `notification_http_${response.status}`);
  return body;
}

export async function scheduleRecommendationNotification(userId: string, lookId: string, now = new Date()): Promise<ScheduleResult> {
  const support = webNotificationSupport();
  const result = await scheduleWithAdapter({
    support,
    requestPermission: async () => Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission(),
    subscribe: async () => {
      const config = await jsonRequest('/config');
      if (typeof config.vapid_public_key !== 'string') throw new Error('missing_vapid_key');
      await navigator.serviceWorker.register('/notification-sw.js');
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(config.vapid_public_key) });
      const subscribed = await jsonRequest('/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user_id: userId, subscription: subscription.toJSON(), user_agent: navigator.userAgent }) });
      if (typeof subscribed.subscription_id !== 'string' || typeof subscribed.access_token !== 'string') throw new Error('invalid_subscription_response');
      return { subscriptionId: subscribed.subscription_id, accessToken: subscribed.access_token };
    },
    schedule: async (identity, scheduledFor) => {
      const scheduled = await jsonRequest('/schedule', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user_id: userId, subscription_id: identity.subscriptionId, access_token: identity.accessToken, look_id: lookId, scheduled_for: scheduledFor, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
      const schedule = scheduled.schedule as Record<string, unknown> | undefined;
      if (!schedule || typeof schedule.id !== 'string' || typeof schedule.scheduled_for !== 'string') throw new Error('invalid_schedule_response');
      return { scheduleId: schedule.id, scheduledFor: schedule.scheduled_for };
    },
  }, now);
  if (result.ok) {
    globalThis.localStorage?.setItem(ACCOUNT_KEY, userId);
    saveNotificationSettings(userId, { enabled: true, hour: now.getHours(), minute: now.getMinutes(), reservation: result.value });
  }
  return result;
}

export async function protectNotificationAccount(userId: string | null): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  let owner: string | null = null;
  try { owner = globalThis.localStorage?.getItem(ACCOUNT_KEY) ?? null; } catch { return; }
  if (owner === null || owner === userId) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/notification-sw.js');
    await (await registration?.pushManager.getSubscription())?.unsubscribe();
  } catch { /* 다음 구독 시 서버가 이전 계정 예약도 취소한다. */ }
  try { globalThis.localStorage?.removeItem(ACCOUNT_KEY); } catch { /* noop */ }
}

export async function cancelRecommendationNotification(userId: string, value: ScheduledNotification): Promise<boolean> {
  return cancelWithAdapter(async () => {
    await jsonRequest('/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user_id: userId, schedule_id: value.scheduleId, access_token: value.accessToken }) });
  });
}
