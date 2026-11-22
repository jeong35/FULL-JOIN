// 여행 코디·짐(시험판). 주소: /trip/{id}
// 여행지 날씨(기상청 예보, 예보가 없는 먼 날은 평년 기온) → 내 옷장에서 고른 짐(×입는 횟수) → 날마다 코디 →
// 하나로 여러 번(돌려 입기) → 짐 싸기 체크. 고르는 규칙은 data/packing.ts.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { ClosetPicker, EditToggle } from '@/components/ClosetPicker';
import { HintBubble } from '@/components/HintBubble';
import { KindIcon } from '@/components/KindIcon';
import { WeatherIcon } from '@/components/LookParts';
import { BackButton } from '@/components/ui';
import { dayOfMonth, parseKey, weekday } from '@/data/dates';
import { climateWeather, isWet, planTrip, type DayOutfit, type PackPlan, type TripDay } from '@/data/packing';
import { markHintDone, useHintOpen } from '@/data/hints';
import { loadWardrobe, useWardrobeState } from '@/data/store';
import { nightsLabel, setTripItems, togglePacked, tripDates, useTrips, type Trip } from '@/data/trips';
import type { WardrobeItem } from '@/data/types';
import { loadWeather, REGIONS, useWeather } from '@/data/weather';
import { colors, fonts, glass, layout } from '@/theme';

const HINT_WIDTH = 270;

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trips = useTrips();
  const trip = trips.find((item) => item.id === id);
  const back = () => (router.canGoBack() ? router.back() : router.navigate('/recommend'));

  if (trip === undefined) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <BackButton onPress={back} size={40} />
          <Text style={styles.title}>여행</Text>
        </View>
        <Text style={[styles.body, styles.pad]}>이 여행을 찾지 못했어요. 다른 기기에서 만든 여행은 아직 보이지 않아요</Text>
      </SafeAreaView>
    );
  }
  return <TripView trip={trip} onBack={back} />;
}

