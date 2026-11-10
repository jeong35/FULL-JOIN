import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ColorSwatch } from '@/components/ColorSwatch';
import { HintBubble } from '@/components/HintBubble';
import { KindIcon } from '@/components/KindIcon';
import { TabScreen } from '@/components/TabScreen';
import { SmallWhiteButton, TextTabs } from '@/components/ui';
import { SLOTS, type Slot } from '@/data/catalog';
import { track } from '@/data/events';
import { useHintOpen } from '@/data/hints';
import { loadArchive, loadWardrobe, removeWardrobeItems, useArchiveState, useWardrobeState } from '@/data/store';
import type { WardrobeItem } from '@/data/types';
import { colors, fonts, layout } from '@/theme';

// 옷장 탭. 모양은 design/screens/22-tab-closet.html을 따른다. 옷은 서버(GET /wardrobe)에서 받고, 새로 넣은 옷이 맨 앞에 보인다.
// 지우기: '편집'을 누르면 옷마다 동그라미가 생기고, 여러 벌을 골라 아래 '고른 N벌 삭제'로 한 번에 지운다
// (디자인 캔버스 '옷 삭제 — B. 편집 → 여러 벌 골라 삭제', 11/10 팀 결정).

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
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const archive = useArchiveState();
  const emptyHintOpen = useHintOpen('closet_empty');
  const afterClosetHintOpen = useHintOpen('home_after_closet');
  // 다음 할 일 말풍선: 0벌이면 옷 넣기(위). 옷을 넣었고 아직 저장한 사진이 없으면 홈으로 가서 사진 보며 코디 고르기
  // (아래, 꼬리는 홈 탭을 가리킨다. 11/11 팀 결정).
  const hintable = !editing && !loading && wardrobeState.status === 'ready';
  const showEmptyHint = hintable && wardrobe.length === 0 && emptyHintOpen;
  const showAfterClosetHint = hintable && wardrobe.length > 0 && afterClosetHintOpen
    && archive.status === 'ready' && archive.data.length === 0;

  // 다른 탭으로 가면 편집을 끝낸다. 저장한 사진이 있는지(아래 말풍선)는 홈을 안 거쳐도 알 수 있게 받아 둔다.
  useFocusEffect(
    useCallback(() => {
      void loadArchive();
      return () => {
        setEditing(false);
        setSelected(new Set());
      };
    }, []),
  );

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

  function startEditing() {
    track('wardrobe_edit_start', { wardrobe_size: wardrobe.length });
    setActionError(null);
    setSelected(new Set());
    setEditing(true);
  }

  function stopEditing() {
    setEditing(false);
    setSelected(new Set());
  }

  function toggle(id: string) {
    track('wardrobe_delete_select', { item_id: id, selected: !selected.has(id) });
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteSelected() {
    if (selected.size === 0 || deleting) return;
    setDeleting(true);
    setActionError(null);
    const requested = selected.size;
    const failed = await removeWardrobeItems([...selected]);
    setDeleting(false);
    const deleted = requested - failed.length;
    if (deleted > 0) track('wardrobe_delete_done', { delete_count: deleted, remaining_count: wardrobe.length - deleted });
    if (failed.length === 0) {
      stopEditing();
      return;
    }
    track('wardrobe_delete_failed', { failed_count: failed.length });
    track('error_shown', { screen: 'wardrobe', error_code: 'wardrobe_delete_failed' });
    // 못 지운 옷은 고른 채로 남겨서 다시 누르면 바로 다시 지울 수 있게 한다.
    setSelected(new Set(failed));
    setActionError(`${failed.length}벌은 지우지 못했어요. 다시 시도해 주세요.`);
  }

  const subtitle = editing
    ? selected.size === 0
      ? '지울 옷을 골라 주세요'
      : `지울 옷을 골라 주세요 · ${selected.size}벌 골랐어요`
    : loading && wardrobe.length === 0
      ? '불러오는 중'
      : `${wardrobe.length}벌 등록`;

  return (
    <TabScreen
      title="내 옷장"
      subtitle={subtitle}
      headerRight={
        editing ? (
          <Pressable onPress={stopEditing} accessibilityRole="button" style={styles.doneButton}>
            <Text style={styles.doneButtonText}>완료</Text>
          </Pressable>
        ) : (
          <View style={styles.headerButtons}>
            {wardrobe.length > 0 && (
              <Pressable onPress={startEditing} accessibilityRole="button" style={styles.editButton}>
                <Text style={styles.editButtonText}>편집</Text>
              </Pressable>
            )}
            <Pressable onPress={addItem} accessibilityRole="button" style={styles.addButton}>
              <Text style={styles.addButtonText}>+ 옷 추가</Text>
            </Pressable>
          </View>
        )
      }>
      {showEmptyHint && (
        <HintBubble
          id="closet_empty"
          text="옷장이 아직 비어 있어요! 가진 옷을 넣으면 사진과 바로 비교해 볼 수 있어요"
          actionLabel="옷 넣기"
          tail="up"
          tailX={width - layout.screenPaddingX * 2 - 44}
          onPress={addItem}
          doneOnPress={false}
          style={styles.hintTop}
        />
      )}
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
              editing={editing}
              checked={selected.has(item.id)}
              onToggle={() => toggle(item.id)}
            />
          ))
        )}
      </ScrollView>

      {showAfterClosetHint && (
        <HintBubble
          id="home_after_closet"
          text="옷을 등록했어요! 이제 사진을 보며 원하는 코디를 골라볼까요? 옷을 더 등록하면 정확한 코디를 추천받을 수 있어요!"
          actionLabel="홈으로 가기"
          tail="down"
          tailX={width / 10 - layout.screenPaddingX}
          onPress={() => router.navigate('/')}
          style={styles.hintBottom}
        />
      )}

      {editing && (
        <View style={styles.deleteBar}>
          <Pressable
            onPress={deleteSelected}
            disabled={selected.size === 0 || deleting}
            accessibilityRole="button"
            accessibilityState={{ disabled: selected.size === 0 || deleting, busy: deleting }}
            style={[styles.deleteButton, (selected.size === 0 || deleting) && styles.deleteButtonDisabled]}>
            {deleting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.deleteButtonText}>
                {selected.size === 0 ? '지울 옷을 골라 주세요' : `고른 ${selected.size}벌 삭제`}
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </TabScreen>
  );
}

