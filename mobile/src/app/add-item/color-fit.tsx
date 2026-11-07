import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ColorSwatch } from '@/components/ColorSwatch';
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
  type Color,
  type Kind,
  type Slot,
  type VisualFit,
} from '@/data/catalog';
import { errorMessage } from '@/data/api';
import { addWardrobeItem } from '@/data/store';
import { colors, fonts, layout } from '@/theme';

// '옷 추가 ②' 색·핏. 모양은 design/screens/21-add-item-2-color-fit.html을 따른다.
// '모르겠어요'는 11/11 버전에서 뺀다(DESIGN.md 8절).

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

function ColorFitForm({ slot, kind }: { slot: Slot; kind: Kind }) {
  const [color, setColor] = useState<Color | null>(null);
  const [fit, setFit] = useState<VisualFit | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const colorOptions = colorsForKind(kind);
  const fitOptions = fitsForKind(slot, kind);
  const needsFit = fitOptions.length > 0;
  const canSave = color !== null && (!needsFit || fit !== null);

  const chipWidth =
    (width - layout.screenPaddingX * 2 - COLOR_COLUMN_GAP * (COLOR_COLUMNS - 1)) / COLOR_COLUMNS;

  const summary = [slot, kind, color, fit].filter((part) => part !== null).join(' · ');

  async function save() {
    if (saving || color === null || (needsFit && fit === null)) return;
    setSaving(true);
    setSaveError(null);
    try {
      await addWardrobeItem({ slot, kind, color, visual_fit: needsFit ? fit : null });
      // 옷 추가 화면 두 장을 닫고 옷장 탭으로 돌아간다.
      router.dismissTo('/closet');
    } catch (error) {
      setSaveError(errorMessage(error));
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
          {slot} · {kind}
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
                onPress={() => setColor(c)}
              />
            ))}
          </View>
        </View>

        {needsFit && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, styles.fitTitle]}>핏</Text>
            <SegmentedControl options={fitOptions} value={fit} onChange={setFit} fontSize={13} />
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
