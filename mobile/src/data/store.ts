// 앱 안 저장소. 옷장·피드·저장 결과는 서버(api.ts)에서 받아 와 여기에 둔다.
// 화면은 이 파일의 use…() 훅으로 읽고, load…()/add…()/heart…() 함수로 서버를 부른다.
import { useSyncExternalStore } from 'react';

import { createWardrobeItem, errorMessage, fetchFeed, fetchWardrobe, postHeart } from './api';
import type { HeartResult, StyleImage, WardrobeItem } from './types';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export type Remote<T> = {
  status: LoadStatus;
  data: T;
  error: string | null;
  // 마지막으로 받아 온 시각(ms). 피드 사진 주소가 1시간 뒤 만료돼서 쓴다.
  loadedAt: number;
};

export type HeartState =
  | { status: 'loading'; result: HeartResult | null }
  | { status: 'ready'; result: HeartResult }
  | { status: 'error'; result: HeartResult | null; error: string };

type State = {
  // 최근에 넣은 옷이 앞에 온다(서버가 created_at 내림차순으로 준다).
  wardrobe: Remote<readonly WardrobeItem[]>;
  feed: Remote<readonly StyleImage[]>;
  // 이번 실행에서 저장한 사진 id → 저장 순번(클수록 최근). 저장 목록 API(/archive)가 붙으면 서버 값으로 바꾼다.
  saved: Readonly<Record<string, number>>;
  hearts: Readonly<Record<string, HeartState>>;
};

function remote<T>(data: T): Remote<T> {
  return { status: 'idle', data, error: null, loadedAt: 0 };
}

let state: State = { wardrobe: remote([]), feed: remote([]), saved: {}, hearts: {} };
let nextSaveSeq = 1;
const listeners = new Set<() => void>();

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// select는 state 안의 값을 그대로 돌려줘야 한다(새 객체를 만들면 화면이 계속 다시 그려진다).
function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

// ── 옷장 ────────────────────────────────────────────

export function useWardrobeState(): Remote<readonly WardrobeItem[]> {
  return useStore((s) => s.wardrobe);
}

export function useWardrobe(): readonly WardrobeItem[] {
  return useStore((s) => s.wardrobe.data);
}

export async function loadWardrobe(): Promise<void> {
  if (state.wardrobe.status === 'loading') return;
  setState({ wardrobe: { ...state.wardrobe, status: 'loading', error: null } });
  try {
    const items = await fetchWardrobe();
    setState({ wardrobe: { status: 'ready', data: items, error: null, loadedAt: Date.now() } });
  } catch (error) {
    setState({ wardrobe: { ...state.wardrobe, status: 'error', error: errorMessage(error) } });
  }
}

// 서버에 저장이 끝나야 옷장에 보인다. 실패하면 오류를 던진다(화면에서 알려 준다).
export async function addWardrobeItem(input: Omit<WardrobeItem, 'id'>): Promise<WardrobeItem> {
  const item = await createWardrobeItem(input);
  setState({ wardrobe: { ...state.wardrobe, data: [item, ...state.wardrobe.data] } });
  return item;
}

// ── 피드 ────────────────────────────────────────────

// 사진 주소는 1시간 뒤 만료된다. 50분이 지나면 새로 받는다.
const FEED_MAX_AGE_MS = 50 * 60 * 1000;

export function useFeedState(): Remote<readonly StyleImage[]> {
  return useStore((s) => s.feed);
}

export async function loadFeed({ force = false }: { force?: boolean } = {}): Promise<void> {
  const { feed } = state;
  if (feed.status === 'loading') return;
  if (!force && feed.status === 'ready' && Date.now() - feed.loadedAt < FEED_MAX_AGE_MS) return;
  setState({ feed: { ...feed, status: 'loading', error: null } });
  try {
    const images = await fetchFeed();
    setState({ feed: { status: 'ready', data: images, error: null, loadedAt: Date.now() } });
  } catch (error) {
    setState({ feed: { ...state.feed, status: 'error', error: errorMessage(error) } });
  }
}

export function getStyleImage(id: string): StyleImage | undefined {
  return state.feed.data.find((image) => image.id === id);
}

export function useStyleImage(id: string | undefined): StyleImage | undefined {
  return useStore((s) => (id === undefined ? undefined : s.feed.data.find((image) => image.id === id)));
}

// ── 저장(하트)과 옷장 대조 결과 ───────────────────────

export function useSaved(): Readonly<Record<string, number>> {
  return useStore((s) => s.saved);
}

export function useHeart(id: string | undefined): HeartState | undefined {
  return useStore((s) => (id === undefined ? undefined : s.hearts[id]));
}

// 사진을 저장하고 서버에서 옷장 대조 결과를 받는다. 이미 저장한 사진이면 지금 옷장으로 다시 맞춰 본다.
export async function heartStyleImage(id: string): Promise<void> {
  const previous = state.hearts[id];
  if (previous?.status === 'loading') return;
  setState({
    saved: state.saved[id] === undefined ? { ...state.saved, [id]: nextSaveSeq++ } : state.saved,
    hearts: { ...state.hearts, [id]: { status: 'loading', result: previous?.result ?? null } },
  });
  try {
    const result = await postHeart(id);
    setState({ hearts: { ...state.hearts, [id]: { status: 'ready', result } } });
  } catch (error) {
    setState({
      hearts: {
        ...state.hearts,
        [id]: { status: 'error', result: previous?.result ?? null, error: errorMessage(error) },
      },
    });
  }
}
