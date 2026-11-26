// 최근에 입기로 한 옷(11/27): 날씨가 비슷해도 매일 같은 옷만 추천하지 않게 한다.
// '이 룩으로 입을래요'로 고른 날짜별 룩(recommendChoices)에서 옷을 꺼내, 고른 날짜 앞 며칠 동안 입은 옷을 본다.
// - 상의(원피스·점프수트 포함): 3일 안에 입은 것은 뒤로. 어제 입은 게 가장 뒤로(어제 상의는 사실상 빠짐).
// - 하의: 연속은 피하고 퐁당퐁당은 괜찮게 — 어제 입었으면 뒤로, 최근 3일에 2번 입었으면 뒤로.
// - 아우터·신발·가방: 매일 같아도 그대로(보통 같은 코트를 계속 입는다).
// - 완전히 같은 룩: 7일 안에는 다시 앞에 두지 않는다.
// '입을래요'를 누르지 않은 날은 기록이 없으니 영향이 없다. 상의가 한 벌뿐이면 뒤로 밀려도 결국 그 옷이 나온다.
import { addDays } from './dates';
import type { WardrobeItem } from './types';

export type RecentWear = {
  topDaysAgo: ReadonlyMap<string, number>; // 옷 id → 며칠 전에 입었는지(가장 가까운 날, 3일 안)
  bottomDays: ReadonlyMap<string, readonly number[]>; // 옷 id → 입은 날(며칠 전) 목록, 3일 안
  lookDaysAgo: ReadonlyMap<string, number>; // 룩 id → 며칠 전, 7일 안
  hadYesterday: boolean; // 어제 입기로 한 룩이 있는지
};

export const NO_RECENT_WEAR: RecentWear = { topDaysAgo: new Map(), bottomDays: new Map(), lookDaysAgo: new Map(), hadYesterday: false };

const TOP_DAYS = 3;
const LOOK_DAYS = 7;

export const isTopLike = (item: WardrobeItem) => item.slot === '상의' || item.slot === '원피스' || item.kind === '점프수트';
const isBottomLike = (item: WardrobeItem) => item.slot === '하의' && item.kind !== '점프수트';

export function recentWear(
  choices: Readonly<Record<string, { lookId: string }>>,
  date: string,
  itemsOf: (lookId: string) => readonly WardrobeItem[] | null,
): RecentWear {
  const topDaysAgo = new Map<string, number>();
  const bottomDays = new Map<string, number[]>();
  const lookDaysAgo = new Map<string, number>();
  let hadYesterday = false;
  for (let daysAgo = 1; daysAgo <= LOOK_DAYS; daysAgo += 1) {
    const choice = choices[addDays(date, -daysAgo)];
    if (choice === undefined) continue;
    if (!lookDaysAgo.has(choice.lookId)) lookDaysAgo.set(choice.lookId, daysAgo);
    if (daysAgo > TOP_DAYS) continue;
    const items = itemsOf(choice.lookId);
    if (items === null) continue;
    if (daysAgo === 1) hadYesterday = true;
    for (const item of items) {
      if (isTopLike(item) && !topDaysAgo.has(item.id)) topDaysAgo.set(item.id, daysAgo);
      else if (isBottomLike(item)) bottomDays.set(item.id, [...(bottomDays.get(item.id) ?? []), daysAgo]);
    }
  }
  return { topDaysAgo, bottomDays, lookDaysAgo, hadYesterday };
}

const TOP_PENALTY: Readonly<Record<number, number>> = { 1: 100, 2: 30, 3: 10 };

// 작을수록 먼저 추천한다(0 = 최근에 입은 옷 없음).
export function wearPenalty(items: readonly WardrobeItem[], lookId: string, recent: RecentWear): number {
  let penalty = recent.lookDaysAgo.has(lookId) ? 200 : 0;
  for (const item of items) {
    const top = recent.topDaysAgo.get(item.id);
    if (top !== undefined) penalty += TOP_PENALTY[top] ?? 0;
    const bottom = recent.bottomDays.get(item.id);
    if (bottom !== undefined) {
      if (bottom.includes(1)) penalty += 50;
      if (bottom.length >= 2) penalty += 30;
    }
  }
  return penalty;
}

// 카드 안내용: 어제 입기로 한 룩이 있을 때, 이 룩의 상의가 어제와 같은지.
export function yesterdayTopNote(items: readonly WardrobeItem[], recent: RecentWear): '다름' | '같음' | null {
  if (!recent.hadYesterday) return null;
  const tops = items.filter(isTopLike);
  if (tops.length === 0) return null;
  return tops.some((item) => recent.topDaysAgo.get(item.id) === 1) ? '같음' : '다름';
}
