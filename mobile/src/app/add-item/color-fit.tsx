import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ColorSwatch } from '@/components/ColorSwatch';
import { GlassView } from '@/components/GlassView';
import { CheckMark } from '@/components/Icons';
import { KindIcon } from '@/components/KindIcon';
import {
  DetailHeader,
  InfoBar,
  PrimaryButton,
  ProgressSteps,
  SegmentedControl,
  SmallWhiteButton,
} from '@/components/ui';
import {
  colorsForKind,
  fitsForKind,
  isKindOfSlot,
  isSlot,
  kindLabel,
  type Color,
  type Kind,
  type Slot,
  type VisualFit,
} from '@/data/catalog';
import { errorMessage } from '@/data/api';
import { track } from '@/data/events';
import { KIND_ICONS } from '@/data/kindIcons';
import { addWardrobeItem, useWardrobe } from '@/data/store';
import { colors, fonts, glass, layout } from '@/theme';

// '옷 추가 ②' 색·핏. 모양은 design/screens/21-add-item-2-color-fit.html을 따른다.
// '모르겠어요'는 11/11 버전에서 뺀다(DESIGN.md 8절).
// 11/16: 핏별 그림이 있는 종류(바지·스커트)는 핏을 그림 칸으로 고른다 — 고른 색으로 칠해서 모양을 바로 비교한다.

export default function AddItemColorFitScreen() {
  const params = useLocalSearchParams<{ slot?: string; kind?: string }>();
  const slot = isSlot(params.slot) ? params.slot : null;
  const kind = slot !== null && isKindOfSlot(slot, params.kind) ? params.kind : null;

  if (slot === null || kind === null) {
    // 잘못된 주소로 들어온 경우. 정상 흐름에서는 생기지 않는다.
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <DetailHeader title="옷 추가" onBack={() => router.back()} />
        <Text style={styles.invalid}>부위와 종류를 먼저 골라 주세요.</Text>
      </SafeAreaView>
    );
  }

  return <ColorFitForm slot={slot} kind={kind} />;
}

const COLOR_COLUMNS = 6;
const COLOR_COLUMN_GAP = 10;
const FIT_GAP = 10;

function ColorFitForm({ slot, kind }: { slot: Slot; kind: Kind }) {
  const [color, setColor] = useState<Color | null>(null);
  const [fit, setFit] = useState<VisualFit | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const wardrobe = useWardrobe();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const colorOptions = colorsForKind(kind);
  const fitOptions = fitsForKind(slot, kind);
  const needsFit = fitOptions.length > 0;
  const fitPictures = KIND_ICONS[kind].variants !== undefined;
  const canSave = color !== null && (!needsFit || fit !== null);

  const chipWidth =
    (width - layout.screenPaddingX * 2 - COLOR_COLUMN_GAP * (COLOR_COLUMNS - 1)) / COLOR_COLUMNS;

  const fitTileWidth =
    (width - layout.screenPaddingX * 2 - FIT_GAP * (fitOptions.length - 1)) / Math.max(fitOptions.length, 1);

  const summary = [slot, kindLabel(kind), color, fit].filter((part) => part !== null).join(' · ');

  async function save() {
    if (saving || color === null || (needsFit && fit === null)) return;
    setSaving(true);
    setSaveError(null);
    track('wardrobe_add_submit', { slot, kind, color, fit: fit ?? null });
    try {
      await addWardrobeItem({ slot, kind, color, visual_fit: needsFit ? fit : null });
      // 옷장 크기는 활성화(옷 5벌 이상) 목표를 재려고 같이 남긴다.
      const nextSize = wardrobe.length + 1;
      track('wardrobe_add_done', { slot, kind, wardrobe_size: nextSize });
      if ([1, 3, 5, 10].includes(nextSize)) {
        const slotsCovered = new Set([...wardrobe.map((item) => item.slot), slot]).size;
        track('wardrobe_milestone', { count: nextSize, slots_covered: slotsCovered });
      }
      // 옷 추가 화면 두 장을 닫고 옷장 탭으로 돌아간다.
      router.dismissTo('/closet');
    } catch (error) {
      const message = errorMessage(error);
      track('wardrobe_add_failed', { slot, kind, error_code: message });
      track('error_shown', { screen: 'wardrobe_add_color_fit', error_code: message });
      setSaveError(message);
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <DetailHeader title="옷 추가" onBack={() => router.back()} />
      <ProgressSteps current={[2, 3]} />

      <InfoBar
        style={styles.picked}
        right={<SmallWhiteButton label="바꾸기" onPress={() => router.back()} />}>
        <KindIcon kind={kind} color={color ?? undefined} fit={fit} size={34} />
        <Text style={styles.pickedLabel}>고른 것</Text>
        <Text style={styles.pickedValue}>
          {slot} · {kindLabel(kind)}
        </Text>
      </InfoBar>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>색</Text>
          <Text style={styles.sectionHint}>연청·중청·진청·흑청은 데님 종류를 고를 때만 보여요</Text>
          <View style={styles.colorGrid}>
            {colorOptions.map((c) => (
              <ColorChip
                key={c}
                color={c}
                width={chipWidth}
                selected={c === color}
                onPress={() => {
                  track('wardrobe_color_select', { kind, color: c });
                  setColor(c);
                }}
              />
            ))}
          </View>
        </View>

        {needsFit && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, styles.fitTitle]}>핏</Text>
            {fitPictures ? (
              <View style={styles.fitGrid}>
                {fitOptions.map((option) => (
                  <FitTile
                    key={option}
                    kind={kind}
                    color={color}
                    fit={option}
                    width={fitTileWidth}
                    selected={option === fit}
                    onPress={() => {
                      track('wardrobe_fit_select', { kind, fit: option });
                      setFit(option);
                    }}
                  />
                ))}
              </View>
            ) : (
              <SegmentedControl
                options={fitOptions}
                value={fit}
                onChange={(next) => {
                  track('wardrobe_fit_select', { kind, fit: next });
                  setFit(next);
                }}
                fontSize={13}
              />
            )}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(24, insets.bottom) }]}>
        <Text style={[styles.summary, saveError !== null && styles.summaryError]}>{saveError ?? summary}</Text>
        <PrimaryButton label={saving ? '넣는 중…' : '옷장에 넣기'} onPress={save} disabled={!canSave || saving} />
      </View>
    </SafeAreaView>
  );
}

