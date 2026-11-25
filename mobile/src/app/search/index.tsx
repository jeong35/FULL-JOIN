// 홈 검색 ② 고르는 칸 + ③ 글자로 찾기(11/24 '홈 검색 v2 · 돋보기 눌러서' 시안).
// 홈 돋보기를 누르면 열린다. 스타일(여러 개)·옷 종류(하나)·색(하나)을 고르거나 글자를 쳐서 찾고,
// [사진 N장 보기]를 누르면 결과(/search/results)로 바뀐다. 결과에서 뒤로 가면 원래 피드다.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SearchIcon } from '@/components/Icons';
import { BackButton, PrimaryButton, TextTabs } from '@/components/ui';
import { COLOR_HEX, LIGHT_COLORS, MULTI_SWATCH, SLOTS, STYLES, type Color, type Slot } from '@/data/catalog';
import {
  EMPTY_QUERY,
  SEARCH_COLORS,
  SEARCH_KINDS,
  SEARCH_VOCAB,
  applySuggestion,
  hasItemTags,
  isEmptyQuery,
  labelOfKind,
  presentColors,
  presentKinds,
  presentStyles,
  queryFromParams,
  queryLabel,
  queryToParams,
  rememberSearch,
  searchImages,
  slotOfKind,
  suggest,
  useRecentSearches,
  type FeedQuery,
  type QueryParams,
} from '@/data/feedFilter';
import { track } from '@/data/events';
import { loadFeed, useFeedState, useSaved } from '@/data/store';
import { colors, fonts, layout } from '@/theme';

// 웹 브라우저의 검은 초점 테두리를 끈다(outlineWidth 0만으로는 크롬에서 남는다). 초점은 바깥 칸의 연보라 테두리로 보여 준다.
const WEB_INPUT_RESET = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as unknown as TextStyle;

function openResults(query: FeedQuery) {
  rememberSearch(queryLabel(query), query);
  router.replace({ pathname: '/search/results', params: queryToParams(query) });
}

