// 앱 안 저장소. 옷장·피드·저장 결과는 서버(api.ts)에서 받아 와 여기에 둔다.
// 화면은 이 파일의 use…() 훅으로 읽고, load…()/add…()/heart…() 함수로 서버를 부른다.
import { useSyncExternalStore } from 'react';

import { createWardrobeItem, deleteHeart, deleteWardrobeItem, errorMessage, fetchArchive, fetchFeed, fetchWardrobe, postHeart } from './api';
import type { ArchiveImage, HeartResult, StyleImage, WardrobeItem } from './types';

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
  archive: Remote<readonly ArchiveImage[]>;
  // 서버 아카이브의 사진 id → 저장 시각(ms). 새 하트는 응답 전까지 낙관적으로 표시한다.
  saved: Readonly<Record<string, number>>;
  hearts: Readonly<Record<string, HeartState>>;
  unhearting: Readonly<Record<string, boolean>>;
};

function remote<T>(data: T): Remote<T> {
  return { status: 'idle', data, error: null, loadedAt: 0 };
}

let state: State = { wardrobe: remote([]), feed: remote([]), archive: remote([]), saved: {}, hearts: {}, unhearting: {} };
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

// 로그인한 사용자가 바뀌면 그 사람의 옷장·저장을 새로 받는다(피드 사진은 모두에게 같다).
export function resetUserData() {
  setState({ wardrobe: remote([]), archive: remote([]), saved: {}, hearts: {}, unhearting: {} });
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
// 옷장이 바뀌면 전에 받아 둔 저장 사진의 옷장 비교 결과(hearts)는 낡은 것이 되므로 비운다.
// 결과 화면을 다시 열면 서버가 바뀐 옷장으로 다시 맞춘다(저장 시각은 그대로).
export async function addWardrobeItem(input: Omit<WardrobeItem, 'id'>): Promise<WardrobeItem> {
  const item = await createWardrobeItem(input);
  setState({ wardrobe: { ...state.wardrobe, data: [item, ...state.wardrobe.data] }, hearts: {} });
  return item;
}

// 화면에서는 먼저 지우고 서버 삭제가 실패하면 원래 순서로 되돌린다.
export async function removeWardrobeItem(id: string): Promise<void> {
  const previousWardrobe = state.wardrobe;
  const previousHearts = state.hearts;
  setState({
    wardrobe: { ...state.wardrobe, data: state.wardrobe.data.filter((item) => item.id !== id) },
    hearts: {},
  });
  try {
    await deleteWardrobeItem(id);
  } catch (error) {
    setState({ wardrobe: previousWardrobe, hearts: previousHearts });
    throw error;
  }
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
  return useStore((s) => (id === undefined
    ? undefined
    : s.feed.data.find((image) => image.id === id) ?? s.archive.data.find((image) => image.id === id)));
}

// ── 저장(하트)과 옷장 대조 결과 ───────────────────────

export function useArchiveState(): Remote<readonly ArchiveImage[]> {
  return useStore((s) => s.archive);
}

export async function loadArchive({ force = false }: { force?: boolean } = {}): Promise<void> {
  const { archive } = state;
  if (archive.status === 'loading') return;
  if (!force && archive.status === 'ready' && Date.now() - archive.loadedAt < FEED_MAX_AGE_MS) return;
  setState({ archive: { ...archive, status: 'loading', error: null } });
  try {
    const images = await fetchArchive();
    const saved = Object.fromEntries(images.map((image) => [image.id, Date.parse(image.saved_at)]));
    setState({ archive: { status: 'ready', data: images, error: null, loadedAt: Date.now() }, saved });
  } catch (error) {
    setState({ archive: { ...state.archive, status: 'error', error: errorMessage(error) } });
  }
}

export function useSaved(): Readonly<Record<string, number>> {
  return useStore((s) => s.saved);
}

export function useHeart(id: string | undefined): HeartState | undefined {
  return useStore((s) => (id === undefined ? undefined : s.hearts[id]));
}

export function useIsUnhearting(id: string | undefined): boolean {
  return useStore((s) => id !== undefined && s.unhearting[id] === true);
}

// 사진을 저장하고 서버에서 옷장 대조 결과를 받는다. 이미 저장한 사진이면 지금 옷장으로 다시 맞춰 본다.
export async function heartStyleImage(id: string): Promise<void> {
  const previous = state.hearts[id];
  if (previous?.status === 'loading' || state.unhearting[id] === true) return;
  setState({
    saved: state.saved[id] === undefined ? { ...state.saved, [id]: Date.now() } : state.saved,
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

// 서버 취소가 실패하면 이 사진의 저장·아카이브·분석 상태만 원래대로 되돌린다.
export async function unheartStyleImage(id: string): Promise<void> {
  if (state.unhearting[id] === true || state.saved[id] === undefined) return;
  const previousSavedAt = state.saved[id];
  const previousHeart = state.hearts[id];
  const previousArchiveImage = state.archive.data.find((image) => image.id === id);
  const nextSaved = { ...state.saved };
  const nextHearts = { ...state.hearts };
  delete nextSaved[id];
  delete nextHearts[id];
  setState({
    saved: nextSaved,
    hearts: nextHearts,
    archive: { ...state.archive, data: state.archive.data.filter((image) => image.id !== id) },
    unhearting: { ...state.unhearting, [id]: true },
  });
  try {
    await deleteHeart(id);
  } catch (error) {
    const restoredArchive = previousArchiveImage === undefined
      ? state.archive.data
      : [...state.archive.data.filter((image) => image.id !== id), previousArchiveImage]
        .sort((left, right) => right.saved_at.localeCompare(left.saved_at));
    setState({
      saved: { ...state.saved, [id]: previousSavedAt },
      hearts: previousHeart === undefined ? state.hearts : { ...state.hearts, [id]: previousHeart },
      archive: { ...state.archive, data: restoredArchive },
    });
    throw error;
  } finally {
    const nextUnhearting = { ...state.unhearting };
    delete nextUnhearting[id];
    setState({ unhearting: nextUnhearting });
  }
}
