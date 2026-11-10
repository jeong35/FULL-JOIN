import {
  NotoSansKR_400Regular,
  NotoSansKR_500Medium,
  NotoSansKR_700Bold,
  NotoSansKR_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/noto-sans-kr';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AppState, Platform } from 'react-native';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { fetchStylePreferences, updateStylePreferences } from '@/data/api';
import { flushEvents, track } from '@/data/events';
import { getSession, restoreStyles, useSession } from '@/data/session';
import { loadFeed, loadWardrobe, resetUserData } from '@/data/store';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

const subscribeNothing = () => () => {};

function analyticsScreen(pathname: string): string {
  if (/^\/style\/[^/]+$/.test(pathname)) return 'style_detail';
  if (/^\/result\/[^/]+$/.test(pathname)) return 'result';
  if (pathname === '/') return 'feed';
  if (pathname === '/closet') return 'wardrobe';
  if (pathname === '/chat') return 'chat';
  if (pathname === '/my') return 'my';
  if (pathname === '/recommend') return 'recommend';
  if (pathname === '/onboarding') return 'intro';
  if (pathname === '/onboarding/login') return 'login';
  if (pathname === '/onboarding/taste') return 'taste';
  if (pathname === '/onboarding/ready') return 'ready';
  if (pathname === '/add-item/kind') return 'wardrobe_add_kind';
  if (pathname === '/add-item/color-fit') return 'wardrobe_add_color_fit';
  return pathname.replace(/^\//, '').replaceAll('/', '_') || 'unknown';
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    NotoSansKR_400Regular,
    NotoSansKR_500Medium,
    NotoSansKR_700Bold,
    NotoSansKR_800ExtraBold,
  });

  const ready = fontsLoaded || fontError !== null;
  const session = useSession();
  const pathname = usePathname();
  const screenVisit = useRef<{ screen: string; startedAt: number } | null>(null);
  const backgroundRecorded = useRef(false);
  const userId = session?.userId ?? null;
  const previousUserId = useRef<string | null>(null);
  // 웹에서는 로그인 정보가 브라우저에만 있어서, 화면은 브라우저에서 그릴 때부터 만든다(서버에서 미리 그릴 땐 false).
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);

  // 경로가 바뀔 때 화면 진입·이탈과 체류 시간을 공통으로 기록한다.
  useEffect(() => {
    if (!mounted) return;
    const now = Date.now();
    const screen = analyticsScreen(pathname);
    const previous = screenVisit.current;
    if (previous !== null && previous.screen !== screen) {
      track('screen_leave', {
        screen: previous.screen,
        next_screen: screen,
        duration_ms: Math.max(0, now - previous.startedAt),
      });
    }
    if (previous === null || previous.screen !== screen) {
      track('screen_view', { screen, previous_screen: previous?.screen ?? null });
      screenVisit.current = { screen, startedAt: now };
    }
  }, [mounted, pathname]);

  // 화면을 닫거나 다른 앱으로 가는 경우에는 일반 screen_leave가 없으므로 별도 기록한다.
  useEffect(() => {
    if (!mounted) return;
    const recordBackground = () => {
      if (backgroundRecorded.current) return;
      const current = screenVisit.current;
      if (current === null) return;
      backgroundRecorded.current = true;
      track('app_background', {
        screen: current.screen,
        duration_ms: Math.max(0, Date.now() - current.startedAt),
      });
      flushEvents();
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined' && typeof window !== 'undefined') {
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') recordBackground();
        else if (screenVisit.current !== null) {
          backgroundRecorded.current = false;
          screenVisit.current.startedAt = Date.now();
        }
      };
      window.addEventListener('pagehide', recordBackground);
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        window.removeEventListener('pagehide', recordBackground);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        backgroundRecorded.current = false;
        if (screenVisit.current !== null) screenVisit.current.startedAt = Date.now();
      } else {
        recordBackground();
      }
    });
    return () => sub.remove();
  }, [mounted]);

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
