import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassView } from '@/components/GlassView';
import { CheckMark } from '@/components/Icons';
import { KindIcon } from '@/components/KindIcon';
import { DetailHeader, PrimaryButton, ProgressSteps, SegmentedControl } from '@/components/ui';
import { KINDS_BY_SLOT, SLOTS, type Kind, type Slot } from '@/data/catalog';
import { colors, fonts, glass, layout } from '@/theme';

// '옷 추가 ①' 부위·종류. 모양은 design/screens/20-add-item-1-kind.html을 따른다.

const GRID_GAP = 10;
const GRID_COLUMNS = 3;

export default function AddItemKindScreen() {
  const [slot, setSlot] = useState<Slot>('상의');
  const [kind, setKind] = useState<Kind | null>(null);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const cardWidth =
    (width - layout.screenPaddingX * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  const kinds: readonly Kind[] = KINDS_BY_SLOT[slot];

  function selectSlot(next: Slot) {
    if (next === slot) return;
    setSlot(next);
    // 부위가 바뀌면 이전 부위에서 고른 종류는 무효.
    setKind(null);
  }

  function goNext() {
    if (kind === null) return;
    router.push({ pathname: '/add-item/color-fit', params: { slot, kind } });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <DetailHeader title="옷 추가" onBack={() => router.back()} />
      <ProgressSteps current={[0, 1]} />

      <SegmentedControl options={SLOTS} value={slot} onChange={selectSlot} style={styles.segment} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>종류를 골라 주세요</Text>
        <View style={styles.grid}>
          {kinds.map((k) => (
            <KindCard
              key={`${slot}-${k}`}
              name={k}
              width={cardWidth}
              selected={k === kind}
              onPress={() => setKind(k)}
            />
          ))}
        </View>
      </ScrollView>

      {/* 시안의 아래 여백 24는 홈 인디케이터 자리까지 포함한 값이라, 둘 중 큰 쪽을 쓴다. */}
      <View style={[styles.footer, { paddingBottom: Math.max(24, insets.bottom) }]}>
        <PrimaryButton label="다음 — 색 · 핏 고르기" onPress={goNext} disabled={kind === null} />
      </View>
    </SafeAreaView>
  );
}

type KindCardProps = {
  name: Kind;
  width: number;
  selected: boolean;
  onPress: () => void;
};

function KindCard({ name, width, selected, onPress }: KindCardProps) {
  const content = (
    <>
      <View style={styles.cardImage}>
        <KindIcon kind={name} size={64} />
      </View>
      <Text style={[styles.cardName, selected && styles.cardNameSelected]} numberOfLines={1}>
        {name}
      </Text>
    </>
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected }}
      style={{ width }}>
      {selected ? (
        <View style={styles.cardSelected}>
          {content}
          <View style={styles.cardCheck}>
            <CheckMark />
          </View>
        </View>
      ) : (
        <GlassView radius={0} style={styles.card}>
          {content}
        </GlassView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  segment: {
    marginTop: 18,
    marginHorizontal: layout.screenPaddingX,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 12,
  },
  sectionTitle: {
    marginTop: 22,
    marginBottom: 12,
    marginHorizontal: 20,
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    paddingHorizontal: layout.screenPaddingX,
  },
  card: {
    padding: 8,
  },
  cardSelected: {
    padding: 7,
    borderWidth: 2,
    borderColor: colors.purpleStrong,
    backgroundColor: colors.white,
    boxShadow: glass.selectedCardShadow,
  },
  cardImage: {
    height: 72,
    backgroundColor: colors.photoPlaceholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: {
    marginTop: 8,
    marginHorizontal: 2,
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.text,
  },
  cardNameSelected: {
    color: colors.textPurple,
  },
  cardCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  footer: {
    paddingTop: 12,
    paddingHorizontal: layout.screenPaddingX,
  },
});