function TripView({ trip, onBack }: { trip: Trip; onBack: () => void }) {
  const region = REGIONS.find((item) => item.name === trip.region) ?? REGIONS[0];
  const weather = useWeather(region);
  const wardrobe = useWardrobeState();
  useEffect(() => {
    void loadWardrobe();
  }, []);
  useEffect(() => {
    void loadWeather(region);
  }, [region]);

  const days: TripDay[] = useMemo(() => tripDates(trip).map((date, index) => {
    const forecast = weather.days.find((day) => day.date === date);
    return {
      index,
      date,
      weather: forecast ?? climateWeather(region, date),
      forecast: forecast !== undefined,
      schedule: trip.schedule[index] ?? '',
    };
  }), [trip, weather.days, region]);
  // 사용자가 고친 짐이 있으면 그 옷(옷장에 아직 있는 것)만으로 짠다.
  const custom = trip.custom ?? null;
  const chosen = useMemo(
    () => (custom === null ? undefined : wardrobe.data.filter((item) => custom.includes(item.id))),
    [custom, wardrobe.data],
  );
  const plan = useMemo(
    () => planTrip({ wardrobe: wardrobe.data, days, types: trip.types, packing: trip.packing, chosen }),
    [wardrobe.data, days, trip.types, trip.packing, chosen],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  // 처음엔 짐만 보여 주고, '수정'을 눌러야 옷마다 빼기(×)와 더하기가 나온다.
  const [editing, setEditing] = useState(false);
  const hintOpen = useHintOpen('set_edit');
  const toggleEditing = () => {
    markHintDone('set_edit');
    setEditing((on) => !on);
  };
  const packIds = plan.capsule.map((item) => item.id);
  const toggleItem = (itemId: string) => {
    setTripItems(trip.id, packIds.includes(itemId) ? packIds.filter((x) => x !== itemId) : [...packIds, itemId]);
  };
  // 옷 고르기 목록의 '추울 수 있어요' 안내는 가장 쌀쌀한 날 기준.
  const coldest = days.reduce<TripDay | undefined>((low, day) => (low === undefined || day.weather.min < low.weather.min ? day : low), undefined);
  const place = trip.region.split(' ')[0] ?? trip.region;
  const lastDate = days.at(-1)?.date ?? trip.end;
  const range = `${parseKey(trip.start).getMonth() + 1}월 ${dayOfMonth(trip.start)}일 ${weekday(trip.start)}${days.length > 1 ? ` ~ ${dayOfMonth(lastDate)}일 ${weekday(lastDate)}` : ''}`;
  const loading = wardrobe.status !== 'ready' && wardrobe.data.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <BackButton onPress={onBack} size={40} />
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">{place} {nightsLabel(trip.start, lastDate)}</Text>
          <Text style={styles.sub} numberOfLines={1}>{[range, trip.types.join('·'), trip.packing].filter(Boolean).join(' · ')}</Text>
        </View>
        <Pressable onPress={() => router.push({ pathname: '/trip/edit', params: { id: trip.id } })} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.edit}>고치기</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.weatherRow}>
          {days.map((day) => {
            const wet = isWet(day.weather);
            return (
              <View key={day.date} style={[styles.weatherCard, wet && styles.weatherCardWet]}>
                <Text style={styles.weatherDate}>{weekday(day.date)} {dayOfMonth(day.date)}</Text>
                <WeatherIcon sky={day.weather.sky} size={28} />
                <Text style={[styles.weatherSky, wet && styles.weatherSkyWet]}>{wet ? `${day.weather.sky} ${day.weather.pop}%` : day.forecast ? day.weather.sky : '평년'}</Text>
                <Text style={styles.weatherTemp}>{day.weather.max}° / {day.weather.min}°</Text>
              </View>
            );
          })}
        </ScrollView>
        {days.some((day) => !day.forecast) && (
          <Text style={styles.note}>예보는 열흘 뒤까지 나와요. 아직 예보가 없는 날은 평년 기온으로 골랐어요</Text>
        )}

        {loading ? (
          <Text style={styles.body}>옷장을 불러오는 중이에요</Text>
        ) : wardrobe.data.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.body}>옷장에 옷을 넣으면 여행 짐과 날마다 코디를 골라 드려요</Text>
            <Pressable onPress={() => router.push('/add-item/kind')} accessibilityRole="button" style={styles.emptyButton}>
              <Text style={styles.emptyButtonText}>옷장에 옷 넣기</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* 처음 한 번: 날씨 밑, 짐 카드 위에서 '수정'을 가리킨다. */}
            {hintOpen && !editing && plan.capsule.length > 0 && (
              <HintBubble id="set_edit" text="여기서 옷을 빼고 더할 수 있어요" tail="down" tailX={HINT_WIDTH - 48} onPress={() => setEditing(true)} style={styles.hint} />
            )}
            <PackCard
              plan={plan}
              editing={editing}
              onToggleEditing={toggleEditing}
              custom={custom !== null}
              onRemove={toggleItem}
              onAdd={() => setPickerOpen(true)}
              onReset={() => setTripItems(trip.id, null)}
            />

            {plan.outfits.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.h2}>날마다 코디</Text>
                {plan.outfits.map((outfit) => <DayCard key={outfit.day.date} outfit={outfit} />)}
              </View>
            )}

            {plan.reuse.length > 0 && (
              <View style={styles.section}>
                <View>
                  <Text style={styles.h2}>하나로 여러 번</Text>
                  <Text style={styles.sub}>같은 옷을 다르게 돌려 입는 법</Text>
                </View>
                {plan.reuse.map((line) => (
                  <View key={line.item.id} style={styles.reuse}>
                    <View style={styles.reuseIcon}><KindIcon kind={line.item.kind} color={line.item.color} fit={line.item.visual_fit} size={40} /></View>
                    <View style={styles.flex}>
                      <View style={styles.reuseHead}>
                        <Text style={styles.reuseKind}>{line.item.kind}</Text>
                        <Text style={styles.reuseCount}>{line.item.slot === '아우터' && line.days.length === days.length ? `${days.length}일 내내` : `${line.days.length}번`}</Text>
                      </View>
                      <Text style={styles.sub} numberOfLines={1}>{line.note}</Text>
                      <View style={styles.bars}>
                        {days.map((day) => <View key={day.date} style={[styles.bar, line.days.includes(day.index + 1) && styles.barOn]} />)}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {plan.capsule.length > 0 && <PackingChecklist trip={trip} items={plan.capsule} />}
          </>
        )}
        <Text style={styles.rule}>시험판이에요. 내 옷장 옷과 여행지 날씨로만 골라요</Text>
      </ScrollView>
      <ClosetPicker
        visible={pickerOpen}
        title="챙길 옷 고르기"
        wardrobe={wardrobe.data}
        selected={packIds}
        day={coldest?.weather}
        onToggle={toggleItem}
        onClose={() => setPickerOpen(false)}
      />
    </SafeAreaView>
  );
}

function PackCard({ plan, editing, onToggleEditing, custom, onRemove, onAdd, onReset }: {
  plan: PackPlan;
  editing: boolean; // '수정'을 눌러야 옷마다 빼기(×)와 더하기가 나온다
  onToggleEditing: () => void;
  custom: boolean;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onReset: () => void;
}) {
  const [showCombos, setShowCombos] = useState(false);
  const clothes = plan.capsule.filter((item) => item.slot !== '신발' && item.slot !== '가방').length;
  const shoes = plan.capsule.filter((item) => item.slot === '신발').length;
  const bags = plan.capsule.filter((item) => item.slot === '가방').length;
  const parts = [`옷 ${clothes}벌`, shoes > 0 ? `신발 ${shoes}` : '', bags > 0 ? `가방 ${bags}` : ''].filter(Boolean);
  return (
    <View style={styles.card}>
      <View style={styles.packHead}>
        <Text style={styles.sub}>{custom ? '내가 고친 짐' : '날씨와 여행 종류로 고른 짐'}</Text>
        <View style={styles.headLinks}>
          {custom && !editing && (
            <Pressable onPress={onReset} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.linkSoft}>추천대로</Text>
            </Pressable>
          )}
          <EditToggle editing={editing} onPress={onToggleEditing} />
        </View>
      </View>
      {plan.capsule.length > 0 && (
        <Text style={styles.packTitle}>{custom ? parts.join(' · ') : `${parts.join(' · ')}${ifParticle(parts.at(-1) ?? '')} 충분해요`}</Text>
      )}
      {plan.combos.length > 0 && (
        <Pressable onPress={() => setShowCombos((open) => !open)} accessibilityRole="button" accessibilityState={{ expanded: showCombos }}>
          <Text style={styles.packSub}>이 짐으로 코디 {plan.combos.length}가지를 만들 수 있어요 · {showCombos ? '접기' : '모두 보기'}</Text>
        </Pressable>
      )}
      {showCombos && (
        <View style={styles.comboList}>
          {plan.combos.map((combo, index) => (
            <View key={combo.id} style={styles.comboRow}>
              <Text style={styles.comboNum}>{index + 1}</Text>
              {combo.items.map((item) => (
                <View key={item.id} style={styles.comboTile}><KindIcon kind={item.kind} color={item.color} fit={item.visual_fit} size={30} /></View>
              ))}
            </View>
          ))}
        </View>
      )}
      {!editing && <Text style={styles.footnote}>{plan.capsule.length > 0 ? '×숫자 = 입는 횟수' : '옷장에서 챙길 옷을 골라 주세요'}</Text>}
      <View style={styles.grid}>
        {plan.capsule.map((item) => {
          const uses = plan.uses[item.id] ?? 0;
          return (
            <View key={item.id} style={styles.gridItem}>
              <View style={styles.gridTile}>
                <KindIcon kind={item.kind} color={item.color} fit={item.visual_fit} size={46} />
                <View style={[styles.times, uses === 0 && styles.timesZero]}><Text style={styles.timesText}>×{uses}</Text></View>
                {editing && (
                  <Pressable onPress={() => onRemove(item.id)} accessibilityRole="button" accessibilityLabel={`${item.kind} 짐에서 빼기`} hitSlop={6} style={styles.remove}>
                    <XIcon />
                  </Pressable>
                )}
              </View>
              <Text style={styles.gridName} numberOfLines={1}>{item.kind}</Text>
            </View>
          );
        })}
        {/* 더하기도 '수정' 안에서만. 짐이 하나도 없으면 바로 보여 준다. */}
        {(editing || plan.capsule.length === 0) && (
          <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel="옷장에서 짐 더하기" style={styles.gridItem}>
            <View style={[styles.gridTile, styles.addTile]}><PlusIcon /></View>
            <Text style={[styles.gridName, styles.addText]}>더하기</Text>
          </Pressable>
        )}
      </View>
      {plan.notes.map((note) => <Text key={note} style={styles.warn}>{note}</Text>)}
    </View>
  );
}

