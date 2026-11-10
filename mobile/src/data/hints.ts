// 다음 할 일 말풍선(힌트). 한 화면에서 할 일을 마치면 다음 할 일을 말풍선으로 알려 준다(11/10 선배 피드백).
// 다음 할 일을 한 번 하거나 ×로 닫으면 그 말풍선은 다시 띄우지 않는다. 계정마다 따로, 이 브라우저에만 기억한다.
import { useSyncExternalStore } from 'react';

import { getSession, useSession } from './session';

export type HintId =
  | 'closet_empty' // 옷장 0벌: 가진 옷부터 넣기
  | 'home_after_closet' // 옷장에 옷이 있고 저장한 사진은 없음: 홈으로 가서 사진 보며 코디 고르기
  | 'save_compare' // 피드에서 사진 저장: '모든 저장'에서 비교하기
  | 'archive_open' // '모든 저장'에 사진 있음: 사진 눌러 비교 결과 보기
  | 'result_chat'; // 비교 결과를 끝까지 봄: 챗봇에 물어보기

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
