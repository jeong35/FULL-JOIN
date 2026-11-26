import { Redirect, router, Tabs, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassView } from '@/components/GlassView';
import { HintBubble } from '@/components/HintBubble';
import { CHAT_BUTTON_SIZE, TAB_BAR_GAP, TAB_BAR_HEIGHT as BAR_HEIGHT, useTabBarBottom } from '@/components/tabBarSpace';
import { TabIcon, type TabIconName } from '@/components/TabIcon';
import { track } from '@/data/events';
import { emitHomeTabReselect } from '@/data/homeTab';
import { markHintDone, useHintOpen } from '@/data/hints';
import { hasLoggedInBefore, hasSeenIntro, useSession } from '@/data/session';
import { loadWardrobeArt } from '@/data/wardrobeLook';
import { colors, fonts } from '@/theme';

// design/DESIGN.md 6절: 하단 탭 5개, 높이 76 + 위 1px 선, 고른 탭은 보라(textPurple) 굵게, 나머지 #605C6B.
// 11/26: 바닥에 붙은 탭바 → 화면 위에 떠 있는 둥근 유리 탭바(높이 64, 아래 12 또는 홈 막대만큼 띄움). 크기·여백은 components/tabBarSpace.ts.
// 11/24 멘토 피드백 반영: 홈 · 저장(전 홈의 '모든 저장') · 코디(전 추천) · 옷장 · 마이.
// 챗봇은 탭에서 빼고 오른쪽 아래 동그란 버튼으로 연다(챗봇 화면 파일은 그대로 (tabs)/chat.tsx).
const TABS: { name: string; title: string; icon: TabIconName }[] = [
  { name: 'index', title: '홈', icon: 'home' },
  { name: 'saved', title: '저장', icon: 'saved' },
  { name: 'recommend', title: '코디', icon: 'recommend' },
  { name: 'closet', title: '옷장', icon: 'closet' },
  { name: 'my', title: '마이', icon: 'my' },
];
// 챗봇 버튼 안내 말풍선 너비. 꼬리는 버튼 가운데(오른쪽 끝에서 버튼 반지름만큼 안쪽)를 가리킨다.
const CHAT_HINT_WIDTH = 264;

export default function TabLayout() {
  const barBottom = useTabBarBottom();
  const session = useSession();
  const pathname = usePathname();
  const chatHintOpen = useHintOpen('chat_button');
  // 11/26: 홈의 추구미 안내 말풍선(feed_taste)을 빼서, 챗봇 말풍선은 그 말풍선을 기다리지 않는다.
  const showChatHint = pathname !== '/chat' && chatHintOpen;

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
        // 11/26: 바닥에 붙은 탭바 → 화면 위에 떠 있는 둥근 유리 탭바(뒤로 내용이 비친다). 고른 탭은 연보라 알약.
        tabBarStyle: [styles.tabBar, { bottom: barBottom }],
        tabBarItemStyle: styles.tabItem,
        tabBarActiveBackgroundColor: 'rgba(108, 84, 214, 0.12)',
        tabBarBackground: () => <GlassView radius={BAR_HEIGHT / 2} tint="rgba(255,255,255,0.72)" style={StyleSheet.absoluteFill} />,
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
      {/* 챗봇은 아래 입력칸이 탭바에 가리지 않게 탭바를 떠 있게 하지 않고 화면 아래 자리를 차지하게 둔다. */}
      <Tabs.Screen
        name="chat"
        options={{ title: '챗봇', tabBarItemStyle: { display: 'none' }, tabBarStyle: [styles.tabBar, styles.tabBarInFlow, { marginBottom: barBottom }] }}
      />
    </Tabs>
    {showChatHint && (
      <HintBubble
        id="chat_button"
        text="궁금한 건 챗봇에게 물어보세요! 저장한 사진이나 내 옷장으로 뭘 입을지 같이 골라 드려요"
        actionLabel="물어보기"
        tail="down"
        tailX={CHAT_HINT_WIDTH - CHAT_BUTTON_SIZE / 2}
        onPress={() => router.navigate('/chat')}
        style={[styles.chatHint, { bottom: barBottom + BAR_HEIGHT + TAB_BAR_GAP + CHAT_BUTTON_SIZE + 12 }]}
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
        style={[styles.chatButton, { bottom: barBottom + BAR_HEIGHT + TAB_BAR_GAP }]}>
        {/* 11/26: 챗봇 버튼도 연보라 유리 */}
        <GlassView radius={CHAT_BUTTON_SIZE / 2} tint="rgba(196,182,246,0.82)" style={StyleSheet.absoluteFill} />
        {/* 웹에서 아이콘이 유리 층 아래로 숨지 않게 한 번 감싼다(감싼 View가 유리 층보다 뒤에 그려져 위로 올라온다). */}
        <View pointerEvents="none">
          <TabIcon name="chat" color={colors.onPurpleFill} size={26} />
        </View>
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
  },
  tabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: BAR_HEIGHT,
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 6,
    borderRadius: BAR_HEIGHT / 2,
    borderTopWidth: 0,
    backgroundColor: 'transparent',
    elevation: 0,
    shadowOpacity: 0,
    boxShadow: '0 10px 30px rgba(30,20,50,0.14)',
  },
  tabBarInFlow: {
    position: 'relative',
    left: 0,
    right: 0,
    bottom: 0,
    marginHorizontal: 16,
  },
  tabItem: {
    height: 52,
    marginTop: 6,
    marginHorizontal: 2,
    borderRadius: 26,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  label: {
    fontSize: 11,
    marginTop: 2,
  },
});
