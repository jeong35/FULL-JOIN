// 계정 로그인 (Supabase Auth): 이메일 회원가입·로그인 + 카카오·구글·애플.
// - authConfig.ts의 ACCOUNT_LOGIN_ENABLED가 꺼져 있으면 아무것도 하지 않는다 → 예전 로그인(닉네임 + 숫자 4자리) 그대로.
// - 이메일 가입: 가입할 때 닉네임도 같이 받아서 닉네임 화면을 건너뛴다.
//   Supabase 기본 메일 발송은 팀원 주소로만 가므로, 메일 발송(SMTP)을 붙이기 전까지는 대시보드에서 '메일 확인'을 끈다.
//   켜 두면 가입 뒤 'confirm_email'을 돌려주고 화면이 "메일함 확인"을 안내한다.
// - 켜져 있으면: Supabase가 로그인을 보관하고, 출입증(access token)을 auth.ts 콘센트(PR #30)에 꽂아
//   api.ts가 모든 요청에 붙이게 한다. 앱 세션(session.ts)의 사용자 ID는 Supabase가 확인한 ID만 쓴다.
// - 웹: 카카오·구글·애플 페이지로 이동했다가 /auth/callback 으로 돌아온다(Supabase가 주소의 code를 출입증으로 바꿈).
// - 앱: 브라우저 창을 열었다가 앱 주소(…/auth/callback)로 돌아오면 code를 출입증으로 바꾼다.
//   아이폰의 애플 로그인은 브라우저 대신 아이폰 기본 창(expo-apple-authentication)을 쓴다.
import './urlPolyfill';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session as SupabaseSession, type SupabaseClient, type User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AppState, Platform } from 'react-native';

import { accountHasData, deleteAccount, fetchStylePreferences } from './api';
import { registerAccessTokenProvider, registerUnauthorizedHandler } from './auth';
import { ACCOUNT_LOGIN_ENABLED, PROVIDER_LABELS, SUPABASE_ANON_KEY, SUPABASE_URL, type AuthMethod, type SocialProvider } from './authConfig';
import type { Style } from './catalog';
import {
  NICKNAME_MAX,
  clearAuthSession,
  getSession,
  loginWithAuthSession,
  markAuthReady,
  normalizeNickname,
  setAuthNotice,
  setSessionNickname,
  type Session,
} from './session';
import { resetUserData } from './store';

// 사용자가 정한 오딧 닉네임을 Supabase 사용자 정보(user_metadata)에 넣는 칸 이름.
const NICKNAME_KEY = 'odit_nickname';
// 저장된 로그인을 확인하는 데 이보다 오래 걸리면(주소·키 오류 등) 로그인 화면을 그냥 보여 준다.
const READY_TIMEOUT_MS = 6000;

let client: SupabaseClient | null = null;
let started = false;
let currentUser: User | null = null;
let applyingUserId: string | null = null;
let exchangedCode: string | null = null;
// 애플은 이름을 처음 로그인할 때 한 번만 준다 → 닉네임 칸에 미리 넣어 줄 때 쓴다.
let appleNameHint: string | null = null;

function authClient(): SupabaseClient {
  if (client !== null) return client;
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      // 웹은 브라우저 저장소(기본값), 앱은 AsyncStorage에 로그인을 보관한다.
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: Platform.OS === 'web',
      flowType: 'pkce',
    },
  });
  return client;
}

