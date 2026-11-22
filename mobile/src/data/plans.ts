// 약속(데이트·발표 같은 일정). 추천 탭이 그날 무드(스타일)에 맞는 저장한 사진을 먼저 고르는 데 쓴다.
// 서버 DB에 저장할지 팀에서 정하는 중이다(11/20). 정해질 때까지 이 기기에만 저장하고,
// 서버로 옮기면 아래 read()/write()만 api.ts 호출로 바꾸면 된다(화면은 usePlans()·savePlan()·removePlan()만 쓴다).
import { useSyncExternalStore } from 'react';

import { STYLES, type Style } from './catalog';
import { getSession } from './session';

function isStyle(value: unknown): value is Style {
  return typeof value === 'string' && (STYLES as readonly string[]).includes(value);
}

export type Plan = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM, 정하지 않았으면 null
  title: string; // 데이트, 발표 …
  place: string;
  styles: Style[]; // 무드 0~2개
};

export const PLAN_STYLE_MAX = 2;
const STORAGE_KEY = 'odit-plans-v1';
type Store = Record<string, Plan[]>;

let store: Store = read();
const listeners = new Set<() => void>();
const EMPTY: readonly Plan[] = [];

function read(): Store {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function write(next: Store) {
  store = next;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 저장이 막힌 브라우저는 이번 방문 동안만 기억한다.
  }
  for (const listener of listeners) listener();
}

function account(): string {
  return getSession()?.userId ?? 'guest';
}

// 날짜·시간 순서(같으면 id 순서)로 정렬한다.
function sorted(plans: readonly Plan[]): Plan[] {
  return [...plans].sort((a, b) =>
    a.date.localeCompare(b.date) || (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.id.localeCompare(b.id));
}

export function usePlans(): readonly Plan[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => store[account()] ?? EMPTY,
    () => store[account()] ?? EMPTY,
  );
}

export function getPlan(id: string): Plan | undefined {
  return (store[account()] ?? []).find((plan) => plan.id === id);
}

export function savePlan(input: Omit<Plan, 'id'> & { id?: string }): Plan {
  const plan: Plan = {
    id: input.id ?? `plan-${Date.now().toString(36)}`,
    date: input.date,
    time: input.time,
    title: input.title.trim(),
    place: input.place.trim(),
    styles: [...new Set(input.styles)].filter(isStyle).slice(0, PLAN_STYLE_MAX),
  };
  const key = account();
  const rest = (store[key] ?? []).filter((item) => item.id !== plan.id);
  write({ ...store, [key]: sorted([...rest, plan]) });
  return plan;
}

export function removePlan(id: string) {
  const key = account();
  write({ ...store, [key]: (store[key] ?? []).filter((plan) => plan.id !== id) });
}

export function plansOn(plans: readonly Plan[], date: string): Plan[] {
  return plans.filter((plan) => plan.date === date);
}

// 오늘 또는 그 뒤의 가장 가까운 약속.
export function nextPlan(plans: readonly Plan[], today: string): Plan | undefined {
  return plans.find((plan) => plan.date >= today);
}

// '오후 6시', '오전 9시 30분'.
export function timeLabel(time: string | null): string {
  if (time === null) return '시간 미정';
  const [h, m] = time.split(':').map(Number);
  const half = h < 12 ? '오전' : '오후';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${half} ${hour}시${m ? ` ${m}분` : ''}`;
}
