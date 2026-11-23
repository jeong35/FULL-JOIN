import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

export type ApiIdentity = { userId: string; accessToken: string };

let client: SupabaseClient | null = null;
let pendingIdentity: Promise<ApiIdentity> | null = null;
let appStateListenerInstalled = false;

function config(): { url: string; anonKey: string } {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
  if (url === '' || anonKey === '') {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL과 EXPO_PUBLIC_SUPABASE_ANON_KEY가 필요합니다');
  }
  return { url: url.replace(/\/+$/, ''), anonKey };
}

function authClient(): SupabaseClient {
  if (client !== null) return client;
  const { url, anonKey } = config();
  client = createClient(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  if (!appStateListenerInstalled && Platform.OS !== 'web') {
    appStateListenerInstalled = true;
    AppState.addEventListener('change', (state) => {
      if (state === 'active') client?.auth.startAutoRefresh();
      else client?.auth.stopAutoRefresh();
    });
  }
  return client;
}

async function loadIdentity(): Promise<ApiIdentity> {
  const auth = authClient().auth;
  const { data: current, error: sessionError } = await auth.getSession();
  if (sessionError !== null) throw sessionError;
  let session = current.session;

  // 정식 로그인 UI가 확정되기 전에는 Supabase 익명 사용자를 발급한다. 이후 이메일/소셜 계정에
  // 연결할 수 있지만, 기존 닉네임+PIN 데모 데이터는 정책 확정 전 자동 이전하지 않는다.
  if (session === null) {
    const { data, error } = await auth.signInAnonymously();
    if (error !== null || data.session === null) throw error ?? new Error('anonymous_auth_failed');
    session = data.session;
  }

  return { userId: session.user.id, accessToken: session.access_token };
}

export function apiIdentity(): Promise<ApiIdentity> {
  if (pendingIdentity === null) {
    pendingIdentity = loadIdentity().finally(() => {
      pendingIdentity = null;
    });
  }
  return pendingIdentity;
}

export async function authorizationHeaders(): Promise<Record<string, string>> {
  const { accessToken } = await apiIdentity();
  return { authorization: `Bearer ${accessToken}` };
}
