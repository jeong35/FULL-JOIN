// 홈 검색 ④ 결과 + ⑤ 0장일 때(11/24 '홈 검색 v2 · 돋보기 눌러서' 시안).
// 고른 조건은 위에 작게 딱지로만 보여 주고 나머지는 사진. 순서는 홈 피드와 같은 취향 순서(AC15). 딱지 칸을 누르면 고르는 칸(/search)으로,
// ×를 누르면 그 조건만 뺀다. 뒤로 가면 원래 피드(취향 순서)로 돌아간다.
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeedPhoto, PHOTO_GAP, splitColumns } from '@/components/FeedPhoto';
import { SearchIcon } from '@/components/Icons';
import { BackButton, SmallWhiteButton } from '@/components/ui';
import { errorMessage } from '@/data/api';
import { completeChatAction } from '@/data/chatActionTracking';
import { track } from '@/data/events';
import {
  dropOneOptions,
  isEmptyQuery,
  labelOfKind,
  queryFromParams,
  queryParts,
  queryToParams,
  searchImages,
  withoutPart,
  type FeedQuery,
  type QueryParams,
} from '@/data/feedFilter';
import { orderByTaste } from '@/data/feedOrder';
import { useSession } from '@/data/session';
import { heartStyleImage, loadArchive, loadFeed, unheartStyleImage, useFeedState, useSaved } from '@/data/store';
import { colors, fonts, layout } from '@/theme';

function showResults(query: FeedQuery) {
  if (isEmptyQuery(query)) router.replace('/search');
  else router.replace({ pathname: '/search/results', params: queryToParams(query) });
}

function editQuery(query: FeedQuery) {
  router.replace({ pathname: '/search', params: queryToParams(query) });
}

