import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { ColorSwatch } from '@/components/ColorSwatch';
import { BottomSheet, ColorPicker, KindPicker, PhotoSteps } from '@/components/PhotoAddParts';
import { LookIcon } from '@/components/WardrobeIcon';
import { DetailHeader, PrimaryButton } from '@/components/ui';
import { errorMessage } from '@/data/api';
import { fitsForKind, kindLabel, SEASONS, type Color, type Kind, type Slot, type VisualFit } from '@/data/catalog';
import { track } from '@/data/events';
import { clearPhotoDraft, removeCutItem, updateCutItem, usePhotoDraft, withKind, type CutItem } from '@/data/photoAdd';
import { addWardrobeItem, useWardrobe } from '@/data/store';
import type { Season } from '@/data/types';
import { setWardrobePhoto } from '@/data/wardrobePhotos';
import { colors, fonts, glass, layout } from '@/theme';

// 사진으로 옷 추가 ③ 확인. 잘라 낸 옷마다 카드 한 장. 종류 · 색은 꼭, 핏 · 계절은 골라도 되고 안 골라도 된다.
// 서버 AI 태깅이 생기면 칸을 미리 채워 두고, 사람은 틀린 칸만 고친다(11/22 시안). 옷장에 넣기 전에는 저장하지 않는다.

type Sheet = { itemId: string; field: 'kind' | 'color' } | null;

export default function PhotoConfirmScreen() {
  const { items } = usePhotoDraft();
  const wardrobe = useWardrobe();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = items.filter((item) => item.kind === null || item.colorName === null).length;
  const sheetItem = sheet === null ? undefined : items.find((item) => item.id === sheet.itemId);

  async function save() {
    if (saving || items.length === 0 || missing > 0) return;
    setSaving(true);
    setError(null);
    let failed = 0;
    let size = wardrobe.length;
    // 옷장은 새로 넣은 옷이 맨 앞에 보이므로, 거꾸로 넣어야 1번 옷이 맨 앞에 온다.
    for (const item of [...items].reverse()) {
      if (item.slot === null || item.kind === null || item.colorName === null) continue;
      try {
        const saved = await addWardrobeItem({
          slot: item.slot,
          kind: item.kind,
          color: item.colorName,
          visual_fit: item.fit,
          seasons: item.seasons,
        });
        setWardrobePhoto(saved.id, { uri: item.uri, color: item.color, cutout: item.cutout });
        size += 1;
        track('wardrobe_add_done', { via: 'photo', slot: item.slot, kind: item.kind, wardrobe_size: size });
        removeCutItem(item.id);
      } catch (e) {
        failed += 1;
        track('wardrobe_add_failed', { via: 'photo', kind: item.kind, error_code: errorMessage(e) });
      }
    }
    setSaving(false);
    if (failed === 0) {
      clearPhotoDraft();
      router.dismissTo('/closet');
      return;
    }
    track('error_shown', { screen: 'wardrobe_add_photo', error_code: 'wardrobe_add_failed' });
    setError(`${failed}벌은 넣지 못했어요. 다시 눌러 주세요`);
  }

  const title = items.length > 1 ? `이 ${items.length}벌이 맞나요?` : '이 옷이 맞나요?';
  const button = saving ? '넣는 중…' : missing > 0 ? '종류와 색을 골라 주세요' : items.length > 1 ? `옷장에 ${items.length}벌 넣기` : '옷장에 넣기';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <DetailHeader title="옷 추가" onBack={() => router.back()} />
      <PhotoSteps labels={['사진', '네모', '확인']} current={2} />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.head}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>종류와 색은 꼭 골라 주세요. 핏 · 계절은 안 골라도 돼요</Text>
        </View>
        {items.some((item) => !item.cutout) && (
          <Text style={styles.notice}>{'배경을 지우지 못한 사진은\n네모로 자른 그대로 들어가요'}</Text>
        )}

        {items.map((item, index) => (
          <ItemCard
            key={item.id}
            item={item}
            index={index}
            numbered={items.length > 1}
            onRemove={items.length > 1 ? () => removeCutItem(item.id) : undefined}
            onOpen={(field) => setSheet({ itemId: item.id, field })}
          />
        ))}
        {items.length === 0 && <Text style={styles.sub}>넣을 옷이 없어요. 뒤로 가서 네모를 다시 맞춰 주세요</Text>}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(24, insets.bottom) }]}>
        {error !== null && <Text style={styles.error}>{error}</Text>}
        <PrimaryButton label={button} onPress={save} disabled={saving || missing > 0 || items.length === 0} />
      </View>

      <BottomSheet
        visible={sheetItem !== undefined}
        title={sheet?.field === 'color' ? '색 고르기' : '종류 고르기'}
        onClose={() => setSheet(null)}>
        {sheetItem !== undefined && sheet?.field === 'kind' && (
          <KindPicker
            slot={sheetItem.slot}
            kind={sheetItem.kind}
            onPick={(slot: Slot, kind: Kind) => {
              track('wardrobe_kind_select', { via: 'photo', slot, kind });
              updateCutItem(sheetItem.id, withKind(sheetItem, slot, kind));
              // 종류를 고르고 색이 아직 없으면 바로 색 고르기로 넘어간다.
              setSheet(sheetItem.colorName === null ? { itemId: sheetItem.id, field: 'color' } : null);
            }}
          />
        )}
        {sheetItem !== undefined && sheet?.field === 'color' && sheetItem.kind !== null && (
          <ColorPicker
            kind={sheetItem.kind}
            value={sheetItem.colorName}
            onPick={(color: Color) => {
              track('wardrobe_color_select', { via: 'photo', kind: sheetItem.kind, color });
              updateCutItem(sheetItem.id, { colorName: color });
              setSheet(null);
            }}
          />
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

function ItemCard({
  item,
  index,
  numbered,
  onRemove,
  onOpen,
}: {
  item: CutItem;
  index: number;
  numbered: boolean;
  onRemove?: () => void;
  onOpen: (field: 'kind' | 'color') => void;
}) {
  const fits = item.slot !== null && item.kind !== null ? fitsForKind(item.slot, item.kind) : [];
  const name = item.kind === null ? '종류를 골라 주세요' : kindLabel(item.kind);

  function toggleSeason(season: Season) {
    updateCutItem(item.id, {
      seasons: item.seasons.includes(season) ? item.seasons.filter((s) => s !== season) : [...item.seasons, season],
    });
  }

  function chooseFit(fit: VisualFit) {
    updateCutItem(item.id, { fit: item.fit === fit ? null : fit });
  }

  return (
    <View style={styles.card}>
      {onRemove !== undefined && (
        <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`${index + 1}번 옷 빼기`} style={styles.remove} hitSlop={6}>
          <Svg width={14} height={14} viewBox="0 0 24 24">
            <Path d="M6 6l12 12M18 6L6 18" stroke={colors.textSecondary} strokeWidth={2.4} strokeLinecap="round" />
          </Svg>
        </Pressable>
      )}
      <View style={styles.cardTop}>
        <View style={styles.thumb}>
          <Image source={{ uri: item.uri }} style={styles.thumbImage} resizeMode="contain" accessibilityLabel={`${index + 1}번 옷 사진`} />
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.cardName, item.kind === null && styles.cardNameEmpty]} numberOfLines={1}>
            {numbered ? `${index + 1} · ` : ''}
            {name}
          </Text>
          <Field label="종류">
            <Chip label={item.kind === null ? '고르기' : `${item.slot} · ${kindLabel(item.kind)}`} on={item.kind !== null} onPress={() => onOpen('kind')} />
          </Field>
          <Field label="색">
            <Chip
              label={item.colorName ?? '고르기'}
              on={item.colorName !== null}
              disabled={item.kind === null}
              swatch={item.colorName}
              onPress={() => onOpen('color')}
            />
          </Field>
        </View>
      </View>

      {fits.length > 0 && (
        <Field label="핏" wide>
          {fits.map((fit) => (
            <Chip key={fit} label={fit} on={item.fit === fit} onPress={() => chooseFit(fit)} />
          ))}
        </Field>
      )}
      <Field label="계절" wide>
        {SEASONS.map((season) => (
          <Chip key={season} label={season} on={item.seasons.includes(season)} onPress={() => toggleSeason(season)} />
        ))}
      </Field>

      {item.kind !== null && (
        <View style={styles.autoIcon}>
          <View style={styles.autoIconBox}>
            <LookIcon look={null} kind={item.kind} color={item.colorName ?? undefined} fit={item.fit} size={30} />
          </View>
          <Text style={styles.autoIconText}>그림도 자동으로 만들어져요</Text>
        </View>
      )}
    </View>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <View style={[styles.field, wide && styles.fieldWide]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldChips}>{children}</View>
    </View>
  );
}