// 핏 그림 칸: 부위·핏 선택은 둥근 네모(11/04 화면 모양 결정).
function FitTile({
  kind,
  color,
  fit,
  width,
  selected,
  onPress,
}: {
  kind: Kind;
  color: Color | null;
  fit: VisualFit;
  width: number;
  selected: boolean;
  onPress: () => void;
}) {
  const content = (
    <>
      <KindIcon kind={kind} color={color ?? undefined} fit={fit} size={52} />
      <Text style={[styles.fitLabel, selected && styles.fitLabelSelected]} numberOfLines={1}>
        {fit}
      </Text>
    </>
  );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={fit}
      accessibilityState={{ selected }}
      style={{ width }}>
      {selected ? (
        <View style={[styles.fitTile, styles.fitTileSelected]}>{content}</View>
      ) : (
        <GlassView radius={14} style={styles.fitTile}>
          {content}
        </GlassView>
      )}
    </Pressable>
  );
}

function ColorChip({
  color,
  width,
  selected,
  onPress,
}: {
  color: Color;
  width: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={color}
      accessibilityState={{ selected }}
      style={[styles.chip, { width }]}>
      <View style={[styles.chipSwatchWrap, selected && styles.chipSelectedRing]}>
        <ColorSwatch color={color} width={width} height={44} questionSize={15} />
        {selected && (
          <View style={styles.chipCheck}>
            <CheckMark size={20} fill={colors.white} />
          </View>
        )}
      </View>
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]} numberOfLines={1}>
        {color}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  invalid: {
    marginTop: 40,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  picked: {
    marginTop: 16,
    marginHorizontal: layout.screenPaddingX,
  },
  pickedLabel: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
  },
  pickedValue: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.text,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 12,
  },
  section: {
    paddingTop: 20,
    paddingHorizontal: layout.screenPaddingX,
  },
  sectionTitle: {
    marginHorizontal: 4,
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
  },
  fitTitle: {
    marginBottom: 10,
  },
  sectionHint: {
    marginTop: 3,
    marginBottom: 12,
    marginHorizontal: 4,
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: COLOR_COLUMN_GAP,
    rowGap: 12,
  },
  fitGrid: {
    flexDirection: 'row',
    gap: FIT_GAP,
  },
  fitTile: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 9,
    gap: 4,
  },
  // 테두리가 1 → 2로 굵어지는 만큼 안쪽 여백을 1 줄여 그림이 움직이지 않게.
  fitTileSelected: {
    paddingTop: 7,
    paddingBottom: 8,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.purpleStrong,
    backgroundColor: colors.white,
    boxShadow: glass.selectedCardShadow,
  },
  fitLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.text,
  },
  fitLabelSelected: {
    fontFamily: fonts.bold,
    color: colors.textPurple,
  },
  chip: {
    alignItems: 'center',
    gap: 5,
  },
  chipSwatchWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelectedRing: {
    boxShadow: `0 0 0 2px ${colors.background}, 0 0 0 4px ${colors.purpleStrong}`,
  },
  chipCheck: {
    position: 'absolute',
  },
  chipLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    letterSpacing: -0.4,
    color: colors.text,
  },
  chipLabelSelected: {
    fontFamily: fonts.bold,
    color: colors.textPurple,
  },
  footer: {
    paddingTop: 12,
    paddingHorizontal: layout.screenPaddingX,
  },
  summaryError: {
    color: colors.textPurple,
    fontFamily: fonts.bold,
  },
  summary: {
    marginBottom: 10,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
});
