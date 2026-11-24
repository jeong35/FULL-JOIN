import * as Linking from 'expo-linking';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/ui';
import { ACCOUNT_LOGIN_ENABLED } from '@/data/authConfig';
import { track } from '@/data/events';
import { useAuthReady, useSession } from '@/data/session';
import { completeFromUrl, nextRouteFor } from '@/data/socialAuth';
import { colors, fonts, layout } from '@/theme';

// 카카오·구글·애플 로그인에서 돌아오는 곳.
// - 웹: Supabase가 주소의 code를 알아서 출입증으로 바꾼다(detectSessionInUrl). 세션이 생기면 다음 화면으로.
// - 앱: 보통은 signInWith가 이미 처리하지만, 앱 주소로 바로 열린 경우에는 여기서 code를 바꾼다.
// 15초 안에 로그인이 안 되면 실패 안내.

const GIVE_UP_MS = 15_000;

function failureFromWebUrl(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return search.get('error_description') ?? search.get('error') ?? hash.get('error_description') ?? hash.get('error');
}

export default function AuthCallbackScreen() {
  const session = useSession();
  const ready = useAuthReady();
  const url = Linking.useLinkingURL();
  const [failed, setFailed] = useState(() => failureFromWebUrl() !== null);

  useEffect(() => {
    if (Platform.OS === 'web' || url === null || !url.includes('code=')) return;
    completeFromUrl(url).catch(() => setFailed(true));
  }, [url]);

  useEffect(() => {
    if (session !== null) return;
    const timer = setTimeout(() => setFailed(true), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [session]);

  useEffect(() => {
    if (session === null) return;
    track('login_success', { returning: session.onboarded });
    router.replace(nextRouteFor(session));
  }, [session]);

  useEffect(() => {
    if (!failed) return;
    track('login_failed', { error_code: 'oauth_callback_failed' });
    track('error_shown', { screen: 'auth_callback', error_code: 'oauth_callback_failed' });
  }, [failed]);

  if (!ACCOUNT_LOGIN_ENABLED) return <Redirect href="/" />;

  return (
    <View style={styles.container}>
      {failed && session === null ? (
        <>
          <Text style={styles.title}>로그인을 끝내지 못했어요</Text>
          <Text style={styles.body}>잠시 후 다시 시도해 주세요.</Text>
          <View style={styles.button}>
            <PrimaryButton label="로그인 화면으로" onPress={() => router.replace('/onboarding/login')} />
          </View>
        </>
      ) : (
        <Text style={styles.body}>{ready ? '로그인하는 중…' : '확인하는 중…'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenPaddingX,
    backgroundColor: colors.background,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.text,
  },
  body: {
    marginTop: 8,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
  },
  button: {
    marginTop: 24,
    alignSelf: 'stretch',
  },
});
