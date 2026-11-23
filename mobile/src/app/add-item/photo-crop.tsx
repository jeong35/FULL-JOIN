import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PhotoBoxEditor, PhotoSteps } from '@/components/PhotoAddParts';
import { DetailHeader, PrimaryButton } from '@/components/ui';
import { warmUpCutout } from '@/data/cutoutWeb';
import { track } from '@/data/events';
import { cutBoxes, MAX_BOXES, newBox, setBoxes, setCutItems, usePhotoDraft } from '@/data/photoAdd';
import { setWardrobePhoto } from '@/data/wardrobePhotos';
import { colors, fonts, layout } from '@/theme';

// 사진으로 옷 추가 ② 네모. 넣을 옷마다 네모를 맞춘다(한 사진에 여러 벌이면 '+ 옷 하나 더', 4개까지).
// 11/22 시안 '사진으로 옷 추가'. 네모를 자동으로 먼저 그려 주는 건 서버(옷 위치 찾기)가 생기면 붙인다.

export default function PhotoCropScreen() {
  const draft = usePhotoDraft();
  const { source, boxes, attachTo } = draft;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 네모를 맞추는 동안 배경 지우기 모델을 미리 받아 둔다(웹, 처음 한 번).
  useEffect(() => {
    warmUpCutout();
  }, []);

  if (source === null) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <DetailHeader title="옷 추가" onBack={() => router.back()} />
        <Text style={styles.empty}>사진을 먼저 골라 주세요.</Text>
      </SafeAreaView>
    );
  }

  const attaching = attachTo !== null;
  const canAdd = !attaching && boxes.length < MAX_BOXES;
  // 머리·진행 막대·제목·버튼 자리를 빼고 남는 높이에 사진을 맞춘다.
  const editorHeight = Math.max(240, height - insets.top - insets.bottom - (attaching ? 300 : 360));

  async function next() {
    if (source === null || working || boxes.length === 0) return;
    setWorking(true);
    setError(null);
    try {
      const items = await cutBoxes(source, boxes);
      track('wardrobe_add_submit', { via: 'photo', step: 'crop', count: items.length });
      if (attaching && attachTo !== null && items[0]) {
        // 옷 자세히에서 '사진 넣기'로 왔으면 그 옷에 사진만 붙이고 돌아간다.
        setWardrobePhoto(attachTo, { uri: items[0].uri, color: items[0].color, cutout: items[0].cutout });
        router.back();
        return;
      }
      setCutItems(items);
      router.push('/add-item/photo-confirm');
    } catch {
      setError('사진을 자르지 못했어요. 다른 사진으로 다시 해 주세요');
    } finally {
      setWorking(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <DetailHeader title={attaching ? '사진 넣기' : '옷 추가'} onBack={() => router.back()} />
      {!attaching && <PhotoSteps labels={['사진', '네모', '확인']} current={1} />}

      <View style={styles.head}>
        <Text style={styles.title}>{attaching ? '이 옷에 네모를 맞춰 주세요' : '넣을 옷에 네모를 맞춰 주세요'}</Text>
        <Text style={styles.sub}>
          {attaching ? '모서리를 끌어서 옷에 맞춰요. 네모 밖은 잘려요' : '모서리를 끌어서 옷에 맞춰요. 여러 벌이면 네모를 더해요'}
        </Text>
      </View>

      <View style={styles.editorWrap}>
        <PhotoBoxEditor
          source={source}
          boxes={boxes}
          maxWidth={width - layout.screenPaddingX * 2}
          maxHeight={editorHeight}
          onChange={(nextBoxes) => setBoxes(nextBoxes)}
        />
      </View>

      {!attaching && (
        <Pressable
          onPress={() => canAdd && setBoxes([...boxes, newBox(boxes.length)])}
          disabled={!canAdd}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canAdd }}
          style={[styles.addBox, !canAdd && styles.addBoxDisabled]}>
          <Text style={styles.addBoxText}>
            + 옷 하나 더 <Text style={styles.addBoxCount}>{boxes.length} / {MAX_BOXES}</Text>
          </Text>
        </Pressable>
      )}

      <View style={[styles.footer, { paddingBottom: Math.max(24, insets.bottom) }]}>
        {error !== null && <Text style={styles.error}>{error}</Text>}
        <PrimaryButton
          label={working ? '배경 지우는 중…' : attaching ? '이 사진으로 넣기' : boxes.length > 1 ? `${boxes.length}벌 · 다음` : '다음'}
          onPress={next}
          disabled={working || boxes.length === 0}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  empty: {
    margin: layout.screenPaddingX,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
  },
  head: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: 18,
    paddingBottom: 12,
    gap: 4,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    letterSpacing: -0.3,
    color: colors.text,
  },
  sub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  editorWrap: {
    paddingHorizontal: layout.screenPaddingX,
  },
  addBox: {
    marginTop: 12,
    marginHorizontal: layout.screenPaddingX,
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#B6A3E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBoxDisabled: {
    opacity: 0.45,
  },
  addBoxText: {
    fontFamily: fonts.extraBold,
    fontSize: 14,
    color: colors.textPurple,
  },
  addBoxCount: {
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  footer: {
    marginTop: 'auto',
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: 12,
    gap: 8,
  },
  error: {
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.danger,
  },
});
