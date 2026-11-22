// 옷장에서 옷 여러 벌 고르기(아래에서 올라오는 시트). 조합 만들기와 여행 짐 고치기가 같이 쓴다.
// 한 번에 다 보여 주면 고르기 어려워서 두 단계로 나눈다(11/20):
// 1) 카테고리 목록(상의·하의…, 몇 벌 골랐는지) → 2) 누른 카테고리 옷만 → '다 골랐어요'면 카테고리 목록으로 돌아온다.
// 고른 날 기온에 덥거나 추운 옷은 옆에 작게 알려 준다(고르는 건 막지 않는다).
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { KindIcon } from '@/components/KindIcon';
import { SLOTS, type Slot } from '@/data/catalog';
import { itemName } from '@/data/combos';
import type { WardrobeItem } from '@/data/types';
import { tempGap, type DayWeather } from '@/data/weather';
import { colors, fonts, layout } from '@/theme';

export function ClosetPicker({ visible, title, wardrobe, selected, day, onToggle, onClose }: {
  visible: boolean;
  title: string;
  wardrobe: readonly WardrobeItem[];
  selected: readonly string[];
  day: Pick<DayWeather, 'min' | 'max'> | undefined; // 여행처럼 날이 여럿이면 가장 쌀쌀한 날
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const [slot, setSlot] = useState<Slot | null>(null);
  // 닫을 때 카테고리 목록으로 돌려 둬서, 다시 열면 카테고리부터 보인다.
  const close = () => {
    setSlot(null);
    onClose();
  };
  const slots = SLOTS.filter((item) => wardrobe.some((piece) => piece.slot === item));
  const inSlot = slot === null ? [] : wardrobe.filter((item) => item.slot === slot);
  const pickedIn = (s: Slot) => wardrobe.filter((item) => item.slot === s && selected.includes(item.id)).length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => (slot !== null ? setSlot(null) : close())}>
      <View style={styles.backdrop}>
        <Pressable style={styles.flex} onPress={close} accessibilityLabel="닫기" />
        <View style={styles.sheet}>
          {slot === null ? (
            <>
              <View style={styles.head}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.count}>{selected.length}벌 골랐어요</Text>
              </View>
              <Text style={styles.hint}>어떤 옷을 고를까요?</Text>
              <ScrollView contentContainerStyle={styles.list}>
                {slots.map((item) => {
                  const first = wardrobe.find((piece) => piece.slot === item && selected.includes(piece.id)) ?? wardrobe.find((piece) => piece.slot === item);
                  const total = wardrobe.filter((piece) => piece.slot === item).length;
                  const picked = pickedIn(item);
                  return (
                    <Pressable key={item} onPress={() => setSlot(item)} accessibilityRole="button" accessibilityLabel={`${item} 고르기, ${picked}벌 골랐어요`} style={styles.row}>
                      <View style={styles.tile}>{first !== undefined && <KindIcon kind={first.kind} color={first.color} fit={first.visual_fit} size={36} />}</View>
                      <View style={styles.flex}>
                        <Text style={styles.slotName}>{item}</Text>
                        <Text style={styles.slotMeta}>옷장 {total}벌</Text>
                      </View>
                      {picked > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{picked}벌</Text></View>}
                      <ChevronRight />
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable onPress={close} accessibilityRole="button" style={styles.done}>
                <Text style={styles.doneText}>다 골랐어요</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.head}>
                <Pressable onPress={() => setSlot(null)} accessibilityRole="button" accessibilityLabel="카테고리로 돌아가기" hitSlop={10} style={styles.backRow}>
                  <ChevronLeft />
                  <Text style={styles.title}>{slot}</Text>
                </Pressable>
                <Text style={styles.count}>{pickedIn(slot)}벌 골랐어요</Text>
              </View>
              <ScrollView contentContainerStyle={styles.list}>
                {inSlot.map((item) => {
                  const on = selected.includes(item.id);
                  const gap = day === undefined ? null : tempGap(item.kind, day);
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => onToggle(item.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      style={[styles.row, on && styles.rowOn]}>
                      <View style={styles.tile}><KindIcon kind={item.kind} color={item.color} fit={item.visual_fit} size={36} /></View>
                      <View style={styles.flex}>
                        <Text style={styles.name}>{itemName(item)}</Text>
                        {gap !== null && <Text style={styles.warn}>이 날씨엔 {gap === '추움' ? '추울' : '더울'} 수 있어요</Text>}
                      </View>
                      <View style={[styles.check, on && styles.checkOn]}>{on && <CheckIcon />}</View>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable onPress={() => setSlot(null)} accessibilityRole="button" style={styles.done}>
                <Text style={styles.doneText}>{slot} 다 골랐어요</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// 고른 옷 카드 오른쪽 위 '수정' 버튼(누르면 '완료'). 카드 가장자리에서 조금 안쪽에 둔다.
export function EditToggle({ editing, onPress }: { editing: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={editing ? '수정 끝내기' : '옷 빼고 더하기'} hitSlop={6} style={[styles.edit, editing && styles.editOn]}>
      {!editing && <PencilIcon />}
      <Text style={[styles.editText, editing && styles.editTextOn]}>{editing ? '완료' : '수정'}</Text>
    </Pressable>
  );
}

function PencilIcon() {
  return <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={colors.textPurple} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M4 20h4L19 9l-4-4L4 16v4z" /><Path d="M13.5 6.5l4 4" /></Svg>;
}

function CheckIcon() {
  return <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><Path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
}
function ChevronRight() {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M9 6l6 6-6 6" /></Svg>;
}
function ChevronLeft() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 6l-6 6 6 6" /></Svg>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  backdrop: { flex: 1, backgroundColor: 'rgba(30,20,50,0.3)' },
  sheet: { maxHeight: '78%', paddingTop: 18, paddingBottom: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.background },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: -4 },
  title: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.text },
  count: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },
  hint: { paddingHorizontal: 20, paddingBottom: 8, marginTop: -4, fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  list: { paddingHorizontal: layout.screenPaddingX, paddingBottom: 12, gap: 6 },
  row: { minHeight: 58, paddingHorizontal: 8, paddingRight: 12, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowOn: { borderColor: colors.purpleStrong },
  tile: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  slotName: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  slotMeta: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  badge: { height: 24, paddingHorizontal: 9, borderRadius: 12, backgroundColor: colors.purpleFill, justifyContent: 'center' },
  badgeText: { fontFamily: fonts.bold, fontSize: 12, color: colors.onPurpleFill },
  name: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  warn: { fontFamily: fonts.regular, fontSize: 11, color: colors.danger },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.purpleStrong, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.textPurple, borderColor: colors.textPurple },
  done: { marginHorizontal: layout.screenPaddingX, marginTop: 4, height: 50, borderRadius: 14, backgroundColor: colors.purpleFill, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontFamily: fonts.bold, fontSize: 15, color: colors.onPurpleFill },
  edit: { height: 30, marginRight: 4, paddingHorizontal: 12, borderRadius: 15, backgroundColor: colors.photoPlaceholder, flexDirection: 'row', alignItems: 'center', gap: 4 },
  editOn: { backgroundColor: colors.purpleFill },
  editText: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },
  editTextOn: { color: colors.onPurpleFill },
});