function XIcon() {
  return <Svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={3.4} strokeLinecap="round"><Path d="M6 6l12 12M18 6L6 18" /></Svg>;
}
function PlusIcon() {
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.textPurple} strokeWidth={2.2} strokeLinecap="round"><Path d="M12 5v14M5 12h14" /></Svg>;
}

// '가방 2' → '면', '신발 1'·'옷 6벌' → '이면' (숫자는 읽는 소리로).
function ifParticle(text: string): string {
  const last = text.at(-1) ?? '';
  if (/[0-9]/.test(last)) return '2459'.includes(last) ? '면' : '이면';
  const code = last.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '이면' : '면';
}

function DayCard({ outfit }: { outfit: DayOutfit }) {
  const { day } = outfit;
  const wet = isWet(day.weather);
  const schedule = day.schedule.split(/\s*[,·]\s*/).filter(Boolean);
  return (
    <View style={styles.card}>
      <View style={styles.dayHead}>
        <Text style={styles.dayTitle}>{day.index + 1}일차</Text>
        <Text style={styles.sub}>
          {weekday(day.date)} {dayOfMonth(day.date)} · {day.forecast || wet ? day.weather.sky : '평년'}{wet ? ` ${day.weather.pop}%` : ''} {day.weather.max}°/{day.weather.min}°
        </Text>
      </View>
      {schedule.length > 0 && <Text style={styles.schedule}>{schedule.join(' → ')}</Text>}
      <View style={styles.tiles}>
        {outfit.items.map((item) => (
          <View key={item.id} style={styles.tile}>
            <KindIcon kind={item.kind} color={item.color} fit={item.visual_fit} size={46} />
          </View>
        ))}
      </View>
      <Text style={styles.names}>{outfit.items.map((item) => item.kind).join(' · ')}</Text>
      <View style={styles.tip}><Text style={styles.tipText}>{outfit.tip}</Text></View>
    </View>
  );
}