function WardrobeTile({
  item,
  width,
  index,
  editing,
  checked,
  onToggle,
}: {
  item: WardrobeItem;
  width: number;
  index: number;
  editing: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const meta = item.visual_fit === null ? item.color : `${item.color} · ${item.visual_fit}`;
  const content = (
    <>
      <View style={[styles.tileImage, { backgroundColor: TILE_COLORS[index % 2] }]}>
        <KindIcon kind={item.kind} color={item.color} fit={item.visual_fit} size={Math.min(width * 0.72, 96)} />
        <View style={styles.tileSwatch}>
          <ColorSwatch color={item.color} width={14} height={14} questionSize={9} lightBorderColor="#C9BFDB" />
        </View>
        {editing && checked && <View style={styles.tileRing} />}
        {editing && (
          <View style={[styles.checkCircle, checked && styles.checkCircleOn]}>
            {checked && (
              <Svg width={14} height={14} viewBox="0 0 24 24">
                <Path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  fill="none"
                  stroke={colors.white}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            )}
          </View>
        )}
      </View>
      <Text style={styles.tileName} numberOfLines={1}>
        {item.kind}
      </Text>
      <Text style={styles.tileMeta} numberOfLines={1}>
        {meta}
      </Text>
    </>
  );

  if (!editing) {
    return (
      <View style={{ width }} accessible accessibilityLabel={`${item.kind}, ${meta}`}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={`${item.kind}, ${meta}`}
      style={{ width }}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.onPurpleFill,
  },
  doneButton: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.onPurpleFill,
  },
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
  hintTop: {
    marginHorizontal: layout.screenPaddingX,
    marginTop: 2,
    marginBottom: 14,
  },
  hintBottom: {
    position: 'absolute',
    left: layout.screenPaddingX,
    right: layout.screenPaddingX,
    bottom: 12,
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
  // 고른 옷은 보라 테두리.
  tileRing: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 2,
    borderColor: colors.textPurple,
  },
  checkCircle: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#B9AED0',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleOn: {
    borderColor: colors.textPurple,
    backgroundColor: colors.textPurple,
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
  deleteBar: {
    paddingHorizontal: layout.screenPaddingX,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.background,
  },
  deleteButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonDisabled: {
    opacity: 0.4,
  },
  deleteButtonText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.white,
  },
});
