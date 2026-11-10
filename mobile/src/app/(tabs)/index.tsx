import { Image } from 'expo-image';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassView } from '@/components/GlassView';
import { BookmarkIcon } from '@/components/Icons';
import { SmallWhiteButton, TextTabs } from '@/components/ui';
import { errorMessage } from '@/data/api';
import { STYLES, type Style } from '@/data/catalog';
import { orderByTaste } from '@/data/feedOrder';
import { onHomeTabReselect } from '@/data/homeTab';
import { useSession } from '@/data/session';
import { heartStyleImage, loadArchive, loadFeed, unheartStyleImage, useArchiveState, useFeedState, useIsUnhearting, useSaved } from '@/data/store';
import type { ArchiveImage, Season, StyleImage } from '@/data/types';
import { colors, fonts, layout } from '@/theme';

// 홈 피드. 모양은 design/screens/10-home-feed.html을 따른다.
// 사진은 서버(GET /feed)에서 받은 실제 사진이다. 사진은 화면 끝까지, 사이는 2px(DESIGN.md 4절).

// 내가 이름 지은 폴더(출근룩 등)는 나중에 '모든 저장' 옆에 붙는다.
const FOLDERS = ['피드', '모든 저장'] as const;
type Folder = (typeof FOLDERS)[number];
const PHOTO_GAP = 2;
// '모든 저장' 사진 사이 간격. 피드(2px)보다 조금 넓게 둔다.
const ARCHIVE_GAP = 4;
const PHOTO_COLORS = [colors.line, '#DFD5F0'] as const;
// 사진 비율(가로/세로)을 받기 전 기본값과 허용 범위. 너무 길거나 넓은 사진은 잘라서 보여 준다.
const DEFAULT_RATIO = 3 / 4;
const MIN_RATIO = 9 / 16;
const MAX_RATIO = 1;

// 순서대로 왼쪽·오른쪽에 번갈아 넣는다. 사진 비율을 받은 뒤에도 자리가 바뀌지 않는다.
function splitColumns(images: readonly StyleImage[]) {
  const columns: [StyleImage[], StyleImage[]] = [[], []];
  images.forEach((image, index) => columns[index % 2].push(image));
  return columns;
}

function splitArchiveColumns(images: readonly ArchiveImage[]) {
  const columns: [ArchiveImage[], ArchiveImage[], ArchiveImage[]] = [[], [], []];
  images.forEach((image, index) => columns[index % 3].push(image));
  return columns;
}

// '모든 저장' 안에서 고르는 조건. 연도·계절은 저장한 때 기준으로 서버가 정한 season·season_year를 쓴다
// (src/fulljoin/archive.ts — 봄 3~5월 · 여름 6~8월 · 가을 9~11월 · 겨울 12~2월, 11/9 팀 결정).
const SEASONS: readonly Season[] = ['봄', '여름', '가을', '겨울'];
type ArchiveFilter = { year: number | null; season: Season | null; style: Style | null };
type FilterKey = keyof ArchiveFilter;
const NO_FILTER: ArchiveFilter = { year: null, season: null, style: null };
const FILTER_LABELS: Record<FilterKey, string> = { year: '연도', season: '계절', style: '스타일' };
const FILTER_NOTES: Record<FilterKey, string> = {
  year: '사진을 저장한 해예요.',
  season: '저장한 달 기준이에요. 봄 3~5월 · 여름 6~8월 · 가을 9~11월 · 겨울 12~2월.',
  style: '사진에 붙은 스타일로 골라 봐요.',
};

function matchesFilter(image: ArchiveImage, filter: ArchiveFilter) {
  return (
    (filter.year === null || image.season_year === filter.year) &&
    (filter.season === null || image.season === filter.season) &&
    (filter.style === null || image.style.includes(filter.style))
  );
}

// 고를 수 있는 값은 저장한 사진에 실제로 있는 것만 보여 준다.
function filterOptions(images: readonly ArchiveImage[]) {
  const years = [...new Set(images.map((image) => image.season_year))].sort((a, b) => b - a);
  const seasons = SEASONS.filter((season) => images.some((image) => image.season === season));
  const styles = STYLES.filter((style) => images.some((image) => image.style.includes(style)));
  return { year: years, season: seasons, style: styles };
}

