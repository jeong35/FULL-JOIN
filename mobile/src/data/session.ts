// 로그인(닉네임 + 숫자 4자리)과 처음 고른 취향.
// - 웹(동료평가 링크): 처음 열면 튜토리얼 → 로그인 → 취향 고르기. 같은 닉네임·숫자면 어느 기기에서든 같은 옷장이 열린다.
//   주소 끝에 ?user=eunjae-demo 를 붙이면 로그인 없이 그 사용자로 들어간다(웹으로 시연할 때).
// - 앱(시뮬레이터·Expo Go): 시연용 사용자로 바로 들어간다. 튜토리얼은 마이 탭에서 다시 볼 수 있다.
// 익명 로그인(Supabase Auth)이 붙으면 이 파일만 바꾼다. 서버는 지금 user_id를 그대로 믿으니 진짜 계정 보안은 아니다.
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { STYLES, type Style } from './catalog';

export type Session = {
  userId: string;
  nickname: string;
  // 처음 고른 취향 스타일(0~3개). 홈 피드에서 이 스타일 사진을 먼저 보여 준다.
  styles: Style[];
  // 튜토리얼(취향 고르기까지)을 끝냈는지.
  onboarded: boolean;
};

const STORAGE_KEY = 'odit-session-v1';
const DEMO_USER_ID = process.env.EXPO_PUBLIC_DEMO_USER_ID ?? 'eunjae-demo';

// 로그인 화면은 웹에서만 띄운다. EXPO_PUBLIC_DEMO_USER_ID를 넣으면 웹도 시연용 사용자로 고정된다.
export const LOGIN_ENABLED = Platform.OS === 'web' && !process.env.EXPO_PUBLIC_DEMO_USER_ID;

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 12;

export function normalizeNickname(raw: string): string {
  return raw.normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function nicknameProblem(raw: string): string | null {
  const nickname = normalizeNickname(raw);
  if (nickname.length < NICKNAME_MIN) return `닉네임은 ${NICKNAME_MIN}글자 이상이에요`;
  if (nickname.length > NICKNAME_MAX) return `닉네임은 ${NICKNAME_MAX}글자까지예요`;
  return null;
}

export function pinProblem(pin: string): string | null {
  return /^[0-9]{4}$/.test(pin) ? null : '숫자 4자리를 넣어 주세요';
}

// 문자열을 53비트 수로 바꾸는 해시(cyrb53). 암호용이 아니라, 닉네임·숫자를 서버에 그대로 보내지 않고
// 같은 입력이면 늘 같은 사용자 ID가 나오게 하려는 것.
function cyrb53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// 같은 닉네임(대소문자 무시)·같은 숫자 → 같은 사용자 ID.
export function userIdFor(nickname: string, pin: string): string {
  const key = `${normalizeNickname(nickname).toLowerCase()}:${pin}`;
  const part = (seed: number) => cyrb53(key, seed).toString(16).padStart(14, '0');
  return `u-${part(1)}${part(2)}`;
}

function isStyle(value: unknown): value is Style {
  return typeof value === 'string' && (STYLES as readonly string[]).includes(value);
}

function readStored(): Session | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Session>;
    if (typeof data.userId !== 'string' || data.userId === '') return null;
    return {
      userId: data.userId,
      nickname: typeof data.nickname === 'string' ? data.nickname : '',
      styles: Array.isArray(data.styles) ? data.styles.filter(isStyle).slice(0, 3) : [],
      onboarded: data.onboarded === true,
    };
  } catch {
    return null;
  }
}

function writeStored(session: Session | null) {
  try {
    if (session === null) globalThis.localStorage?.removeItem(STORAGE_KEY);
    else globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // 저장이 막힌 브라우저(사생활 보호 모드 등)는 이번 방문 동안만 기억한다.
  }
}

function initialSession(): Session | null {
  if (!LOGIN_ENABLED) {
    return { userId: DEMO_USER_ID, nickname: '시연용 계정', styles: [], onboarded: true };
  }
  if (typeof window === 'undefined') return null; // 서버에서 미리 그릴 때
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('user')?.trim();
    if (fromUrl && /^[A-Za-z0-9_-]{1,64}$/.test(fromUrl)) {
      const session: Session = { userId: fromUrl, nickname: fromUrl, styles: [], onboarded: true };
      writeStored(session);
      return session;
    }
  } catch {
    // 주소를 못 읽으면 저장된 로그인으로 간다.
  }
  return readStored();
}

let session: Session | null = initialSession();
const listeners = new Set<() => void>();

function setSession(next: Session | null) {
  session = next;
  if (LOGIN_ENABLED) writeStored(next);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSession(): Session | null {
  return session;
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession, getSession);
}

export function login(nickname: string, pin: string) {
  setSession({
    userId: userIdFor(nickname, pin),
    nickname: normalizeNickname(nickname),
    styles: [],
    onboarded: false,
  });
}

export function logout() {
  if (!LOGIN_ENABLED) return;
  setSession(null);
}

export function saveStyles(styles: readonly Style[]) {
  if (session === null) return;
  setSession({ ...session, styles: [...new Set(styles)].slice(0, 3) });
}

export function finishOnboarding() {
  if (session === null) return;
  setSession({ ...session, onboarded: true });
}
