import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckMark } from '@/components/Icons';
import { DetailHeader, PrimaryButton } from '@/components/ui';
import { errorMessage, updateStylePreferences } from '@/data/api';
import { STYLES, type Style } from '@/data/catalog';
import { track } from '@/data/events';
import { saveStyles, useSession } from '@/data/session';
import { loadFeed, useFeedState } from '@/data/store';
import type { StyleImage } from '@/data/types';
import { colors, fonts, layout } from '@/theme';

// 튜토리얼 ③: 내 추구미 고르기. 스타일 카드 11개 중 1~3개를 고르면 그대로 취향이 된다
// (SPEC AC15의 '온보딩에서 고른 취향 스타일'). 카드 사진은 피드에서 그 스타일 사진을 한 장씩 자동으로 가져온다.
// 마이 탭의 '다시 고르기'로 오면(replay=1) 저장하고 돌아간다.

const MAX_PICKS = 3;
const GRID_GAP = 8;
const GRID_COLUMNS = 3;

// 한 줄 설명: src/fulljoin/prompts/parse_query.md의 스타일 정의를 줄인 것.
const STYLE_DESC: Record<Style, string> = {
  캐주얼: '편한 데일리룩',
  미니멀: '무채색, 깔끔',
  러블리: '파스텔·리본·프릴',
  청순: '연한 색, 단정',
  엘레강스: '우아하고 성숙',
  시크: '블랙, 도회적',
  스트릿: '오버핏·그래픽',
  레트로: '빈티지 감성',
  프레피: '단정한 학생풍',
  스포티: '트레이닝·레깅스',
  글램: '화려하고 반짝',
};

// 스타일마다 그 스타일이 첫째로 붙은 사진을 한 장씩(겹치지 않게) 고른다. 늘 같은 결과.
function coverPhotos(images: readonly StyleImage[]): Partial<Record<Style, StyleImage>> {
  const used = new Set<string>();
  const covers: Partial<Record<Style, StyleImage>> = {};
  for (const style of STYLES) {
    const image =
      images.find((i) => !used.has(i.id) && i.style[0] === style) ??
      images.find((i) => !used.has(i.id) && i.style.includes(style));
    if (image !== undefined) {
      used.add(image.id);
      covers[style] = image;
    }
  }
  return covers;
}

export default function TasteScreen() {
  const { replay } = useLocalSearchParams<{ replay?: string }>();
  const isReplay = replay === '1';
  const session = useSession();
  const feed = useFeedState();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<Style[]>(() => (isReplay ? (session?.styles ?? []) : []));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (session !== null) loadFeed();
  }, [session]);

  // 튜토리얼 이탈 지점을 재려고 첫 고르기에서만 남긴다(마이 탭의 다시 고르기는 빼고).
  useEffect(() => {
    if (!isReplay) track('taste_view');
  }, [isReplay]);

  // 로그인 없이 이 주소로 바로 온 경우.
  useEffect(() => {
    if (session === null) router.replace('/onboarding');
  }, [session]);

  const covers = useMemo(() => coverPhotos(feed.data), [feed.data]);
  const cardWidth = (width - layout.screenPaddingX * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

  function toggle(style: Style) {
    setPicked((current) => {
      if (current.includes(style)) {
        const next = current.filter((s) => s !== style);
        track('taste_deselect', { style, selected_count: next.length, replay: isReplay });
        return next;
      }
      if (current.length >= MAX_PICKS) {
        track('taste_limit_reached', { selected_count: current.length, style, replay: isReplay });
        const next = [...current.slice(1), style];
        track('taste_select', { style, selected_count: next.length, replay: isReplay });
        return next;
      }
      const next = [...current, style];
      track('taste_select', { style, selected_count: next.length, replay: isReplay });
      return next;
    });
  }

  async function done(styles: Style[]) {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await updateStylePreferences(styles);
      saveStyles(saved);
      if (!isReplay) {
        if (styles.length > 0) track('taste_done', { count: styles.length });
        else track('taste_later');
      }
      if (isReplay) {
        if (router.canGoBack()) router.back();
        else router.replace('/my');
      } else {
        router.replace('/onboarding/ready');
      }
    } catch (error) {
      const message = errorMessage(error);
      track('taste_save_failed', { error_code: message, count: styles.length, replay: isReplay });
      track('error_shown', { screen: 'taste', error_code: message });
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {isReplay ? (
        <DetailHeader title="내 추구미 다시 고르기" onBack={() => (router.canGoBack() ? router.back() : router.replace('/my'))} />
      ) : (
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            내 추구미 고르기
          </Text>
        </View>
      )}
      <Text style={styles.lead}>
        마음에 드는 스타일을 {MAX_PICKS}개까지 골라 주세요.{'\n'}고른 스타일 사진을 피드에서 먼저 보여 드려요.
      </Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.grid}>
        {STYLES.map((style) => {
          const selected = picked.includes(style);
          const cover = covers[style];
          return (
            <Pressable
              key={style}
              onPress={() => toggle(style)}
              accessibilityRole="button"
              accessibilityLabel={style}
              accessibilityState={{ selected }}
              style={[styles.card, { width: cardWidth }, selected && styles.cardSelected]}>
              <View style={styles.cardPhoto}>
                {cover !== undefined && (
                  <Image
                    source={{ uri: cover.thumbnail_url, cacheKey: cover.id }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={150}
                  />
                )}
              </View>
              <Text style={[styles.cardName, selected && styles.cardNameSelected]}>{style}</Text>
              <Text style={styles.cardDesc} numberOfLines={1}>
                {STYLE_DESC[style]}
              </Text>
              {selected && (
                <View style={styles.check}>
                  <CheckMark size={20} />
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(24, insets.bottom) }]}>
        {saveError !== null && <Text style={styles.saveError}>{saveError}</Text>}
        <PrimaryButton
          label={saving ? '저장하는 중…' : picked.length === 0 ? '스타일을 골라 주세요' : `다음 (${picked.length}/${MAX_PICKS})`}
          onPress={() => void done(picked)}
          disabled={saving || picked.length === 0}
        />
        {!isReplay && (
          <Pressable onPress={() => void done([])} disabled={saving} accessibilityRole="button" style={styles.later} hitSlop={8}>
            <Text style={styles.laterText}>나중에 고를게요</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: 28,
    paddingHorizontal: layout.screenPaddingX,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    letterSpacing: -0.4,
    color: colors.text,
  },
  lead: {
    marginTop: 8,
    marginBottom: 14,
    paddingHorizontal: layout.screenPaddingX,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  scroll: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: 16,
  },
  // 카드는 각진 네모(옷 추가 종류 카드와 같은 느낌). 고르면 보라 테두리.
  card: {
    padding: 5,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  cardSelected: {
    padding: 4,
    borderWidth: 2,
    borderColor: colors.purpleStrong,
    backgroundColor: colors.white,
  },
  cardPhoto: {
    aspectRatio: 1,
    overflow: 'hidden',
    backgroundColor: colors.photoPlaceholder,
  },
  cardName: {
    marginTop: 6,
    marginHorizontal: 2,
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.text,
  },
  cardNameSelected: {
    color: colors.textPurple,
  },
  cardDesc: {
    marginTop: 1,
    marginHorizontal: 2,
    marginBottom: 2,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
  },
  check: {
    position: 'absolute',
    top: 9,
    right: 9,
  },
  footer: {
    paddingTop: 12,
    paddingHorizontal: layout.screenPaddingX,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  saveError: {
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.danger,
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
