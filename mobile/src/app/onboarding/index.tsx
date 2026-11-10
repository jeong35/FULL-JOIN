import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassView } from '@/components/GlassView';
import { BookmarkIcon } from '@/components/Icons';
import { KindIcon } from '@/components/KindIcon';
import { PrimaryButton } from '@/components/ui';
import type { Color, Kind, VisualFit } from '@/data/catalog';
import { track } from '@/data/events';
import { getSession, hasLoggedInBefore, markIntroSeen } from '@/data/session';
import { colors, fonts, layout } from '@/theme';

// 튜토리얼 ①: 앱 소개 3장. 처음 연 사람(웹)은 여기서 시작해 로그인 → 취향 고르기로 간다.
// 마이 탭의 '튜토리얼 다시 보기'로 오면(replay=1) 마지막에 닫기만 한다.
// '건너뛰기'는 이 브라우저에서 로그인한 적이 있는 사람에게만 보여 준다. 처음 온 사람은 핵심(활용·비슷함·필요)을 알고
// 시작하도록 3장을 끝까지 본다(11/10 결정).

type Slide = { title: string; body: string; picture: ReactNode };

const SLIDES: Slide[] = [
  {
    title: '따라 입고 싶은 사진을\n저장해요',
    body: '피드에서 마음에 드는 코디 사진의 저장 버튼을 눌러요.',
    picture: <FeedPicture />,
  },
  {
    title: '내 옷장과\n비교해 드려요',
    body: '사진 속 옷마다 가진 옷으로 되는지(활용), 비슷한 옷이 있는지(비슷함), 새로 필요한지(필요) 알려 줘요.',
    picture: <ResultPicture />,
  },
  {
    title: '옷장은\n네 번만 고르면 끝',
    body: '부위 → 종류 → 색 → 핏을 고르면 옷 한 벌이 등록돼요. 사진은 안 찍어도 돼요.',
    picture: <ClosetPicture />,
  },
];

