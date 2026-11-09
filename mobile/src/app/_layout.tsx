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

import { useSession } from '@/data/session';
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

  // 로그인한 사용자가 정해지면(바뀌면) 그 사람의 옷장과 피드를 서버에서 받아 둔다.
  useEffect(() => {
    if (userId === null) return;
    if (previousUserId.current !== null && previousUserId.current !== userId) resetUserData();
    previousUserId.current = userId;
    loadWardrobe();
    loadFeed();
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
