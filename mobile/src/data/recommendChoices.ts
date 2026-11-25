import { useSyncExternalStore } from 'react';

export type RecommendationChoice = {
  date: string;
  lookId: string;
  chosenAt: string;
  notificationScheduled: boolean;
  scheduleId?: string;
  scheduledFor?: string;
  subscriptionId?: string;
  accessToken?: string;
};

type ChoiceState = Readonly<Record<string, RecommendationChoice>>;
const PREFIX = 'odit-recommend-choices-v1:';
const listeners = new Set<() => void>();
const memory = new Map<string, ChoiceState>();
const EMPTY_CHOICES: ChoiceState = {};

function key(userId: string): string { return `${PREFIX}${userId}`; }

function validChoice(value: unknown): value is RecommendationChoice {
  if (value === null || typeof value !== 'object') return false;
  const item = value as Partial<RecommendationChoice>;
  return typeof item.date === 'string' && typeof item.lookId === 'string' && typeof item.chosenAt === 'string' &&
    Number.isFinite(Date.parse(item.chosenAt)) && typeof item.notificationScheduled === 'boolean';
}

export function readRecommendationChoices(userId: string): ChoiceState {
  const cached = memory.get(userId);
  if (cached !== undefined) return cached;
  let next: ChoiceState = {};
  try {
    const raw = globalThis.localStorage?.getItem(key(userId));
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      next = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, RecommendationChoice] => validChoice(entry[1])));
    }
  } catch { /* 메모리 상태를 사용한다. */ }
  memory.set(userId, next);
  return next;
}

export function saveRecommendationChoice(userId: string, choice: RecommendationChoice): void {
  const next = { ...readRecommendationChoices(userId), [choice.date]: choice };
  memory.set(userId, next);
  try { globalThis.localStorage?.setItem(key(userId), JSON.stringify(next)); } catch { /* 이번 실행 동안 유지한다. */ }
  listeners.forEach((listener) => listener());
}

export function useRecommendationChoices(userId: string): ChoiceState {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => readRecommendationChoices(userId),
    () => EMPTY_CHOICES,
  );
}
