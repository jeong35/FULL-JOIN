import { Redirect, router, Tabs, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HintBubble } from '@/components/HintBubble';
import { TabIcon, type TabIconName } from '@/components/TabIcon';
import { track } from '@/data/events';
import { emitHomeTabReselect } from '@/data/homeTab';
import { markHintDone, useHintOpen } from '@/data/hints';
import { hasLoggedInBefore, hasSeenIntro, useSession } from '@/data/session';
import { loadWardrobeArt } from '@/data/wardrobeLook';
import { colors, fonts, layout } from '@/theme';

// design/DESIGN.md 6절: 하단 탭 5개, 높이 76 + 위 1px 선, 고른 탭은 보라(textPurple) 굵게, 나머지 #605C6B.
// 11/24 멘토 피드백 반영: 홈 · 저장(전 홈의 '모든 저장') · 코디(전 추천) · 옷장 · 마이.
// 챗봇은 탭에서 빼고 오른쪽 아래 동그란 버튼으로 연다(챗봇 화면 파일은 그대로 (tabs)/chat.tsx).
const TABS: { name: string; title: string; icon: TabIconName }[] = [
  { name: 'index', title: '홈', icon: 'home' },
  { name: 'saved', title: '저장', icon: 'saved' },
  { name: 'recommend', title: '코디', icon: 'recommend' },
  { name: 'closet', title: '옷장', icon: 'closet' },
  { name: 'my', title: '마이', icon: 'my' },
];
const CHAT_BUTTON_SIZE = 56;
// 챗봇 버튼 안내 말풍선 너비. 꼬리는 버튼 가운데(오른쪽 끝에서 버튼 반지름만큼 안쪽)를 가리킨다.
const CHAT_HINT_WIDTH = 264;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const session = useSession();
  const pathname = usePathname();
  const chatHintOpen = useHintOpen('chat_button');
  // 홈 첫 화면에 추구미 안내 말풍선이 떠 있는 동안은 챗봇 말풍선을 같이 띄우지 않는다(말풍선은 한 번에 하나).
  const feedTasteOpen = useHintOpen('feed_taste');
  const showChatHint = pathname !== '/chat' && chatHintOpen && (pathname !== '/' || !feedTasteOpen);

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
    <View style={styles.root}>
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
      {/* 챗봇은 탭 버튼만 숨긴다. href: null로 숨기면 expo-router 58에서는 '숨긴 탭'이 되어
          /chat으로 가도 첫 탭(홈)으로 돌려보낸다(11/25 확인) — 그래서 버튼 칸만 안 보이게 한다. */}
      <Tabs.Screen name="chat" options={{ title: '챗봇', tabBarItemStyle: { display: 'none' } }} />
    </Tabs>
    {showChatHint && (
      <HintBubble
        id="chat_button"
        text="궁금한 건 챗봇에게 물어보세요! 저장한 사진이나 내 옷장으로 뭘 입을지 같이 골라 드려요"
        actionLabel="물어보기"
        tail="down"
        tailX={CHAT_HINT_WIDTH - CHAT_BUTTON_SIZE / 2}
        onPress={() => router.navigate('/chat')}
        style={[styles.chatHint, { bottom: layout.tabBarHeight + insets.bottom + 14 + CHAT_BUTTON_SIZE + 12 }]}
      />
    )}
    {pathname !== '/chat' && (
      <Pressable
        onPress={() => {
          markHintDone('chat_button');
          track('tab_click', { from_tab: pathname === '/' ? 'index' : pathname.slice(1), to_tab: 'chat', via: 'chat_button' });
          router.navigate('/chat');
        }}
        accessibilityRole="button"
        accessibilityLabel="챗봇에게 물어보기"
        style={[styles.chatButton, { bottom: layout.tabBarHeight + insets.bottom + 14 }]}>
        <TabIcon name="chat" color={colors.onPurpleFill} size={26} />
      </Pressable>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  chatHint: {
    position: 'absolute',
    right: 16,
    width: CHAT_HINT_WIDTH,
  },
  chatButton: {
    position: 'absolute',
    right: 16,
    width: CHAT_BUTTON_SIZE,
    height: CHAT_BUTTON_SIZE,
    borderRadius: CHAT_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    // 11/22 색 규칙: 진한 연보라 바탕(purpleFill)은 큰 버튼에만 — 챗봇 버튼도 큰 버튼과 같은 색으로 둔다.
    backgroundColor: colors.purpleFill,
    boxShadow: '0 4px 14px rgba(30,20,50,0.16)',
  },
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
