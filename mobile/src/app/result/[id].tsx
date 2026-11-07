import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassView } from '@/components/GlassView';
import { KindIcon } from '@/components/KindIcon';
import { BookmarkIcon } from '@/components/Icons';
import { BackButton, InfoBar, PrimaryButton, SmallWhiteButton } from '@/components/ui';
import type { Kind } from '@/data/catalog';
import { heartStyleImage, useHeart, useStyleImage, useWardrobe, type HeartState } from '@/data/store';
import type { GapStatus, HeartItem, HeartResult, StyleImage, WardrobeItem } from '@/data/types';
import { colors, fonts, glass, layout } from '@/theme';

// 저장 후 결과(옷장 대조). 모양은 design/screens/14-save-result.html을 따른다.
// 결과는 서버(POST /style-images/{id}/heart)가 내 옷장과 갭 분석 규칙으로 맞춘 것이다.
// 그래서 '활용'은 옷장에 실제로 있는 옷일 때만 나온다(AGENTS.md 절대 규칙 5).

const PHOTO_HEIGHT = 280;
const SHEET_TOP = 236;

export default function SaveResultScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const imageId = typeof id === 'string' ? id : undefined;
  const image = useStyleImage(imageId);
  const heart = useHeart(imageId);

  // 이 화면 주소로 바로 들어와(새로고침 등) 결과가 없으면 서버에 다시 맞춰 달라고 한다.
  useEffect(() => {
    if (imageId !== undefined && heart === undefined) heartStyleImage(imageId);
  }, [imageId, heart]);

  if (imageId === undefined) {
    return (
      <View style={[styles.container, styles.invalid]}>
        <Text style={styles.invalidText}>사진을 찾을 수 없어요.</Text>
        <SmallWhiteButton label="돌아가기" onPress={() => router.back()} />
      </View>
    );
  }

  return <SaveResult id={imageId} image={image} heart={heart} />;
}

// 비슷함은 사용자가 활용/구매를 고르는 정보 상태다(AGENTS.md 2절).
type SimilarChoice = '활용' | '구매';
const SIMILAR_OPTIONS: { value: SimilarChoice; label: string }[] = [
  { value: '활용', label: '가진 걸로 입기' },
  { value: '구매', label: '새로 찾기' },
];

// 서버가 아이템 정보(종류·색·핏)를 같이 준 아이템만 카드로 그릴 수 있다.
type ShownItem = HeartItem & { kind: Kind };
function hasKind(item: HeartItem): item is ShownItem {
  return item.kind !== undefined;
}

