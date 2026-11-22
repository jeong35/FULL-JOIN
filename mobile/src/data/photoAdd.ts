// 사진으로 옷 추가(11/22 시안 '사진으로 옷 추가'): 사진 고르기 → 네모(옷마다 하나, 4개까지) → 배경 지우기 → 확인 → 옷장에 넣기.
// 고른 사진과 잘라 낸 옷은 화면 사이에 이 파일에 잠깐 둔다(주소로 넘기기엔 크다). 옷장에 넣기 전에는 아무것도 저장하지 않는다.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useSyncExternalStore } from 'react';
import { Image } from 'react-native';

import { cutoutPhoto, SERVER_HAS_PHOTO_CUTOUT } from './api';
import { canCutoutInBrowser, cutoutInBrowser } from './cutoutWeb';
import { colorsForKind, fitsForKind, type Color, type Kind, type Slot, type VisualFit } from './catalog';
import type { Season } from './types';

export const MAX_BOXES = 4;
// 서버로 보내는 사진의 긴 쪽(누끼 서버도 1024로 줄인다).
const UPLOAD_SIDE = 1024;
// 브라우저에서 배경을 지울 때 넣는 사진의 긴 쪽(모델은 320으로 줄여 보고, 결과 사진은 480).
const BROWSER_SIDE = 768;
// 배경을 못 지웠을 때 저장하는 사진의 긴 쪽(이 브라우저 저장 공간을 아끼려고 작게).
const FALLBACK_SIDE = 640;

export type PhotoSource = { uri: string; width: number; height: number };

// 네모: 사진 크기에 대한 비율(0~1).
export type Box = { id: string; x: number; y: number; w: number; h: number };

export type CutItem = {
  id: string;
  uri: string;
  color: string | null;
  cutout: boolean;
  slot: Slot | null;
  kind: Kind | null;
  colorName: Color | null;
  fit: VisualFit | null;
  seasons: Season[];
};

type Draft = {
  source: PhotoSource | null;
  boxes: Box[];
  items: CutItem[];
  // 옷 자세히에서 '사진 넣기'로 왔으면 그 옷 id(새 옷을 만들지 않고 사진만 붙인다).
  attachTo: string | null;
};

let draft: Draft = { source: null, boxes: [], items: [], attachTo: null };
const listeners = new Set<() => void>();
let nextId = 1;

function setDraft(patch: Partial<Draft>) {
  draft = { ...draft, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePhotoDraft(): Draft {
  return useSyncExternalStore(subscribe, () => draft, () => draft);
}

export function newBox(index: number): Box {
  // 처음 네모는 사진 가운데에 크게, 더하는 네모는 조금씩 비켜서 놓는다.
  const offset = Math.min(index, 3) * 0.06;
  return index === 0
    ? { id: `box-${nextId++}`, x: 0.12, y: 0.12, w: 0.76, h: 0.76 }
    : { id: `box-${nextId++}`, x: 0.2 + offset, y: 0.25 + offset, w: 0.45, h: 0.4 };
}

export function startPhotoDraft(source: PhotoSource, attachTo: string | null = null) {
  setDraft({ source, boxes: [newBox(0)], items: [], attachTo });
}

export function setBoxes(boxes: Box[]) {
  setDraft({ boxes });
}

export function setCutItems(items: CutItem[]) {
  setDraft({ items });
}

export function updateCutItem(id: string, patch: Partial<CutItem>) {
  setDraft({ items: draft.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
}

export function removeCutItem(id: string) {
  setDraft({ items: draft.items.filter((item) => item.id !== id) });
}

export function clearPhotoDraft() {
  setDraft({ source: null, boxes: [], items: [], attachTo: null });
}

// 종류를 바꾸면 그 종류에 없는 색 · 핏은 비운다.
export function withKind(item: CutItem, slot: Slot, kind: Kind): Partial<CutItem> {
  const colorOk = item.colorName !== null && colorsForKind(kind).includes(item.colorName);
  const fitOk = item.fit !== null && fitsForKind(slot, kind).includes(item.fit);
  return { slot, kind, colorName: colorOk ? item.colorName : null, fit: fitOk ? item.fit : null };
}

function sizeOf(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => Image.getSize(uri, (width, height) => resolve({ width, height }), reject));
}

// 사진 찍기 · 앨범에서 고르기. 취소하면 null. 웹에서는 누른 그 순간에 불러야 파일 고르기 창이 열린다.
export async function pickPhoto(from: 'camera' | 'album'): Promise<PhotoSource | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9 };
  if (from === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('카메라를 쓸 수 있게 허락해 주세요');
  }
  const result = from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (asset === undefined) return null;
  const size = asset.width > 0 && asset.height > 0 ? { width: asset.width, height: asset.height } : await sizeOf(asset.uri);
  return { uri: asset.uri, ...size };
}

async function cropBox(source: PhotoSource, box: Box, side: number): Promise<string> {
  const originX = Math.round(box.x * source.width);
  const originY = Math.round(box.y * source.height);
  const width = Math.max(1, Math.min(source.width - originX, Math.round(box.w * source.width)));
  const height = Math.max(1, Math.min(source.height - originY, Math.round(box.h * source.height)));
  let context = ImageManipulator.manipulate(source.uri).crop({ originX, originY, width, height });
  if (Math.max(width, height) > side) {
    context = width >= height ? context.resize({ width: side }) : context.resize({ height: side });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
  return `data:image/jpeg;base64,${saved.base64 ?? ''}`;
}

async function cutOne(source: PhotoSource, box: Box): Promise<CutItem> {
  const base = { id: box.id, slot: null, kind: null, colorName: null, fit: null, seasons: [] };
  try {
    // 서버 누끼(u2net)가 있으면 서버에서, 없으면 웹에서는 브라우저에서(u2netp) 지운다.
    if (SERVER_HAS_PHOTO_CUTOUT) {
      const result = await cutoutPhoto(await cropBox(source, box, UPLOAD_SIDE));
      return { ...base, uri: result.image, color: result.color, cutout: true };
    }
    if (canCutoutInBrowser) {
      const result = await cutoutInBrowser(await cropBox(source, box, BROWSER_SIDE));
      return { ...base, uri: result.image, color: result.color, cutout: true };
    }
  } catch {
    // 아래에서 자른 사진으로 넣는다.
  }
  return { ...base, uri: await cropBox(source, box, FALLBACK_SIDE), color: null, cutout: false };
}

// 네모마다 잘라서 배경을 지운다. 못 지우면 자른 사진을 그대로 쓴다(cutout: false).
// 브라우저 누끼는 한 번에 하나씩만 돌릴 수 있어서 차례로 한다.
export async function cutBoxes(source: PhotoSource, boxes: readonly Box[]): Promise<CutItem[]> {
  const items: CutItem[] = [];
  for (const box of boxes) items.push(await cutOne(source, box));
  return items;
}
