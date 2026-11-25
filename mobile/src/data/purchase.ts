// 쇼핑몰에 갔다 오면 "샀어요?"를 묻고, 샀으면 종류·색을 미리 채운 옷 추가 화면으로 보낸다(11/24 팀 결정 15번).
// 앱(iOS·안드로이드): 앱 안 브라우저를 닫으면 묻는다. 웹: 새 탭으로 열고, 이 탭으로 돌아오면 묻는다.
// 너무 빨리(3초 안에) 돌아오면 그냥 둘러본 것으로 보고 묻지 않는다.
import { router, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';

import { colorsForKind, fitsForKind, KINDS_BY_SLOT, SLOTS, type Color, type Kind, type Slot, type VisualFit } from './catalog';
import type { Product } from './types';

export type ShopTarget = { slot?: Slot | null; kind: Kind; color?: Color | null; visual_fit?: VisualFit | null };
export type PurchaseAsk = { slot: Slot; kind: Kind; color: Color | null; fit: VisualFit | null; platform: string; openedAt: number };

const MIN_AWAY_MS = 3000;
let pending: PurchaseAsk | null = null;
let asking: PurchaseAsk | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function slotOfKind(kind: Kind): Slot | null {
  return SLOTS.find((slot) => (KINDS_BY_SLOT[slot] as readonly string[]).includes(kind)) ?? null;
}

function ask() {
  const from = pending;
  pending = null;
  if (from === null || Date.now() - from.openedAt < MIN_AWAY_MS) return;
  asking = from;
  emit();
}

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && pending !== null) ask();
  });
}

// 쇼핑몰 링크는 모두 이걸로 연다.
export async function openShop(target: ShopTarget, product: Product): Promise<void> {
  const slot = target.slot ?? slotOfKind(target.kind);
  pending = slot === null ? null : {
    slot,
    kind: target.kind,
    color: target.color ?? null,
    fit: target.visual_fit ?? null,
    platform: product.match_type === 'exact' ? '쇼핑몰' : product.platform,
    openedAt: Date.now(),
  };
  await WebBrowser.openBrowserAsync(product.url);
  if (Platform.OS !== 'web') ask();
}

export function usePurchaseAsk(): PurchaseAsk | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => asking,
    () => null,
  );
}

export function dismissPurchaseAsk() {
  asking = null;
  emit();
}

// 옷 추가 ②(색·핏)로 바로 간다. 색·핏은 그 종류에 고를 수 있는 값일 때만 미리 채운다.
// from: 'purchase'(샀어요) → 넣고 옷장으로, 'photo'(저장한 사진 속 옷) → 넣고 원래 화면으로.
export function addToClosetFrom(target: ShopTarget, from: 'purchase' | 'photo') {
  const slot = target.slot ?? slotOfKind(target.kind);
  if (slot === null) {
    router.push('/add-item/kind');
    return;
  }
  const color = target.color != null && colorsForKind(target.kind).includes(target.color) ? target.color : undefined;
  const fit = target.visual_fit != null && fitsForKind(slot, target.kind).includes(target.visual_fit) ? target.visual_fit : undefined;
  router.push({
    pathname: '/add-item/color-fit',
    params: { slot, kind: target.kind, from, ...(color === undefined ? {} : { color }), ...(fit === undefined ? {} : { fit }) },
  } as Href);
}
