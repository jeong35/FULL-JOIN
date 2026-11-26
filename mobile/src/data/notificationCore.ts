export const DAY_MS = 24 * 60 * 60 * 1_000;

export type NotificationSupport =
  | { supported: true }
  | { supported: false; reason: 'server' | 'not_secure' | 'browser_unsupported' | 'ios_home_screen_required' };

export type NotificationSubscriptionIdentity = { subscriptionId: string; accessToken: string };
export type ScheduledNotification = NotificationSubscriptionIdentity & { scheduleId: string; scheduledFor: string };
export type ScheduleResult =
  | { ok: true; value: ScheduledNotification }
  | {
    ok: false;
    reason: 'unsupported' | 'permission_denied' | 'request_failed';
    support?: NotificationSupport;
    // request_failed일 때 어느 단계에서 어떤 오류였는지(11/26: 아이폰에서 '예약하지 못했어요' 원인을 찾으려고 기록에 남긴다).
    stage?: 'permission' | 'subscribe' | 'schedule';
    error?: string;
  };
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

// 오류 이름·문구만 짧게(구독 주소·키는 오류 문구에 들어가지 않는다).
export function errorLabel(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  const label = error.name && error.name !== 'Error' ? `${error.name}: ${error.message}` : error.message;
  return label.slice(0, 80);
}

export async function scheduleWithAdapter(adapter: NotificationScheduleAdapter, now = new Date()): Promise<ScheduleResult> {
  if (!adapter.support.supported) return { ok: false, reason: 'unsupported', support: adapter.support };
  let stage: 'permission' | 'subscribe' | 'schedule' = 'permission';
  try {
    if (await adapter.requestPermission() !== 'granted') return { ok: false, reason: 'permission_denied' };
    stage = 'subscribe';
    const identity = await adapter.subscribe();
    stage = 'schedule';
    const schedule = await adapter.schedule(identity, nextDaySameLocalTime(now).toISOString());
    return { ok: true, value: { ...identity, ...schedule } };
  } catch (error) {
    return { ok: false, reason: 'request_failed', stage, error: errorLabel(error) };
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
