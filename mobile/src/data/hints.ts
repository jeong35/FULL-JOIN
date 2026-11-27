// 다음 할 일 말풍선(힌트). 한 화면에서 할 일을 마치면 다음 할 일을 말풍선으로 알려 준다(11/10 선배 피드백).
// 다음 할 일을 한 번 하거나 ×로 닫으면 그 말풍선은 다시 띄우지 않는다. 계정마다 따로, 이 브라우저에만 기억한다.
import { useEffect, useSyncExternalStore } from 'react';

import { getSession, useSession } from './session';

export type HintId =
  | 'closet_empty' // 옷장 0벌: 가진 옷부터 넣기
  | 'home_after_closet' // 옷장에 옷이 있고 저장한 사진은 없음: 홈으로 가서 사진 보며 코디 고르기
  | 'save_compare' // 피드에서 사진 저장: '모든 저장'에서 비교하기
  | 'archive_open' // '모든 저장'에 사진 있음: 사진 눌러 비교 결과 보기
  | 'result_chat' // 비교 결과를 끝까지 봄: 챗봇에 물어보기
  | 'set_edit' // 여행 짐·조합 만들기 처음: '수정'으로 옷을 빼고 더할 수 있다고 알려 주기(두 화면이 같이 씀)
  | 'closet_swipe' // 사진 넣은 옷이 생김: 옷장 칸을 옆으로 밀면 내 옷 사진이 나온다고 알려 주기
  | 'feed_taste' // 홈 피드 처음: 고른 추구미에 맞춰 피드 순서를 바꿨다고 한 번 알려 주기(11/24) — 11/26 뺌(지금 안 씀)
  | 'taste_suggest' // 추구미 아닌 스타일 사진 저장: 그 스타일을 추구미로 저장할지 묻기(매번 다름, 기억 안 함)
  | 'purchase_check' // 쇼핑몰에 갔다 오면: 샀는지 묻고 옷장에 넣기(매번 다름, 기억 안 함)
  | 'chat_button'; // 챗봇이 탭에서 동그란 버튼으로 바뀜: 여기서 물어볼 수 있다고 한 번 알려 주기(11/24)

const STORAGE_KEY = 'odit-hints-v1';
type DoneStore = Record<string, HintId[]>;

function readStore(): DoneStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as DoneStore) : {};
  } catch {
    return {};
  }
}

let store: DoneStore = readStore();
const listeners = new Set<() => void>();

function accountKey(): string {
  return getSession()?.userId ?? 'guest';
}

function isDone(account: string, id: HintId): boolean {
  const done = store[account];
  return Array.isArray(done) && done.includes(id);
}

export function markHintDone(id: HintId) {
  const account = accountKey();
  if (isDone(account, id)) return;
  store = { ...store, [account]: [...(store[account] ?? []), id] };
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // 저장이 막힌 브라우저는 이번 방문 동안만 기억한다.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// 아직 띄울 차례인지(다음 할 일을 안 했고 닫지도 않았는지). 서버에서 미리 그릴 때는 띄우지 않는다.
export function useHintOpen(id: HintId): boolean {
  const account = useSession()?.userId ?? 'guest';
  return useSyncExternalStore(subscribe, () => !isDone(account, id), () => false);
}

// ── 말풍선은 한 번에 하나씩(11/27) ──
// 챗봇 버튼 말풍선은 탭 화면 위에 떠 있어서, 그 화면의 다른 말풍선(옷장 '홈으로 가기' 등)과 겹쳤다.
// 지금 보이는 화면에 다른 말풍선이 떠 있으면 챗봇 말풍선은 그 말풍선이 닫힐 때까지 기다린다.
const shownBubbles = new Set<symbol>();
const shownListeners = new Set<() => void>();

function emitShown() {
  for (const listener of shownListeners) listener();
}

// 말풍선이 지금 보이는 화면에 떠 있는 동안 세어 둔다(HintBubble이 부른다).
export function useShowingHint(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const token = Symbol('hint');
    shownBubbles.add(token);
    emitShown();
    return () => {
      shownBubbles.delete(token);
      emitShown();
    };
  }, [active]);
}

export function useOtherHintShown(): boolean {
  return useSyncExternalStore(
    (listener) => {
      shownListeners.add(listener);
      return () => {
        shownListeners.delete(listener);
      };
    },
    () => shownBubbles.size > 0,
    () => false,
  );
}
