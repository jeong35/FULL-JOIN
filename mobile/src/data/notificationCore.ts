export const DAY_MS = 24 * 60 * 60 * 1_000;

export type NotificationSupport =
  | { supported: true }
  | { supported: false; reason: 'server' | 'not_secure' | 'browser_unsupported' | 'ios_home_screen_required' };

export type NotificationSubscriptionIdentity = { subscriptionId: string; accessToken: string };
export type ScheduledNotification = NotificationSubscriptionIdentity & { scheduleId: string; scheduledFor: string };
export type NotificationFailureStage = 'permission' | 'subscribe' | 'schedule';
export type ScheduleResult =
  | { ok: true; value: ScheduledNotification }
  | { ok: false; reason: 'unsupported'; support: NotificationSupport }
  | { ok: false; reason: 'permission_denied' }
  | { ok: false; reason: 'request_failed'; stage: NotificationFailureStage; error: string };
export type NotificationScheduleAdapter = {
  support: NotificationSupport;
  requestPermission: () => Promise<'granted' | 'denied' | 'default'>;
  subscribe: () => Promise<NotificationSubscriptionIdentity>;
  schedule: (identity: NotificationSubscriptionIdentity, scheduledFor: string) => Promise<{ scheduleId: string; scheduledFor: string }>;
};

export function nextDaySameLocalTime(now: Date): Date {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  return next;
}

export function webNotificationSupport(scope: typeof globalThis = globalThis): NotificationSupport {
  if (typeof window === 'undefined') return { supported: false, reason: 'server' };
  if (!scope.isSecureContext) return { supported: false, reason: 'not_secure' };
  const navigatorValue = scope.navigator as Navigator & { standalone?: boolean };
  const ua = navigatorValue.userAgent ?? '';
  const ios = /iPad|iPhone|iPod/.test(ua);
  const homeScreen = navigatorValue.standalone === true || scope.matchMedia?.('(display-mode: standalone)').matches === true;
  if (ios && !homeScreen) return { supported: false, reason: 'ios_home_screen_required' };
  if (!('serviceWorker' in navigatorValue) || !('PushManager' in scope) || !('Notification' in scope)) {
    return { supported: false, reason: 'browser_unsupported' };
  }
  return { supported: true };
}

export function notificationSupportMessage(support: NotificationSupport): string {
  if (support.supported) return '';
  if (support.reason === 'ios_home_screen_required') return 'iPhone에서는 Safari의 홈 화면에 추가한 뒤 알림을 받을 수 있어요.';
  if (support.reason === 'not_secure') return '보안 연결(HTTPS)에서만 알림을 받을 수 있어요.';
  return '이 브라우저에서는 알림 예약을 지원하지 않아요.';
}

export function formatScheduledTime(value: Date): string {
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(value);
}

function failureError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized.slice(0, 80) || 'unknown_error';
}

export async function scheduleWithAdapter(adapter: NotificationScheduleAdapter, now = new Date()): Promise<ScheduleResult> {
  if (!adapter.support.supported) return { ok: false, reason: 'unsupported', support: adapter.support };
  let permission: 'granted' | 'denied' | 'default';
  try {
    permission = await adapter.requestPermission();
  } catch (error) {
    return { ok: false, reason: 'request_failed', stage: 'permission', error: failureError(error) };
  }
  if (permission !== 'granted') return { ok: false, reason: 'permission_denied' };
  let identity: NotificationSubscriptionIdentity;
  try {
    identity = await adapter.subscribe();
  } catch (error) {
    return { ok: false, reason: 'request_failed', stage: 'subscribe', error: failureError(error) };
  }
  try {
    const schedule = await adapter.schedule(identity, nextDaySameLocalTime(now).toISOString());
    return { ok: true, value: { ...identity, ...schedule } };
  } catch (error) {
    return { ok: false, reason: 'request_failed', stage: 'schedule', error: failureError(error) };
  }
}

export async function cancelWithAdapter(cancel: () => Promise<void>): Promise<boolean> {
  try {
    await cancel();
    return true;
  } catch {
    return false;
  }
}
