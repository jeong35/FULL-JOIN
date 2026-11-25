// 홈 피드 사진 한 장(사진 + 오른쪽 아래 저장 버튼). 홈 피드와 홈 검색 결과가 같이 쓴다.
// 사진은 각진 네모, 두 줄 사이는 2px(DESIGN.md 4절).
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { GlassView } from '@/components/GlassView';
import { BookmarkIcon } from '@/components/Icons';
import { useIsUnhearting } from '@/data/store';
import type { StyleImage } from '@/data/types';
import { colors } from '@/theme';

export const PHOTO_GAP = 2;
const PHOTO_COLORS = [colors.line, '#E4E1EC'] as const;
// 사진 비율(가로/세로)을 받기 전 기본값과 허용 범위. 너무 길거나 넓은 사진은 잘라서 보여 준다.
const DEFAULT_RATIO = 3 / 4;
const MIN_RATIO = 9 / 16;
const MAX_RATIO = 1;

// 순서대로 왼쪽·오른쪽에 번갈아 넣는다. 사진 비율을 받은 뒤에도 자리가 바뀌지 않는다.
export function splitColumns<T>(images: readonly T[]): [T[], T[]] {
  const columns: [T[], T[]] = [[], []];
  images.forEach((image, index) => columns[index % 2].push(image));
  return columns;
}

export function FeedPhoto({
  image,
  colorIndex,
  saved,
  onOpen,
  onSave,
  onLayout,
}: {
  image: StyleImage;
  colorIndex: number;
  saved: boolean;
  onOpen: () => void;
  onSave: () => void;
  onLayout?: (y: number, height: number) => void;
}) {
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const unhearting = useIsUnhearting(image.id);
  return (
    <View
      style={[styles.photo, { aspectRatio: ratio, backgroundColor: PHOTO_COLORS[colorIndex] }]}
      onLayout={onLayout === undefined ? undefined : (event) => onLayout(event.nativeEvent.layout.y, event.nativeEvent.layout.height)}>
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
  photo: {
    // 사진은 각진 네모(모서리 0).
    overflow: 'hidden',
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
    boxShadow: '0 2px 10px rgba(30,20,50,0.12)',
  },
});
