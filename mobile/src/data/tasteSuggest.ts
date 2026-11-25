// 추구미 제안(11/24 팀 결정 2번, 멘토 피드백 4번): 추구미로 고르지 않은 스타일의 사진을 저장하면
// "○○도 추구미로 저장할까요?" 말풍선을 띄운다. ×로 닫은 스타일은 다시 묻지 않는다(계정마다, 이 기기에만 기억).
import { updateStylePreferences } from './api';
import type { Style } from './catalog';
import { getSession, saveStyles } from './session';

export const TASTE_MAX = 3;
const STORAGE_KEY = 'odit-taste-declined-v1';
type DeclinedStore = Record<string, Style[]>;

function readStore(): DeclinedStore {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as DeclinedStore) : {};
  } catch {
    return {};
  }
}

let declined: DeclinedStore = readStore();

// 저장한 사진의 스타일 중 아직 추구미가 아니고, 전에 거절하지도 않은 첫 스타일.
export function tasteSuggestionFor(imageStyles: readonly Style[]): Style | null {
  const session = getSession();
  if (session === null) return null;
  const no = declined[session.userId] ?? [];
  return imageStyles.find((style) => !session.styles.includes(style) && !no.includes(style)) ?? null;
}

export function declineTaste(style: Style) {
  const session = getSession();
  if (session === null) return;
  const no = declined[session.userId] ?? [];
  if (no.includes(style)) return;
  declined = { ...declined, [session.userId]: [...no, style] };
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(declined));
  } catch {
    // 저장이 막힌 브라우저는 이번 방문 동안만 기억한다.
  }
}

// 추구미가 3개 미만이면 바로 더한다. 이미 3개면 false — 화면에서 '추구미 바꾸기'(다시 고르기)로 보낸다.
export async function addTaste(style: Style): Promise<boolean> {
  const session = getSession();
  if (session === null || session.styles.length >= TASTE_MAX) return false;
  const saved = await updateStylePreferences([...session.styles, style]);
  saveStyles(saved);
  return true;
}

// 받침이 있으면 '을', 없으면 '를'을 붙인다.
export function withEulReul(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return `${word}${code >= 0 && code <= 11171 && code % 28 !== 0 ? '을' : '를'}`;
}

// 말풍선 글. 추구미가 이미 있으면 '도'.
export function tasteSuggestionText(style: Style, current: readonly Style[]): { text: string; action: string; full: boolean } {
  const full = current.length >= TASTE_MAX;
  if (full) {
    return { text: `${style} 사진을 저장했어요. 추구미는 3개까지라, ${withEulReul(style)} 넣으려면 하나를 바꿔야 해요`, action: '추구미 바꾸기', full };
  }
  if (current.length === 0) return { text: `${style} 사진을 저장했어요. ${withEulReul(style)} 추구미로 저장할까요?`, action: '추구미로 저장', full };
  return { text: `${style} 사진을 저장했어요. ${style}도 추구미로 저장할까요?`, action: '추구미에 넣기', full };
}
