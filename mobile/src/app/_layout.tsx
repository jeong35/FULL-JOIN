import {
  NotoSansKR_400Regular,
  NotoSansKR_500Medium,
  NotoSansKR_700Bold,
  NotoSansKR_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/noto-sans-kr';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { fetchStylePreferences, updateStylePreferences } from '@/data/api';
import { track } from '@/data/events';
import { getSession, restoreStyles, useSession } from '@/data/session';
import { loadFeed, loadWardrobe, resetUserData } from '@/data/store';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

const subscribeNothing = () => () => {};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    NotoSansKR_400Regular,
    NotoSansKR_500Medium,
    NotoSansKR_700Bold,
    NotoSansKR_800ExtraBold,
  });

  const ready = fontsLoaded || fontError !== null;
  const session = useSession();
  const userId = session?.userId ?? null;
  const previousUserId = useRef<string | null>(null);
  // 웹에서는 로그인 정보가 브라우저에만 있어서, 화면은 브라우저에서 그릴 때부터 만든다(서버에서 미리 그릴 땐 false).
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);

  // 앱을 연 횟수(재방문)와 처음 들어온 주소를 남긴다. 로그인 여부도 같이 본다.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    track('app_open', { path: window.location?.pathname ?? null, logged_in: getSession() !== null });
  }, []);

  // 로그인한 사용자가 정해지면(바뀌면) 그 사람의 옷장과 피드를 서버에서 받아 둔다.
  useEffect(() => {
    if (userId === null) return;
    if (previousUserId.current !== null && previousUserId.current !== userId) resetUserData();
    previousUserId.current = userId;
    loadWardrobe();
    loadFeed();
    void fetchStylePreferences(userId)
      .then(async (styles) => {
        const current = getSession();
        // 이 기능을 배포하기 전에 브라우저에만 있던 선택은 서버가 비어 있을 때 최초 1회 옮긴다.
        if (styles.length === 0 && current?.userId === userId && current.styles.length > 0) {
          restoreStyles(userId, await updateStylePreferences(current.styles));
          return;
        }
        restoreStyles(userId, styles);
      })
      .catch(() => {
        // 네트워크 오류면 브라우저에 남은 추구미를 유지한다.
      });
  }, [userId]);

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready || !mounted) {
    return null;
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </>
  );
}
