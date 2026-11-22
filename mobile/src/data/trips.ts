// 여행 계획(시험판). 어디로·언제·어떤 여행·날마다 일정·짐 크기를 받아 두면 여행 화면이 날마다 코디와 짐을 고른다.
// 약속(plans.ts)처럼 정해질 때까지 이 기기에만 저장한다. 서버로 옮길 때는 read()/write()만 바꾸면 된다.
import { useSyncExternalStore } from 'react';

import { addDays, parseKey } from './dates';
import { getSession } from './session';

export const TRIP_TYPES = ['휴양', '도시 구경', '캠핑·등산', '출장', '촬영 여행', 'MT', '새내기 배움터', '워크숍'] as const;
export type TripType = (typeof TRIP_TYPES)[number];
export const TRIP_TYPE_MAX = 2;
export const TRIP_DAYS_MAX = 7; // 시험판은 6박 7일까지
export const PACKINGS = ['가볍게', '넉넉하게'] as const;
export type Packing = (typeof PACKINGS)[number];

export type Trip = {
  id: string;
  region: string; // weather.ts REGIONS의 이름
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD (같으면 당일치기)
  types: TripType[]; // 0~2개
  schedule: string[]; // 날마다 일정(1일차부터)
  packing: Packing;
  packed: string[]; // 짐 싸기 체크한 옷장 옷 id
  custom: string[] | null; // 사용자가 더하고 뺀 짐(옷장 옷 id). null이면 날씨·여행 종류로 고른 추천 짐
};

const isTripType = (value: unknown): value is TripType => typeof value === 'string' && (TRIP_TYPES as readonly string[]).includes(value);

const STORAGE_KEY = 'odit-trips-v1';
type Store = Record<string, Trip[]>;

let store: Store = read();
const listeners = new Set<() => void>();
const EMPTY: readonly Trip[] = [];

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

export function useTrips(): readonly Trip[] {
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

export function getTrip(id: string): Trip | undefined {
  return (store[account()] ?? []).find((trip) => trip.id === id);
}

export function tripDates(trip: Pick<Trip, 'start' | 'end'>): string[] {
  const dates: string[] = [];
  for (let date = trip.start; date <= trip.end && dates.length < TRIP_DAYS_MAX; date = addDays(date, 1)) dates.push(date);
  return dates;
}

export function saveTrip(input: Omit<Trip, 'id' | 'packed' | 'custom'> & { id?: string }): Trip {
  const previous = input.id === undefined ? undefined : getTrip(input.id);
  const days = tripDates(input).length;
  const trip: Trip = {
    id: input.id ?? `trip-${Date.now().toString(36)}`,
    region: input.region,
    start: input.start,
    end: input.end < input.start ? input.start : input.end,
    types: [...new Set(input.types)].filter(isTripType).slice(0, TRIP_TYPE_MAX),
    schedule: Array.from({ length: days }, (_, i) => (input.schedule[i] ?? '').trim().slice(0, 40)),
    packing: input.packing,
    packed: previous?.packed ?? [],
    custom: previous?.custom ?? null,
  };
  const key = account();
  const rest = (store[key] ?? []).filter((item) => item.id !== trip.id);
  write({ ...store, [key]: [...rest, trip].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id)) });
  return trip;
}

export function removeTrip(id: string) {
  const key = account();
  write({ ...store, [key]: (store[key] ?? []).filter((trip) => trip.id !== id) });
}

// 짐을 사용자가 고친 목록으로 바꾼다. null이면 추천 짐으로 되돌린다.
export function setTripItems(id: string, items: string[] | null) {
  const key = account();
  write({ ...store, [key]: (store[key] ?? []).map((trip) => (trip.id !== id ? trip : { ...trip, custom: items })) });
}

export function togglePacked(id: string, itemId: string) {
  const key = account();
  write({
    ...store,
    [key]: (store[key] ?? []).map((trip) => (trip.id !== id ? trip : {
      ...trip,
      packed: trip.packed.includes(itemId) ? trip.packed.filter((item) => item !== itemId) : [...trip.packed, itemId],
    })),
  });
}

// 오늘 진행 중이거나 그 뒤의 가장 가까운 여행.
export function nextTrip(trips: readonly Trip[], today: string): Trip | undefined {
  return trips.find((trip) => trip.end >= today);
}

export function tripOn(trips: readonly Trip[], date: string): Trip | undefined {
  return trips.find((trip) => trip.start <= date && date <= trip.end);
}

// '2박 3일', '당일치기'.
export function nightsLabel(start: string, end: string): string {
  const nights = Math.round((parseKey(end).getTime() - parseKey(start).getTime()) / 86_400_000);
  return nights <= 0 ? '당일치기' : `${nights}박 ${nights + 1}일`;
}
