// 여행 계획 넣기·고치기(시험판). 주소: /trip/edit?start=YYYY-MM-DD (새 여행) 또는 /trip/edit?id=… (고치기).
// 어디로(국내 지역) · 언제(6박 7일까지) · 어떤 여행(2개까지) · 날마다 일정 · 짐 크기를 받아 /trip/{id}로 간다.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { BackButton, PrimaryButton, SegmentedControl } from '@/components/ui';
import { addDays, dayOfMonth, nextDays, parseKey, todayKey, weekday } from '@/data/dates';
import { getTrip, nightsLabel, PACKINGS, removeTrip, saveTrip, TRIP_DAYS_MAX, TRIP_TYPE_MAX, TRIP_TYPES, tripDates, type Packing, type TripType } from '@/data/trips';
import { REGIONS, useRegion } from '@/data/weather';
import { colors, fonts, glass, layout } from '@/theme';

const PACKING_LABEL: Record<Packing, string> = { 가볍게: '가볍게 (기내용)', 넉넉하게: '넉넉하게 (캐리어)' };
const PACKING_OPTIONS = PACKINGS.map((item) => PACKING_LABEL[item]);
const START_RANGE = 60;

function dateLabel(key: string): string {
  return `${parseKey(key).getMonth() + 1}월 ${dayOfMonth(key)}일 (${weekday(key)})`;
}

