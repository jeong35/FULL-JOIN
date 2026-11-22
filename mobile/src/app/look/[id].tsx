// 룩 자세히(11/20 확정 시안): 내 옷을 바닥에 펼쳐 놓은 것처럼 보여 주고, 옷마다 사진 속 옷과의 매치를 적는다.
// 주소: /look/{저장한 사진 id}?date=YYYY-MM-DD (추천 탭에서 고른 날짜의 날씨·약속으로 같은 룩을 다시 계산한다).
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ItemIcon } from '@/components/WardrobeIcon';
import { MatchBadge, pieceNote } from '@/components/LookParts';
import { BackButton } from '@/components/ui';
import { kindLabel, type Slot } from '@/data/catalog';
import { dayOfMonth, todayKey, weekday } from '@/data/dates';
import { lookTips, matchOf, sortPieces, type OwnedPiece } from '@/data/recommend';
import { loadArchive, loadWardrobe } from '@/data/store';
import { useRecommendation } from '@/data/useRecommendation';
import { loadWeather } from '@/data/weather';
import { colors, fonts, glass, layout } from '@/theme';

// 펼쳐 놓는 자리(판 360×470 기준 왼쪽·위·크기·기울기). 같은 자리에 두 벌이면 다음 칸을 쓴다.
const SPOTS: Record<Slot, readonly { left: number; top: number; size: number; rotate: number }[]> = {
  아우터: [{ left: 2, top: 30, size: 196, rotate: -4 }],
  상의: [{ left: 182, top: 54, size: 160, rotate: 3 }, { left: 10, top: 40, size: 170, rotate: -3 }],
  원피스: [{ left: 170, top: 40, size: 190, rotate: 2 }],
  하의: [{ left: 96, top: 200, size: 176, rotate: 0 }],
  신발: [{ left: 14, top: 350, size: 112, rotate: -8 }],
  가방: [{ left: 236, top: 300, size: 106, rotate: 6 }],
  잡화: [{ left: 262, top: 16, size: 84, rotate: 8 }],
};

