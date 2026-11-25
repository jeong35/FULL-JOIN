import { useSyncExternalStore } from 'react';
import type { ScheduledNotification } from './notificationCore';

export type NotificationSettings = { enabled: boolean; hour: number; minute: number; reservation?: ScheduledNotification };
const defaults: NotificationSettings = { enabled: false, hour: 8, minute: 0 };
const cache = new Map<string, NotificationSettings>();
const listeners = new Set<() => void>();
export function getNotificationSettings(user: string): NotificationSettings {
  if (!cache.has(user)) {
    let value = defaults;
    try {
      const raw = JSON.parse(globalThis.localStorage?.getItem(`odit-reminder:${user}`) ?? 'null');
      if (raw && Number.isInteger(raw.hour) && raw.hour >= 0 && raw.hour < 24 && Number.isInteger(raw.minute) && raw.minute >= 0 && raw.minute < 60) value = raw;
    } catch { /* no saved settings */ }
    cache.set(user, value);
  }
  return cache.get(user)!;
}
export function saveNotificationSettings(user: string, value: NotificationSettings): void {
  globalThis.localStorage?.setItem(`odit-reminder:${user}`, JSON.stringify(value));
  cache.set(user, value);
  listeners.forEach((listener) => listener());
}
export function useNotificationSettings(user: string): NotificationSettings {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => getNotificationSettings(user), () => defaults);
}
