import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { PhotoBoxEditor, PhotoSteps } from '@/components/PhotoAddParts';
import { DetailHeader, PrimaryButton } from '@/components/ui';
import { warmUpCutout } from '@/data/cutoutWeb';
import { track } from '@/data/events';
import {
  appendPhotoSources,
  cutBoxes,
  MAX_BATCH_ITEMS,
  MAX_BATCH_PHOTOS,
  MAX_BOXES,
  newBox,
  pickPhotos,
  removeDraftPhoto,
  setActivePhoto,
  setBoxes,
  setCutItems,
  setPhotoProcessing,
  usePhotoDraft,
} from '@/data/photoAdd';
import { setWardrobePhoto } from '@/data/wardrobePhotos';
import { canAddBatchItem } from '@/data/photoBatchCore';
import { colors, fonts, layout } from '@/theme';

// 사진으로 옷 추가 ② 네모. 넣을 옷마다 네모를 맞춘다(한 사진에 여러 벌이면 '+ 옷 하나 더', 4개까지).
// 11/22 시안 '사진으로 옷 추가'. 네모를 자동으로 먼저 그려 주는 건 서버(옷 위치 찾기)가 생기면 붙인다.

export default function PhotoCropScreen() {
  const draft = usePhotoDraft();
  const { photos, activeIndex, attachTo } = draft;
  const activePhoto = photos[activeIndex];
  const source = activePhoto?.source ?? null;
  const boxes = activePhoto?.boxes ?? [];
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 네모를 맞추는 동안 배경 지우기 모델을 미리 받아 둔다(웹, 처음 한 번).
  useEffect(() => {
    warmUpCutout();
  }, []);

  if (source === null || activePhoto === undefined) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <DetailHeader title="옷 추가" onBack={() => router.back()} />
        <Text style={styles.empty}>사진을 먼저 골라 주세요.</Text>
      </SafeAreaView>
    );
  }

  const attaching = attachTo !== null;
  const plannedItems = photos.reduce((sum, photo) => sum + (photo.status === 'ready' ? photo.items.length : photo.boxes.length), 0);
  const canAdd = !attaching && canAddBatchItem(plannedItems, boxes.length, MAX_BATCH_ITEMS, MAX_BOXES);
  const canAddPhoto = !attaching && photos.length < MAX_BATCH_PHOTOS;
  const completedPhotos = photos.filter((photo) => photo.status === 'ready').length;
  // 머리·진행 막대·제목·버튼 자리를 빼고 남는 높이에 사진을 맞춘다.
  const editorHeight = Math.max(200, height - insets.top - insets.bottom - (attaching ? 300 : 440));

  async function next() {
    if (source === null || working || boxes.length === 0) return;
    setWorking(true);
    setError(null);
    const startedAt = Date.now();
    const processingIndex = activeIndex;
    setPhotoProcessing(processingIndex, 'processing');
    try {
      const items = await cutBoxes(source, boxes);
      track('wardrobe_add_submit', {
        via: 'photo', step: 'crop', photo_count: photos.length, item_count: items.length,
        cutout_count: items.filter((item) => item.cutout).length,
        tagged_count: items.filter((item) => item.tagged).length,
        duration_ms: Date.now() - startedAt,
      });
      if (attaching && attachTo !== null && items[0]) {
        // 옷 자세히에서 '사진 넣기'로 왔으면 그 옷에 사진만 붙이고 돌아간다.
        if (!setWardrobePhoto(attachTo, { uri: items[0].uri, color: items[0].color, cutout: items[0].cutout })) {
          setPhotoProcessing(processingIndex, 'failed', '사진 저장 공간이 부족해요');
          setError('사진 저장 공간이 부족해요. 기기 공간을 정리한 뒤 다시 시도해 주세요');
          return;
        }
        router.back();
        return;
      }
      setCutItems(items);
      const nextIndex = photos.findIndex((photo, index) => index !== processingIndex && photo.status !== 'ready');
      if (nextIndex >= 0) setActivePhoto(nextIndex);
      else router.push('/add-item/photo-confirm');
    } catch {
      setPhotoProcessing(processingIndex, 'failed', '사진 처리 실패');
      setError('사진을 자르지 못했어요. 다른 사진으로 다시 해 주세요');
    } finally {
      setWorking(false);
    }
  }

  async function addPhotos(from: 'camera' | 'album') {
    if (!canAddPhoto || working) return;
    setError(null);
    try {
      const selected = await pickPhotos(from, MAX_BATCH_PHOTOS - photos.length);
      if (selected.length === 0) return;
      appendPhotoSources(selected);
      track('wardrobe_add_start', { via: 'photo', source: from, photo_count: selected.length, batch: true, again: true });
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : '사진을 불러오지 못했어요');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <DetailHeader title={attaching ? '사진 넣기' : '옷 추가'} onBack={() => router.back()} />
      {!attaching && <PhotoSteps labels={['사진', '네모', '확인']} current={1} />}

      {!attaching && (
        <View style={styles.batchSummary}>
          <Text style={styles.batchProgress}>사진 {activeIndex + 1}/{photos.length} · 처리 {completedPhotos}/{photos.length} · 최대 {MAX_BATCH_ITEMS}벌</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoQueue}>
            {photos.map((photo, index) => (
              <Pressable
                key={photo.id}
                onPress={() => !working && setActivePhoto(index)}
                disabled={working}
                accessibilityRole="button"
                accessibilityLabel={`${index + 1}번 사진 ${photo.status}`}
                style={[styles.photoChoice, index === activeIndex && styles.photoChoiceOn]}>
                <Image source={{ uri: photo.source.uri }} style={styles.photoThumb} />
                <Text style={styles.photoState}>{photo.status === 'ready' ? '완료' : photo.status === 'failed' ? '다시' : `${index + 1}`}</Text>
                {photos.length > 1 && (
                  <Pressable
                    onPress={(event) => { event.stopPropagation(); removeDraftPhoto(index); }}
                    accessibilityRole="button"
                    accessibilityLabel={`${index + 1}번 사진 제거`}
                    style={styles.photoRemove}>
                    <Text style={styles.photoRemoveText}>×</Text>
                  </Pressable>
                )}
              </Pressable>
            ))}
            {canAddPhoto && (
              <View style={styles.addPhotoColumn}>
                <Pressable onPress={() => addPhotos('album')} style={styles.addPhoto}><Text style={styles.addPhotoText}>+ 앨범</Text></Pressable>
                <Pressable onPress={() => addPhotos('camera')} style={styles.addPhoto}><Text style={styles.addPhotoText}>+ 촬영</Text></Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      )}

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
          label={working ? `사진 ${activeIndex + 1} 처리 중…` : attaching ? '이 사진으로 넣기' : completedPhotos + 1 < photos.length ? `${boxes.length}벌 처리 · 다음 사진` : `${plannedItems}벌 · 전체 확인`}
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
  batchSummary: {
    paddingTop: 10,
    gap: 8,
  },
  batchProgress: {
    paddingHorizontal: layout.screenPaddingX,
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  photoQueue: {
    paddingHorizontal: layout.screenPaddingX,
    gap: 8,
  },
  photoChoice: {
    width: 58,
    height: 58,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  photoChoiceOn: {
    borderColor: colors.purpleStrong,
  },
  photoThumb: {
    width: '100%',
    height: '100%',
  },
  photoState: {
    position: 'absolute',
    left: 4,
    bottom: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 7,
    overflow: 'hidden',
    backgroundColor: 'rgba(35,26,59,0.74)',
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.white,
  },
  photoRemove: {
    position: 'absolute',
    right: 2,
    top: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  photoRemoveText: {
    marginTop: -2,
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.text,
  },
  addPhotoColumn: {
    width: 62,
    gap: 5,
  },
  addPhoto: {
    flex: 1,
    borderRadius: 9,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#B6A3E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoText: {
    fontFamily: fonts.bold,
    fontSize: 10.5,
    color: colors.textPurple,
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
