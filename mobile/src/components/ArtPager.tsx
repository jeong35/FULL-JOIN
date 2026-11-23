// 옷 그림 ↔ 내 옷 사진 넘겨 보기(11/22). 옷장 칸·오늘의 룩 칸이 같이 쓴다.
// - 사진을 넣은 옷만 옆으로 넘어가고, 아래 점 2개로 지금 쪽을 보여 준다. 위아래로 밀면 화면이 스크롤된다.
// - 보기 방식(그림 · 사진, data/wardrobePhotos.ts)에 따라 첫 장이 그림 또는 사진이다. 보기를 바꾸면 key로 첫 장부터 다시 그린다.
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { WardrobeItem } from '@/data/types';
import type { ClosetView, WardrobePhoto } from '@/data/wardrobePhotos';
import { colors, fonts } from '@/theme';

import { ItemIcon } from './WardrobeIcon';

export function ArtPager({ item, photo, view, iconSize, photoSize, height, dotsBottom = 4 }: {
  item: WardrobeItem;
  photo: WardrobePhoto | undefined;
  view: ClosetView;
  iconSize: number;
  photoSize: number;
  /** 넘기는 칸의 높이. 폭은 놓인 자리만큼(onLayout). */
  height: number;
  dotsBottom?: number;
}) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const pages: ('icon' | 'photo')[] = photo === undefined ? ['icon'] : view === 'photo' ? ['photo', 'icon'] : ['icon', 'photo'];
  const art = (p: 'icon' | 'photo') =>
    p === 'photo' && photo !== undefined ? (
      <Image source={{ uri: photo.uri }} style={{ width: photoSize, height: photoSize }} resizeMode="contain" accessibilityIgnoresInvertColors />
    ) : (
      <ItemIcon item={item} size={iconSize} />
    );
  if (pages.length === 1) return art('icon');
  return (
    <View style={[styles.wrap, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <ScrollView
          horizontal
          pagingEnabled
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={{ width }}>
          {pages.map((p) => (
            <View key={p} style={[styles.page, { width, height }]}>
              {art(p)}
            </View>
          ))}
        </ScrollView>
      )}
      <View style={[styles.dots, { bottom: dotsBottom }]} pointerEvents="none">
        {pages.map((p, i) => (
          <View key={p} style={[styles.dot, i === page && styles.dotOn]} />
        ))}
      </View>
    </View>
  );
}

/** 넘기지 않는 자리(룩 자세히의 펼쳐 놓은 코디 등): 보기가 '사진'이고 사진이 있으면 사진, 아니면 그림. */
export function ItemArt({ item, photo, view, size }: { item: WardrobeItem; photo: WardrobePhoto | undefined; view: ClosetView; size: number }) {
  if (view === 'photo' && photo !== undefined) {
    return <Image source={{ uri: photo.uri }} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />;
  }
  return <ItemIcon item={item} size={size} />;
}

/** 보기 방식 고르기: 그림 | 사진. 옷장과 추천 탭이 같은 설정을 쓴다. */
export function ViewToggle({ value, onChange, label = '옷 보기' }: { value: ClosetView; onChange: (view: ClosetView) => void; label?: string }) {
  return (
    <View style={styles.toggle} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {(['icon', 'photo'] as const).map((v) => {
        const on = v === value;
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[styles.toggleItem, on && styles.toggleItemOn]}>
            <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{v === 'icon' ? '그림' : '사진'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  page: { alignItems: 'center', justifyContent: 'center' },
  dots: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 3 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(140,125,216,0.35)' },
  dotOn: { width: 12, backgroundColor: colors.purpleStrong },
  toggle: { flexDirection: 'row', padding: 2, gap: 2, borderRadius: 10, backgroundColor: colors.progressTrack },
  toggleItem: { height: 26, paddingHorizontal: 10, borderRadius: 8, justifyContent: 'center' },
  toggleItemOn: { backgroundColor: colors.white },
  toggleText: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  toggleTextOn: { fontFamily: fonts.bold, color: colors.text },
});
