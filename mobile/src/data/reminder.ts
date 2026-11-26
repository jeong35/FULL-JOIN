// 코디 알림 화면 도우미(11/24 팀 결정 17번, 11/25 연결).
// 저장과 서버 예약은 친구분이 만든 모듈을 그대로 쓴다(docs/NOTIFICATION_FRONTEND_HANDOFF.md):
//   notificationSettings.ts(켜짐·시간·예약 정보) · webNotifications.ts(예약·취소) · recommendChoices.ts(날짜별 고른 룩).
// 화면 규칙: '이 룩으로 입을래요' 뒤 '내일 알려 주세요' → 내일 그 시간부터 매일. 끄기·시간 바꾸기는 마이 › 코디 알림.
// 서버 예약이 성공했을 때만 켜졌다고 보여 주고, 권한 거절·미지원·실패는 성공처럼 보이지 않게 그대로 알린다.
import { Platform } from 'react-native';

import { track } from './events';
import { notificationSupportMessage, type ScheduleResult } from './notificationCore';
import type { NotificationSettings } from './notificationSettings';

export const NOTIFY_PLATFORM = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
// 마이에서 켜거나 시간을 바꿀 때처럼 고른 룩이 없을 때 서버에 넘기는 룩 자리값.
export const SETTINGS_LOOK_ID = 'my-reminder-settings';

const pad = (n: number) => String(n).padStart(2, '0');

export function timeOf(settings: Pick<NotificationSettings, 'hour' | 'minute'>): string {
  return `${pad(settings.hour)}:${pad(settings.minute)}`;
}

// '08:10' → '오전 8시 10분'
export function clockLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const half = h < 12 ? '오전' : '오후';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${half} ${hour}시${m > 0 ? ` ${m}분` : ''}`;
}

// 결정 창에서 물어볼 시간: 알림이 켜져 있으면 그 시간,
// 아침(6~11시)에 룩을 골랐으면 그 시간(30분 단위), 아니면 아침 8시. 시간은 마이 › 코디 알림에서 바꾼다.
export function suggestTime(settings: NotificationSettings, now = new Date()): string {
  if (settings.enabled) return timeOf(settings);
  const h = now.getHours();
  if (h >= 6 && h < 11) {
    const minutes = Math.round((h * 60 + now.getMinutes()) / 30) * 30;
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  }
  return '08:00';
}

// 오늘 날짜에 그 시각을 넣은 Date — 예약 함수(scheduleRecommendationNotification)가 하루를 더해 내일 그 시각부터 매일 보낸다.
export function todayAt(time: string, now = new Date()): Date {
  const [h, m] = time.split(':').map(Number);
  const at = new Date(now);
  at.setHours(h, m, 0, 0);
  return at;
}

export function scheduleFailText(result: Extract<ScheduleResult, { ok: false }>): string {
  if (result.reason === 'unsupported') {
    return (result.support !== undefined && notificationSupportMessage(result.support)) || '이 브라우저에서는 알림 예약을 지원하지 않아요.';
  }
  if (result.reason === 'permission_denied') return '알림 권한을 허용해야 받을 수 있어요. 브라우저 설정에서 오딧 알림을 허용해 주세요.';
  return '알림을 예약하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
}

// 예약 결과를 사용 기록으로 남긴다(docs/EVENTS.md '추천 선택과 다음 날 알림'). 구독 키·토큰은 넣지 않는다.
export function trackScheduleResult(result: ScheduleResult) {
  if (result.ok) {
    track('notification_permission', { result: 'granted', platform: NOTIFY_PLATFORM });
    track('notification_schedule_done', { scheduled_for: result.value.scheduledFor, platform: NOTIFY_PLATFORM });
    return;
  }
  if (result.reason === 'permission_denied') track('notification_permission', { result: 'denied', platform: NOTIFY_PLATFORM });
  track('notification_schedule_failed', {
    reason: result.reason,
    platform: NOTIFY_PLATFORM,
    ...(result.reason === 'request_failed' ? { stage: result.stage, error: result.error } : {}),
  });
}
