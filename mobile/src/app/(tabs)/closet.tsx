import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ViewToggle } from '@/components/ArtPager';
import { ColorSwatch } from '@/components/ColorSwatch';
import { HintBubble } from '@/components/HintBubble';
import { BottomSheet } from '@/components/PhotoAddParts';
import { ItemIcon } from '@/components/WardrobeIcon';
import { TabScreen } from '@/components/TabScreen';
import { SmallWhiteButton, TextTabs } from '@/components/ui';
import { kindLabel, SLOTS, type Slot } from '@/data/catalog';
import { track } from '@/data/events';
import { useHintOpen } from '@/data/hints';
import { pickPhotos, startPhotoBatch } from '@/data/photoAdd';
import { loadArchive, loadWardrobe, removeWardrobeItems, useArchiveState, useWardrobeState } from '@/data/store';
import type { Season, WardrobeItem } from '@/data/types';
import { removeWardrobePhotos, setClosetView, useClosetView, useWardrobePhotos, type ClosetView, type WardrobePhoto } from '@/data/wardrobePhotos';
import { colors, fonts, layout } from '@/theme';

// 옷장 탭. 모양은 design/screens/22-tab-closet.html을 따른다. 옷은 서버(GET /wardrobe)에서 받고, 새로 넣은 옷이 맨 앞에 보인다.
// 지우기: '편집'을 누르면 옷마다 동그라미가 생기고, 여러 벌을 골라 아래 '고른 N벌 삭제'로 한 번에 지운다
// (디자인 캔버스 '옷 삭제 — B. 편집 → 여러 벌 골라 삭제', 11/10 팀 결정).
// 11/22 사진으로 옷 추가: '+ 옷 추가'를 누르면 사진 찍기 · 앨범에서 고르기 · 직접 고르기를 고른다.
// 옷장 기본은 그림. 사진 넣은 옷은 칸 밑에 점 두 개가 있고, 칸을 옆으로 밀면 사진이 나온다. 옷을 누르면 옷 자세히.

const FILTERS = ['전체', ...SLOTS] as const;
type Filter = '전체' | Slot;

const GRID_COLUMNS = 3;
const GRID_COLUMN_GAP = 2;
const TILE_COLORS = [colors.line, '#E4E1EC'] as const;

