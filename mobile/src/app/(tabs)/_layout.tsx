import { Redirect, Tabs } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabIcon, type TabIconName } from '@/components/TabIcon';
import { hasSeenIntro, useSession } from '@/data/session';
import { colors, fonts, layout } from '@/theme';

// design/DESIGN.md 6절: 하단 탭 5개, 높이 76 + 위 1px 선, 고른 탭은 #6A3FC4 굵게, 나머지 #645A73.
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

  // 처음 온 사람(웹)은 튜토리얼 → 로그인 → 취향 고르기부터. 소개를 이미 봤으면(로그아웃 등) 로그인부터.
  if (session === null) return <Redirect href={hasSeenIntro() ? '/onboarding/login' : '/onboarding'} />;
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
