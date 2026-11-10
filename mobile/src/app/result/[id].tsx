import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassView } from '@/components/GlassView';
import { KindIcon } from '@/components/KindIcon';
import { BookmarkIcon } from '@/components/Icons';
import { BackButton, InfoBar, SmallWhiteButton } from '@/components/ui';
import { errorMessage, postItemDecision } from '@/data/api';
import type { Kind } from '@/data/catalog';
import { buildOutfits, substitutesFor, type OutfitPiece, type OutfitSuggestion } from '@/data/outfits';
import { shoppingLinksFor } from '@/data/shopping';
import { heartStyleImage, unheartStyleImage, useHeart, useStyleImage, useWardrobe, type HeartState } from '@/data/store';
import type { GapStatus, HeartItem, HeartResult, ItemDecisionResult, Product, StyleImage, WardrobeItem } from '@/data/types';
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
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // 이 화면 주소로 바로 들어와(새로고침 등) 결과가 없으면 서버에 다시 맞춰 달라고 한다.
  useEffect(() => {
    if (imageId !== undefined && heart === undefined && !removing) heartStyleImage(imageId);
  }, [imageId, heart, removing]);

  if (imageId === undefined) {
    return (
      <View style={[styles.container, styles.invalid]}>
        <Text style={styles.invalidText}>사진을 찾을 수 없어요.</Text>
        <SmallWhiteButton label="돌아가기" onPress={() => router.back()} />
      </View>
    );
  }

  async function removeHeart() {
    if (imageId === undefined || removing) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await unheartStyleImage(imageId);
      router.back();
    } catch (error) {
      setRemoveError(errorMessage(error));
      setRemoving(false);
    }
  }

  return (
    <SaveResult
      id={imageId}
      image={image}
      heart={heart}
      removing={removing}
      removeError={removeError}
      onRemove={removeHeart}
    />
  );
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