export default function ClosetScreen() {
  const wardrobeState = useWardrobeState();
  const wardrobe = wardrobeState.data;
  const loading = wardrobeState.status === 'idle' || wardrobeState.status === 'loading';
  const [filter, setFilter] = useState<Filter>('전체');
  // 11/24 팀 결정 9번: 옷장 화면의 계절 표시(계절 거르기 칩, 옷 칸의 '사계절' 글)는 뺐다. 옷의 계절 값은 그대로 저장한다.
  const season = '전체' as Season | '전체';
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  // '고른 N벌 삭제'를 누른 뒤 한 번 더 묻는 중인지.
  const [confirming, setConfirming] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const archive = useArchiveState();
  const emptyHintOpen = useHintOpen('closet_empty');
  const afterClosetHintOpen = useHintOpen('home_after_closet');
  const swipeHintOpen = useHintOpen('closet_swipe');
  const photos = useWardrobePhotos();
  const view = useClosetView();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const photoCount = wardrobe.filter((item) => photos[item.id] !== undefined).length;
  // 다음 할 일 말풍선: 0벌이면 옷 넣기(위). 옷을 넣었고 아직 저장한 사진이 없으면 홈으로 가서 사진 보며 코디 고르기
  // (아래, 꼬리는 홈 탭을 가리킨다. 11/11 팀 결정).
  const hintable = !editing && !loading && wardrobeState.status === 'ready';
  const showEmptyHint = hintable && wardrobe.length === 0 && emptyHintOpen;
  const showAfterClosetHint = hintable && wardrobe.length > 0 && afterClosetHintOpen
    && archive.status === 'ready' && archive.data.length === 0;
  const showSwipeHint = hintable && photoCount > 0 && swipeHintOpen && !showAfterClosetHint;

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
  const visible = wardrobe.filter(
    (item) =>
      (filter === '전체' || item.slot === filter) &&
      (season === '전체' || !item.seasons?.length || item.seasons.includes(season)),
  );
  const emptyText =
    season === '전체' ? '아직 등록한 옷이 없어요' : `${season}에 입는 ${filter === '전체' ? '옷' : filter}이 아직 없어요`;

  // '+ 옷 추가': 사진으로 넣을지, 직접 고를지 먼저 묻는다.
  function addItem() {
    setSheetError(null);
    setSheetOpen(true);
  }

  // 웹에서는 누른 그 순간에 파일 고르기 창을 열어야 해서, 판을 닫기 전에 사진부터 고른다.
  async function addFromPhoto(from: 'camera' | 'album') {
    setSheetError(null);
    try {
      const sources = await pickPhotos(from);
      if (sources.length === 0) return;
      setSheetOpen(false);
      track('wardrobe_add_start', { via: 'photo', source: from, photo_count: sources.length, batch: sources.length > 1 });
      startPhotoBatch(sources);
      router.push('/add-item/photo-crop');
    } catch (error) {
      setSheetError(error instanceof Error ? error.message : '사진을 불러오지 못했어요');
    }
  }

  function addByChips() {
    setSheetOpen(false);
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
    setConfirming(false);
    setSelected(new Set());
  }

  function toggle(id: string) {
    track('wardrobe_delete_select', { item_id: id, selected: !selected.has(id) });
    setConfirming(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteSelected() {
    if (selected.size === 0 || deleting) return;
    setConfirming(false);
    setDeleting(true);
    setActionError(null);
    const requested = selected.size;
    const failed = await removeWardrobeItems([...selected]);
    setDeleting(false);
    const deleted = requested - failed.length;
    removeWardrobePhotos([...selected].filter((id) => !failed.includes(id)));
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
      : photoCount > 0
        ? `${wardrobe.length}벌 등록 · 사진 ${photoCount}벌`
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
      {photoCount > 0 && (
        <View style={styles.filterRow}>
          <View style={styles.seasonScroll} />
          <ViewToggle value={view} onChange={setClosetView} />
        </View>
      )}
      {actionError !== null && <Text style={styles.actionError}>{actionError}</Text>}
      {showSwipeHint && (
        <HintBubble
          id="closet_swipe"
          text={view === 'photo' ? '사진 넣은 옷은 칸을 옆으로 밀면 그림이 나와요' : '사진 넣은 옷은 칸을 옆으로 밀면 내 옷 사진이 나와요'}
          tail="none"
          style={styles.hintTop}
        />
      )}

      {/* 아래 말풍선이 떠 있으면 마지막 줄 옷이 가려지지 않게 그만큼 더 내려 볼 수 있게 한다. */}
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.grid, showAfterClosetHint && styles.gridUnderHint]}>
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
          <Text style={styles.empty}>{emptyText}</Text>
        ) : (
          visible.map((item, index) => (
            <WardrobeTile
              // 보기(그림 · 사진)를 바꾸면 칸을 새로 그려서 첫 장부터 보이게 한다.
              key={`${item.id}-${view}`}
              item={item}
              width={tileWidth}
              index={index}
              editing={editing}
              checked={selected.has(item.id)}
              onToggle={() => toggle(item.id)}
              photo={photos[item.id]}
              view={view}
              onOpen={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
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
          {confirming && !deleting ? (
            // 지우기 전에 한 번 더 묻는다. 지운 옷은 되돌릴 수 없다(동료 피드백 11/14).
            <>
              <Text style={styles.confirmText}>{selected.size}벌을 옷장에서 지울까요? 지우면 되돌릴 수 없어요.</Text>
              <View style={styles.confirmRow}>
                <Pressable
                  onPress={() => setConfirming(false)}
                  accessibilityRole="button"
                  style={[styles.deleteButton, styles.cancelButton]}>
                  <Text style={styles.cancelButtonText}>취소</Text>
                </Pressable>
                <Pressable onPress={deleteSelected} accessibilityRole="button" style={[styles.deleteButton, styles.confirmButton]}>
                  <Text style={styles.deleteButtonText}>지우기</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable
              onPress={() => setConfirming(true)}
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
          )}
        </View>
      )}

      <BottomSheet visible={sheetOpen} title="어떻게 넣을까요?" onClose={() => setSheetOpen(false)}>
        <Text style={styles.sheetGroup}>사진으로</Text>
        <SheetRow icon="camera" title="사진 찍기" sub="옷을 펴 놓고 위에서 찍어요" onPress={() => addFromPhoto('camera')} />
        <SheetRow icon="album" title="앨범에서 고르기" sub="거울샷 · 쇼핑몰 캡처도 돼요 · 여러 벌 한 번에" onPress={() => addFromPhoto('album')} />
        {sheetError !== null && <Text style={styles.sheetError}>{sheetError}</Text>}
        <View style={styles.sheetDivider} />
        <Text style={styles.sheetGroup}>사진 없이</Text>
        <SheetRow icon="list" title="직접 고르기" sub="부위 · 종류 · 색 · 핏을 골라요" onPress={addByChips} />
      </BottomSheet>
    </TabScreen>
  );
}

const SHEET_ICONS = {
  camera: 'M4 8h3l2-3h6l2 3h3v11H4z M12 9.4a3.6 3.6 0 1 0 0 7.2a3.6 3.6 0 1 0 0-7.2',
  album: 'M4 5h16v14H4z M20 16l-5-5-8 8 M9 8.3a1.7 1.7 0 1 0 0 3.4a1.7 1.7 0 1 0 0-3.4',
  list: 'M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01',
} as const;

function SheetRow({ icon, title, sub, onPress }: { icon: keyof typeof SHEET_ICONS; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}, ${sub}`} style={styles.sheetRow}>
      <View style={styles.sheetIcon}>
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <Path d={SHEET_ICONS[icon]} fill="none" stroke={colors.textPurple} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
      <View style={styles.sheetText}>
        <Text style={styles.sheetTitle}>{title}</Text>
        <Text style={styles.sheetSub}>{sub}</Text>
      </View>
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Path d="M9 5l7 7-7 7" fill="none" stroke="#A6A1B2" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}

// 옷장 보기: 그림(기본) · 사진. 사진 넣은 옷이 있을 때만 보인다.
function WardrobeTile({
  item,
  width,
  index,
  editing,
  checked,
  onToggle,
  photo,
  view,
  onOpen,
}: {
  item: WardrobeItem;
  width: number;
  index: number;
  editing: boolean;
  checked: boolean;
  onToggle: () => void;
  photo: WardrobePhoto | undefined;
  view: ClosetView;
  onOpen: () => void;
}) {
  const [page, setPage] = useState(0);
  const iconSize = Math.min(width * 0.72, 96);
  const photoSize = Math.min(width - 8, 106);
  const pages: ('icon' | 'photo')[] = photo === undefined ? ['icon'] : view === 'photo' ? ['photo', 'icon'] : ['icon', 'photo'];
  const art = (p: 'icon' | 'photo') =>
    p === 'photo' && photo !== undefined ? (
      <Image source={{ uri: photo.uri }} style={{ width: photoSize, height: photoSize }} resizeMode="contain" accessibilityIgnoresInvertColors />
    ) : (
      <ItemIcon item={item} size={iconSize} />
    );
  // 색(+ 무늬) · 핏. 무늬는 '더 자세히'에서 고른 옷만(11/19).
  const colorText = item.pattern ? `${item.color} ${item.pattern}` : item.color;
  const meta = item.visual_fit === null ? colorText : `${colorText} · ${item.visual_fit}`;
  const content = (
    <>
      <View style={[styles.tileImage, { backgroundColor: TILE_COLORS[index % 2] }]}>
        {pages.length > 1 && !editing ? (
          // 사진 넣은 옷: 칸을 옆으로 밀면 그림 ↔ 사진. 위아래로 밀면 옷장이 스크롤된다.
          <ScrollView
            horizontal
            pagingEnabled
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
            style={{ width }}>
            {pages.map((p) => (
              <View key={p} style={[styles.tilePage, { width }]}>
                {art(p)}
              </View>
            ))}
          </ScrollView>
        ) : (
          art(pages[0])
        )}
        {pages.length > 1 && !editing && (
          <View style={styles.tileDots} pointerEvents="none">
            {pages.map((p, i) => (
              <View key={p} style={[styles.tileDot, i === page && styles.tileDotOn]} />
            ))}
          </View>
        )}
        <View style={styles.tileSwatch} pointerEvents="none">
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
        {kindLabel(item.kind)}
      </Text>
      <Text style={styles.tileMeta} numberOfLines={1}>
        {meta}
      </Text>
    </>
  );

  if (!editing) {
    return (
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${kindLabel(item.kind)}, ${meta}${photo !== undefined ? ', 사진 있음' : ''}`}
        accessibilityHint="옷 자세히 보기"
        style={{ width }}>
        {content}
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={`${kindLabel(item.kind)}, ${meta}`}
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
    // 오른쪽 아래 챗봇 버튼(56)에 마지막 줄이 가리지 않게 넉넉히 둔다(11/25).
    paddingBottom: 96,
  },
  gridUnderHint: {
    paddingBottom: 170,
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
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: layout.screenPaddingX,
    paddingBottom: 10,
  },
  seasonScroll: {
    flexGrow: 1,
    flexShrink: 1,
  },
  seasonRow: {
    flexDirection: 'row',
    gap: 6,
    paddingLeft: layout.screenPaddingX,
  },
  tilePage: {
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileDots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 7,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 3,
  },
  tileDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(140,125,216,0.35)',
  },
  tileDotOn: {
    width: 12,
    backgroundColor: colors.purpleStrong,
  },
  sheetGroup: {
    paddingHorizontal: layout.screenPaddingX + 4,
    paddingTop: 4,
    paddingBottom: 2,
    fontFamily: fonts.bold,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: layout.screenPaddingX + 4,
    paddingVertical: 11,
  },
  sheetIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.photoPlaceholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetText: {
    flex: 1,
    gap: 2,
  },
  sheetTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.text,
  },
  sheetSub: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  sheetDivider: {
    height: 1,
    marginHorizontal: layout.screenPaddingX + 4,
    marginVertical: 6,
    backgroundColor: colors.line,
  },
  sheetError: {
    paddingHorizontal: layout.screenPaddingX + 4,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.danger,
  },
  seasonPill: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  seasonPillOn: {
    backgroundColor: colors.white,
    borderColor: colors.purpleLine,
    borderWidth: 1.5,
  },
  seasonText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
  seasonTextOn: {
    fontFamily: fonts.bold,
    color: colors.textPurple,
  },
  tileSeason: {
    marginTop: 1,
    fontFamily: fonts.regular,
    fontSize: 10.5,
    color: colors.textSecondary,
    opacity: 0.8,
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
  confirmText: {
    marginBottom: 10,
    textAlign: 'center',
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.text,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  cancelButtonText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
  },
  confirmButton: {
    flex: 1,
  },
});
