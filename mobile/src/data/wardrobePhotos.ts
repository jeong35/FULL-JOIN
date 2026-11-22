// 옷장 옷의 사진(배경 지운 사진)과 옷장 보기 방식(그림 · 사진). 11/22 사진으로 옷 추가 시안.
// - 서버에 사진 칸(photo_path)이 생기기 전까지는 이 브라우저에만 저장한다(계정마다 따로). 앱(Expo Go)에서는 켜 둔 동안만 기억한다.
// - 옷장 기본은 그림. 사진 있는 옷은 칸을 옆으로 밀거나 옷 자세히에서 넘기면 사진이 보인다.
import { useSyncExternalStore } from 'react';

import { getSession, useSession } from './session';

export type WardrobePhoto = {
  // data:image/...;base64 주소. 배경을 지웠으면 PNG, 아직 못 지웠으면 네모로 자른 JPEG.
  uri: string;
  // 사진에서 뽑은 옷 색(#RRGGBB). 서버 누끼가 생기면 채워진다.
  color: string | null;
  // 배경을 지운 사진인지.
  cutout: boolean;
  added_at: number;
};

export type ClosetView = 'icon' | 'photo';

const STORAGE_KEY = 'odit-wardrobe-photos-v1';
type Account = { photos: Record<string, WardrobePhoto>; view: ClosetView };
type Store = Record<string, Account>;

const EMPTY_PHOTOS: Readonly<Record<string, WardrobePhoto>> = {};

function read(): Store {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

let store: Store = read();
const listeners = new Set<() => void>();

// 저장 공간이 모자라면 false(이번 방문 동안은 화면에 남는다).
function write(next: Store): boolean {
  store = next;
  let saved = true;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    saved = false;
  }
  for (const listener of listeners) listener();
  return saved;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function accountKey(): string {
  return getSession()?.userId ?? 'guest';
}

function accountOf(key: string): Account {
  return store[key] ?? { photos: {}, view: 'icon' };
}

export function useWardrobePhotos(): Readonly<Record<string, WardrobePhoto>> {
  const key = useSession()?.userId ?? 'guest';
  return useSyncExternalStore(subscribe, () => store[key]?.photos ?? EMPTY_PHOTOS, () => EMPTY_PHOTOS);
}

export function useWardrobePhoto(itemId: string | undefined): WardrobePhoto | undefined {
  const photos = useWardrobePhotos();
  return itemId === undefined ? undefined : photos[itemId];
}

export function setWardrobePhoto(itemId: string, photo: Omit<WardrobePhoto, 'added_at'>): boolean {
  const key = accountKey();
  const account = accountOf(key);
  return write({ ...store, [key]: { ...account, photos: { ...account.photos, [itemId]: { ...photo, added_at: Date.now() } } } });
}

export function removeWardrobePhotos(itemIds: readonly string[]) {
  const key = accountKey();
  const account = accountOf(key);
  if (!itemIds.some((id) => account.photos[id] !== undefined)) return;
  const photos = { ...account.photos };
  for (const id of itemIds) delete photos[id];
  write({ ...store, [key]: { ...account, photos } });
}

export function useClosetView(): ClosetView {
  const key = useSession()?.userId ?? 'guest';
  return useSyncExternalStore(subscribe, () => store[key]?.view ?? 'icon', () => 'icon');
}

export function setClosetView(view: ClosetView) {
  const key = accountKey();
  const account = accountOf(key);
  if (account.view === view) return;
  write({ ...store, [key]: { ...account, view } });
}
