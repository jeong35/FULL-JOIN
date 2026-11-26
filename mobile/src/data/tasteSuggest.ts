// 추구미 제안(11/24 팀 결정 2번, 멘토 피드백 4번): 추구미로 고르지 않은 스타일의 사진을 저장하면
// "○○도 추구미로 저장할까요?" 말풍선을 띄운다. ×로 닫은 스타일은 다시 묻지 않는다(계정마다, 이 기기에만 기억).
// 11/25: 사진 한 장으로 추구미를 묻는 건 이르다 — 같은 스타일 사진을 3장째 저장했을 때부터 묻는다(저장한 뒤에 뜸).
import { updateStylePreferences } from './api';
import type { Style } from './catalog';
import { getSession, saveStyles } from './session';
import { getArchiveImages } from './store';

export const TASTE_MAX = 3;
// 같은 스타일 사진을 이만큼 저장하면 추구미로 넣을지 묻는다.
export const SAVED_TO_SUGGEST = 3;
export type TasteSuggestion = { style: Style; count: number };
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

// 방금 저장한 사진의 스타일 중 아직 추구미가 아니고, 전에 거절하지도 않았고, 그 스타일 사진을 3장 이상 저장한 첫 스타일.
// 저장 장수는 불러와 둔 '모든 저장' 사진 + 방금 저장한 사진으로 센다.
export function tasteSuggestionFor(image: { id: string; style: readonly Style[] }): TasteSuggestion | null {
  const session = getSession();
  if (session === null) return null;
  const no = declined[session.userId] ?? [];
  const archive = getArchiveImages();
  for (const style of image.style) {
    if (session.styles.includes(style) || no.includes(style)) continue;
    const ids = new Set(archive.filter((saved) => (saved.style as readonly string[]).includes(style)).map((saved) => saved.id));
    ids.add(image.id);
    if (ids.size >= SAVED_TO_SUGGEST) return { style, count: ids.size };
  }
  return null;
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
export function tasteSuggestionText({ style, count }: TasteSuggestion, current: readonly Style[]): { text: string; action: string; full: boolean } {
  const full = current.length >= TASTE_MAX;
  const saved = `${style} 사진을 ${count}장 저장했어요.`;
  if (full) {
    return { text: `${saved} 추구미는 3개까지라, ${withEulReul(style)} 넣으려면 하나를 바꿔야 해요`, action: '추구미 바꾸기', full };
  }
  if (current.length === 0) return { text: `${saved} ${withEulReul(style)} 추구미로 저장할까요?`, action: '추구미로 저장', full };
  return { text: `${saved} ${style}도 추구미로 저장할까요?`, action: '추구미에 넣기', full };
}