function metaString(user: User | null, key: string): string {
  const value = (user?.user_metadata as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function savedNickname(user: User | null): string {
  return metaString(user, NICKNAME_KEY);
}

// 앱을 켤 때 한 번 부른다(_layout.tsx). 꺼져 있으면 아무것도 안 한다.
export function startSocialAuth(): void {
  if (!ACCOUNT_LOGIN_ENABLED || started) return;
  if (Platform.OS === 'web' && typeof window === 'undefined') return; // 서버에서 미리 그릴 때
  started = true;
  const auth = authClient().auth;

  registerAccessTokenProvider(async () => {
    const { data } = await auth.getSession(); // 만료가 가까우면 Supabase가 새 출입증으로 바꿔 준다.
    return data.session?.access_token ?? null;
  });
  registerUnauthorizedHandler(() => {
    void expireLogin();
  });

  const readyTimer = setTimeout(markAuthReady, READY_TIMEOUT_MS);
  auth.onAuthStateChange((event, authSession) => {
    // Supabase 안내: 이 콜백 안에서 다른 Supabase 함수를 바로 기다리면 멈출 수 있다 → 다음 차례로 미룬다.
    setTimeout(() => {
      void applyFromAuth(event, authSession)
        .catch(() => {
          // 확인 요청이 실패해도 로그인 자체는 유지한다(applyFromAuth 안에서 처리).
        })
        .finally(() => {
          if (event === 'INITIAL_SESSION') {
            clearTimeout(readyTimer);
            markAuthReady();
          }
        });
    }, 0);
  });

  if (Platform.OS !== 'web') {
    // 앱이 화면에 있을 때만 출입증을 자동으로 새로 받는다(Supabase 권장).
    AppState.addEventListener('change', (state) => {
      if (state === 'active') auth.startAutoRefresh();
      else auth.stopAutoRefresh();
    });
  }
}

async function applyFromAuth(event: string, authSession: SupabaseSession | null): Promise<void> {
  if (authSession === null) {
    currentUser = null;
    if (getSession() !== null) {
      resetUserData();
      clearAuthSession();
    }
    return;
  }

  const user = authSession.user;
  currentUser = user;
  const nickname = savedNickname(user);
  const existing = getSession();
  if (existing?.userId === user.id) {
    if (nickname !== '' && existing.nickname !== nickname) setSessionNickname(nickname);
    return;
  }
  if (applyingUserId === user.id) return;
  applyingUserId = user.id;
  try {
    // 닉네임을 이미 정한 계정은 한 번 시작을 끝낸 사람 → 바로 홈으로.
    // 새 기기에서 처음 들어온 경우에는 서버에 옷장·저장·취향이 있는지 보고 취향 고르기를 건너뛸지 정한다.
    let returning = nickname !== '' && event === 'INITIAL_SESSION';
    let styles: Style[] = [];
    if (!returning) {
      const [hasData, savedStyles] = await Promise.allSettled([accountHasData(user.id), fetchStylePreferences(user.id)]);
      if (hasData.status === 'fulfilled') returning = hasData.value;
      if (savedStyles.status === 'fulfilled') {
        styles = savedStyles.value;
        returning ||= styles.length > 0;
      }
    }
    // 기다리는 동안 로그아웃했거나 다른 계정으로 바뀌었으면 버린다.
    if (currentUser?.id !== user.id) return;
    loginWithAuthSession({ userId: user.id, nickname, styles, onboarded: returning });
  } finally {
    applyingUserId = null;
  }
}

export type SignInResult = 'redirected' | 'signed_in' | 'cancelled';

export async function signInWith(provider: SocialProvider): Promise<SignInResult> {
  const auth = authClient().auth;
  setAuthNotice(null);

  if (Platform.OS === 'web') {
    const { error } = await auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl() },
    });
    if (error !== null) throw error;
    return 'redirected'; // 브라우저가 카카오·구글·애플 페이지로 넘어간다.
  }

  if (provider === 'apple' && Platform.OS === 'ios' && (await AppleAuthentication.isAvailableAsync())) {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('apple_identity_token_missing');
      const name = [credential.fullName?.familyName, credential.fullName?.givenName].filter(Boolean).join('');
      if (name !== '') appleNameHint = name;
      const { error } = await auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
      if (error !== null) throw error;
      return 'signed_in';
    } catch (error) {
      if ((error as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED') return 'cancelled';
      throw error;
    }
  }

  const redirectTo = callbackUrl();
  const { data, error } = await auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error !== null || !data.url) throw error ?? new Error('oauth_url_missing');
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return 'cancelled';
  await completeFromUrl(result.url);
  return 'signed_in';
}

// 로그인·가입 뒤 돌아올 주소(이메일 확인 링크, 카카오·구글·애플).
function callbackUrl(): string {
  return Platform.OS === 'web' ? `${window.location.origin}/auth/callback` : Linking.createURL('auth/callback');
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  setAuthNotice(null);
  const { error } = await authClient().auth.signInWithPassword({ email: email.trim(), password });
  if (error !== null) throw error;
}

export type SignUpResult = 'signed_in' | 'confirm_email';

export async function signUpWithEmail(email: string, password: string, nickname: string): Promise<SignUpResult> {
  setAuthNotice(null);
  const { data, error } = await authClient().auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { [NICKNAME_KEY]: normalizeNickname(nickname) },
      emailRedirectTo: callbackUrl(),
    },
  });
  if (error !== null) throw error;
  // 메일 확인이 켜져 있으면 세션 없이 돌아온다. 이미 가입한 이메일도 보안상 같은 모양으로 온다(identities 비어 있음).
  if (data.session !== null) return 'signed_in';
  if (data.user !== null && (data.user.identities?.length ?? 0) === 0) {
    throw Object.assign(new Error('user_already_exists'), { code: 'user_already_exists' });
  }
  return 'confirm_email';
}

