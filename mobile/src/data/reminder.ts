// 코디 알림 설정(11/24 팀 결정 17번, 11/25 고침). 이 기기에 저장한다(계정마다).
// - 코디 탭에서 '이 룩으로 입을래요'를 누르면 "내일도 알림 보내 드릴까요?"를 묻고, '내일 알려 주세요'를 누르면
//   그 시간으로 매일 알림을 켠다(enabled + time). 끄기·시간 바꾸기는 마이 › 코디 알림.
// 실제로 알림을 보내는 일(18번, 서버 푸시 또는 expo-notifications 예약)은 친구분 몫 — 이 값을 읽어서 연결한다:
//   getReminder() → { enabled, time: 'HH:MM' }, onReminderChange(listener)로 바뀔 때마다 다시 예약.
import { useSyncExternalStore } from 'react';

import { getSession, useSession } from './session';

export type Reminder = { enabled: boolean; time: string };
const DEFAULT: Reminder = { enabled: false, time: '08:00' };
const STORAGE_KEY = 'odit-reminder-v1';
type Store = Record<string, Reminder>;

function readStore(): Store {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

let store: Store = readStore();
const listeners = new Set<() => void>();

function accountKey(): string {
  return getSession()?.userId ?? 'guest';
}

export function getReminder(account = accountKey()): Reminder {
  return store[account] ?? DEFAULT;
}

export function setReminder(next: Partial<Reminder>) {
  const account = accountKey();
  store = { ...store, [account]: { ...getReminder(account), ...next } };
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // 저장이 막힌 브라우저는 이번 방문 동안만 기억한다.
  }
  for (const listener of listeners) listener();
}

export function onReminderChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useReminder(): Reminder {
  const account = useSession()?.userId ?? 'guest';
  return useSyncExternalStore(onReminderChange, () => getReminder(account), () => DEFAULT);
}

// '08:10' → '오전 8시 10분'
export function clockLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const half = h < 12 ? '오전' : '오후';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${half} ${hour}시${m > 0 ? ` ${m}분` : ''}`;
}

// '이 룩으로 입을래요' 창에서 물어볼 시간: 알림이 켜져 있으면 그 시간,
// 아침(6~11시)에 룩을 골랐으면 그 시간(30분 단위), 아니면 아침 8시. 시간은 마이 › 코디 알림에서 바꾼다.
export function suggestTime(now = new Date(), current: Reminder = getReminder()): string {
  if (current.enabled) return current.time;
  const h = now.getHours();
  if (h >= 6 && h < 11) {
    const minutes = Math.round((h * 60 + now.getMinutes()) / 30) * 30;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${minutes % 60 === 0 ? '00' : '30'}`;
  }
  return '08:00';
}
