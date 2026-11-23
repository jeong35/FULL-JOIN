import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Rect } from 'react-native-svg';

import { ClothPattern } from '@/components/ClothPattern';
import { ColorSwatch } from '@/components/ColorSwatch';
import { GlassView } from '@/components/GlassView';
import { CheckMark } from '@/components/Icons';
import { KindIcon } from '@/components/KindIcon';
import { LookIcon } from '@/components/WardrobeIcon';
import { DetailHeader, InfoBar, PrimaryButton, ProgressSteps, SegmentedControl, SmallWhiteButton } from '@/components/ui';
import {
  COLOR_HEX,
  colorsForKind,
  isKindOfSlot,
  isSlot,
  kindLabel,
  PATTERN_SHAPES,
  type Color,
  type Kind,
  type Slot,
  type VisualFit,
} from '@/data/catalog';
import { errorMessage, needsWardrobeUpdate, WARDROBE_UPDATE_MESSAGE, type NewWardrobeItem } from '@/data/api';
import { track } from '@/data/events';
import { addWardrobeItem, useWardrobe } from '@/data/store';
import {
  initialSelection,
  isFitGroup,
  lookFor,
  option,
  overlayKey,
  PATTERN_SHAPE_GROUP,
  patternFill,
  patternLabel,
  specFor,
  useWardrobeArt,
  visible,
  wardrobeFields,
  type AddItemGroup,
  type AddItemSpec,
  type Selection,
  type WardrobeArt,
} from '@/data/wardrobeLook';
import { colors, fonts, glass, layout } from '@/theme';

// '옷 추가 ②' 색 · 핏 · 더 자세히. 11/19: 옷 추가 시안(11/15, 옷추가_눌러보기_전체-2.html)을 옮겼다.
// - 꼭 고를 것은 색뿐이다. 핏(또는 길이 · 두께)은 고르면 좋고, '모르겠어요'도 있다.
// - 목 모양 · 짜임 · 기장 · 칼라 · 소재 · 무늬 · 계절 같은 칸은 '더 자세히'에 접어 두고, 펼쳐서 고른다(안 골라도 된다).
// - 칸마다 보기와 그림, 고르면 바뀌는 그림 규칙은 data/wardrobeArt.ts(시안에서 생성)와 data/wardrobeLook.ts를 따른다.

export default function AddItemColorFitScreen() {
  const params = useLocalSearchParams<{ slot?: string; kind?: string }>();
  const slot = isSlot(params.slot) ? params.slot : null;
  const kind = slot !== null && isKindOfSlot(slot, params.kind) ? params.kind : null;
  const art = useWardrobeArt();

  if (slot === null || kind === null) {
    // 잘못된 주소로 들어온 경우. 정상 흐름에서는 생기지 않는다.
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <DetailHeader title="옷 추가" onBack={() => router.back()} />
        <Text style={styles.invalid}>부위와 종류를 먼저 골라 주세요.</Text>
      </SafeAreaView>
    );
  }

  const spec = art ? specFor(art, slot, kind) : undefined;
  if (art === null || spec === undefined) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <DetailHeader title="옷 추가" onBack={() => router.back()} />
        {art === null ? (
          <ActivityIndicator style={styles.loading} color={colors.purpleStrong} />
        ) : (
          <Text style={styles.invalid}>이 종류는 아직 넣을 수 없어요.</Text>
        )}
      </SafeAreaView>
    );
  }

  return <AddItemForm key={`${slot}-${kind}`} art={art} spec={spec} slot={slot} kind={kind} />;
}

const COLOR_COLUMNS = 6;
const COLOR_COLUMN_GAP = 10;
const TILE_GAP = 8;
const NEUTRAL_HEX = '#D9D3E3';
const UNKNOWN_FIT = '모르겠어요';
const MATERIAL_HINT = '누르면 어떤 천인지 알려 줘요 · 여러 개 골라도 돼요';

function toggle(group: AddItemGroup, current: readonly string[], value: string): string[] {
  if (group.multi) return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  // 한 개만 고르는 칸: 고른 걸 다시 누르면 빠진다(안 고르면 처음 값 = 라운드 등).
  return current.includes(value) ? [] : [value];
}