function PackingChecklist({ trip, items }: { trip: Trip; items: readonly WardrobeItem[] }) {
  const packed = items.filter((item) => trip.packed.includes(item.id)).length;
  return (
    <View style={styles.card}>
      <View style={styles.checkHead}>
        <Text style={styles.h2}>짐 싸기 체크</Text>
        <Text style={styles.sub}>{items.length}개 중 {packed}개 챙김</Text>
      </View>
      {items.map((item) => {
        const done = trip.packed.includes(item.id);
        return (
          <Pressable
            key={item.id}
            onPress={() => togglePacked(trip.id, item.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            style={styles.checkRow}>
            <View style={[styles.checkBox, done && styles.checkBoxOn]}>{done && <CheckIcon />}</View>
            <Text style={[styles.checkKind, done && styles.checkDone]}>{item.kind}</Text>
            <Text style={[styles.checkColor, done && styles.checkDone]}>{item.color}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function CheckIcon() {
  return <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><Path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  pad: { padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: layout.screenPaddingX, paddingTop: 12, paddingBottom: 10 },
  title: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  edit: { fontFamily: fonts.bold, fontSize: 14, color: colors.textPurple },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.text },
  scroll: { paddingHorizontal: layout.screenPaddingX, paddingTop: 6, paddingBottom: 40, gap: 18 },
  bleed: { marginHorizontal: -layout.screenPaddingX, flexGrow: 0 },
  weatherRow: { gap: 8, paddingHorizontal: layout.screenPaddingX, paddingVertical: 2 },
  weatherCard: { width: 108, paddingVertical: 10, borderRadius: 16, backgroundColor: glass.background, borderWidth: 1, borderColor: glass.border, alignItems: 'center', gap: 3 },
  weatherCardWet: { borderColor: colors.purpleStrong, backgroundColor: colors.white },
  weatherDate: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  weatherSky: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  weatherSkyWet: { color: colors.textPurple },
  weatherTemp: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  note: { marginTop: -8, fontFamily: fonts.regular, fontSize: 11, lineHeight: 17, color: colors.textSecondary },
  empty: { gap: 10, padding: 14, borderRadius: 14, backgroundColor: colors.photoPlaceholder },
  emptyButton: { alignSelf: 'flex-start', height: 38, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.white, justifyContent: 'center' },
  emptyButtonText: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },
  card: { padding: 14, borderRadius: 18, backgroundColor: glass.background, borderWidth: 1, borderColor: glass.border, boxShadow: glass.shadow, gap: 8 },
  packHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headLinks: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hint: { alignSelf: 'flex-end', width: HINT_WIDTH, marginTop: -6, marginBottom: -8 },
  linkSoft: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
  link: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },
  timesZero: { backgroundColor: colors.textSecondary },
  remove: { position: 'absolute', left: 3, top: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(96,92,107,0.85)', alignItems: 'center', justifyContent: 'center' },
  addTile: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.purpleStrong, backgroundColor: 'transparent' },
  addText: { fontFamily: fonts.bold, color: colors.textPurple },
  comboList: { gap: 6, padding: 8, borderRadius: 12, backgroundColor: colors.photoPlaceholder },
  comboRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  comboNum: { width: 18, fontFamily: fonts.bold, fontSize: 12, color: colors.textPurple },
  comboTile: { width: 38, height: 38, borderRadius: 8, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  packTitle: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.text },
  packSub: { marginTop: -4, fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, marginTop: 4 },
  gridItem: { width: '20%', alignItems: 'center', gap: 4 },
  gridTile: { width: 56, height: 56, borderRadius: 12, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  times: { position: 'absolute', right: -6, top: -6, minWidth: 24, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: colors.purpleStrong, alignItems: 'center', justifyContent: 'center' },
  timesText: { fontFamily: fonts.bold, fontSize: 11, color: colors.white },
  gridName: { fontFamily: fonts.medium, fontSize: 11, color: colors.text },
  footnote: { fontFamily: fonts.regular, fontSize: 11, color: colors.textSecondary },
  warn: { fontFamily: fonts.medium, fontSize: 12, color: colors.danger },
  section: { gap: 10 },
  h2: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  dayTitle: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.text },
  schedule: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 6, borderRadius: 14, backgroundColor: colors.photoPlaceholder },
  tile: { width: 56, height: 56, borderRadius: 10, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  names: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  tip: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.photoPlaceholder },
  tipText: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.text },
  reuse: { padding: 12, borderRadius: 16, backgroundColor: glass.background, borderWidth: 1, borderColor: glass.border, flexDirection: 'row', alignItems: 'center', gap: 12 },
  reuseIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  reuseHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  reuseKind: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  reuseCount: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },
  bars: { flexDirection: 'row', gap: 3, marginTop: 6 },
  bar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.progressTrack },
  barOn: { backgroundColor: colors.purpleStrong },
  checkHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 },
  checkRow: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: colors.line },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.purpleStrong, alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { backgroundColor: colors.textPurple, borderColor: colors.textPurple },
  checkKind: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  checkColor: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  checkDone: { textDecorationLine: 'line-through', color: colors.textSecondary },
  rule: { fontFamily: fonts.regular, fontSize: 11, color: colors.textSecondary, textAlign: 'center' },
});