export default function LookDetailScreen() {
  const { id, date: dateParam } = useLocalSearchParams<{ id: string; date?: string }>();
  const date = typeof dateParam === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayKey();
  const view = useRecommendation(date);
  const index = view.looks.findIndex((look) => look.image.id === id);
  const look = index === -1 ? undefined : view.looks[index];
  const [chosen, setChosen] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.navigate('/recommend'));
  // 주소로 바로 들어온 경우(새로고침 등)에도 옷장·저장 목록·날씨를 받아 같은 룩을 다시 고른다.
  useEffect(() => {
    void loadWardrobe();
    void loadArchive();
  }, []);
  useEffect(() => {
    void loadWeather(view.region);
  }, [view.region]);
  const loading = view.wardrobeStatus !== 'ready' || view.archiveStatus !== 'ready' || view.pending > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <BackButton onPress={back} size={40} />
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">{view.plan !== undefined ? `${weekday(date)}요일 ${view.plan.title} 룩` : '오늘의 룩'}</Text>
          <Text style={styles.sub}>
            {dayOfMonth(date)}일 {weekday(date)}
            {view.day !== undefined ? ` · 아침 ${view.day.min}° 낮 ${view.day.max}°` : ''}
            {look !== undefined ? ` · 가진 옷 ${look.pieces.length}벌` : ''}
          </Text>
        </View>
        {look !== undefined && <Text style={styles.count}>{index + 1} / {view.looks.length}</Text>}
      </View>

      {look === undefined ? (
        <View style={styles.missing}>
          <Text style={styles.missingText}>{loading ? '내 옷장과 맞춰 보는 중이에요' : '이 룩을 찾지 못했어요. 옷장이 바뀌었을 수 있어요'}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <FlatLay pieces={look.pieces} onCompare={() => router.push({ pathname: '/result/[id]', params: { id: look.image.id } })} />

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.h2}>사진 속 옷과 매치</Text>
              <Text style={styles.sub}>내 옷 {look.pieces.length}벌</Text>
            </View>
            {sortPieces(look.pieces).map((piece) => (
              <View key={piece.wardrobeItem.id} style={styles.row}>
                <View style={styles.rowIcon}>
                  <ItemIcon item={piece.wardrobeItem} size={38} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.rowKind}>{kindLabel(piece.wardrobeItem.kind)}</Text>
                  <Text style={styles.sub} numberOfLines={1}>{pieceNote(piece)}</Text>
                </View>
                <MatchBadge match={matchOf(piece)} style={styles.rowBadge} />
              </View>
            ))}
          </View>

          {lookTips(look.pieces, view.day).length > 0 && (
            <View style={styles.tips}>
              {lookTips(look.pieces, view.day).map((tip) => (
                <View key={tip.label} style={styles.tipRow}>
                  <Text style={styles.tipLabel}>{tip.label}</Text>
                  <Text style={styles.tipText}>{tip.text}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.actions}>
            <Pressable onPress={() => setChosen(true)} disabled={chosen} accessibilityRole="button" style={[styles.choose, chosen && styles.chooseDone]}>
              <Text style={styles.chooseText}>{chosen ? '이 룩으로 입기로 했어요' : '이 룩으로 입을래요'}</Text>
            </Pressable>
            {view.looks.length > 1 && (
              <Pressable
                onPress={() => router.replace({ pathname: '/look/[id]', params: { id: view.looks[(index + 1) % view.looks.length].image.id, date } })}
                accessibilityRole="button"
                accessibilityLabel="다른 조합 보기"
                style={styles.iconButton}>
                <Text style={styles.next}>다음</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function FlatLay({ pieces, onCompare }: { pieces: readonly OwnedPiece[]; onCompare: () => void }) {
  const used: Partial<Record<Slot, number>> = {};
  return (
    <View style={styles.board} accessibilityLabel="내 옷을 펼쳐 놓은 코디">
      {sortPieces(pieces).map((piece) => {
        const slot = piece.wardrobeItem.slot;
        const n = used[slot] ?? 0;
        used[slot] = n + 1;
        const spot = SPOTS[slot][Math.min(n, SPOTS[slot].length - 1)];
        return (
          <View key={piece.wardrobeItem.id} style={[styles.spot, { left: spot.left, top: spot.top, transform: [{ rotate: `${spot.rotate}deg` }] }]}>
            <MatchBadge match={matchOf(piece)} style={styles.spotBadge} />
            <View style={styles.shadow}>
              <ItemIcon item={piece.wardrobeItem} size={spot.size} />
            </View>
          </View>
        );
      })}
      <Pressable onPress={onCompare} accessibilityRole="button" style={styles.compare}>
        <Text style={styles.compareText}>저장한 사진과 보기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: layout.screenPaddingX, paddingTop: 12, paddingBottom: 10 },
  title: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  count: { fontFamily: fonts.bold, fontSize: 13, color: colors.textSecondary },
  missing: { padding: 24 },
  missingText: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  scroll: { paddingHorizontal: layout.screenPaddingX, paddingTop: 6, paddingBottom: 34, gap: 18 },
  board: { height: 470, borderRadius: 22, overflow: 'hidden', backgroundColor: '#EFE9E1', boxShadow: glass.shadow },
  spot: { position: 'absolute' },
  spotBadge: { position: 'absolute', left: 6, top: -14, zIndex: 1, borderRadius: 13 },
  shadow: { filter: 'drop-shadow(0 10px 14px rgba(40,30,20,0.16))' },
  compare: { position: 'absolute', right: 12, bottom: 12, height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.92)', justifyContent: 'center' },
  compareText: { fontFamily: fonts.bold, fontSize: 12, color: colors.text },
  section: { gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  h2: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  row: { height: 60, paddingLeft: 8, paddingRight: 12, borderRadius: 14, backgroundColor: glass.background, borderWidth: 1, borderColor: glass.border, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowIcon: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  rowKind: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  rowBadge: { alignSelf: 'center' },
  tips: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.photoPlaceholder, gap: 6 },
  tipRow: { flexDirection: 'row', gap: 8 },
  tipLabel: { width: 52, fontFamily: fonts.bold, fontSize: 13, lineHeight: 20, color: colors.textPurple },
  tipText: { flex: 1, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.text },
  actions: { flexDirection: 'row', gap: 8 },
  choose: { flex: 1, height: 52, borderRadius: 14, backgroundColor: colors.purpleFill, alignItems: 'center', justifyContent: 'center' },
  chooseDone: { opacity: 0.6 },
  chooseText: { fontFamily: fonts.bold, fontSize: 15, color: colors.onPurpleFill },
  iconButton: { width: 64, height: 52, borderRadius: 14, backgroundColor: colors.white, boxShadow: glass.selectedInnerShadow, alignItems: 'center', justifyContent: 'center' },
  next: { fontFamily: fonts.bold, fontSize: 14, color: colors.textPurple },
});