// Supabase 오류를 사용자에게 보여 줄 말로 바꾼다.
export function authErrorMessage(error: unknown): string {
  const code = String((error as { code?: unknown } | null)?.code ?? '');
  const message = String((error as { message?: unknown } | null)?.message ?? '');
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) return '이메일이나 비밀번호가 달라요';
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) return '메일함에서 확인 링크를 먼저 눌러 주세요';
  if (code === 'user_already_exists' || /already (registered|exists)/i.test(message)) return '이미 가입한 이메일이에요. 로그인해 주세요';
  if (code === 'weak_password') return '비밀번호를 더 길고 어렵게 정해 주세요';
  if (code === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(message)) return '이메일 주소를 다시 확인해 주세요';
  if (code === 'signup_disabled' || code === 'email_provider_disabled') return '지금은 이메일 가입을 쓸 수 없어요';
  if (/rate limit/i.test(code) || /rate limit/i.test(message)) return '잠시 후 다시 시도해 주세요';
  if (/network|fetch/i.test(message)) return '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요';
  return '로그인을 끝내지 못했어요. 잠시 후 다시 시도해 주세요';
}

// 앱에서 돌아온 주소(…/auth/callback?code=…)의 code를 출입증으로 바꾼다. 같은 code는 한 번만.
export async function completeFromUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  // 일부 공급자는 오류를 # 뒤에 붙여 돌려준다.
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const failure = params.get('error_description') ?? params.get('error') ?? hash.get('error_description') ?? hash.get('error');
  if (failure) throw new Error(failure);
  const code = params.get('code');
  if (!code) throw new Error('oauth_code_missing');
  if (exchangedCode === code) return;
  exchangedCode = code;
  const { error } = await authClient().auth.exchangeCodeForSession(code);
  if (error !== null) throw error;
}

// 처음 로그인한 사람에게 닉네임 칸에 미리 넣어 줄 이름(카카오 닉네임·구글 이름·애플 이름).
export function nicknameSuggestion(): string {
  const candidates = [
    savedNickname(currentUser),
    metaString(currentUser, 'nickname'),
    metaString(currentUser, 'name'),
    metaString(currentUser, 'full_name'),
    metaString(currentUser, 'preferred_username'),
    appleNameHint ?? '',
  ];
  const first = candidates.find((value) => value !== '') ?? '';
  return normalizeNickname(first).slice(0, NICKNAME_MAX);
}

export async function saveNickname(raw: string): Promise<void> {
  const nickname = normalizeNickname(raw);
  const { error } = await authClient().auth.updateUser({ data: { [NICKNAME_KEY]: nickname } });
  if (error !== null) throw error;
  setSessionNickname(nickname);
}

export function currentProviderLabel(): string | null {
  const provider = (currentUser?.app_metadata as Record<string, unknown> | undefined)?.provider;
  return typeof provider === 'string' && provider in PROVIDER_LABELS ? PROVIDER_LABELS[provider as AuthMethod] : null;
}

// 로그아웃: 이 기기의 출입증까지 지운다. 같은 계정으로 다시 로그인하면 옷장이 그대로 열린다.
export async function signOutSocial(): Promise<void> {
  try {
    await authClient().auth.signOut({ scope: 'local' });
  } finally {
    currentUser = null;
    resetUserData();
    clearAuthSession();
  }
}

// 서버가 출입증을 거절했을 때(401): 로그인을 풀고 로그인 화면에 "다시 로그인해 주세요"를 보여 준다.
async function expireLogin(): Promise<void> {
  if (getSession() === null) return;
  setAuthNotice('expired');
  await signOutSocial();
}

// 회원 탈퇴: 서버가 계정과 데이터를 지운 뒤 이 기기에서도 로그아웃한다.
export async function deleteMyAccount(): Promise<void> {
  await deleteAccount();
  await signOutSocial();
}

// 로그인 뒤 갈 곳: 닉네임 → 취향 고르기 → 홈.
export function nextRouteFor(session: Session): '/onboarding/nickname' | '/onboarding/taste' | '/' {
  if (ACCOUNT_LOGIN_ENABLED && session.nickname === '') return '/onboarding/nickname';
  return session.onboarded ? '/' : '/onboarding/taste';
}
