import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookmarkIcon } from '@/components/Icons';
import { KindIcon } from '@/components/KindIcon';
import { BackButton, PrimaryButton, SmallWhiteButton } from '@/components/ui';
import { errorMessage, fetchStyleImageDetail } from '@/data/api';
import { track } from '@/data/events';
import { markHintDone } from '@/data/hints';
import { heartStyleImage, unheartStyleImage, useSaved } from '@/data/store';
import type { StyleImageDetail, StyleImageDetailItem } from '@/data/types';
import { colors, fonts, layout } from '@/theme';

export default function StyleDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const imageId = typeof id === 'string' ? id : undefined;
  const saved = useSaved();
  const [detail, setDetail] = useState<StyleImageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trackedItems = useRef(new Set<string>());

  const load = async () => {
    if (imageId === undefined) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await fetchStyleImageDetail(imageId));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (imageId === undefined) return undefined;
    let active = true;
    fetchStyleImageDetail(imageId)
      .then((nextDetail) => {
        if (active) setDetail(nextDetail);
      })
      .catch((loadError: unknown) => {
        if (active) {
          const message = errorMessage(loadError);
          track('error_shown', { screen: 'style_detail', error_code: message });
          setError(message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [imageId]);

  if (imageId === undefined) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>사진을 찾을 수 없어요.</Text>
        <SmallWhiteButton label="돌아가기" onPress={() => router.back()} />
      </View>
    );
  }

  const isSaved = saved[imageId] !== undefined;

  const toggleSave = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (isSaved) await unheartStyleImage(imageId);
      else {
        track('photo_save', { style_image_id: imageId, place: 'detail' });
        markHintDone('home_after_closet');
        const ok = await heartStyleImage(imageId);
        if (ok) track('photo_save_done', { style_image_id: imageId, place: 'detail' });
        else {
          track('photo_save_failed', { style_image_id: imageId, place: 'detail' });
          track('error_shown', { screen: 'style_detail', error_code: 'photo_save_failed' });
        }
      }
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const openComparison = async () => {
    if (busy) return;
    setBusy(true);
    track('compare_open', { style_image_id: imageId, was_saved: isSaved });
    if (!isSaved) {
      const startedAt = Date.now();
      track('photo_save', { style_image_id: imageId, place: 'compare' });
      const ok = await heartStyleImage(imageId);
      if (!ok) {
        track('photo_save_failed', { style_image_id: imageId, place: 'compare' });
        track('comparison_failed', { style_image_id: imageId, latency_ms: Date.now() - startedAt, error_code: 'save_failed' });
        track('error_shown', { screen: 'style_detail', error_code: 'save_failed' });
        setBusy(false);
        return;
      }
      track('photo_save_done', { style_image_id: imageId, place: 'compare' });
      track('comparison_done', { style_image_id: imageId, latency_ms: Date.now() - startedAt });
    }
    setBusy(false);
    router.push({ pathname: '/result/[id]', params: { id: imageId } });
  };

  if (loading && detail === null) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.textPurple} />
        <Text style={styles.helpText}>제품 정보를 불러오는 중이에요</Text>
      </SafeAreaView>
    );
  }

  if (detail === null) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>{error ?? '제품 정보를 불러오지 못했어요.'}</Text>
        <SmallWhiteButton label="다시 시도" onPress={load} />
        <SmallWhiteButton label="돌아가기" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const products = detail.items.filter((item) => item.product_url !== null);
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} size={40} />
        <Text style={styles.headerTitle}>사진 속 제품 정보</Text>
        <Pressable
          onPress={toggleSave}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={isSaved ? '저장 취소' : '저장'}
          style={styles.bookmarkButton}>
          {busy ? (
            <ActivityIndicator size="small" color={colors.textPurple} />
          ) : (
            <BookmarkIcon color={colors.textPurple} size={20} filled={isSaved} />
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Image
          source={{ uri: detail.style_image.thumbnail_url, cacheKey: detail.style_image.id }}
          style={styles.photo}
          contentFit="cover"
          accessibilityLabel={`${detail.style_image.style.join('·')} 스타일 사진`}
        />
        <View style={styles.summary}>
          <Text style={styles.styles}>{detail.style_image.style.join(' · ')}</Text>
          <Text style={styles.source}>출처 유형 · {detail.style_image.source}</Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>사진 속 아이템</Text>
          <Text style={styles.sectionCount}>{detail.items.length}개</Text>
        </View>
        <View style={styles.itemList}>
          {detail.items.map((item) => (
            <View
              key={item.item_id}
              onLayout={() => {
                if (trackedItems.current.has(item.item_id)) return;
                trackedItems.current.add(item.item_id);
                track('style_detail_item_view', { item_id: item.item_id, kind: item.kind, color: item.color ?? null });
              }}>
              <ProductItem item={item} />
            </View>
          ))}
        </View>

        {products.length === 0 && (
          <View style={styles.noProduct}>
            <Text style={styles.noProductTitle}>연결된 정확한 상품 정보가 없어요</Text>
            <Text style={styles.helpText}>사진 분석 정보는 볼 수 있고, 저장 후에는 비슷한 상품을 찾을 수 있어요.</Text>
          </View>
        )}
        {error !== null && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label={isSaved ? '내 옷장 비교 보기' : '저장하고 내 옷장과 비교'}
          onPress={openComparison}
          disabled={busy}
        />
      </View>
    </SafeAreaView>
  );
}

function ProductItem({ item }: { item: StyleImageDetailItem }) {
  // 제목은 다른 아이템과 같은 '색 · 핏 · 종류'. 쇼핑몰 상품명은 길고 브랜드가 겹쳐서 보여 주지 않고 링크로만 연다.
  const label = [item.color, item.visual_fit, item.kind].filter(Boolean).join(' · ');
  const groundedBrand = item.brand_source === '없음' ? null : item.brand;
  const source = [...new Set([groundedBrand, item.shop].filter((value): value is string => Boolean(value)))].join(' · ');
  return (
    <View style={styles.itemCard}>
      <View style={styles.itemIcon}>
        <KindIcon kind={item.kind} color={item.color} fit={item.visual_fit} size={42} />
      </View>
      <View style={styles.itemText}>
        <Text style={styles.itemName}>{label}</Text>
        {source !== '' && <Text style={styles.itemMeta}>{source}</Text>}
        {item.product_url !== null ? (
          <Pressable
            onPress={() => {
              track('shop_link_click', { place: 'detail', match_type: 'exact', platform: item.shop ?? null, kind: item.kind });
              void WebBrowser.openBrowserAsync(item.product_url!);
            }}
            accessibilityRole="link"
            style={styles.productLink}>
            <Text style={styles.productLinkText}>이 상품 보기 ›</Text>
          </Pressable>
        ) : (
          <Text style={styles.unlinked}>정확한 상품 링크 없음</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: layout.screenPaddingX },
  header: { height: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: layout.screenPaddingX },
  headerTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.text },
  bookmarkButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.white },
  content: { paddingBottom: 24 },
  photo: { width: '100%', aspectRatio: 4 / 5, maxHeight: 500, backgroundColor: colors.photoPlaceholder },
  summary: { paddingHorizontal: layout.screenPaddingX, paddingVertical: 16, gap: 4 },
  styles: { fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  source: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: layout.screenPaddingX, marginTop: 4, marginBottom: 10 },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  sectionCount: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  itemList: { gap: 10, paddingHorizontal: layout.screenPaddingX },
  itemCard: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.white },
  itemIcon: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.photoPlaceholder },
  itemText: { flex: 1, minWidth: 0, justifyContent: 'center' },
  itemName: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  itemMeta: { marginTop: 2, fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  productLink: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.photoPlaceholder },
  productLinkText: { fontFamily: fonts.bold, fontSize: 12, color: colors.textPurple },
  unlinked: { marginTop: 7, fontFamily: fonts.regular, fontSize: 11, color: colors.textSecondary },
  noProduct: { margin: layout.screenPaddingX, padding: 16, borderRadius: 16, backgroundColor: '#F3EEF9', gap: 5 },
  noProductTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  helpText: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.textSecondary, textAlign: 'center' },
  errorText: { paddingHorizontal: layout.screenPaddingX, fontFamily: fonts.regular, fontSize: 12, color: '#A23B3B', textAlign: 'center' },
  footer: { paddingHorizontal: layout.screenPaddingX, paddingTop: 10, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.background },
});
