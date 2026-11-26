// 쇼핑몰에 갔다 오면 "샀어요?"를 묻고, 샀으면 종류·색을 미리 채운 옷 추가 화면으로 보낸다(11/24 팀 결정 15번).
// 앱(iOS·안드로이드): 앱 안 브라우저를 닫으면 묻는다. 웹: 새 탭으로 열고, 이 탭으로 돌아오면 묻는다.
// 너무 빨리(3초 안에) 돌아오면 그냥 둘러본 것으로 보고 묻지 않는다.
// 11/25 고침: 웹에서 작은 팝업 창으로 열려서(데스크톱) 원래 탭이 가려지지 않아 '돌아옴'을 못 알아채던 문제 —
// 그냥 새 탭으로 열고, 탭이 다시 보일 때·창이 다시 눌릴 때·폰 브라우저가 탭을 새로 불러왔을 때 모두 묻는다
// (갔다 온 기록은 이 탭 저장 공간(sessionStorage)에 둬서 새로 불러와도 남는다).
// 11/26: 한 쇼핑몰만 보고 끝나지 않을 수 있다 — 물을 때 '다른 쇼핑몰도 보기'(나머지 쇼핑몰 버튼)를 같이 보여 주고,
// 다른 쇼핑몰로 가면 그 쇼핑몰에서 돌아왔을 때 다시 묻는다. 묻는 중에 화면의 쇼핑몰 버튼을 눌러도 물음은 닫힌다.
import { router, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';

import { colorsForKind, fitsForKind, KINDS_BY_SLOT, SLOTS, type Color, type Kind, type Slot, type VisualFit } from './catalog';
import type { Product } from './types';

export type ShopTarget = { slot?: Slot | null; kind: Kind; color?: Color | null; visual_fit?: VisualFit | null };
export type PurchaseAsk = {
  slot: Slot;
  kind: Kind;
  color: Color | null;
  fit: VisualFit | null;
  platform: string;
  openedAt: number;
  // 같은 옷을 찾는 쇼핑몰 버튼 전부(무신사·에이블리·지그재그). 물을 때 방금 간 곳만 빼고 보여 준다.
  links?: Product[];
};

const MIN_AWAY_MS = 3000;
// 이보다 오래 지나서 돌아오면 묻지 않는다(다른 날 다시 연 경우).
const MAX_AWAY_MS = 6 * 60 * 60 * 1000;
const PENDING_KEY = 'odit-shop-pending-v1';
let pending: PurchaseAsk | null = null;

function savePending(next: PurchaseAsk | null) {
  pending = next;
  try {
    if (next === null) globalThis.sessionStorage?.removeItem(PENDING_KEY);
    else globalThis.sessionStorage?.setItem(PENDING_KEY, JSON.stringify(next));
  } catch {
    // 저장이 막힌 브라우저는 이 탭이 살아 있는 동안만 기억한다.
  }
}

function storedPending(): PurchaseAsk | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(PENDING_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<PurchaseAsk>) : null;
    return parsed !== null && typeof parsed.kind === 'string' && typeof parsed.slot === 'string' && typeof parsed.openedAt === 'number'
      ? (parsed as PurchaseAsk)
      : null;
  } catch {
    return null;
  }
}
let asking: PurchaseAsk | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function slotOfKind(kind: Kind): Slot | null {
  return SLOTS.find((slot) => (KINDS_BY_SLOT[slot] as readonly string[]).includes(kind)) ?? null;
}

function ask() {
  const from = pending ?? storedPending();
  if (from === null) return;
  const away = Date.now() - from.openedAt;
  // 너무 빨리 돌아왔으면(아직 쇼핑몰 탭이 열리는 중일 수도) 기록은 그대로 두고 다음에 다시 본다.
  if (away < MIN_AWAY_MS) return;
  savePending(null);
  if (away > MAX_AWAY_MS) return;
  asking = from;
  emit();
}

if (Platform.OS === 'web' && typeof document !== 'undefined' && typeof window !== 'undefined') {
  const back = () => {
    if (document.visibilityState === 'visible') ask();
  };
  document.addEventListener('visibilitychange', back);
  window.addEventListener('focus', back);
  window.addEventListener('pageshow', back);
  // 폰 브라우저가 돌아온 탭을 새로 불러온 경우: 처음 열릴 때 한 번 본다.
  setTimeout(back, 1500);
}

// 쇼핑몰 링크는 모두 이걸로 연다. links: 같은 옷을 찾는 쇼핑몰 버튼 전부(돌아와서 '다른 쇼핑몰도 보기'에 쓴다).
export async function openShop(target: ShopTarget, product: Product, links: readonly Product[] = []): Promise<void> {
  const slot = target.slot ?? slotOfKind(target.kind);
  if (asking !== null) dismissPurchaseAsk();
  savePending(slot === null ? null : {
    slot,
    kind: target.kind,
    color: target.color ?? null,
    fit: target.visual_fit ?? null,
    platform: product.match_type === 'exact' ? '쇼핑몰' : product.platform,
    openedAt: Date.now(),
    links: links.filter((link) => link.match_type === 'similar'),
  });
  if (Platform.OS === 'web') {
    // 작은 팝업 창 대신 새 탭으로(돌아오면 이 탭이 다시 보여서 물을 수 있다).
    globalThis.open?.(product.url, '_blank', 'noopener');
    return;
  }
  await WebBrowser.openBrowserAsync(product.url);
  ask();
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
