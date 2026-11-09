import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlassView } from '@/components/GlassView';
import { BookmarkIcon } from '@/components/Icons';
import { SmallWhiteButton, TextTabs } from '@/components/ui';
import { heartStyleImage, loadArchive, loadFeed, useArchiveState, useFeedState, useSaved } from '@/data/store';
import type { ArchiveImage, Season, StyleImage } from '@/data/types';
import { colors, fonts, layout } from '@/theme';

// 홈 피드. 모양은 design/screens/10-home-feed.html을 따른다.
// 사진은 서버(GET /feed)에서 받은 실제 사진이다. 사진은 화면 끝까지, 사이는 2px(DESIGN.md 4절).

const FOLDERS = ['피드', '모든 저장', '계절'] as const;
type Folder = (typeof FOLDERS)[number];
const PHOTO_GAP = 2;
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

const SEASON_MONTHS: Record<Season, string> = {
  봄: '3~5월에 저장',
  여름: '6~8월에 저장',
  가을: '9~11월에 저장',
  겨울: '12~2월에 저장',
};

export default function HomeScreen() {
  const feed = useFeedState();
  const archive = useArchiveState();
  const saved = useSaved();
  const [folder, setFolder] = useState<Folder>('피드');
  const [refreshing, setRefreshing] = useState(false);

  // 화면에 돌아올 때마다 사진 주소가 만료됐는지 보고 필요하면 새로 받는다.
  useFocusEffect(
    useCallback(() => {
      loadFeed();
      loadArchive({ force: true });
    }, []),
  );

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([loadFeed({ force: true }), loadArchive({ force: true })]);
    setRefreshing(false);
  }

  function onSave(id: string) {
    heartStyleImage(id);
    router.push({ pathname: '/result/[id]', params: { id } });
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
  } else if (folder === '모든 저장') {
    body = <ArchiveGrid images={archive.data} />;
  } else if (folder === '계절') {
    body = <SeasonArchive images={archive.data} />;
  } else {
    const columns = splitColumns(feed.data);
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
                onSave={() => onSave(image.id)}
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
        <Text style={styles.archiveHint}>최근에 저장한 순서</Text>
      )}
      {folder === '계절' && archive.data.length > 0 && (
        <Text style={styles.archiveHint}>저장한 달로 자동으로 나눠요</Text>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textPurple} />}>
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}

function openArchiveImage(image: ArchiveImage) {
  router.push({ pathname: '/result/[id]', params: { id: image.id } });
}

function ArchiveGrid({ images }: { images: readonly ArchiveImage[] }) {
  const columns = splitArchiveColumns(images);
  return (
    <View style={styles.archiveColumns}>
      {columns.map((column, columnIndex) => (
        <View key={columnIndex} style={styles.archiveColumn}>
          {column.map((image) => (
            <Pressable
              key={image.id}
              onPress={() => openArchiveImage(image)}
              accessibilityRole="button"
              accessibilityLabel={`${image.style.join('·')} 저장 사진 열기`}
              style={styles.archivePhoto}>
              <Image
                source={{ uri: image.thumbnail_url, cacheKey: image.id }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

function SeasonArchive({ images }: { images: readonly ArchiveImage[] }) {
  const groups = new Map<string, { year: number; season: Season; images: ArchiveImage[] }>();
  for (const image of images) {
    const key = `${image.season_year}-${image.season}`;
    const group = groups.get(key) ?? { year: image.season_year, season: image.season, images: [] };
    group.images.push(image);
    groups.set(key, group);
  }
  return (
    <View style={styles.seasonGrid}>
      {[...groups.values()].map((group) => (
        <View key={`${group.year}-${group.season}`} style={styles.seasonCard}>
          <View style={styles.seasonPreview}>
            {group.images.slice(0, 4).map((image) => (
              <Pressable
                key={image.id}
                onPress={() => openArchiveImage(image)}
                accessibilityRole="button"
                accessibilityLabel={`${group.year} ${group.season} 저장 사진 열기`}
                style={styles.seasonPhoto}>
                <Image
                  source={{ uri: image.thumbnail_url, cacheKey: image.id }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              </Pressable>
            ))}
          </View>
          <Text style={styles.seasonTitle}>{group.year} {group.season}</Text>
          <Text style={styles.seasonSubtitle}>{SEASON_MONTHS[group.season]}</Text>
        </View>
      ))}
    </View>
  );
}

function FeedPhoto({
  image,
  colorIndex,
  saved,
  onSave,
}: {
  image: StyleImage;
  colorIndex: number;
  saved: boolean;
  onSave: () => void;
}) {
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  return (
    <View style={[styles.photo, { aspectRatio: ratio, backgroundColor: PHOTO_COLORS[colorIndex] }]}>
      <Image
        // 사진 주소는 받을 때마다 바뀌지만 사진은 같으니 id로 캐시한다.
        source={{ uri: image.thumbnail_url, cacheKey: image.id }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={150}
        accessibilityLabel={`${image.style.join('·')} 스타일 사진`}
        onLoad={({ source }) => {
          if (source.width > 0 && source.height > 0) {
            setRatio(Math.min(MAX_RATIO, Math.max(MIN_RATIO, source.width / source.height)));
          }
        }}
      />
      <Pressable
        onPress={onSave}
        accessibilityRole="button"
        accessibilityLabel={saved ? '저장됨' : '저장'}
        hitSlop={6}
        style={styles.saveButtonWrap}>
        <GlassView radius={18} style={styles.saveButton}>
          <BookmarkIcon color={colors.text} filled={saved} />
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
  archiveHint: {
    marginHorizontal: layout.screenPaddingX,
    marginBottom: 10,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
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
    gap: PHOTO_GAP,
  },
  archiveColumn: {
    flex: 1,
    gap: PHOTO_GAP,
  },
  archivePhoto: {
    aspectRatio: 1,
    overflow: 'hidden',
    backgroundColor: colors.line,
  },
  seasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: 24,
  },
  seasonCard: {
    width: '47%',
  },
  seasonPreview: {
    height: 170,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: PHOTO_GAP,
  },
  seasonPhoto: {
    width: '49%',
    height: 84,
    overflow: 'hidden',
    backgroundColor: colors.line,
  },
  seasonTitle: {
    marginTop: 8,
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
  },
  seasonSubtitle: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
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