// '모든 저장'을 스크롤하는 동안 오른쪽에 지금 보는 사진의 '연도 계절'을 띄운다(사진 앱의 날짜 말풍선처럼).
const BUBBLE_HEIGHT = 28;
const BUBBLE_MARGIN = 8;
const BUBBLE_HIDE_MS = 1200;

export default function HomeScreen() {
  const feed = useFeedState();
  const archive = useArchiveState();
  const saved = useSaved();
  const session = useSession();
  // 처음 고른 취향 스타일 사진 → 이웃 스타일 → 나머지 순서(SPEC AC15).
  // 이미 저장한 사진은 즉시 피드에서 빼고 '모든 저장'에서만 보여 준다.
  const taste = session?.styles;
  const feedImages = useMemo(
    () => orderByTaste(feed.data.filter((image) => saved[image.id] === undefined), taste ?? []),
    [feed.data, saved, taste],
  );
  const [folder, setFolder] = useState<Folder>('피드');
  const [filter, setFilter] = useState<ArchiveFilter>(NO_FILTER);
  const [picking, setPicking] = useState<FilterKey | null>(null);
  const archiveImages = useMemo(() => archive.data.filter((image) => matchesFilter(image, filter)), [archive.data, filter]);
  const options = useMemo(() => filterOptions(archive.data), [archive.data]);
  const filtered = filter.year !== null || filter.season !== null || filter.style !== null;
  const [refreshing, setRefreshing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const [scrollY] = useState(() => new Animated.Value(0));
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const showBubble = folder === '모든 저장' && archiveImages.length > 0 && contentHeight > viewportHeight;

  // 화면에 돌아올 때마다 사진 주소가 만료됐는지 보고 필요하면 새로 받는다.
  useFocusEffect(
    useCallback(() => {
      loadFeed();
      loadArchive({ force: true });
    }, []),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadFeed({ force: true }), loadArchive({ force: true })]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => onHomeTabReselect(() => {
    if (folder === '모든 저장') {
      setFolder('피드');
      return;
    }
    void onRefresh();
  }), [folder, onRefresh]);

  async function onToggleSave(id: string) {
    setActionError(null);
    if (saved[id] !== undefined) {
      try {
        await unheartStyleImage(id);
      } catch (error) {
        setActionError(errorMessage(error));
      }
      return;
    }
    await heartStyleImage(id);
    // 저장 버튼은 화면을 열지 않는다. '모든 저장' 목록만 서버 상태와 맞춘다.
    await loadArchive({ force: true });
  }

  let body;
  if (folder === '피드' && feed.data.length === 0 && feed.status !== 'error') {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.textPurple} />
        <Text style={styles.centerText}>사진을 불러오는 중이에요</Text>
      </View>
    );
  } else if (folder === '피드' && feed.data.length === 0) {
    body = (
      <View style={styles.center}>
        <Text style={styles.centerText}>{feed.error}</Text>
        <SmallWhiteButton label="다시 시도" onPress={() => loadFeed({ force: true })} />
      </View>
    );
  } else if (folder === '피드' && feedImages.length === 0) {
    body = (
      <View style={styles.center}>
        <Text style={styles.centerText}>피드 사진을 모두 저장했어요{'\n'}저장한 사진은 &apos;모든 저장&apos;에서 볼 수 있어요</Text>
        <SmallWhiteButton label="모든 저장 보기" onPress={() => setFolder('모든 저장')} />
      </View>
    );
  } else if (folder !== '피드' && archive.data.length === 0 && archive.status !== 'error') {
    body = (
      <View style={styles.center}>
        {archive.status === 'loading' && <ActivityIndicator color={colors.textPurple} />}
        <Text style={styles.centerText}>마음에 드는 사진의 저장 버튼을 눌러 보세요</Text>
      </View>
    );
  } else if (folder !== '피드' && archive.data.length === 0) {
    body = (
      <View style={styles.center}>
        <Text style={styles.centerText}>{archive.error}</Text>
        <SmallWhiteButton label="다시 시도" onPress={() => loadArchive({ force: true })} />
      </View>
    );
  } else if (folder === '모든 저장' && archiveImages.length === 0) {
    body = (
      <View style={styles.center}>
        <Text style={styles.centerText}>고른 조건에 맞는 저장 사진이 없어요</Text>
        <SmallWhiteButton label="전체 보기" onPress={() => setFilter(NO_FILTER)} />
      </View>
    );
  } else if (folder === '모든 저장') {
    body = (
      <>
        <ArchiveGrid images={archiveImages} onUnsave={onToggleSave} />
        <View style={styles.archiveEnd} />
      </>
    );
  } else {
    const columns = splitColumns(feedImages);
    body = (
      <View style={styles.columns}>
        {columns.map((column, columnIndex) => (
          <View key={columnIndex} style={styles.column}>
            {column.map((image, index) => (
              <FeedPhoto
                key={image.id}
                image={image}
                colorIndex={(index + columnIndex) % 2}
                saved={saved[image.id] !== undefined}
                onOpen={() => router.push(`/style/${encodeURIComponent(image.id)}` as Href)}
                onSave={() => onToggleSave(image.id)}
              />
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.logo} accessibilityRole="header">
          odit.
        </Text>
      </View>

      <TextTabs options={FOLDERS} value={folder} onChange={setFolder} />

      {folder === '모든 저장' && archive.data.length > 0 && (
        <View style={styles.filterBar}>
          <FilterPill label={filter.year === null ? '연도' : String(filter.year)} active={filter.year !== null} onPress={() => setPicking('year')} />
          <FilterPill label={filter.season ?? '계절'} active={filter.season !== null} onPress={() => setPicking('season')} />
          {filtered && (
            <Pressable onPress={() => setFilter(NO_FILTER)} accessibilityRole="button" hitSlop={8} style={styles.clearFilter}>
              <Text style={styles.clearFilterText}>전체</Text>
            </Pressable>
          )}
          <View style={styles.filterSpacer} />
          <FilterPill label={filter.style ?? '스타일'} active={filter.style !== null} onPress={() => setPicking('style')} />
        </View>
      )}
      {actionError !== null && <Text style={styles.actionError}>{actionError}</Text>}

      <View style={styles.scroll}>
        <Animated.ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
          onContentSizeChange={(_, height) => setContentHeight(height)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textPurple} />}>
          {body}
        </Animated.ScrollView>
        {showBubble && (
          <DateBubble
            scrollY={scrollY}
            images={archiveImages}
            rowHeight={(width - ARCHIVE_GAP * 2) / 3 + ARCHIVE_GAP}
            viewportHeight={viewportHeight}
            contentHeight={contentHeight}
          />
        )}
      </View>

      <FilterSheet
        picking={picking}
        filter={filter}
        options={options}
        onPick={(key, value) => {
          setFilter((current) => ({ ...current, [key]: value }));
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
    </SafeAreaView>
  );
}

// 스크롤하는 동안만 보이고, 멈추면 잠시 뒤 사라진다. 위치는 스크롤 막대처럼 위(처음)~아래(끝)로 움직이고,
// 말풍선 옆 줄의 사진 계절을 보여 준다(저장 사진은 한 줄에 3장, 정사각형).
function DateBubble({
  scrollY,
  images,
  rowHeight,
  viewportHeight,
  contentHeight,
}: {
  scrollY: Animated.Value;
  images: readonly ArchiveImage[];
  rowHeight: number;
  viewportHeight: number;
  contentHeight: number;
}) {
  const [label, setLabel] = useState<string | null>(null);
  const maxScroll = Math.max(1, contentHeight - viewportHeight);
  const track = Math.max(0, viewportHeight - BUBBLE_HEIGHT - BUBBLE_MARGIN * 2);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const id = scrollY.addListener(({ value }) => {
      const progress = Math.min(1, Math.max(0, value / maxScroll));
      const bubbleCenter = value + BUBBLE_MARGIN + progress * track + BUBBLE_HEIGHT / 2;
      const row = Math.max(0, Math.floor(bubbleCenter / rowHeight));
      const image = images[Math.min(row * 3, images.length - 1)];
      if (image === undefined) return;
      setLabel(`${image.season_year} ${image.season}`);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setLabel(null), BUBBLE_HIDE_MS);
    });
    return () => {
      scrollY.removeListener(id);
      clearTimeout(hideTimer);
    };
  }, [scrollY, images, rowHeight, maxScroll, track]);

  if (label === null) return null;
  const translateY = scrollY.interpolate({
    inputRange: [0, maxScroll],
    outputRange: [BUBBLE_MARGIN, BUBBLE_MARGIN + track],
    extrapolate: 'clamp',
  });
  return (
    <Animated.View style={[styles.dateBubble, { transform: [{ translateY }] }]}>
      <Text style={styles.dateBubbleText}>{label}</Text>
    </Animated.View>
  );
}

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
      <Text style={[styles.pillArrow, active && styles.pillTextActive]}>▾</Text>
    </Pressable>
  );
}

// 아래에서 올라오는 고르기 창. '전체' + 저장한 사진에 있는 값만.
function FilterSheet({
  picking,
  filter,
  options,
  onPick,
  onClose,
}: {
  picking: FilterKey | null;
  filter: ArchiveFilter;
  options: { year: number[]; season: Season[]; style: Style[] };
  onPick: (key: FilterKey, value: ArchiveFilter[FilterKey]) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const key = picking ?? 'year';
  const values: readonly (number | string)[] = options[key];
  const current = filter[key];
  return (
    <Modal visible={picking !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityLabel="닫기" />
      <View style={[styles.sheet, { paddingBottom: Math.max(24, insets.bottom + 12) }]}>
        <Text style={styles.sheetTitle}>{FILTER_LABELS[key]}</Text>
        <Text style={styles.sheetNote}>{FILTER_NOTES[key]}</Text>
        <View style={styles.sheetChips}>
          {[null, ...values].map((value) => {
            const selected = value === current;
            const label = value === null ? '전체' : key === 'year' ? `${value}년` : String(value);
            return (
              <Pressable
                key={label}
                onPress={() => onPick(key, value as ArchiveFilter[FilterKey])}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.sheetChip, selected && styles.sheetChipSelected]}>
                <Text style={[styles.sheetChipText, selected && styles.sheetChipTextSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

function openArchiveImage(image: ArchiveImage) {
  router.push({ pathname: '/result/[id]', params: { id: image.id } });
}

function ArchiveGrid({ images, onUnsave }: { images: readonly ArchiveImage[]; onUnsave: (id: string) => void }) {
  const columns = splitArchiveColumns(images);
  return (
    <View style={styles.archiveColumns}>
      {columns.map((column, columnIndex) => (
        <View key={columnIndex} style={styles.archiveColumn}>
          {column.map((image) => <ArchiveThumbnail key={image.id} image={image} onUnsave={onUnsave} />)}
        </View>
      ))}
    </View>
  );
}

function ArchiveThumbnail({ image, onUnsave }: { image: ArchiveImage; onUnsave: (id: string) => void }) {
  const unhearting = useIsUnhearting(image.id);
  return (
    <View style={styles.archivePhoto}>
      <Pressable
        onPress={() => openArchiveImage(image)}
        accessibilityRole="button"
        accessibilityLabel={`${image.style.join('·')} 저장 사진과 내 옷장 비교 보기`}
        style={StyleSheet.absoluteFill}>
        <Image
          source={{ uri: image.thumbnail_url, cacheKey: image.id }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      </Pressable>
      <Pressable
        onPress={() => onUnsave(image.id)}
        disabled={unhearting}
        accessibilityRole="button"
        accessibilityLabel="저장 취소"
        accessibilityState={{ busy: unhearting, disabled: unhearting }}
        style={styles.archiveRemoveButton}>
        {unhearting ? (
          <ActivityIndicator size="small" color={colors.textPurple} />
        ) : (
          <BookmarkIcon color={colors.textPurple} size={14} filled />
        )}
      </Pressable>
    </View>
  );
}

function FeedPhoto({
  image,
  colorIndex,
  saved,
  onOpen,
  onSave,
}: {
  image: StyleImage;
  colorIndex: number;
  saved: boolean;
  onOpen: () => void;
  onSave: () => void;
}) {
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const unhearting = useIsUnhearting(image.id);
  return (
    <View style={[styles.photo, { aspectRatio: ratio, backgroundColor: PHOTO_COLORS[colorIndex] }]}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${image.style.join('·')} 스타일 사진 제품 정보 보기`}
        style={StyleSheet.absoluteFill}>
        <Image
          // 사진 주소는 받을 때마다 바뀌지만 사진은 같으니 id로 캐시한다.
          source={{ uri: image.thumbnail_url, cacheKey: image.id }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          onLoad={({ source }) => {
            if (source.width > 0 && source.height > 0) {
              setRatio(Math.min(MAX_RATIO, Math.max(MIN_RATIO, source.width / source.height)));
            }
          }}
        />
      </Pressable>
      <Pressable
        onPress={onSave}
        disabled={unhearting}
        accessibilityRole="button"
        accessibilityLabel={saved ? '저장 취소' : '저장'}
        accessibilityState={{ busy: unhearting, disabled: unhearting }}
        hitSlop={6}
        style={styles.saveButtonWrap}>
        <GlassView radius={18} style={styles.saveButton}>
          {unhearting ? (
            <ActivityIndicator size="small" color={colors.textPurple} />
          ) : (
            <BookmarkIcon color={colors.text} filled={saved} />
          )}
        </GlassView>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 70,
    paddingTop: 24,
    paddingBottom: 2,
    paddingHorizontal: layout.screenPaddingX,
  },
  logo: {
    fontFamily: fonts.extraBold,
    fontSize: 26,
    letterSpacing: -0.5,
    color: colors.textPurple,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  actionError: {
    marginHorizontal: layout.screenPaddingX,
    marginBottom: 8,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: '#A23B3B',
  },
  columns: {
    flexDirection: 'row',
    gap: PHOTO_GAP,
  },
  column: {
    flex: 1,
    gap: PHOTO_GAP,
  },
  archiveColumns: {
    flexDirection: 'row',
    gap: ARCHIVE_GAP,
  },
  archiveColumn: {
    flex: 1,
    gap: ARCHIVE_GAP,
  },
  archivePhoto: {
    aspectRatio: 1,
    overflow: 'hidden',
    backgroundColor: colors.line,
  },
  archiveRemoveButton: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  dateBubble: {
    position: 'absolute',
    top: 0,
    right: 10,
    height: BUBBLE_HEIGHT,
    paddingHorizontal: 12,
    borderRadius: BUBBLE_HEIGHT / 2,
    justifyContent: 'center',
    backgroundColor: colors.textPurple,
    boxShadow: '0 2px 10px rgba(46,26,92,0.25)',
    pointerEvents: 'none',
  },
  dateBubbleText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.white,
  },
  archiveEnd: {
    height: 24,
  },
  // 위 탭(피드·모든 저장)보다 튀지 않게 테두리 없는 연한 칩으로 두고, 사진과는 12px 띄운다.
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: layout.screenPaddingX,
    marginBottom: 12,
  },
  filterSpacer: {
    flex: 1,
  },
  // 고르기 버튼은 둥근 네모(부위·핏 선택과 같은 모양). 고르면 보라로 채운다.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  pillActive: {
    backgroundColor: colors.purpleFill,
  },
  pillText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  pillArrow: {
    fontFamily: fonts.regular,
    fontSize: 9,
    color: colors.textSecondary,
  },
  pillTextActive: {
    fontFamily: fonts.bold,
    color: colors.onPurpleFill,
  },
  clearFilter: {
    paddingHorizontal: 4,
  },
  clearFilterText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(36,27,51,0.35)',
  },
  sheet: {
    paddingTop: 20,
    paddingHorizontal: layout.screenPaddingX + 4,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: colors.background,
  },
  sheetTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.text,
  },
  sheetNote: {
    marginTop: 4,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  sheetChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  sheetChip: {
    height: 38,
    minWidth: 64,
    paddingHorizontal: 14,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetChipSelected: {
    borderColor: colors.purpleStrong,
    backgroundColor: colors.purpleFill,
  },
  sheetChipText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.text,
  },
  sheetChipTextSelected: {
    color: colors.onPurpleFill,
  },
  photo: {
    // 사진은 각진 네모(모서리 0).
    overflow: 'hidden',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: 60,
  },
  centerText: {
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  saveButtonWrap: {
    position: 'absolute',
    right: 6,
    bottom: 6,
  },
  saveButton: {
    // DESIGN.md 4절 예외: 지름 36 동그라미.
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'rgba(255,255,255,0.85)',
    boxShadow: '0 2px 10px rgba(46,26,92,0.12)',
  },
});