function SaveResult({ id, image, heart }: { id: string; image: StyleImage | undefined; heart: HeartState | undefined }) {
  const insets = useSafeAreaInsets();
  const result = heart?.result ?? null;

  return (
    <View style={styles.container}>
      <View style={[styles.photo, { height: PHOTO_HEIGHT + insets.top }]}>
        {image !== undefined && (
          <Image
            source={{ uri: image.thumbnail_url, cacheKey: image.id }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition="top"
            accessibilityLabel={`저장한 ${image.style.join('·')} 스타일 사진`}
          />
        )}
        <BackButton
          onPress={() => router.back()}
          size={44}
          style={[styles.photoButton, { top: insets.top + 20, left: layout.screenPaddingX }]}
        />
        <View
          style={[styles.photoButton, { top: insets.top + 20, right: layout.screenPaddingX }]}
          accessible
          accessibilityLabel="저장됨">
          <GlassView radius={13} style={styles.savedButton}>
            <BookmarkIcon color={colors.textPurple} size={18} filled />
          </GlassView>
        </View>
      </View>

      <View style={[styles.sheet, { top: SHEET_TOP + insets.top }]}>
        <View style={styles.handle} />
        {result !== null ? (
          <ResultBody result={result} />
        ) : heart?.status === 'error' ? (
          <View style={styles.center}>
            <Text style={styles.centerText}>{heart.error}</Text>
            <SmallWhiteButton label="다시 시도" onPress={() => heartStyleImage(id)} />
          </View>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textPurple} />
            <Text style={styles.centerText}>내 옷장과 맞춰 보는 중이에요</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function ResultBody({ result }: { result: HeartResult }) {
  const insets = useSafeAreaInsets();
  const wardrobe = useWardrobe();
  const [choices, setChoices] = useState<Record<string, SimilarChoice>>({});

  const items = result.items.filter(hasKind);
  const missingInfo = result.items.length > 0 && items.length === 0;
  const wardrobeEmpty = result.message !== undefined;

  // '비슷한 ○○ 찾기'는 구매할 첫 아이템 기준. 비슷함에서 '새로 찾기'를 고른 것도 구매로 본다.
  const firstToBuy = items.find((item) => item.gap_status === '구매' || choices[item.item_id] === '구매');
  const product = result.products[0];
  const productUrl = result.product_url ?? null;

  let footerButton = null;
  if (product !== undefined && firstToBuy !== undefined) {
    footerButton = (
      <PrimaryButton
        label={`비슷한 ${firstToBuy.kind} 찾기`}
        onPress={() => WebBrowser.openBrowserAsync(product.product_url)}
      />
    );
  } else if (productUrl !== null) {
    footerButton = (
      <PrimaryButton
        label={`${result.shop ?? '쇼핑몰'}에서 이 상품 보기`}
        onPress={() => WebBrowser.openBrowserAsync(productUrl)}
      />
    );
  }

  return (
    <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <InfoBar style={styles.savedBar}>
          <BookmarkIcon color={colors.textPurple} size={15} filled />
          <Text style={styles.savedBarText}>모든 저장에 담았어요</Text>
        </InfoBar>

        <Text style={styles.title} accessibilityRole="header">
          {missingInfo ? '아이템 정보를 불러오지 못했어요' : `아이템 ${items.length}개를 찾았어요`}
        </Text>
        <Text style={styles.subtitle}>{wardrobeEmpty ? result.message : '내 옷장과 맞춰 봤어요'}</Text>

        {wardrobeEmpty && (
          <InfoBar
            style={styles.emptyBar}
            right={<SmallWhiteButton label="옷 추가" onPress={() => router.push('/add-item/kind')} />}>
            <Text style={styles.emptyBarText}>가진 옷을 넣으면 활용·필요를 알려 드려요</Text>
          </InfoBar>
        )}

        <View style={styles.list}>
          {items.map((item, index) => (
            <ResultCard
              key={item.item_id}
              item={item}
              wardrobe={wardrobe}
              thumbColor={index % 2 === 0 ? colors.line : '#DFD5F0'}
              choice={choices[item.item_id] ?? null}
              onChoose={(value) => setChoices((prev) => ({ ...prev, [item.item_id]: value }))}
            />
          ))}
        </View>

        <Text style={styles.note}>
          브랜드는 근거가 있을 때만 보여 줘요.
          {result.shop ? ` 사진 출처: ${result.shop}` : ''}
        </Text>
      </ScrollView>

      {footerButton !== null && (
        <View style={[styles.footer, { paddingBottom: Math.max(20, insets.bottom) }]}>{footerButton}</View>
      )}
    </>
  );
}

function describe(item: ShownItem, wardrobe: readonly WardrobeItem[]): string {
  const parts = [
    item.brand_source !== '없음' ? item.brand : null,
    item.color ?? null,
  ].filter((part): part is string => typeof part === 'string' && part.length > 0);
  const prefix = parts.length === 0 ? '' : `${parts.join(' · ')} · `;
  switch (item.gap_status) {
    case '활용':
      return `${prefix}옷장에 같은 색 있음`;
    case '구매':
      return `${prefix}옷장에 없음`;
    case '비슷함': {
      const matched = wardrobe.filter((w) => item.wardrobe_item_ids.includes(w.id));
      const matchedColors = [...new Set(matched.map((w) => w.color))].join('·');
      return matchedColors === '' ? `${prefix}옷장에 비슷한 옷 있음` : `${prefix}옷장에 ${matchedColors} 있음`;
    }
    default:
      return parts.join(' · ');
  }
}

function ResultCard({
  item,
  wardrobe,
  thumbColor,
  choice,
  onChoose,
}: {
  item: ShownItem;
  wardrobe: readonly WardrobeItem[];
  thumbColor: string;
  choice: SimilarChoice | null;
  onChoose: (value: SimilarChoice) => void;
}) {
  const fit = item.visual_fit ?? null;
  const name = fit === null ? item.kind : `${item.kind} (${fit})`;
  return (
    <GlassView radius={16} style={styles.card}>
      <View style={styles.cardRow}>
        <View style={[styles.thumb, { backgroundColor: thumbColor }]}>
          <KindIcon kind={item.kind} color={item.color ?? null} fit={fit} size={40} />
        </View>
        <View style={styles.cardText}>
          <Text style={styles.cardName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {describe(item, wardrobe)}
          </Text>
        </View>
        {item.gap_status !== null && <GapTag status={item.gap_status} />}
      </View>

      {item.gap_status === '비슷함' && (
        <View style={styles.choice}>
          {SIMILAR_OPTIONS.map((option) => {
            const selected = option.value === choice;
            return (
              <Pressable
                key={option.value}
                onPress={() => onChoose(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.choiceItem, selected && styles.choiceItemSelected]}>
                <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </GlassView>
  );
}

// 태그: 높이 26, 모서리 7. 서버 값 '구매'는 화면에 '필요'로 보여 준다(DESIGN.md 8절).
function GapTag({ status }: { status: GapStatus }) {
  if (status === '활용') {
    return (
      <View style={[styles.tag, styles.tagUse]}>
        <Text style={[styles.tagText, styles.tagTextUse]}>활용</Text>
      </View>
    );
  }
  if (status === '비슷함') {
    return (
      <View style={[styles.tag, styles.tagSimilar]}>
        <Text style={styles.tagText}>비슷함</Text>
      </View>
    );
  }
  return (
    <View style={[styles.tag, styles.tagNeed]}>
      <Text style={styles.tagText}>필요</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  invalid: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  invalidText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#E2D8F2',
    overflow: 'hidden',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: 80,
  },
  centerText: {
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  emptyBar: {
    marginBottom: 12,
  },
  emptyBarText: {
    flexShrink: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.text,
  },
  photoButton: {
    position: 'absolute',
  },
  savedButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 6px 20px rgba(46,26,92,0.08)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#DFD5F0',
    alignSelf: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: 12,
  },
  savedBar: {
    marginTop: 12,
  },
  savedBarText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.text,
  },
  title: {
    marginTop: 16,
    marginBottom: 2,
    marginHorizontal: 4,
    fontFamily: fonts.extraBold,
    fontSize: 20,
    letterSpacing: -0.3,
    color: colors.text,
  },
  subtitle: {
    marginBottom: 12,
    marginHorizontal: 4,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  list: {
    gap: 8,
  },
  card: {
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 10,
    paddingRight: 12,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumb: {
    width: 40,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    minWidth: 0,
  },
  cardName: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
  },
  cardMeta: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  tag: {
    height: 26,
    paddingHorizontal: 11,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagUse: {
    backgroundColor: colors.purpleFill,
  },
  tagSimilar: {
    borderWidth: 1,
    borderColor: colors.purpleFill,
    backgroundColor: colors.white,
  },
  tagNeed: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.purpleStrong,
  },
  tagText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.tagText,
  },
  tagTextUse: {
    color: colors.onPurpleFill,
  },
  choice: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 10,
    marginLeft: 52,
    padding: 3,
    borderRadius: 13,
    backgroundColor: 'rgba(46,26,92,0.05)',
  },
  choiceItem: {
    flex: 1,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceItemSelected: {
    backgroundColor: colors.white,
    boxShadow: glass.selectedInnerShadow,
  },
  choiceText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.textSecondary,
  },
  choiceTextSelected: {
    color: colors.onPurpleFill,
  },
  note: {
    marginTop: 10,
    marginHorizontal: 4,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  footer: {
    paddingTop: 12,
    paddingHorizontal: layout.screenPaddingX,
  },
});
