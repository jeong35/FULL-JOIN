import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassView } from '@/components/GlassView';
import { KindIcon } from '@/components/KindIcon';
import { PrimaryButton } from '@/components/ui';
import { track } from '@/data/events';
import { finishOnboarding, useSession } from '@/data/session';
import { colors, fonts, layout } from '@/theme';

// 튜토리얼 ④: 준비 끝. 저장한 사진과 비교하려면 옷장이 있어야 해서 옷 넣기부터 권한다.

export default function ReadyScreen() {
  const session = useSession();
  const insets = useSafeAreaInsets();
  const taste = session?.styles ?? [];

  function goCloset() {
    track('ready_choice', { choice: 'closet' });
    finishOnboarding();
    router.replace('/closet');
    router.push('/add-item/kind');
  }

  function goFeed() {
    track('ready_choice', { choice: 'feed' });
    finishOnboarding();
    router.replace('/');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.body}>
        <View style={styles.icons}>
          <GlassView radius={0} style={styles.iconCard}>
            <KindIcon kind="카디건" color="아이보리" fit="레귤러" size={56} />
          </GlassView>
          <GlassView radius={0} style={[styles.iconCard, styles.iconCardMiddle]}>
            <KindIcon kind="데님팬츠" color="연청" fit="와이드" size={56} />
          </GlassView>
          <GlassView radius={0} style={styles.iconCard}>
            <KindIcon kind="로퍼" color="브라운" size={56} />
          </GlassView>
        </View>

        <Text style={styles.title}>{session?.nickname ? `${session.nickname}님, ` : ''}준비 끝!</Text>
        {taste.length > 0 ? (
          <View style={styles.tasteBox}>
            <Text style={styles.text}>내 추구미</Text>
            <View style={styles.chips}>
              {taste.map((style) => (
                <View key={style} style={styles.chip}>
                  <Text style={styles.chipText}>{style}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.text}>이 스타일 사진부터 피드에 보여 드릴게요.</Text>
          </View>
        ) : (
          <Text style={styles.text}>추구미는 마이 탭에서 언제든 고를 수 있어요.</Text>
        )}
        <Text style={[styles.text, styles.closetHint]}>
          먼저 가진 옷을 몇 벌 넣어 주세요.{'\n'}그래야 저장한 사진을 내 옷장과 비교할 수 있어요.
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(24, insets.bottom) }]}>
        <PrimaryButton label="옷장에 옷 넣으러 가기" onPress={goCloset} />
        <Pressable onPress={goFeed} accessibilityRole="button" style={styles.later} hitSlop={8}>
          <Text style={styles.laterText}>피드 먼저 볼게요</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  icons: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'flex-end',
    gap: 10,
    marginBottom: 36,
  },
  iconCard: {
    width: 84,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCardMiddle: {
    height: 108,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    letterSpacing: -0.4,
    color: colors.text,
  },
  tasteBox: {
    marginTop: 12,
    gap: 8,
  },
  chips: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 7,
    backgroundColor: colors.purpleFill,
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.onPurpleFill,
  },
  text: {
    marginTop: 4,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 23,
    color: colors.textSecondary,
  },
  closetHint: {
    marginTop: 18,
    color: colors.text,
  },
  footer: {
    paddingTop: 12,
    paddingHorizontal: layout.screenPaddingX,
    gap: 14,
  },
  later: {
    alignSelf: 'center',
  },
  laterText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textSecondary,
  },
});
