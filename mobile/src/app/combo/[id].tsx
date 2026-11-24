// 조합 만들기. 주소: /combo/{처음 누른 옷장 옷 id}?date=YYYY-MM-DD
// 추천 탭 '오늘 기온에 맞는 내 옷'에서 옷을 누르면 온다. 그날 날씨로 그 옷과 어울리는 옷 여러 벌을 먼저 골라 두고(suggestSet),
// 사용자가 옷을 더하거나 빼면 고른 옷들로 만들 수 있는 조합을 전부 다시 보여 준다(combosFromSet). 옷장 옷만 쓴다.
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { ClosetPicker, EditToggle } from '@/components/ClosetPicker';
import { HintBubble } from '@/components/HintBubble';
import { ItemIcon } from '@/components/WardrobeIcon';
import { kindLabel } from '@/data/catalog';
import { BackButton } from '@/components/ui';
import { combosFromSet, itemName, setGap, sortItems, suggestSet, type Combo } from '@/data/combos';
import { dayOfMonth, todayKey, weekday } from '@/data/dates';
import { track } from '@/data/events';
import { markHintDone, useHintOpen } from '@/data/hints';
import { loadArchive, loadWardrobe } from '@/data/store';
import type { WardrobeItem } from '@/data/types';
import { useRecommendation } from '@/data/useRecommendation';
import { loadWeather, tempGap } from '@/data/weather';
import { colors, fonts, glass, layout } from '@/theme';

const FIRST_SHOWN = 6;
const HINT_WIDTH = 270;