function Chip({
  label,
  on,
  disabled = false,
  swatch = null,
  onPress,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  swatch?: Color | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled }}
      style={[styles.chip, on ? styles.chipOn : styles.chipOff, disabled && styles.chipDisabled]}>
      {swatch !== null && <ColorSwatch color={swatch} width={13} height={13} questionSize={9} />}
      <Text style={[styles.chipText, on ? styles.chipTextOn : styles.chipTextOff]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: 24,
    gap: 12,
  },
  head: {
    paddingTop: 18,
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
  notice: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.photoPlaceholder,
    fontFamily: fonts.medium,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.onPurpleFill,
  },
  card: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: glass.border,
    gap: 10,
  },
  remove: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  cardTop: {
    flexDirection: 'row',
    gap: 14,
  },
  thumb: {
    width: 104,
    height: 104,
    borderRadius: 12,
    backgroundColor: colors.line,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: {
    width: 104,
    height: 104,
  },
  cardBody: {
    flex: 1,
    gap: 8,
    paddingRight: 28,
  },
  cardName: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.text,
  },
  cardNameEmpty: {
    color: colors.textPurple,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fieldWide: {
    alignItems: 'flex-start',
  },
  fieldLabel: {
    width: 30,
    paddingTop: 5,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  fieldChips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipOn: {
    backgroundColor: colors.purpleFill,
    borderColor: colors.purpleFill,
  },
  chipOff: {
    backgroundColor: colors.white,
    borderColor: colors.line,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipText: {
    fontSize: 12.5,
  },
  chipTextOn: {
    fontFamily: fonts.bold,
    color: colors.onPurpleFill,
  },
  chipTextOff: {
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  autoIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  autoIconBox: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoIconText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  footer: {
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