function AddItemForm({ art, spec, slot, kind }: { art: WardrobeArt; spec: AddItemSpec; slot: Slot; kind: Kind }) {
  const [sel, setSel] = useState<Record<string, string[]>>(() => initialSelection(spec));
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const [open, setOpen] = useState(false);
  const [materialNote, setMaterialNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const wardrobe = useWardrobe();
  const insets = useSafeAreaInsets();

  const colorGroup = spec.groups.find((g) => g.role === 'color');
  const color = (sel[colorGroup?.title ?? '색']?.[0] as Color | undefined) ?? null;
  const fitGroup = spec.groups.find(isFitGroup);
  const fitValue = fitGroup ? (sel[fitGroup.title]?.[0] ?? null) : null;
  const fit = fitValue === null || fitValue === UNKNOWN_FIT ? null : (fitValue as VisualFit);
  const mainGroups = spec.groups.filter((g) => !g.more && g.role !== 'color');
  const moreGroups = spec.groups.filter((g) => g.more);
  // 짜임 칸(니트·카디건)을 안 건드렸으면 '안 고름'으로 본다 — 옷장에서처럼 지금 앱 그림(꽈배기)으로 보인다.
  const weaveGroup = spec.groups.find((g) => g.weave);
  const lookSel = weaveGroup && !touched.has(weaveGroup.title) ? { ...sel, [weaveGroup.title]: [] } : sel;
  const look = lookFor(art, spec, lookSel, kind, fit);
  const ovKey = overlayKey(spec, sel);
  const pattern = patternFill(sel);

  const draft: NewWardrobeItem = { slot, kind, color: color ?? '기타', visual_fit: fit, ...wardrobeFields(spec, sel, touched) };
  const blocked = color !== null && needsWardrobeUpdate(draft);
  const summary = [kindLabel(kind), color ?? '색을 골라 주세요', fitValue, patternLabel(sel)].filter(Boolean).join(' · ');

  function choose(group: AddItemGroup, value: string) {
    if (group.fixed) return;
    const next = toggle(group, sel[group.title] ?? [], value);
    const updated: Record<string, string[]> = { ...sel, [group.title]: next };
    if (group.title === '무늬') {
      const p = next[0];
      updated[PATTERN_SHAPE_GROUP] = p && p in PATTERN_SHAPES ? [PATTERN_SHAPES[p as keyof typeof PATTERN_SHAPES][0]] : [];
    }
    setSel(updated);
    setTouched(new Set([...touched, group.title]));
    setSaveError(null);
    if (group.role === 'color' && next[0]) track('wardrobe_color_select', { kind, color: next[0] });
    if (isFitGroup(group) && next[0]) track('wardrobe_fit_select', { kind, fit: next[0] });
    if (group.role === 'mat') {
      const label = option(group.options.find((o) => option(o).v === value) ?? value).label ?? value;
      setMaterialNote(next.includes(value) ? `${label} — ${art.materialNotes[value] ?? ''}` : null);
    }
  }

  function chooseShape(shape: string) {
    setSel({ ...sel, [PATTERN_SHAPE_GROUP]: [shape] });
  }

  async function save() {
    if (saving || color === null || blocked) return;
    setSaving(true);
    setSaveError(null);
    track('wardrobe_add_submit', { slot, kind, color, fit: fit ?? null });
    try {
      await addWardrobeItem({ ...draft, color });
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

  const groupProps = { art, spec, sel, kind, color, ovKey, pattern, onChoose: choose };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <DetailHeader title="옷 추가" onBack={() => router.back()} />
      <ProgressSteps current={[2, 3]} />

      <InfoBar style={styles.picked} right={<SmallWhiteButton label="바꾸기" onPress={() => router.back()} />}>
        <LookIcon look={look} kind={kind} color={color ?? undefined} fit={fit} size={34} />
        <Text style={styles.pickedLabel}>고른 것</Text>
        <Text style={styles.pickedValue} numberOfLines={1}>
          {slot} · {kindLabel(kind)}
        </Text>
      </InfoBar>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {colorGroup && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              색{colorGroup.note ? <Text style={styles.note}> · {colorGroup.note}</Text> : null}
            </Text>
            <ColorGrid
              colors={colorGroup.options.map((o) => option(o).v as Color)}
              fallback={colorsForKind(kind)}
              value={color}
              onChange={(c) => choose(colorGroup, c)}
            />
          </View>
        )}

        {mainGroups.map((g) => (
          <View key={g.title} style={styles.section}>
            <Text style={styles.sectionTitle}>
              {g.title}
              {g.note ? <Text style={styles.note}> · {g.note}</Text> : null}
            </Text>
            <GroupOptions group={g} {...groupProps} />
          </View>
        ))}

        {moreGroups.length > 0 && (
          <GlassView radius={14} style={styles.more}>
            <Pressable
              onPress={() => setOpen(!open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              style={styles.moreHead}>
              <View style={styles.moreHeadText}>
                <Text style={styles.moreTitle}>
                  더 자세히<Text style={styles.note}> · 안 골라도 돼요</Text>
                </Text>
                <Text style={styles.moreNames}>{moreGroups.map((g) => g.title).join(' · ')}</Text>
              </View>
              <Text style={styles.moreToggle}>{open ? '접기 ▴' : '펼치기 ▾'}</Text>
            </Pressable>
            {open &&
              moreGroups
                .filter((g) => visible(g, sel))
                .map((g) => (
                  <View key={g.title} style={styles.moreGroup}>
                    <Text style={styles.moreGroupTitle}>
                      {g.title}
                      {g.note ? <Text style={styles.note}> · {g.note}</Text> : null}
                    </Text>
                    <GroupOptions group={g} {...groupProps} />
                    {g.role === 'mat' && <Text style={styles.materialNote}>{materialNote ?? MATERIAL_HINT}</Text>}
                    {g.title === '무늬' && sel['무늬']?.[0] !== undefined && sel['무늬'][0] in PATTERN_SHAPES && (
                      <PatternShapes
                        pattern={sel['무늬'][0] as keyof typeof PATTERN_SHAPES}
                        value={sel[PATTERN_SHAPE_GROUP]?.[0] ?? null}
                        base={color && color !== '멀티' && color !== '기타' ? COLOR_HEX[color] : NEUTRAL_HEX}
                        onChange={chooseShape}
                      />
                    )}
                  </View>
                ))}
          </GlassView>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(24, insets.bottom) }]}>
        <Text style={[styles.summary, (saveError !== null || blocked) && styles.summaryError]}>
          {saveError ?? (blocked ? WARDROBE_UPDATE_MESSAGE : summary)}
        </Text>
        <PrimaryButton
          label={saving ? '넣는 중…' : '옷장에 넣기'}
          onPress={save}
          disabled={color === null || blocked || saving}
        />
      </View>
    </SafeAreaView>
  );
}

type GroupProps = {
  group: AddItemGroup;
  art: WardrobeArt;
  spec: AddItemSpec;
  sel: Selection;
  kind: Kind;
  color: Color | null;
  ovKey: string;
  pattern: string | null;
  onChoose: (group: AddItemGroup, value: string) => void;
};

function GroupOptions({ group, art, spec, sel, kind, color, ovKey, pattern, onChoose }: GroupProps) {
  const { width } = useWindowDimensions();
  const chosen = sel[group.title] ?? [];
  const options = group.options.map(option);

  if (group.ui === 'seg') {
    return (
      <SegmentedControl
        options={options.map((o) => o.v)}
        value={chosen[0] ?? null}
        onChange={(v) => onChoose(group, v)}
        fontSize={13}
      />
    );
  }

  if (group.ui === 'grid') {
    const columns = options.length === 5 ? 5 : 4;
    // '더 자세히' 카드 안은 카드 테두리(양쪽 1)와 안쪽 여백(양쪽 12)만큼 좁다.
    const inner = width - layout.screenPaddingX * 2 - (group.more ? 26 : 0);
    const tileWidth = Math.floor((inner - TILE_GAP * (columns - 1)) / columns);
    return (
      <View style={styles.tileGrid}>
        {options.map((o) => {
          const layers = o.icon ? art.icons[o.icon] : undefined;
          // 그림 칸은 지금 고른 색 · 무늬로 칠한다. 짜임 칸은 보기마다 제 결을, 나머지 칸은 지금 고른 결을 덮는다.
          const ov = o.ov ? art.weaves[o.ov] : group.nooverlay || !ovKey ? null : art.weaves[ovKey];
          return (
            <Tile
              key={o.v}
              label={o.label ?? o.v}
              width={tileWidth}
              selected={chosen.includes(o.v)}
              disabled={group.fixed === true}
              onPress={() => onChoose(group, o.v)}>
              {layers ? (
                <KindIcon
                  kind={kind}
                  color={color ?? undefined}
                  size={Math.min(tileWidth - 10, 60)}
                  layers={layers}
                  place={spec.place}
                  overlay={ov ?? null}
                  pattern={pattern}
                />
              ) : null}
            </Tile>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const selected = chosen.includes(o.v);
        return (
          <Pressable
            key={o.v}
            onPress={() => onChoose(group, o.v)}
            disabled={group.fixed === true}
            accessibilityRole="button"
            accessibilityLabel={o.label ?? o.v}
            accessibilityState={{ selected, disabled: group.fixed === true }}
            style={[styles.chip, selected && styles.chipSelected, group.fixed && !selected && styles.chipDisabled]}>
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{o.label ?? o.v}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// 그림 칸: 옷 추가의 종류 그림 칸과 같은 각진 네모(11/04 화면 모양 결정).
function Tile({
  label,
  width,
  selected,
  disabled,
  onPress,
  children,
}: {
  label: string;
  width: number;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      style={[styles.tile, { width }, selected && styles.tileSelected]}>
      <View style={styles.tileImage}>{children}</View>
      <Text style={[styles.tileLabel, selected && styles.tileLabelSelected]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

function PatternShapes({
  pattern,
  value,
  base,
  onChange,
}: {
  pattern: keyof typeof PATTERN_SHAPES;
  value: string | null;
  base: string;
  onChange: (shape: string) => void;
}) {
  return (
    <View style={styles.shapes}>
      <Text style={styles.shapesTitle}>{pattern} 모양</Text>
      <View style={styles.shapeRow}>
        {PATTERN_SHAPES[pattern].map((shape, i) => {
          const selected = shape === value;
          return (
            <Pressable
              key={shape}
              onPress={() => onChange(shape)}
              accessibilityRole="button"
              accessibilityLabel={shape}
              accessibilityState={{ selected }}
              style={styles.shape}>
              <View style={[styles.shapeSwatch, selected && styles.shapeSwatchSelected]}>
                <Svg width={40} height={40} viewBox="0 0 16 16">
                  <Defs>
                    <ClothPattern id={`shape-${pattern}-${i}`} kind={shape} base={base} />
                  </Defs>
                  <Rect width={16} height={16} fill={`url(#shape-${pattern}-${i})`} />
                </Svg>
              </View>
              <Text style={[styles.shapeLabel, selected && styles.tileLabelSelected]}>{shape}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ColorGrid({
  colors: list,
  fallback,
  value,
  onChange,
}: {
  colors: readonly Color[];
  fallback: readonly Color[];
  value: Color | null;
  onChange: (color: Color) => void;
}) {
  const { width } = useWindowDimensions();
  const chipWidth = (width - layout.screenPaddingX * 2 - COLOR_COLUMN_GAP * (COLOR_COLUMNS - 1)) / COLOR_COLUMNS;
  return (
    <View style={styles.colorGrid}>
      {(list.length ? list : fallback).map((c) => (
        <ColorChip key={c} color={c} width={chipWidth} selected={c === value} onPress={() => onChange(c)} />
      ))}
    </View>
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
      style={[styles.colorChip, { width }]}>
      <View style={[styles.chipSwatchWrap, selected && styles.chipSelectedRing]}>
        <ColorSwatch color={color} width={width} height={44} questionSize={15} />
        {selected && (
          <View style={styles.chipCheck}>
            <CheckMark size={20} fill={colors.white} />
          </View>
        )}
      </View>
      <Text style={[styles.colorLabel, selected && styles.colorLabelSelected]} numberOfLines={1}>
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
  loading: {
    marginTop: 60,
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
    flexShrink: 1,
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.text,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  section: {
    paddingTop: 20,
    paddingHorizontal: layout.screenPaddingX,
  },
  sectionTitle: {
    marginHorizontal: 4,
    marginBottom: 10,
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
  },
  note: {
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
  colorChip: {
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
  colorLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    letterSpacing: -0.4,
    color: colors.text,
  },
  colorLabelSelected: {
    fontFamily: fonts.bold,
    color: colors.textPurple,
  },
  more: {
    marginTop: 20,
    marginHorizontal: layout.screenPaddingX,
    paddingBottom: 4,
  },
  moreHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 12,
  },
  moreHeadText: {
    flex: 1,
  },
  moreTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 15,
    color: colors.text,
  },
  moreNames: {
    marginTop: 3,
    fontFamily: fonts.regular,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  moreToggle: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.textPurple,
  },
  moreGroup: {
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  moreGroupTitle: {
    marginTop: 4,
    marginBottom: 8,
    marginHorizontal: 2,
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.text,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },
  tile: {
    padding: 4,
    borderWidth: 1,
    borderColor: glass.border,
    backgroundColor: colors.white,
  },
  tileSelected: {
    padding: 3,
    borderWidth: 2,
    borderColor: colors.purpleStrong,
    boxShadow: glass.selectedCardShadow,
  },
  tileImage: {
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.photoPlaceholder,
  },
  tileLabel: {
    marginTop: 5,
    marginBottom: 2,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 11,
    letterSpacing: -0.3,
    color: colors.text,
  },
  tileLabelSelected: {
    fontFamily: fonts.bold,
    color: colors.textPurple,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: glass.border,
  },
  chipSelected: {
    backgroundColor: colors.white,
    borderColor: colors.purpleLine,
    borderWidth: 1.5,
  },
  chipDisabled: {
    opacity: 0.45,
  },
  chipText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.text,
  },
  chipTextSelected: {
    fontFamily: fonts.bold,
    color: colors.textPurple,
  },
  materialNote: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: colors.white,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textPurple,
  },
  shapes: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  shapesTitle: {
    marginBottom: 8,
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.textSecondary,
  },
  shapeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  shape: {
    alignItems: 'center',
    gap: 4,
    width: 52,
  },
  shapeSwatch: {
    padding: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  shapeSwatchSelected: {
    borderColor: colors.purpleStrong,
  },
  shapeLabel: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  footer: {
    paddingTop: 12,
    paddingHorizontal: layout.screenPaddingX,
  },
  summary: {
    marginBottom: 10,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  summaryError: {
    color: colors.textPurple,
    fontFamily: fonts.bold,
  },
});