export default function ComboScreen() {
  const { id, date: dateParam, source } = useLocalSearchParams<{ id: string; date?: string; source?: string }>();
  const date = typeof dateParam === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayKey();
  const view = useRecommendation(date);
  const anchor = view.wardrobe.find((item) => item.id === id);
  // null이면 추천대로(날씨·옷장이 바뀌면 같이 바뀐다). 한 번이라도 더하거나 빼면 그때부터 사용자가 고른 목록.
  const [edited, setEdited] = useState<string[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // 처음엔 고른 옷만 보여 주고, '수정'을 눌러야 옷마다 빼기(×)가 나온다.
  const [editing, setEditing] = useState(false);
  const hintOpen = useHintOpen('set_edit');
  const toggleEditing = () => {
    markHintDone('set_edit');
    setEditing((on) => !on);
  };
  const [showAll, setShowAll] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const recordedRecommendationView = useRef<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.navigate('/recommend'));

  useEffect(() => {
    void loadWardrobe();
    void loadArchive();
  }, []);
  useEffect(() => {
    void loadWeather(view.region);
  }, [view.region]);

  const suggested = useMemo(
    () => (anchor === undefined ? [] : suggestSet(anchor, view.wardrobe, view.day)),
    [anchor, view.wardrobe, view.day],
  );
  const selectedIds = useMemo(() => edited ?? suggested.map((item) => item.id), [edited, suggested]);
  const selected = useMemo(() => sortItems(view.wardrobe.filter((item) => selectedIds.includes(item.id))), [view.wardrobe, selectedIds]);
  const combos = useMemo(() => combosFromSet(selected, view.day), [selected, view.day]);
  const shown = showAll ? combos : combos.slice(0, FIRST_SHOWN);
  const gap = combos.length === 0 ? setGap(selected) : null;
  // 저장한 사진 룩 중에 고른 옷만으로 입을 수 있는 것.
  const photoLooks = view.looks.filter((look) => look.pieces.every((piece) => selectedIds.includes(piece.wardrobeItem.id)));
  useEffect(() => {
    if (source !== 'recommendation' || anchor === undefined || view.wardrobeStatus !== 'ready') return;
    const signature = `${date}:${anchor.id}:${combos.length}`;
    if (recordedRecommendationView.current === signature) return;
    recordedRecommendationView.current = signature;
    track('recommendation_combo_view', {
      wardrobe_item_id: anchor.id,
      kind: anchor.kind,
      slot: anchor.slot,
      suggested_count: suggested.length,
      combo_count: combos.length,
      weather_available: view.day !== undefined,
    });
  }, [anchor, combos.length, date, source, suggested.length, view.day, view.wardrobeStatus]);
  const toggle = (itemId: string) => {
    setEdited((prev) => {
      const base = prev ?? suggested.map((item) => item.id);
      return base.includes(itemId) ? base.filter((x) => x !== itemId) : [...base, itemId];
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <BackButton onPress={back} size={40} />
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">조합 만들기</Text>
          <Text style={styles.sub}>
            {dayOfMonth(date)}일 {weekday(date)}
            {view.day !== undefined ? ` · 아침 ${view.day.min}° 낮 ${view.day.max}°` : ''}
            {view.plan !== undefined ? ` · ${view.plan.title}` : ''}
          </Text>
        </View>
      </View>

      {anchor === undefined ? (
        <View style={styles.pad}>
          <Text style={styles.body}>{view.wardrobeStatus === 'ready' ? '이 옷을 옷장에서 찾지 못했어요' : '옷장을 불러오는 중이에요'}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* 처음 한 번: 날씨(위 제목 줄) 밑, 고른 옷 카드 위에서 '수정'을 가리킨다. */}
          {hintOpen && !editing && selected.length > 0 && (
            <HintBubble id="set_edit" text="여기서 옷을 빼고 더할 수 있어요" tail="down" tailX={HINT_WIDTH - 46} onPress={() => setEditing(true)} style={styles.hint} />
          )}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.h2}>고른 옷 {selected.length}벌</Text>
              <View style={styles.headLinks}>
                {edited !== null && !editing && (
                  <Pressable onPress={() => setEdited(null)} accessibilityRole="button" hitSlop={8}>
                    <Text style={styles.linkSoft}>추천대로</Text>
                  </Pressable>
                )}
                <EditToggle editing={editing} onPress={toggleEditing} />
              </View>
            </View>
            {edited === null && <Text style={styles.sub}>{view.day !== undefined ? '날씨에 맞춰 ' : ''}{andParticle(kindLabel(anchor.kind))} 입기 좋은 옷을 골라 뒀어요</Text>}
            <View style={styles.picked}>
              {selected.map((item) => {
                const warm = view.day === undefined ? null : tempGap(item.kind, view.day);
                return (
                  <View key={item.id} style={styles.pickedItem}>
                    <View style={[styles.pickedTile, item.id === anchor.id && styles.pickedAnchor]}>
                      <ItemIcon item={item} size={48} />
                      {editing && (
                        <Pressable onPress={() => toggle(item.id)} accessibilityRole="button" accessibilityLabel={`${kindLabel(item.kind)} 빼기`} hitSlop={6} style={styles.remove}>
                          <XIcon />
                        </Pressable>
                      )}
                    </View>
                    <Text style={styles.pickedName} numberOfLines={1}>{kindLabel(item.kind)}</Text>
                    {warm !== null && <Text style={styles.pickedWarn}>{warm === '추움' ? '추울 수도' : '더울 수도'}</Text>}
                  </View>
                );
              })}
              {/* 더하기도 '수정' 안에서만. 고른 옷이 하나도 없으면 바로 보여 준다. */}
              {(editing || selected.length === 0) && (
                <Pressable onPress={() => setPickerOpen(true)} accessibilityRole="button" accessibilityLabel="옷장에서 옷 더하기" style={styles.pickedItem}>
                  <View style={[styles.pickedTile, styles.addTile]}><PlusIcon /></View>
                  <Text style={[styles.pickedName, styles.addText]}>더하기</Text>
                </Pressable>
              )}
            </View>
          </View>

          {photoLooks.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.h2}>고른 옷으로 입는 저장한 사진</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.photoRow}>
                {photoLooks.map((look) => (
                  <Pressable
                    key={look.image.id}
                    onPress={() => router.push({ pathname: '/look/[id]', params: { id: look.image.id, date } })}
                    accessibilityRole="button"
                    accessibilityLabel="저장한 사진 룩 보기">
                    <Image source={{ uri: look.image.thumbnail_url }} style={styles.photo} contentFit="cover" />
                    <Text style={styles.photoText}>내 옷 {look.pieces.length}벌</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.h2}>이 옷들로 만드는 조합</Text>
              {combos.length > 0 && <Text style={styles.sub}>{combos.length}가지</Text>}
            </View>
            {combos.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.body}>{gap ?? '고른 옷끼리는 색이 잘 맞는 조합이 없어요. 무채색 옷을 하나 더해 보세요'}</Text>
                <Pressable onPress={() => setPickerOpen(true)} accessibilityRole="button" style={styles.emptyButton}>
                  <Text style={styles.emptyButtonText}>옷 더하기</Text>
                </Pressable>
              </View>
            ) : (
              <>
                {shown.map((combo, index) => (
                  <ComboCard
                    key={combo.id}
                    combo={combo}
                    index={index}
                    anchorId={anchor.id}
                    chosen={chosen === combo.id}
                    onChoose={() => {
                      if (source === 'recommendation') {
                        track('recommendation_choice', {
                          recommendation_type: 'wardrobe_combo',
                          wardrobe_item_id: anchor.id,
                          combo_id: combo.id,
                          item_count: combo.items.length,
                        });
                      }
                      setChosen(combo.id);
                    }}
                  />
                ))}
                {combos.length > FIRST_SHOWN && (
                  <Pressable onPress={() => setShowAll((open) => !open)} accessibilityRole="button" style={styles.more}>
                    <Text style={styles.moreText}>{showAll ? '접기' : `${combos.length - FIRST_SHOWN}가지 더 보기`}</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>

        </ScrollView>
      )}

      <ClosetPicker
        visible={pickerOpen}
        title="옷장에서 고르기"
        wardrobe={view.wardrobe}
        selected={selectedIds}
        day={view.day}
        onToggle={toggle}
        onClose={() => setPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

function ComboCard({ combo, index, anchorId, chosen, onChoose }: {
  combo: Combo;
  index: number;
  anchorId: string;
  chosen: boolean;
  onChoose: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>조합 {index + 1}</Text>
        <View style={styles.tags}>
          {combo.tags.map((tag) => (
            <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>
          ))}
        </View>
      </View>
      <View style={styles.tiles}>
        {combo.items.map((item: WardrobeItem) => (
          <View key={item.id} style={[styles.tile, item.id === anchorId && styles.tileAnchor]}>
            <ItemIcon item={item} size={50} />
          </View>
        ))}
      </View>
      <Text style={styles.names}>{combo.items.map(itemName).join(' + ')}</Text>
      <Pressable onPress={onChoose} disabled={chosen} accessibilityRole="button" style={[styles.choose, chosen && styles.chooseDone]}>
        <Text style={styles.chooseText}>{chosen ? '이 조합으로 입기로 했어요' : '이 조합으로 입을래요'}</Text>
      </Pressable>
    </View>
  );
}

// '니트와', '재킷과'.
function andParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return `${word}${code >= 0 && code <= 11171 && code % 28 !== 0 ? '과' : '와'}`;
}

function XIcon() {
  return <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={3.2} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>;
}
function PlusIcon() {
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPurple} strokeWidth={2.2} strokeLinecap="round"><Path d="M12 5v14M5 12h14" /></Svg>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: layout.screenPaddingX, paddingTop: 12, paddingBottom: 10 },
  title: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  link: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },
  linkSoft: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
  headLinks: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hint: { alignSelf: 'flex-end', width: HINT_WIDTH, marginBottom: -10 },
  pad: { padding: 24 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.text },
  scroll: { paddingHorizontal: layout.screenPaddingX, paddingTop: 6, paddingBottom: 34, gap: 20 },
  card: { padding: 12, borderRadius: 18, backgroundColor: glass.background, borderWidth: 1, borderColor: glass.border, boxShadow: glass.shadow, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  picked: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 8, marginTop: 4 },
  pickedItem: { width: 64, alignItems: 'center', gap: 3 },
  pickedTile: { width: 64, height: 64, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: glass.border },
  pickedAnchor: { borderWidth: 2, borderColor: colors.purpleStrong },
  remove: { position: 'absolute', right: -6, top: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textSecondary, alignItems: 'center', justifyContent: 'center' },
  pickedName: { fontFamily: fonts.medium, fontSize: 11, color: colors.text },
  pickedWarn: { marginTop: -2, fontFamily: fonts.regular, fontSize: 10, color: colors.danger },
  addTile: { borderStyle: 'dashed', borderColor: colors.purpleStrong, backgroundColor: 'transparent' },
  addText: { color: colors.textPurple, fontFamily: fonts.bold },
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  h2: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  bleed: { marginHorizontal: -layout.screenPaddingX },
  photoRow: { gap: 8, paddingHorizontal: layout.screenPaddingX },
  photo: { width: 96, height: 120, borderRadius: 12, backgroundColor: colors.progressTrack },
  photoText: { marginTop: 4, fontFamily: fonts.medium, fontSize: 12, color: colors.text },
  empty: { gap: 10, padding: 14, borderRadius: 14, backgroundColor: colors.photoPlaceholder },
  emptyButton: { alignSelf: 'flex-start', height: 38, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.white, justifyContent: 'center' },
  emptyButtonText: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },
  cardTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  tags: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' },
  tag: { height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: colors.photoPlaceholder, justifyContent: 'center' },
  tagText: { fontFamily: fonts.medium, fontSize: 11, color: colors.tagText },
  tiles: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tile: { width: 60, height: 60, borderRadius: 12, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  tileAnchor: { borderWidth: 2, borderColor: colors.purpleStrong },
  names: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.text },
  choose: { height: 44, borderRadius: 12, backgroundColor: colors.purpleFill, alignItems: 'center', justifyContent: 'center' },
  chooseDone: { opacity: 0.6 },
  chooseText: { fontFamily: fonts.bold, fontSize: 14, color: colors.onPurpleFill },
  more: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  moreText: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },
});