export default function SearchScreen() {
  const params = useLocalSearchParams<QueryParams>();
  const [query, setQuery] = useState<FeedQuery>(() => queryFromParams(params));
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const insets = useSafeAreaInsets();
  const feed = useFeedState();
  const saved = useSaved();
  const recent = useRecentSearches();
  // 홈 피드와 같은 목록(저장한 사진은 빼고)에서 찾는다. 순서는 결과 화면이 취향 순서로 맞춘다.
  const images = useMemo(() => feed.data.filter((image) => saved[image.id] === undefined), [feed.data, saved]);

  useEffect(() => {
    void loadFeed();
  }, []);

  const tagsReady = hasItemTags(images);
  const styleOptions = useMemo(() => presentStyles(images, STYLES), [images]);
  const kindOptions = useMemo(() => presentKinds(images, SEARCH_KINDS), [images]);
  const slotOptions = useMemo(
    () => SLOTS.filter((slot) => kindOptions.some((kind) => slotOfKind(kind) === slot)),
    [kindOptions],
  );
  const [pickedSlot, setPickedSlot] = useState<Slot | null>(() => (query.kind === null ? null : slotOfKind(query.kind)));
  const slot = pickedSlot !== null && slotOptions.includes(pickedSlot) ? pickedSlot : (slotOptions[0] ?? null);
  const colorOptions = useMemo(() => presentColors(images, SEARCH_COLORS, query.kind), [images, query.kind]);
  const count = useMemo(() => searchImages(images, query).length, [images, query]);

  // 글자를 치면 고르는 칸 대신 추천 단어. 눌렀을 때 사진이 0장이 되는 단어는 보여 주지 않는다.
  const suggestions = useMemo(
    () =>
      suggest(text, SEARCH_VOCAB)
        .map((suggestion) => ({ suggestion, next: applySuggestion(query, suggestion) }))
        .filter(({ next }) => searchImages(images, next).length > 0),
    [text, query, images],
  );

  const typing = text.trim() !== '';

  // 칩을 누를 때마다 feed_filter_apply(EVENTS.md). 고른 칩을 다시 눌러 풀면 filter_value는 all.
  function applyFilter(next: FeedQuery, filterType: 'style' | 'kind' | 'color', value: string | null) {
    track('feed_filter_apply', {
      filter_type: filterType,
      filter_value: value ?? 'all',
      result_count: searchImages(images, next).length,
    });
    setQuery(next);
  }

  function toggleStyle(style: string) {
    const removing = query.styles.includes(style);
    const styles = removing ? query.styles.filter((candidate) => candidate !== style) : [...query.styles, style];
    applyFilter({ ...query, styles }, 'style', removing ? null : style);
  }

  function toggleKind(kind: string) {
    const next = query.kind === kind ? null : kind;
    // 새 종류에 없는 색은 풀어 준다(베이지 니트 → 블랙 슬랙스로 바꾸면 베이지는 빠진다).
    const keepColor = query.color !== null && presentColors(images, SEARCH_COLORS, next).includes(query.color);
    applyFilter({ ...query, kind: next, color: keepColor ? query.color : null }, 'kind', next);
  }

  function toggleColor(color: string) {
    const next = query.color === color ? null : color;
    applyFilter({ ...query, color: next }, 'color', next);
  }

  // 글자로 찾기: 추천 단어를 누르거나 키보드 검색. 검색어 원문은 남기지 않는다(EVENTS.md feed_search).
  function searchByText(next: FeedQuery) {
    track('feed_search', { query_length: text.trim().length, result_count: searchImages(images, next).length });
    openResults(next);
  }

  function reset() {
    track('feed_filter_clear', {
      had_query: text.trim() !== '',
      active_filter_count: query.styles.length + (query.kind === null ? 0 : 1) + (query.color === null ? 0 : 1),
    });
    setQuery(EMPTY_QUERY);
    setText('');
  }

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.top}>
        <BackButton onPress={back} size={44} />
        <Pressable onPress={() => input.current?.focus()} style={[styles.field, focused && styles.fieldFocused]}>
          <SearchIcon color={colors.textSecondary} size={18} />
          <TextInput
            ref={input}
            value={text}
            onChangeText={setText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="스타일·옷·색으로 찾기"
            placeholderTextColor="#9A96A6"
            returnKeyType="search"
            onSubmitEditing={() => {
              const first = suggestions[0];
              if (first !== undefined) searchByText(first.next);
            }}
            accessibilityLabel="스타일·옷·색으로 찾기"
            style={[styles.input, WEB_INPUT_RESET]}
          />
          {typing && (
            <Pressable onPress={() => setText('')} accessibilityRole="button" accessibilityLabel="글자 지우기" hitSlop={8}>
              <Text style={styles.clearText}>✕</Text>
            </Pressable>
          )}
        </Pressable>
      </View>

      {images.length === 0 && feed.status !== 'error' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textPurple} />
        </View>
      ) : typing ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.typingContent}>
          {suggestions.length > 0 ? (
            <View style={styles.suggestBox}>
              {suggestions.map(({ suggestion, next }, index) => (
                <Pressable
                  key={`${suggestion.tag}:${suggestion.label}`}
                  onPress={() => searchByText(next)}
                  accessibilityRole="button"
                  style={[styles.suggestRow, index > 0 && styles.suggestDivider]}>
                  <SearchIcon color={colors.textSecondary} size={18} />
                  <Text style={styles.suggestLabel}>{suggestion.label}</Text>
                  <Text style={styles.suggestTag}>{suggestion.tag}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.typingNote}>{`'${text.trim()}'(으)로 찾은 사진이 없어요`}</Text>
          )}
          <Text style={styles.typingNote}>
            스타일·옷 종류·색으로 찾아요. 브랜드 이름은 아직 안 돼요.
            {!tagsReady && '\n옷·색으로 찾기는 서버를 새로 올리면 열려요.'}
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingBottom: 110 + insets.bottom }]}>
          {recent.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentRow}>
              <Text style={styles.recentTitle}>최근</Text>
              {recent.map((entry) => (
                <Pressable key={entry.label} onPress={() => openResults(entry.query)} accessibilityRole="button" style={styles.recentChip}>
                  <Text style={styles.recentText}>{entry.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <SectionTitle title="스타일" note="여러 개 골라도 돼요" />
          <View style={styles.chips}>
            {styleOptions.map((style) => (
              <Chip key={style} label={style} selected={query.styles.includes(style)} onPress={() => toggleStyle(style)} />
            ))}
          </View>

          <SectionTitle title="옷" note="종류 하나" />
          {!tagsReady || slot === null ? (
            <Text style={styles.pending}>옷 종류로 찾기는 서버를 새로 올리면 열려요.</Text>
          ) : (
            <>
              <TextTabs options={slotOptions} value={slot} onChange={setPickedSlot} />
              <View style={[styles.chips, styles.kindChips]}>
                {kindOptions
                  .filter((kind) => slotOfKind(kind) === slot)
                  .map((kind) => (
                    <Chip key={kind} label={labelOfKind(kind)} selected={query.kind === kind} onPress={() => toggleKind(kind)} />
                  ))}
              </View>
            </>
          )}

          <SectionTitle title="색" note={query.kind === null ? '옷의 색이에요 · 안 골라도 돼요' : `${labelOfKind(query.kind)}에 있는 색이에요`} />
          {!tagsReady ? (
            <Text style={styles.pending}>색으로 찾기는 서버를 새로 올리면 열려요.</Text>
          ) : (
            <View style={styles.colors}>
              {colorOptions.map((color) => (
                <ColorDot key={color} color={color as Color} selected={query.color === color} onPress={() => toggleColor(color)} />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {!typing && images.length > 0 && (
        <View style={[styles.bottom, { paddingBottom: 16 + insets.bottom }]}>
          <Pressable
            onPress={reset}
            disabled={isEmptyQuery(query)}
            accessibilityRole="button"
            style={[styles.reset, isEmptyQuery(query) && styles.resetDisabled]}>
            <Text style={styles.resetText}>초기화</Text>
          </Pressable>
          <View style={styles.primaryWrap}>
            <PrimaryButton
              label={isEmptyQuery(query) ? '스타일·옷·색을 골라 주세요' : `사진 ${count}장 보기`}
              disabled={isEmptyQuery(query)}
              onPress={() => openResults(query)}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function SectionTitle({ title, note }: { title: string; note: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionText} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.sectionNote}>{note}</Text>
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function ColorDot({ color, selected, onPress }: { color: Color; selected: boolean; onPress: () => void }) {
  const hex = color === '멀티' || color === '기타' ? null : COLOR_HEX[color];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={color} accessibilityState={{ selected }} style={styles.colorItem}>
      <View style={[styles.colorRing, selected && styles.colorRingSelected]}>
        {hex === null ? (
          <View style={[styles.colorDot, styles.multi]}>
            {MULTI_SWATCH.map((swatch) => (
              <View key={swatch} style={[styles.multiCell, { backgroundColor: swatch }]} />
            ))}
          </View>
        ) : (
          <View style={[styles.colorDot, { backgroundColor: hex }, LIGHT_COLORS.has(color) && styles.lightDot]} />
        )}
      </View>
      <Text style={[styles.colorText, selected && styles.colorTextSelected]}>{color}</Text>
    </Pressable>
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
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: colors.white,
  },
  fieldFocused: {
    borderColor: colors.purpleLine,
  },
  input: {
    flex: 1,
    height: 40,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
    padding: 0,
  },
  clearText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingTop: 4,
  },
  recentRow: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: 8,
  },
  recentTitle: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.textSecondary,
  },
  recentChip: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 15,
    backgroundColor: colors.white,
  },
  recentText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.text,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingTop: 20,
    paddingBottom: 10,
    paddingHorizontal: layout.screenPaddingX,
  },
  sectionText: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.text,
  },
  sectionNote: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: layout.screenPaddingX,
  },
  kindChips: {
    paddingTop: 12,
  },
  // 고른 칩: 흰 바탕 + 연보라 테두리 + 보라 글자(DESIGN.md '고른 칩 테두리').
  chip: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  chipSelected: {
    borderColor: colors.purpleLine,
  },
  chipText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.text,
  },
  chipTextSelected: {
    fontFamily: fonts.bold,
    color: colors.textPurple,
  },
  pending: {
    paddingHorizontal: layout.screenPaddingX,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  colors: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 12,
    paddingHorizontal: layout.screenPaddingX - 6,
  },
  colorItem: {
    width: 56,
    alignItems: 'center',
    gap: 6,
  },
  colorRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorRingSelected: {
    borderColor: colors.textPurple,
  },
  colorDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  lightDot: {
    borderWidth: 1,
    borderColor: '#DDD9E6',
  },
  multi: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
  },
  multiCell: {
    width: 15,
    height: 15,
  },
  colorText: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  colorTextSelected: {
    fontFamily: fonts.bold,
    color: colors.textPurple,
  },
  typingContent: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: 8,
    gap: 14,
  },
  suggestBox: {
    borderRadius: 16,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  suggestDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  suggestLabel: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.text,
  },
  suggestTag: {
    overflow: 'hidden',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: colors.purpleTint,
    fontFamily: fonts.bold,
    fontSize: 11.5,
    color: colors.tagText,
  },
  typingNote: {
    paddingHorizontal: 4,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    paddingHorizontal: layout.screenPaddingX,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.background,
  },
  reset: {
    height: 54,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  resetDisabled: {
    opacity: 0.5,
  },
  resetText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.textSecondary,
  },
  primaryWrap: {
    flex: 1,
  },
});
