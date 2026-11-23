import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ItemIcon } from '@/components/WardrobeIcon';
import { DetailHeader } from '@/components/ui';
import { kindLabel } from '@/data/catalog';
import { track } from '@/data/events';
import { pickPhoto, startPhotoDraft } from '@/data/photoAdd';
import { useWardrobeState } from '@/data/store';
import { deleteSavedWardrobePhoto, useClosetView, useWardrobePhoto } from '@/data/wardrobePhotos';
import { colors, fonts, glass, layout } from '@/theme';

// 옷 자세히(11/22 시안). 그림이 먼저 보이고, 사진을 넣은 옷은 옆으로 넘기면 내 옷 사진이 나온다.
// 옷장을 '사진'으로 보고 있으면 사진이 먼저 나온다. 여기서 사진을 넣거나 바꾸거나 뺄 수 있다.

type Page = 'icon' | 'photo';

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wardrobe = useWardrobeState();
  const item = wardrobe.data.find((i) => i.id === id);
  const photo = useWardrobePhoto(id);
  const view = useClosetView();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  if (item === undefined) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <DetailHeader title="옷 자세히" onBack={() => router.back()} />
        {wardrobe.status === 'loading' || wardrobe.status === 'idle' ? (
          <ActivityIndicator style={styles.loading} color={colors.purpleStrong} />
        ) : (
          <Text style={styles.missing}>이 옷을 찾지 못했어요. 옷장에서 지웠을 수 있어요.</Text>
        )}
      </SafeAreaView>
    );
  }

  const pageWidth = width - layout.screenPaddingX * 2;
  const pageHeight = Math.min(pageWidth, 340);
  const pages: Page[] = photo === undefined ? ['icon'] : view === 'photo' ? ['photo', 'icon'] : ['icon', 'photo'];
  const meta = [item.slot, item.pattern ? `${item.color} ${item.pattern}` : item.color, item.visual_fit, item.seasons?.length ? item.seasons.join('·') : '사계절']
    .filter(Boolean)
    .join(' · ');

  async function addPhoto(from: 'camera' | 'album') {
    if (item === undefined) return;
    setError(null);
    try {
      const source = await pickPhoto(from);
      if (source === null) return;
      track('wardrobe_add_start', { via: 'photo', source: from, attach: true });
      startPhotoDraft(source, item.id);
      router.push('/add-item/photo-crop');
    } catch (e) {
      setError(e instanceof Error ? e.message : '사진을 불러오지 못했어요');
    }
  }

  async function removePhoto() {
    if (item === undefined) return;
    setError(null);
    try {
      await deleteSavedWardrobePhoto(item.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '사진을 빼지 못했어요');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <DetailHeader title="옷 자세히" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScrollView
          horizontal
          pagingEnabled
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / pageWidth))}
          style={{ width: pageWidth, alignSelf: 'center' }}
          accessibilityLabel={pages.length > 1 ? '그림과 사진, 옆으로 넘겨 보기' : undefined}>
          {pages.map((p) => (
            <View key={p} style={[styles.page, { width: pageWidth, height: pageHeight }]}>
              {p === 'icon' ? (
                <ItemIcon item={item} size={Math.round(pageHeight * 0.66)} />
              ) : (
                <Image
                  source={{ uri: photo?.uri }}
                  style={{ width: pageWidth - 24, height: pageHeight - 24 }}
                  resizeMode="contain"
                  accessibilityLabel={`${kindLabel(item.kind)} 사진`}
                />
              )}
              {pages.length > 1 && (
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{p === 'icon' ? '그림' : '내 옷 사진'}</Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
        {pages.length > 1 && (
          <>
            <View style={styles.dots} accessibilityElementsHidden>
              {pages.map((p, i) => (
                <View key={p} style={[styles.dot, i === page && styles.dotOn]} />
              ))}
            </View>
            <Text style={styles.swipeNote}>옆으로 넘기면 {pages[1] === 'photo' ? '내 옷 사진' : '그림'}이 나와요</Text>
          </>
        )}

        <View style={styles.info}>
          <Text style={styles.name} accessibilityRole="header">
            {kindLabel(item.kind)}
          </Text>
          <Text style={styles.meta}>{meta}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{photo === undefined ? '내 옷 사진 넣기' : '내 옷 사진'}</Text>
          <Text style={styles.cardNote}>
            {photo === undefined
              ? '사진을 넣으면 옷장에서 칸을 옆으로 밀어 내 옷 사진을 볼 수 있어요'
              : photo.cutout
                ? '배경을 지운 사진이에요'
                : '네모로 자른 사진이에요'}
          </Text>
          <View style={styles.buttons}>
            {photo === undefined ? (
              <>
                <SmallButton label="사진 찍기" onPress={() => addPhoto('camera')} />
                <SmallButton label="앨범에서 고르기" onPress={() => addPhoto('album')} />
              </>
            ) : (
              <>
                <SmallButton label="사진 바꾸기" onPress={() => addPhoto('album')} />
                <SmallButton label="사진 빼기" muted onPress={removePhoto} />
              </>
            )}
          </View>
          {error !== null && <Text style={styles.error}>{error}</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SmallButton({ label, muted = false, onPress }: { label: string; muted?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.smallButton}>
      <Text style={[styles.smallButtonText, muted && styles.smallButtonMuted]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    marginTop: 40,
  },
  missing: {
    margin: layout.screenPaddingX,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
  },
  scroll: {
    paddingTop: 16,
    paddingBottom: 32,
  },
  page: {
    borderRadius: 20,
    backgroundColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    position: 'absolute',
    left: 12,
    top: 12,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
  },
  pillText: {
    fontFamily: fonts.bold,
    fontSize: 12.5,
    color: colors.onPurpleFill,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    paddingTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#CFC6E6',
  },
  dotOn: {
    width: 18,
    backgroundColor: colors.purpleStrong,
  },
  swipeNote: {
    marginTop: 6,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  info: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: 18,
    gap: 3,
  },
  name: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    letterSpacing: -0.4,
    color: colors.text,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
  },
  card: {
    marginTop: 16,
    marginHorizontal: layout.screenPaddingX,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: glass.border,
    gap: 8,
  },
  cardTitle: {
    fontFamily: fonts.bold,
    fontSize: 14.5,
    color: colors.text,
  },
  cardNote: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  smallButton: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButtonText: {
    fontFamily: fonts.bold,
    fontSize: 13.5,
    color: colors.onPurpleFill,
  },
  smallButtonMuted: {
    color: colors.textSecondary,
  },
  error: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.danger,
  },
});