export default function TripEditScreen() {
  const params = useLocalSearchParams<{ id?: string; start?: string }>();
  const existing = typeof params.id === 'string' ? getTrip(params.id) : undefined;
  const today = todayKey();
  const current = useRegion();
  const firstStart = existing?.start ?? (typeof params.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.start) && params.start >= today ? params.start : addDays(today, 1));
  const [region, setRegion] = useState(existing?.region ?? current.name);
  const [start, setStart] = useState(firstStart);
  const [end, setEnd] = useState(existing?.end ?? addDays(firstStart, 2));
  const [types, setTypes] = useState<TripType[]>(existing?.types ?? []);
  const [schedule, setSchedule] = useState<string[]>(existing?.schedule ?? []);
  const [packing, setPacking] = useState<Packing>(existing?.packing ?? '가볍게');
  const [sheet, setSheet] = useState<'region' | 'start' | 'end' | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.navigate('/recommend'));
  const dates = tripDates({ start, end });

  const pickStart = (date: string) => {
    // 가는 날을 옮기면 기간(며칠)은 그대로 둔다.
    const length = Math.max(0, dates.length - 1);
    setStart(date);
    setEnd(addDays(date, length));
  };
  const toggleType = (type: TripType) => {
    setTypes((prev) => (prev.includes(type) ? prev.filter((item) => item !== type) : prev.length >= TRIP_TYPE_MAX ? prev : [...prev, type]));
  };

  const sheetItems: { key: string; label: string; current: boolean; onPick: () => void }[] =
    sheet === 'region'
      ? REGIONS.map((item) => ({ key: item.name, label: item.name, current: item.name === region, onPick: () => setRegion(item.name) }))
      : sheet === 'start'
        ? nextDays(today, START_RANGE).map((date) => ({ key: date, label: dateLabel(date), current: date === start, onPick: () => pickStart(date) }))
        : sheet === 'end'
          ? nextDays(start, TRIP_DAYS_MAX).map((date, i) => ({ key: date, label: `${dateLabel(date)} · ${i === 0 ? '당일치기' : nightsLabel(start, date)}`, current: date === end, onPick: () => setEnd(date) }))
          : [];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <BackButton onPress={back} size={40} />
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">{existing ? '여행 고치기' : '여행 계획'}</Text>
          <Text style={styles.sub}>날마다 입을 옷과 챙길 짐을 내 옷장에서 골라 드려요</Text>
        </View>
        <View style={styles.beta}><Text style={styles.betaText}>시험판</Text></View>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Field label="어디로 가요">
          <Pressable onPress={() => setSheet('region')} accessibilityRole="button" accessibilityLabel={`여행지, 지금 ${region}`} style={styles.box}>
            <PinIcon />
            <Text style={styles.boxValue}>{region}</Text>
          </Pressable>
        </Field>

        <Field label="언제 가요">
          <View style={styles.dateRow}>
            <Pressable onPress={() => setSheet('start')} accessibilityRole="button" style={[styles.box, styles.dateBox]}>
              <View>
                <Text style={styles.boxLabel}>가는 날</Text>
                <Text style={styles.boxValue}>{dateLabel(start)}</Text>
              </View>
            </Pressable>
            <Text style={styles.tilde}>~</Text>
            <Pressable onPress={() => setSheet('end')} accessibilityRole="button" style={[styles.box, styles.dateBox]}>
              <View>
                <Text style={styles.boxLabel}>오는 날</Text>
                <Text style={styles.boxValue}>{dateLabel(end)}</Text>
              </View>
            </Pressable>
          </View>
          <Text style={styles.nights}>{nightsLabel(start, end)}</Text>
        </Field>

        <Field label="어떤 여행이에요" hint={`${TRIP_TYPE_MAX}개까지 · MT·새터·워크숍이면 활동하기 편한 옷, 출장이면 단정한 옷을 먼저 골라요`}>
          <View style={styles.wrap}>
            {TRIP_TYPES.map((type) => {
              const selected = types.includes(type);
              return (
                <Pressable key={type} onPress={() => toggleType(type)} accessibilityRole="button" accessibilityState={{ selected }} style={[styles.chip, selected && styles.chipSelected]}>
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{type}</Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <Field label="날마다 일정" hint="일정에 맞춰 신발·가방까지 골라요 (예: 오름 → 편한 신발)">
          {dates.map((date, i) => (
            <View key={date} style={styles.dayRow}>
              <View style={styles.dayLabel}>
                <Text style={styles.dayNum}>{i + 1}일차</Text>
                <Text style={styles.dayDate}>{weekday(date)} {dayOfMonth(date)}</Text>
              </View>
              <TextInput
                value={schedule[i] ?? ''}
                onChangeText={(text) => setSchedule((prev) => {
                  const next = [...prev];
                  next[i] = text;
                  return next;
                })}
                placeholder={i === 0 ? '예: 애월 카페, 협재 해변' : i === dates.length - 1 && dates.length > 1 ? '예: 시내 쇼핑, 오후 비행기' : '예: 오름 산책, 동문시장'}
                placeholderTextColor={colors.textSecondary}
                maxLength={40}
                style={styles.dayInput}
                accessibilityLabel={`${i + 1}일차 일정`}
              />
            </View>
          ))}
        </Field>

        <Field label="짐은">
          <SegmentedControl
            options={PACKING_OPTIONS}
            value={PACKING_LABEL[packing]}
            onChange={(label) => setPacking(PACKINGS.find((item) => PACKING_LABEL[item] === label) ?? '가볍게')}
          />
        </Field>

        {existing !== undefined && (
          <Pressable
            onPress={() => {
              removeTrip(existing.id);
              router.navigate('/recommend');
            }}
            accessibilityRole="button"
            style={styles.delete}>
            <Text style={styles.deleteText}>이 여행 지우기</Text>
          </Pressable>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton
          label="날마다 입을 옷 골라 보기"
          onPress={() => {
            const trip = saveTrip({ id: existing?.id, region, start, end, types, schedule, packing });
            router.replace({ pathname: '/trip/[id]', params: { id: trip.id } });
          }}
        />
      </View>

      <Modal visible={sheet !== null} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheet(null)} accessibilityLabel="닫기">
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{sheet === 'region' ? '어디로 가요' : sheet === 'start' ? '가는 날' : '오는 날'}</Text>
            <ScrollView style={styles.sheetList}>
              {sheetItems.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    item.onPick();
                    setSheet(null);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.current }}
                  style={styles.sheetRow}>
                  <Text style={[styles.sheetRowText, item.current && styles.sheetRowTextCurrent]}>{item.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint !== undefined && <Text style={[styles.sub, styles.hintTop]}>{hint}</Text>}
      {children}
    </View>
  );
}

function PinIcon() {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textPurple} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 21s-6-5.4-6-10.5a6 6 0 0 1 12 0C18 15.6 12 21 12 21z" /><Path d="M14.2 10.5a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0z" /></Svg>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: layout.screenPaddingX, paddingTop: 12, paddingBottom: 10 },
  title: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  beta: { height: 24, paddingHorizontal: 9, borderRadius: 12, backgroundColor: colors.photoPlaceholder, justifyContent: 'center' },
  betaText: { fontFamily: fonts.bold, fontSize: 11, color: colors.tagText },
  scroll: { paddingHorizontal: layout.screenPaddingX, paddingTop: 8, paddingBottom: 24, gap: 24 },
  field: { gap: 8 },
  label: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  hintTop: { marginTop: -4 },
  box: { minHeight: 50, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: glass.border, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 10 },
  boxLabel: { fontFamily: fonts.regular, fontSize: 11, color: colors.textSecondary },
  boxValue: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateBox: { flex: 1 },
  tilde: { fontFamily: fonts.regular, fontSize: 15, color: colors.textSecondary },
  nights: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { height: 38, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: glass.border, backgroundColor: glass.background, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.purpleFill, borderColor: colors.purpleFill },
  chipText: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  chipTextSelected: { fontFamily: fonts.bold, color: colors.onPurpleFill },
  dayRow: { minHeight: 56, paddingLeft: 12, paddingRight: 6, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: glass.border, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayLabel: { width: 48 },
  dayNum: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },
  dayDate: { fontFamily: fonts.regular, fontSize: 11, color: colors.textSecondary },
  dayInput: { flex: 1, height: 48, fontFamily: fonts.regular, fontSize: 14, color: colors.text },
  delete: { alignSelf: 'center', paddingVertical: 8 },
  deleteText: { fontFamily: fonts.medium, fontSize: 14, color: colors.danger },
  footer: { paddingHorizontal: layout.screenPaddingX, paddingTop: 8, paddingBottom: 12 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(30,20,50,0.3)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '70%', paddingTop: 18, paddingBottom: 30, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.background },
  sheetTitle: { paddingHorizontal: 20, paddingBottom: 8, fontFamily: fonts.extraBold, fontSize: 17, color: colors.text },
  sheetList: { paddingHorizontal: 12 },
  sheetRow: { height: 48, paddingHorizontal: 8, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.line },
  sheetRowText: { fontFamily: fonts.regular, fontSize: 15, color: colors.text },
  sheetRowTextCurrent: { fontFamily: fonts.bold, color: colors.textPurple },
});