function SaveResult({
  id,
  image,
  heart,
  removing,
  removeError,
  onRemove,
}: {
  id: string;
  image: StyleImage | undefined;
  heart: HeartState | undefined;
  removing: boolean;
  removeError: string | null;
  onRemove: () => void;
}) {
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
        <Pressable
          onPress={onRemove}
          disabled={removing}
          style={[styles.photoButton, { top: insets.top + 20, right: layout.screenPaddingX }]}
          accessibilityRole="button"
          accessibilityLabel="저장 취소"
          accessibilityState={{ busy: removing, disabled: removing }}>
          <GlassView radius={13} style={styles.savedButton}>
            {removing ? (
              <ActivityIndicator size="small" color={colors.textPurple} />
            ) : (
              <BookmarkIcon color={colors.textPurple} size={18} filled />
            )}
          </GlassView>
        </Pressable>
        {removeError !== null && (
          <Text style={[styles.removeError, { top: insets.top + 70 }]}>{removeError}</Text>
        )}
      </View>

      <View style={[styles.sheet, { top: SHEET_TOP + insets.top }]}>
        <View style={styles.handle} />
        {result !== null ? (
          <ResultBody key={id} imageId={id} result={result} />
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

function ResultBody({ imageId, result }: { imageId: string; result: HeartResult }) {
  const wardrobe = useWardrobe();
  const [choices, setChoices] = useState<Record<string, SimilarChoice>>({});
  const [decisions, setDecisions] = useState<Record<string, ItemDecisionResult>>({});
  const [pendingItems, setPendingItems] = useState<Record<string, boolean>>({});
  const [decisionErrors, setDecisionErrors] = useState<Record<string, string>>({});

  const items = result.items.filter(hasKind);
  const missingInfo = result.items.length > 0 && items.length === 0;
  const wardrobeEmpty = result.message !== undefined;

  // 쇼핑 링크는 아이템마다 단다 — 사진 속 실제 상품 링크(있을 때)를 먼저, 그다음 무신사·에이블리·지그재그 검색.
  // 앞으로 사진 속 모든 아이템에 상품 링크가 붙어도 같은 방식으로 늘어난다(SPEC 4절 쇼핑몰 상품 정보 저장).

  // 코디 조합(AC11): 사진 구성을 부위별로 내 옷장 옷으로 채우고, 없는 자리는 가까운 종류의 내 옷으로 대신한다.
  // 비슷함에서 '새로 찾기'를 고르면 그 자리는 '필요'가 된다. 필요한 자리에는 무신사·에이블리·지그재그 링크를 단다.
  const outfits = wardrobeEmpty ? [] : buildOutfits(items, wardrobe, choices);
  // 활용·필요만 있으면 코디가 위 목록과 같은 내용이라, 비슷함·대체 옷이 들어간 코디가 있을 때만 보여 준다(11/10 팀 결정).
  const showOutfits = outfits.some((outfit) =>
    outfit.pieces.some((piece) => piece.type === 'owned' && (piece.similar || piece.substitute)));
  const linksFor = (item: HeartItem): Product[] => shoppingLinksFor(
    item,
    decisions[item.item_id]?.products ?? result.products.filter((candidate) => candidate.item_id === item.item_id),
  );

  const choose = async (itemId: string, value: SimilarChoice) => {
    const previousChoice = choices[itemId];
    setChoices((current) => ({ ...current, [itemId]: value }));
    setPendingItems((current) => ({ ...current, [itemId]: true }));
    setDecisionErrors((current) => ({ ...current, [itemId]: '' }));
    try {
      const decision = await postItemDecision(imageId, itemId, value);
      setDecisions((current) => ({ ...current, [itemId]: decision }));
    } catch (error) {
      setChoices((current) => {
        if (previousChoice !== undefined) return { ...current, [itemId]: previousChoice };
        const next = { ...current };
        delete next[itemId];
        return next;
      });
      setDecisionErrors((current) => ({ ...current, [itemId]: errorMessage(error) }));
    } finally {
      setPendingItems((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
    }
  };

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
              decision={decisions[item.item_id] ?? null}
              links={item.gap_status === null || item.gap_status === '구매' || choices[item.item_id] === '구매' ? linksFor(item) : []}
              substitutes={substitutesFor(item, wardrobe)}
              pending={pendingItems[item.item_id] === true}
              error={decisionErrors[item.item_id] || null}
              // '대체'는 화면에서만 고른다(서버 판정은 구매 그대로). 고르면 아래 코디만 바뀐다.
              onChoose={(value) => (item.gap_status === '구매'
                ? setChoices((current) => ({ ...current, [item.item_id]: value }))
                : choose(item.item_id, value))}
            />
          ))}
        </View>

        {showOutfits && <OutfitSection outfits={outfits} linksFor={linksFor} />}

        {result.shop ? <Text style={styles.note}>사진 출처: {result.shop}</Text> : null}
      </ScrollView>
    </>
  );
}

function describe(item: ShownItem, wardrobe: readonly WardrobeItem[], substituteKinds: readonly string[] = []): string {
  const parts = [
    item.brand_source !== '없음' ? item.brand : null,
    item.color ?? null,
  ].filter((part): part is string => typeof part === 'string' && part.length > 0);
  const prefix = parts.length === 0 ? '' : `${parts.join(' · ')} · `;
  switch (item.gap_status) {
    case '활용':
      return `${prefix}옷장에 같은 색 있음`;
    case '구매':
      return substituteKinds.length > 0
        ? `${prefix}가진 ${withRo(substituteKinds.join('·'))} 대체 가능`
        : `${prefix}옷장에 없음`;
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
  decision,
  links,
  substitutes,
  pending,
  error,
  onChoose,
}: {
  item: ShownItem;
  wardrobe: readonly WardrobeItem[];
  thumbColor: string;
  choice: SimilarChoice | null;
  decision: ItemDecisionResult | null;
  links: Product[];
  substitutes: WardrobeItem[];
  pending: boolean;
  error: string | null;
  onChoose: (value: SimilarChoice) => void;
}) {
  const fit = item.visual_fit ?? null;
  const name = fit === null ? item.kind : `${item.kind} (${fit})`;
  const hasSubstitute = item.gap_status === '구매' && substitutes.length > 0;
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
            {describe(item, wardrobe, [...new Set(substitutes.map((substitute) => substitute.kind))])}
          </Text>
        </View>
        {item.gap_status !== null && <GapTag status={item.gap_status} substitute={hasSubstitute} />}
      </View>

      {/* 필요한 옷, 그리고 옷장이 비어 비교하지 못한 옷(AC12)에는 쇼핑 링크를 바로 단다. */}
      {(item.gap_status === null || (item.gap_status === '구매' && !hasSubstitute)) && (
        <View style={styles.needBox}>
          <ShopLinks item={item} links={links} />
        </View>
      )}

      {(item.gap_status === '비슷함' || hasSubstitute) && (
        <>
          <Text style={styles.choiceGuide}>
            {hasSubstitute
              ? '가진 옷으로 대체할지, 새 상품을 찾을지 선택해 주세요.'
              : '비슷한 옷을 활용할지, 새 상품을 찾을지 선택해 주세요.'}
          </Text>
          <View style={styles.choice}>
            {SIMILAR_OPTIONS.map((option) => {
              const selected = option.value === choice;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => onChoose(option.value)}
                  disabled={pending}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: pending }}
                  style={[styles.choiceItem, selected && styles.choiceItemSelected]}>
                  {pending && selected ? (
                    <ActivityIndicator size="small" color={colors.textPurple} />
                  ) : (
                    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{option.label}</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
          {!hasSubstitute && decision !== null && !pending && (
            <DecisionOutcome item={item} decision={decision} wardrobe={wardrobe} links={links} />
          )}
          {hasSubstitute && choice === '활용' && (
            <View style={styles.decisionOutcome}>
              <Text style={styles.decisionTitle}>이 옷으로 입을 수 있어요</Text>
              <Text style={styles.decisionText}>{substitutes.map(wardrobeLabel).join(', ')}</Text>
            </View>
          )}
          {hasSubstitute && choice === '구매' && (
            <View style={styles.decisionOutcome}>
              <Text style={styles.decisionTitle}>비슷한 상품을 찾아볼게요</Text>
              <ShopLinks item={item} links={links} />
            </View>
          )}
        </>
      )}
      {error !== null && <Text style={styles.choiceError}>{error}</Text>}
    </GlassView>
  );
}

// '필요'한 옷의 쇼핑 링크. 검색어는 옷마다 다르다(색 + 핏 + 종류, parse_query.md 쇼핑 검색어 규칙).
function ShopLinks({ item, links }: { item: ShownItem; links: Product[] }) {
  return (
    <View style={styles.decisionLinks}>
      {links.map((product) => (
        <Pressable
          key={`${product.platform}-${product.match_type}`}
          onPress={() => WebBrowser.openBrowserAsync(product.url)}
          accessibilityRole="link"
          accessibilityLabel={`${item.kind} ${product.platform}에서 찾기`}
          style={styles.decisionLink}>
          <Text style={styles.decisionLinkText}>
            {product.match_type === 'exact' ? `사진 속 ${item.kind}` : product.platform} ›
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// 조사: 받침이 없거나 ㄹ 받침이면 '로', 아니면 '으로' / 받침이 있으면 '을', 없으면 '를'.
function finalConsonant(word: string): number | null {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code < 0 || code > 11171 ? null : code % 28;
}

function withRo(word: string): string {
  const final = finalConsonant(word);
  return final === null || final === 0 || final === 8 ? `${word}로` : `${word}으로`;
}

function withEulReul(word: string): string {
  const final = finalConsonant(word);
  return final === null || final === 0 ? `${word}를` : `${word}을`;
}

function wardrobeLabel(item: WardrobeItem): string {
  return [item.color, item.visual_fit, item.kind].filter(Boolean).join(' · ');
}

function DecisionOutcome({
  item,
  decision,
  wardrobe,
  links,
}: {
  item: ShownItem;
  decision: ItemDecisionResult;
  wardrobe: readonly WardrobeItem[];
  links: Product[];
}) {
  if (decision.decision === '활용') {
    const matched = decision.outfits.flatMap((outfit) => outfit.wardrobe_item_ids)
      .map((id) => wardrobe.find((item) => item.id === id))
      .filter((item): item is WardrobeItem => item !== undefined);
    const labels = matched.map(wardrobeLabel);
    return (
      <View style={styles.decisionOutcome}>
        <Text style={styles.decisionTitle}>이 옷으로 입을 수 있어요</Text>
        <Text style={styles.decisionText}>{labels.join(', ') || '옷장에 등록된 비슷한 옷을 활용해요.'}</Text>
      </View>
    );
  }
  return (
    <View style={styles.decisionOutcome}>
      <Text style={styles.decisionTitle}>비슷한 상품을 찾아볼게요</Text>
      <ShopLinks item={item} links={links} />
    </View>
  );
}

// 코디 조합. 한 벌은 사진 속 옷 순서(아우터·상의·원피스·하의·신발·가방)대로 놓는다.
function OutfitSection({
  outfits,
  linksFor,
}: {
  outfits: OutfitSuggestion[];
  linksFor: (item: ShownItem) => Product[];
}) {
  return (
    <View style={styles.outfitSection}>
      <Text style={styles.sectionTitle} accessibilityRole="header">내 옷장으로 입어 보기</Text>
      <Text style={styles.sectionSub}>사진처럼 입을 수 있게 비슷한 옷까지 넣어 맞춰 봤어요</Text>
      {outfits.map((outfit, index) => (
        <OutfitCard key={outfit.id} index={index} outfit={outfit} linksFor={linksFor} />
      ))}
    </View>
  );
}

function OutfitCard({
  index,
  outfit,
  linksFor,
}: {
  index: number;
  outfit: OutfitSuggestion;
  linksFor: (item: ShownItem) => Product[];
}) {
  const owned = outfit.pieces.filter((piece): piece is Extract<OutfitPiece, { type: 'owned' }> => piece.type === 'owned');
  const substitutes = owned.filter((piece) => piece.substitute);
  const missing = outfit.pieces.filter((piece) => piece.type === 'missing');
  return (
    <GlassView radius={16} style={styles.outfitCard}>
      <View style={styles.outfitHead}>
        <Text style={styles.outfitTitle}>코디 {index + 1}</Text>
        <Text style={styles.outfitCount}>
          내 옷 {owned.length}벌{substitutes.length > 0 ? `(대체 ${substitutes.length})` : ''}
          {missing.length > 0 ? ` · 필요 ${missing.length}벌` : ''}
        </Text>
      </View>
      <View style={styles.pieces}>
        {outfit.pieces.map((piece) => (
          <OutfitPieceView key={piece.item.item_id} piece={piece} />
        ))}
      </View>
      {(substitutes.length > 0 || missing.length > 0) && (
        <View style={styles.outfitNotes}>
          {substitutes.map((piece) => (
            <Text key={piece.item.item_id} style={styles.outfitNote}>
              사진 속 {withEulReul(piece.item.kind ?? '옷')} 내 {piece.wardrobeItem.color} {withRo(piece.wardrobeItem.kind)} 대체
            </Text>
          ))}
          {missing.map((piece) => hasKind(piece.item) && (
            <View key={piece.item.item_id} style={styles.needRow}>
              <Text style={styles.needLabel} numberOfLines={1}>
                {[piece.item.color, piece.item.kind].filter(Boolean).join(' ')} 찾기
              </Text>
              <ShopLinks item={piece.item} links={linksFor(piece.item)} />
            </View>
          ))}
        </View>
      )}
    </GlassView>
  );
}

function OutfitPieceView({ piece }: { piece: OutfitPiece }) {
  if (piece.type === 'owned') {
    const { wardrobeItem } = piece;
    return (
      <View
        style={styles.piece}
        accessible
        accessibilityLabel={`${piece.substitute ? `사진 속 ${piece.item.kind ?? '옷'} 대체, ` : ''}내 옷 ${wardrobeItem.color} ${wardrobeItem.visual_fit ?? ''} ${wardrobeItem.kind}`}>
        <View style={styles.pieceThumb}>
          <KindIcon kind={wardrobeItem.kind} color={wardrobeItem.color} fit={wardrobeItem.visual_fit} size={44} />
          {piece.substitute && (
            <View style={styles.pieceBadge}>
              <Text style={styles.pieceBadgeText}>대체</Text>
            </View>
          )}
        </View>
        <Text style={styles.pieceName} numberOfLines={1}>{wardrobeItem.kind}</Text>
        <Text style={styles.pieceMeta} numberOfLines={1}>
          {piece.similar ? `${wardrobeItem.color}(비슷)` : wardrobeItem.color}
        </Text>
        {wardrobeItem.visual_fit !== null && (
          <Text style={styles.pieceMeta} numberOfLines={1}>{wardrobeItem.visual_fit}</Text>
        )}
      </View>
    );
  }
  const kind = piece.item.kind;
  return (
    <View style={styles.piece} accessible accessibilityLabel={`필요한 옷 ${kind ?? ''}`}>
      <View style={[styles.pieceThumb, styles.pieceThumbMissing]}>
        {kind !== undefined && (
          <View style={styles.pieceFaded}>
            <KindIcon kind={kind} color={piece.item.color ?? null} fit={piece.item.visual_fit ?? null} size={44} />
          </View>
        )}
      </View>
      <Text style={styles.pieceName} numberOfLines={1}>{kind ?? '아이템'}</Text>
      <Text style={[styles.pieceMeta, styles.pieceNeed]} numberOfLines={1}>필요</Text>
    </View>
  );
}

// 태그: 높이 26, 모서리 7. 서버 값 '구매'는 화면에 '필요'로 보여 준다(DESIGN.md 8절).
// '구매'라도 가까운 종류의 내 옷이 있으면 '대체'로 보여 준다(판정 값은 구매 그대로, SPEC AC11).
function GapTag({ status, substitute = false }: { status: GapStatus; substitute?: boolean }) {
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
  if (substitute) {
    return (
      <View style={[styles.tag, styles.tagSubstitute]}>
        <Text style={styles.tagText}>대체</Text>
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
  removeError: {
    position: 'absolute',
    right: layout.screenPaddingX,
    maxWidth: 220,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.9)',
    fontFamily: fonts.regular,
    fontSize: 11,
    color: '#A23B3B',
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
  tagSubstitute: {
    borderWidth: 1,
    borderColor: colors.purpleStrong,
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
  choiceGuide: {
    marginTop: 10,
    marginLeft: 55,
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textSecondary,
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
  choiceError: {
    marginTop: 6,
    marginLeft: 55,
    fontFamily: fonts.regular,
    fontSize: 11,
    color: '#A23B3B',
  },
  decisionOutcome: {
    marginTop: 8,
    marginLeft: 52,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#F3EEF9',
  },
  decisionTitle: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.text,
  },
  decisionText: {
    marginTop: 3,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  decisionLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  decisionLink: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.white,
  },
  decisionLinkText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.textPurple,
  },
  outfitSection: {
    marginTop: 20,
  },
  sectionTitle: {
    marginHorizontal: 4,
    fontFamily: fonts.extraBold,
    fontSize: 16,
    letterSpacing: -0.2,
    color: colors.text,
  },
  sectionSub: {
    marginTop: 2,
    marginBottom: 10,
    marginHorizontal: 4,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  outfitCard: {
    padding: 12,
    gap: 10,
    marginBottom: 8,
  },
  outfitHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  outfitTitle: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.text,
  },
  outfitCount: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  pieces: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  piece: {
    width: 58,
    alignItems: 'center',
  },
  pieceThumb: {
    width: 58,
    height: 66,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.line,
  },
  pieceThumbMissing: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.purpleStrong,
  },
  pieceFaded: {
    opacity: 0.45,
  },
  pieceName: {
    marginTop: 4,
    maxWidth: 58,
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.text,
  },
  pieceMeta: {
    maxWidth: 58,
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.textSecondary,
  },
  pieceNeed: {
    fontFamily: fonts.bold,
    color: colors.textPurple,
  },
  pieceBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: colors.purpleStrong,
  },
  pieceBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 9,
    color: colors.white,
  },
  outfitNotes: {
    gap: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  outfitNote: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  needBox: {
    marginTop: 10,
    marginLeft: 55,
  },
  needRow: {
    gap: 2,
  },
  needLabel: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.text,
  },
  note: {
    marginTop: 10,
    marginHorizontal: 4,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
});