export default function SearchResultsScreen() {
  const params = useLocalSearchParams<QueryParams & { action_id?: string; chat_action_type?: string }>();
  const { styles: styleParam, kind: kindParam, color: colorParam } = params;
  const query = useMemo(
    () => queryFromParams({ styles: styleParam, kind: kindParam, color: colorParam }),
    [styleParam, kindParam, colorParam],
  );
  const feed = useFeedState();
  const saved = useSaved();
  const taste = useSession()?.styles;
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void loadFeed();
  }, []);

  // 홈 피드와 같은 목록(저장 안 한 사진, 취향 순서 AC15)에서 좁힌다(docs/SPEC.md 피드 구성).
  const feedImages = useMemo(
    () => orderByTaste(feed.data.filter((image) => saved[image.id] === undefined), taste ?? []),
    [feed.data, saved, taste],
  );
  const results = useMemo(() => searchImages(feedImages, query), [feedImages, query]);
  const parts = queryParts(query, labelOfKind);
  const loading = feed.data.length === 0 && feed.status !== 'error';

  useEffect(() => {
    if (!loading && feed.status !== 'error') completeChatAction(params.action_id, params.chat_action_type, 'search_results', { result_count: results.length });
  }, [feed.status, loading, params.action_id, params.chat_action_type, results.length]);

  async function onToggleSave(id: string) {
    setActionError(null);
    if (saved[id] !== undefined) {
      try {
        await unheartStyleImage(id);
      } catch (error) {
        const message = errorMessage(error);
        track('error_shown', { screen: 'search_results', error_code: message });
        setActionError(message);
      }
      return;
    }
    // 검색 결과도 홈 피드 사진의 북마크라 place는 feed로 둔다(EVENTS.md photo_save.place 목록).
    track('photo_save', { style_image_id: id, place: 'feed' });
    const savedOk = await heartStyleImage(id);
    if (!savedOk) {
      track('photo_save_failed', { style_image_id: id, place: 'feed' });
      track('error_shown', { screen: 'search_results', error_code: 'photo_save_failed' });
      setActionError('사진을 저장하지 못했어요. 다시 시도해 주세요.');
      return;
    }
    track('photo_save_done', { style_image_id: id, place: 'feed', saved_count: Object.keys(saved).length + 1 });
    await loadArchive({ force: true });
  }

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  let body;
  if (loading) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textPurple} />
      </View>
    );
  } else if (feed.status === 'error' && feed.data.length === 0) {
    body = (
      <View style={styles.center}>
        <Text style={styles.centerText}>사진을 불러오지 못했어요</Text>
        <SmallWhiteButton label="다시 시도" onPress={() => loadFeed({ force: true })} />
      </View>
    );
  } else if (results.length === 0) {
    const drops = dropOneOptions(feedImages, query, labelOfKind);
    body = (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <SearchIcon color={colors.textPurple} />
        </View>
        <Text style={styles.emptyTitle}>고른 조건에 맞는 사진이 없어요</Text>
        {drops.length > 0 && <Text style={styles.emptyNote}>하나를 빼면 볼 수 있어요</Text>}
        <View style={styles.drops}>
          {drops.map((part) => (
            <Pressable
              key={part.key}
              onPress={() => showResults(withoutPart(query, part.key))}
              accessibilityRole="button"
              style={styles.dropRow}>
              <Text style={styles.dropText}>
                <Text style={styles.dropStrong}>{part.label}</Text> 빼고 보기 · {part.count}장
              </Text>
              <Text style={styles.dropArrow}>›</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => editQuery(query)} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.again}>조건 다시 고르기</Text>
        </Pressable>
      </View>
    );
  } else {
    const columns = splitColumns(results);
    body = (
      <>
        <View style={styles.countRow}>
          <Text style={styles.countText}>
            사진 <Text style={styles.countStrong}>{results.length}장</Text>
          </Text>
        </View>
        <View style={styles.columns}>
          {columns.map((column, columnIndex) => (
            <View key={columnIndex} style={styles.column}>
              {column.map((image, index) => (
                <FeedPhoto
                  key={image.id}
                  image={image}
                  colorIndex={(index + columnIndex) % 2}
                  saved={saved[image.id] !== undefined}
                  onOpen={() => {
                    track('photo_open', { style_image_id: image.id });
                    router.push(`/style/${encodeURIComponent(image.id)}` as Href);
                  }}
                  onSave={() => void onToggleSave(image.id)}
                />
              ))}
            </View>
          ))}
        </View>
      </>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.top}>
        <BackButton onPress={back} size={44} />
        <Pressable
          onPress={() => editQuery(query)}
          accessibilityRole="button"
          accessibilityLabel={`조건 바꾸기: ${parts.map((part) => part.label).join(', ')}`}
          style={styles.box}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tags}>
            {parts.map((part) => (
              <Pressable
                key={part.key}
                onPress={() => showResults(withoutPart(query, part.key))}
                accessibilityRole="button"
                accessibilityLabel={`${part.label} 빼기`}
                hitSlop={4}
                style={styles.tag}>
                <Text style={styles.tagText}>{part.label}</Text>
                <Text style={styles.tagX}>✕</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </View>
      {actionError !== null && <Text style={styles.actionError}>{actionError}</Text>}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {body}
      </ScrollView>
    </SafeAreaView>
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
    gap: 8,
    paddingTop: 12,
    paddingBottom: 6,
    paddingHorizontal: layout.screenPaddingX,
  },
  box: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.white,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tags: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 28,
    paddingLeft: 10,
    paddingRight: 8,
    borderRadius: 7,
    backgroundColor: colors.purpleTint,
  },
  tagText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.tagText,
  },
  tagX: {
    fontSize: 11,
    color: colors.tagText,
  },
  actionError: {
    marginHorizontal: layout.screenPaddingX,
    marginBottom: 8,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.danger,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  countRow: {
    paddingTop: 6,
    paddingBottom: 10,
    paddingHorizontal: layout.screenPaddingX,
  },
  countText: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  countStrong: {
    fontFamily: fonts.bold,
    color: colors.text,
  },
  columns: {
    flexDirection: 'row',
    gap: PHOTO_GAP,
  },
  column: {
    flex: 1,
    gap: PHOTO_GAP,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 60,
  },
  centerText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 64,
    paddingHorizontal: layout.screenPaddingX + 8,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.purpleTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginTop: 16,
    fontFamily: fonts.extraBold,
    fontSize: 17,
    color: colors.text,
    textAlign: 'center',
  },
  emptyNote: {
    marginTop: 6,
    fontFamily: fonts.regular,
    fontSize: 13.5,
    color: colors.textSecondary,
  },
  drops: {
    alignSelf: 'stretch',
    gap: 8,
    marginTop: 20,
  },
  dropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  dropText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
  },
  dropStrong: {
    fontFamily: fonts.bold,
    color: colors.textPurple,
  },
  dropArrow: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  again: {
    marginTop: 16,
    fontFamily: fonts.medium,
    fontSize: 13.5,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
});
