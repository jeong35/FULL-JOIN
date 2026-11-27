// Private Beta 로그인(닉네임 + 숫자 4자리)과 Supabase Auth 세션.
// PIN은 서버의 제한된 베타 계정에서만 검증하며 access token의 sub가 API user_id가 된다.
import { useSyncExternalStore } from 'react';

import { STYLES, type Style } from './catalog';

export type Session = {
  userId: string;
  nickname: string;
  // 처음 고른 취향 스타일(0~3개). 홈 피드에서 이 스타일 사진을 먼저 보여 준다.
  styles: Style[];
  // 튜토리얼(취향 고르기까지)을 끝냈는지.
  onboarded: boolean;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

const STORAGE_KEY = 'odit-session-v1';
// 이 브라우저에서 소개 3장을 본 적이 있는지. 로그아웃해도 남는다(한 번 본 사람은 로그인 화면부터).
const INTRO_SEEN_KEY = 'odit-intro-seen-v1';
// 이 브라우저에서 로그인한 적이 있는지. 로그아웃해도 남는다. 소개의 '건너뛰기'는 이런 사람에게만 보여 준다.
const EVER_LOGGED_IN_KEY = 'odit-ever-logged-in-v1';
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://gctbcanltqgcymdlplyr.supabase.co').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
// production은 항상 로그인한다. 개발 전용 우회 계정도 유효한 Auth 세션 없이는 API를 호출할 수 없다.
export const LOGIN_ENABLED = true;

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

function isStyle(value: unknown): value is Style {
  return typeof value === 'string' && (STYLES as readonly string[]).includes(value);
}

function readStored(): Session | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Session>;
    if (typeof data.userId !== 'string' || data.userId === '' ||
        typeof data.accessToken !== 'string' || typeof data.refreshToken !== 'string' ||
        typeof data.expiresAt !== 'number') return null;
    return {
      userId: data.userId,
      nickname: typeof data.nickname === 'string' ? data.nickname : '',
      styles: Array.isArray(data.styles) ? data.styles.filter(isStyle).slice(0, 3) : [],
      onboarded: data.onboarded === true,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
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
  if (typeof window === 'undefined') return null; // 서버에서 미리 그릴 때
  return readStored();
}

let session: Session | null = initialSession();
let introSeen = readIntroSeen();
let everLoggedIn = readEverLoggedIn();
if (session !== null) markEverLoggedIn();

function readEverLoggedIn(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return globalThis.localStorage?.getItem(EVER_LOGGED_IN_KEY) === '1';
  } catch {
    return false;
  }
}

function markEverLoggedIn() {
  if (everLoggedIn || typeof window === 'undefined') return;
  everLoggedIn = true;
  try {
    globalThis.localStorage?.setItem(EVER_LOGGED_IN_KEY, '1');
  } catch {
    // 저장이 막힌 브라우저는 이번 방문 동안만 기억한다.
  }
}

// 이 브라우저에서 로그인한 적이 있으면(로그아웃 뒤 포함) 소개를 건너뛸 수 있다. 처음 온 사람은 소개 3장을 끝까지 본다.
export function hasLoggedInBefore(): boolean {
  return everLoggedIn;
}

function readIntroSeen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return globalThis.localStorage?.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

// 소개를 본 적이 있으면 로그아웃 뒤에도 소개를 건너뛰고 로그인 화면으로 간다.
export function hasSeenIntro(): boolean {
  return introSeen;
}

export function markIntroSeen() {
  introSeen = true;
  try {
    globalThis.localStorage?.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    // 저장이 막힌 브라우저는 이번 방문 동안만 기억한다.
  }
}
const listeners = new Set<() => void>();

function setSession(next: Session | null) {
  session = next;
  if (next !== null) markEverLoggedIn();
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

// returning: 이 계정으로 저장한 사진이나 옷장 옷이 이미 있으면(이미 쓰던 사람) 취향 고르기를 건너뛴다.
export function loginWithBetaSession(input: {
  userId: string;
  nickname: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  returning: boolean;
  styles: readonly Style[];
}) {
  setSession({
    userId: input.userId,
    nickname: normalizeNickname(input.nickname),
    styles: [...new Set(input.styles)].filter(isStyle).slice(0, 3),
    onboarded: input.returning,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    expiresAt: input.expiresAt,
  });
}

export function updateAuthSession(accessToken: string, refreshToken: string, expiresAt: number): void {
  if (session === null) return;
  setSession({ ...session, accessToken, refreshToken, expiresAt });
}

export function currentAccessToken(): string | null {
  return session?.accessToken ?? null;
}

export function currentRefreshToken(): string | null {
  return session?.refreshToken ?? null;
}

export function authExpiresAt(): number {
  return session?.expiresAt ?? 0;
}

export function logout() {
  if (!LOGIN_ENABLED) return;
  const accessToken = session?.accessToken;
  setSession(null);
  if (accessToken && SUPABASE_ANON_KEY) {
    void fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${accessToken}` },
    }).catch(() => undefined);
  }
}

export function saveStyles(styles: readonly Style[]) {
  if (session === null) return;
  setSession({ ...session, styles: [...new Set(styles)].slice(0, 3) });
}

// 다른 브라우저나 시연용 계정으로 들어왔을 때 서버에 저장된 추구미로 현재 세션을 맞춘다.
// 요청 도중 로그아웃하거나 다른 계정으로 바뀐 경우에는 늦게 온 응답을 버린다.
export function restoreStyles(userId: string, styles: readonly Style[]) {
  if (session === null || session.userId !== userId) return;
  setSession({ ...session, styles: [...new Set(styles)].filter(isStyle).slice(0, 3) });
}

export function finishOnboarding() {
  if (session === null) return;
  setSession({ ...session, onboarded: true });
}
