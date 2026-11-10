import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { ColorSwatch } from '@/components/ColorSwatch';
import { KindIcon } from '@/components/KindIcon';
import { TabScreen } from '@/components/TabScreen';
import { SmallWhiteButton, TextTabs } from '@/components/ui';
import { errorMessage } from '@/data/api';
import { SLOTS, type Slot } from '@/data/catalog';
import { loadWardrobe, removeWardrobeItem, useWardrobeState } from '@/data/store';
import type { WardrobeItem } from '@/data/types';
import { colors, fonts, layout } from '@/theme';

// 옷장 탭. 모양은 design/screens/22-tab-closet.html을 따른다. 옷은 서버(GET /wardrobe)에서 받고, 새로 넣은 옷이 맨 앞에 보인다.

const FILTERS = ['전체', ...SLOTS] as const;
type Filter = '전체' | Slot;

const GRID_COLUMNS = 3;
const GRID_COLUMN_GAP = 2;
const TILE_COLORS = [colors.line, '#DFD5F0'] as const;

export default function ClosetScreen() {
  const wardrobeState = useWardrobeState();
  const wardrobe = wardrobeState.data;
  const loading = wardrobeState.status === 'idle' || wardrobeState.status === 'loading';
  const [filter, setFilter] = useState<Filter>('전체');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { width } = useWindowDimensions();

  const tileWidth =
    (width - layout.screenPaddingX * 2 - GRID_COLUMN_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  const visible = filter === '전체' ? wardrobe : wardrobe.filter((item) => item.slot === filter);

  function addItem() {
    if (filter === '전체') {
      router.push('/add-item/kind');
      return;
    }
    router.push({ pathname: '/add-item/kind', params: { slot: filter } });
  }

  function confirmDelete(item: WardrobeItem) {
    const remove = () => {
      setActionError(null);
      setDeletingId(item.id);
      void removeWardrobeItem(item.id)
        .catch((error) => setActionError(errorMessage(error)))
        .finally(() => setDeletingId(null));
    };

    // React Native Web의 Alert는 선택 버튼 콜백을 지원하지 않아 브라우저 확인창을 쓴다.
    if (Platform.OS === 'web') {
      if (globalThis.confirm(`${item.kind}을(를) 내 옷장에서 삭제할까요?`)) remove();
      return;
    }
    Alert.alert(
      '옷을 삭제할까요?',
      `${item.kind}을(를) 내 옷장에서 삭제해요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: remove,
        },
      ],
    );
  }

  return (
    <TabScreen
      title="내 옷장"
      subtitle={loading && wardrobe.length === 0 ? '불러오는 중' : `${wardrobe.length}벌 등록`}
      headerRight={
        <Pressable
          onPress={addItem}
          accessibilityRole="button"
          style={styles.addButton}>
          <Text style={styles.addButtonText}>+ 옷 추가</Text>
        </Pressable>
      }>
      <TextTabs options={FILTERS} value={filter} onChange={setFilter} />
      {actionError !== null && <Text style={styles.actionError}>{actionError}</Text>}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.grid}>
        {wardrobe.length === 0 && loading ? (
          <View style={styles.emptyBox}>
            <ActivityIndicator color={colors.textPurple} />
          </View>
        ) : wardrobe.length === 0 && wardrobeState.status === 'error' ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>{wardrobeState.error}</Text>
            <SmallWhiteButton label="다시 시도" onPress={() => loadWardrobe()} />
          </View>
        ) : visible.length === 0 ? (
          <Text style={styles.empty}>아직 등록한 옷이 없어요</Text>
        ) : (
          visible.map((item, index) => (
            <WardrobeTile
              key={item.id}
              item={item}
              width={tileWidth}
              index={index}
              deleting={deletingId === item.id}
              onDelete={() => confirmDelete(item)}
            />
          ))
        )}
      </ScrollView>
    </TabScreen>
  );
}

function WardrobeTile({
  item,
  width,
  index,
  deleting,
  onDelete,
}: {
  item: WardrobeItem;
  width: number;
  index: number;
  deleting: boolean;
  onDelete: () => void;
}) {
  const meta = item.visual_fit === null ? item.color : `${item.color} · ${item.visual_fit}`;
  return (
    <View style={{ width }} accessible accessibilityLabel={`${item.kind}, ${meta}`}>
      <View style={[styles.tileImage, { backgroundColor: TILE_COLORS[index % 2] }]}>
        <KindIcon kind={item.kind} color={item.color} fit={item.visual_fit} size={Math.min(width * 0.72, 96)} />
        <View style={styles.tileSwatch}>
          <ColorSwatch color={item.color} width={14} height={14} questionSize={9} lightBorderColor="#C9BFDB" />
        </View>
        <Pressable
          onPress={onDelete}
          disabled={deleting}
          accessibilityRole="button"
          accessibilityLabel={`${item.kind} 삭제`}
          hitSlop={6}
          style={styles.deleteButton}>
          {deleting
            ? <ActivityIndicator size="small" color={colors.textSecondary} />
            : <Text style={styles.deleteButtonText}>삭제</Text>}
        </Pressable>
      </View>
      <Text style={styles.tileName} numberOfLines={1}>
        {item.kind}
      </Text>
      <Text style={styles.tileMeta} numberOfLines={1}>
        {meta}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  addButton: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.purpleFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.onPurpleFill,
  },
  actionError: {
    marginHorizontal: layout.screenPaddingX,
    marginBottom: 10,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.danger,
  },
  scroll: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: GRID_COLUMN_GAP,
    rowGap: 14,
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: 16,
  },
  empty: {
    width: '100%',
    marginTop: 40,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  emptyBox: {
    width: '100%',
    marginTop: 40,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  tileImage: {
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileSwatch: {
    position: 'absolute',
    left: 8,
    bottom: 8,
  },
  deleteButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 36,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.danger,
  },
  tileName: {
    marginTop: 6,
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.text,
  },
  tileMeta: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
});