export default function OnboardingIntroScreen() {
  const { replay } = useLocalSearchParams<{ replay?: string }>();
  const isReplay = replay === '1';
  const [index, setIndex] = useState(0);
  const insets = useSafeAreaInsets();
  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;
  const canSkip = isReplay || hasLoggedInBefore();

  useEffect(() => {
    if (!isReplay) track('intro_view', { step: index + 1 });
  }, [index, isReplay]);

  function next() {
    if (!isReplay) track('intro_next', { step: index + 1 });
    setIndex(index + 1);
  }

  function previous() {
    if (!isReplay) track('intro_prev', { step: index + 1 });
    setIndex(index - 1);
  }

  function skip() {
    if (!isReplay) track('intro_skip', { step: index + 1 });
    finish();
  }

  function done() {
    if (!isReplay) track('intro_done');
    finish();
  }

  function finish() {
    if (isReplay) {
      if (router.canGoBack()) router.back();
      else router.replace('/');
      return;
    }
    markIntroSeen();
    const session = getSession();
    if (session === null) router.push('/onboarding/login');
    else router.replace('/onboarding/taste');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.top}>
        <Text style={styles.logo} accessibilityRole="header">
          odit.
        </Text>
        {!last && canSkip && (
          <Pressable onPress={skip} accessibilityRole="button" hitSlop={10}>
            <Text style={styles.skip}>{isReplay ? '닫기' : '건너뛰기'}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.picture}>{slide.picture}</View>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.text}>{slide.body}</Text>
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(24, insets.bottom) }]}>
        <View style={styles.dots} accessibilityLabel={`${SLIDES.length}장 중 ${index + 1}번째`}>
          {SLIDES.map((s, i) => (
            <View key={s.title} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <PrimaryButton
          label={last ? (isReplay ? '닫기' : '시작하기') : '다음'}
          onPress={last ? done : next}
        />
        {index > 0 && (
          <Pressable onPress={previous} accessibilityRole="button" style={styles.prev} hitSlop={8}>
            <Text style={styles.prevText}>이전</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

// ── 그림 ① 피드: 사진 네 칸 + 저장 버튼 ──
function FeedPicture() {
  return (
    <View style={pic.feed}>
      {[0, 1].map((column) => (
        <View key={column} style={pic.feedColumn}>
          {[0, 1].map((row) => {
            const tall = (column + row) % 2 === 0;
            const saved = column === 1 && row === 0;
            return (
              <View
                key={row}
                style={[pic.feedPhoto, { height: tall ? 128 : 92, backgroundColor: tall ? colors.line : '#DFD5F0' }]}>
                {saved && (
                  <GlassView radius={16} style={pic.saveButton}>
                    <BookmarkIcon color={colors.text} filled size={14} />
                  </GlassView>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ── 그림 ② 결과: 옷 세 벌과 활용·비슷함·필요 ──
const RESULT_ROWS: { kind: Kind; color: Color; fit: VisualFit | null; label: string; tag: '활용' | '비슷함' | '필요' }[] = [
  { kind: '니트', color: '아이보리', fit: '레귤러', label: '니트 · 아이보리', tag: '활용' },
  { kind: '데님팬츠', color: '중청', fit: '일자', label: '데님팬츠 · 중청', tag: '비슷함' },
  { kind: '부츠', color: '블랙', fit: null, label: '부츠 · 블랙', tag: '필요' },
];

function ResultPicture() {
  return (
    <GlassView radius={16} style={pic.result}>
      {RESULT_ROWS.map((row) => (
        <View key={row.kind} style={pic.resultRow}>
          <View style={pic.resultIcon}>
            <KindIcon kind={row.kind} color={row.color} fit={row.fit} size={36} />
          </View>
          <Text style={pic.resultLabel}>{row.label}</Text>
          <View
            style={[
              pic.tag,
              row.tag === '활용' ? pic.tagUse : row.tag === '비슷함' ? pic.tagSimilar : pic.tagNeed,
            ]}>
            <Text style={[pic.tagText, row.tag === '활용' && pic.tagTextUse]}>{row.tag}</Text>
          </View>
        </View>
      ))}
    </GlassView>
  );
}

// ── 그림 ③ 옷장: 고르는 순서 + 옷 세 벌 ──
const CLOSET: { kind: Kind; color: Color; fit: VisualFit | null }[] = [
  { kind: '반소매티셔츠', color: '화이트', fit: '레귤러' },
  { kind: '슬랙스', color: '베이지', fit: '와이드' },
  { kind: '스니커즈', color: '그레이', fit: null },
];

function ClosetPicture() {
  return (
    <View style={pic.closet}>
      <View style={pic.steps}>
        {['부위', '종류', '색', '핏'].map((step, i) => (
          <View key={step} style={pic.step}>
            <Text style={pic.stepNumber}>{i + 1}</Text>
            <Text style={pic.stepText}>{step}</Text>
          </View>
        ))}
      </View>
      <View style={pic.closetRow}>
        {CLOSET.map((item) => (
          <GlassView key={item.kind} radius={0} style={pic.closetCard}>
            <View style={pic.closetImage}>
              <KindIcon kind={item.kind} color={item.color} fit={item.fit} size={52} />
            </View>
            <Text style={pic.closetName}>{item.kind}</Text>
          </GlassView>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 70,
    paddingTop: 24,
    paddingHorizontal: layout.screenPaddingX,
  },
  logo: {
    fontFamily: fonts.extraBold,
    fontSize: 26,
    letterSpacing: -0.5,
    color: colors.textPurple,
  },
  skip: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textSecondary,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  picture: {
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    lineHeight: 33,
    letterSpacing: -0.4,
    color: colors.text,
  },
  text: {
    marginTop: 10,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 23,
    color: colors.textSecondary,
  },
  footer: {
    paddingTop: 12,
    paddingHorizontal: layout.screenPaddingX,
    gap: 14,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.progressTrack,
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.purpleStrong,
  },
  prev: {
    alignSelf: 'center',
  },
  prevText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.textSecondary,
  },
});

const pic = StyleSheet.create({
  feed: {
    flexDirection: 'row',
    gap: 3,
    width: 200,
  },
  feedColumn: {
    flex: 1,
    gap: 3,
  },
  feedPhoto: {
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: 6,
  },
  saveButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  result: {
    width: 290,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  resultIcon: {
    width: 42,
    height: 42,
    backgroundColor: colors.photoPlaceholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultLabel: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.text,
  },
  tag: {
    height: 26,
    paddingHorizontal: 11,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagUse: {
    backgroundColor: colors.purpleFill,
  },
  tagSimilar: {
    borderWidth: 1,
    borderColor: colors.purpleFill,
    backgroundColor: colors.white,
  },
  tagNeed: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.purpleStrong,
  },
  tagText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.tagText,
  },
  tagTextUse: {
    color: colors.onPurpleFill,
  },
  closet: {
    alignItems: 'center',
    gap: 18,
  },
  steps: {
    flexDirection: 'row',
    gap: 8,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 15,
    backgroundColor: colors.white,
  },
  stepNumber: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    color: colors.textPurple,
  },
  stepText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.text,
  },
  closetRow: {
    flexDirection: 'row',
    gap: 10,
  },
  closetCard: {
    width: 88,
    padding: 7,
  },
  closetImage: {
    height: 64,
    backgroundColor: colors.photoPlaceholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closetName: {
    marginTop: 7,
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.text,
  },
});
