import { Redirect, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabIcon, type TabIconName } from '@/components/TabIcon';
import { track } from '@/data/events';
import { emitHomeTabReselect } from '@/data/homeTab';
import { hasLoggedInBefore, hasSeenIntro, useSession } from '@/data/session';
import { loadWardrobeArt } from '@/data/wardrobeLook';
import { colors, fonts, layout } from '@/theme';

// design/DESIGN.md 6절: 하단 탭 5개, 높이 76 + 위 1px 선, 고른 탭은 #6A3FC4 굵게, 나머지 #605C6B.
const TABS: { name: string; title: string; icon: TabIconName }[] = [
  { name: 'index', title: '홈', icon: 'home' },
  { name: 'recommend', title: '추천', icon: 'recommend' },
  { name: 'chat', title: '챗봇', icon: 'chat' },
  { name: 'closet', title: '옷장', icon: 'closet' },
  { name: 'my', title: '마이', icon: 'my' },
];

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const session = useSession();

  // 옷 추가·옷장의 시안 그림(약 880KB)을 앱이 뜨고 조금 뒤에 미리 불러 둔다 — 옷장에 들어갈 때 기다리지 않게(11/19).
  useEffect(() => {
    const timer = setTimeout(() => {
      loadWardrobeArt().catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // 처음 온 사람(웹)은 튜토리얼 → 로그인 → 취향 고르기부터. 소개를 이미 봤거나 이 브라우저에서 로그인한 적이 있으면
  // (로그아웃 등) 소개 없이 로그인부터.
  if (session === null) {
    return <Redirect href={hasSeenIntro() || hasLoggedInBefore() ? '/onboarding/login' : '/onboarding'} />;
  }
  if (!session.onboarded) return <Redirect href="/onboarding/taste" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.textPurple,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelPosition: 'below-icon',
        tabBarStyle: [
          styles.tabBar,
          { height: layout.tabBarHeight + insets.bottom, paddingBottom: insets.bottom },
        ],
        tabBarItemStyle: styles.tabItem,
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          listeners={({ navigation }) => ({
            tabPress: () => {
              const state = navigation.getState();
              const from = state.routes[state.index]?.name ?? 'unknown';
              track('tab_click', { from_tab: from, to_tab: tab.name, reselect: from === tab.name });
              if (tab.name === 'index' && from === 'index') emitHomeTabReselect();
            },
          })}
          options={{
            title: tab.title,
            tabBarIcon: ({ color }) => <TabIcon name={tab.icon} color={color} />,
            tabBarLabel: ({ focused, color, children }) => (
              <Text
                style={[
                  styles.label,
                  { color, fontFamily: focused ? fonts.bold : fonts.medium },
                ]}>
                {children}
              </Text>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabItem: {
    height: 52,
    justifyContent: 'flex-start',
  },
  label: {
    fontSize: 11,
    marginTop: 4,
  },
});
