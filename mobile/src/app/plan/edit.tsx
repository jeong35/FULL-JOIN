// 약속 넣기·고치기. 주소: /plan/edit?date=YYYY-MM-DD (새 약속) 또는 /plan/edit?id=… (고치기).
// 시간은 오전/오후 + 시·분을 직접 넣는다(13~23시를 넣으면 그대로 24시간제로 본다).
// 무드(스타일)는 2개까지 — 약속 종류를 고르면 어울리는 무드를 먼저 골라 두고, 사용자가 바꿀 수 있다.
// 추천 탭이 그날 이 무드의 저장한 사진을 먼저 고른다.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DetailHeader, PrimaryButton, SegmentedControl } from '@/components/ui';
import { STYLES, type Style } from '@/data/catalog';
import { dayOfMonth, nextDays, todayKey, weekday } from '@/data/dates';
import { getPlan, PLAN_STYLE_MAX, removePlan, savePlan, timeLabel } from '@/data/plans';
import { colors, fonts, glass, layout } from '@/theme';

// 옷차림이 달라지는 약속 종류와, 고르면 먼저 골라 둘 무드.
const PRESETS: readonly { title: string; styles: readonly Style[] }[] = [
  { title: '데이트', styles: ['러블리'] },
  { title: '소개팅', styles: ['청순'] },
  { title: '출근', styles: ['미니멀'] },
  { title: '수업', styles: ['캐주얼'] },
  { title: '발표', styles: ['미니멀'] },
  { title: '면접', styles: ['미니멀'] },
  { title: '친구 모임', styles: ['캐주얼'] },
  { title: '하객', styles: ['엘레강스'] },
  { title: '여행', styles: ['캐주얼'] },
  { title: '운동', styles: ['스포티'] },
];
// 이 약속이면 여행 계획(시험판)으로 이어 준다.
const TRIP_TITLES: readonly string[] = ['여행', 'MT', '새터', '새내기 배움터', '워크숍'];
const HALVES = ['오전', '오후'] as const;
type Half = (typeof HALVES)[number];
const DATE_RANGE = 14;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// 'HH:MM' → 입력칸 값.
function splitTime(time: string | null): { half: Half; hour: string; minute: string } {
  if (time === null) return { half: '오후', hour: '', minute: '' };
  const [h, m] = time.split(':').map(Number);
  return { half: h < 12 ? '오전' : '오후', hour: String(h % 12 === 0 ? 12 : h % 12), minute: m ? pad(m) : '' };
}

// 입력칸 값 → 'HH:MM'. 시를 비우면 시간 미정(null), 범위를 벗어나면 'invalid'.
function joinTime(half: Half, hour: string, minute: string): string | null | 'invalid' {
  if (hour.trim() === '') return null;
  const h = Number(hour);
  const m = minute.trim() === '' ? 0 : Number(minute);
  if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(m) || m < 0 || m > 59) return 'invalid';
  if (h === 0 || h > 12) return `${pad(h)}:${pad(m)}`;
  const h24 = half === '오전' ? h % 12 : (h % 12) + 12;
  return `${pad(h24)}:${pad(m)}`;
}

const digits = (text: string) => text.replace(/[^0-9]/g, '').slice(0, 2);

export default function PlanEditScreen() {
  const params = useLocalSearchParams<{ id?: string; date?: string }>();
  const existing = typeof params.id === 'string' ? getPlan(params.id) : undefined;
  const today = todayKey();
  const dates = nextDays(today, DATE_RANGE);
  const initialDate = existing?.date ?? (typeof params.date === 'string' && dates.includes(params.date) ? params.date : today);
  const initialTime = splitTime(existing?.time ?? null);
  const [date, setDate] = useState(initialDate);
  const [half, setHalf] = useState<Half>(initialTime.half);
  const [hour, setHour] = useState(initialTime.hour);
  const [minute, setMinute] = useState(initialTime.minute);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [place, setPlace] = useState(existing?.place ?? '');
  const [moods, setMoods] = useState<Style[]>(existing?.styles ?? []);
  const [autoMoods, setAutoMoods] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.navigate('/recommend'));

  const time = joinTime(half, hour, minute);
  const timeInvalid = time === 'invalid';
  const canSave = title.trim().length > 0 && !timeInvalid;

  const pickPreset = (preset: (typeof PRESETS)[number]) => {
    setTitle(preset.title);
    // 무드를 직접 고르지 않았으면 약속에 어울리는 무드를 골라 둔다.
    if (moods.length === 0 || autoMoods) {
      setMoods([...preset.styles]);
      setAutoMoods(true);
    }
  };
  const toggleMood = (style: Style) => {
    setAutoMoods(false);
    setMoods((prev) => (prev.includes(style)
      ? prev.filter((item) => item !== style)
      : prev.length >= PLAN_STYLE_MAX ? prev : [...prev, style]));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <DetailHeader title={existing ? '약속 고치기' : '약속 추가'} onBack={back} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Field label="날짜">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {dates.map((item, index) => (
              <Chip key={item} selected={item === date} onPress={() => setDate(item)} label={`${index === 0 ? '오늘' : weekday(item)} ${dayOfMonth(item)}`} />
            ))}
          </ScrollView>
        </Field>

        <Field label="무슨 약속인가요">
          <View style={styles.wrap}>
            {PRESETS.map((preset) => (
              <Chip key={preset.title} selected={title === preset.title} onPress={() => pickPreset(preset)} label={preset.title} />
            ))}
          </View>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="직접 쓰기 (예: 친구 생일)"
            placeholderTextColor={colors.textSecondary}
            maxLength={12}
            style={styles.input}
            accessibilityLabel="약속 이름"
          />
          {TRIP_TITLES.includes(title.trim()) && (
            <Pressable
              onPress={() => router.push({ pathname: '/trip/edit', params: { start: date } })}
              accessibilityRole="button"
              style={styles.tripLink}>
              <Text style={styles.tripLinkText}>여러 날이면 여행 계획으로 날마다 코디와 짐까지 골라 드려요 · 시험판</Text>
              <Text style={styles.tripLinkGo}>만들기</Text>
            </Pressable>
          )}
        </Field>

        <Field label="시간">
          <View style={styles.timeRow}>
            <SegmentedControl options={HALVES} value={half} onChange={setHalf} style={styles.half} />
            <TextInput
              value={hour}
              onChangeText={(text) => setHour(digits(text))}
              placeholder="6"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              maxLength={2}
              style={styles.timeInput}
              accessibilityLabel="시"
            />
            <Text style={styles.timeUnit}>시</Text>
            <TextInput
              value={minute}
              onChangeText={(text) => setMinute(digits(text))}
              placeholder="00"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              maxLength={2}
              style={styles.timeInput}
              accessibilityLabel="분"
            />
            <Text style={styles.timeUnit}>분</Text>
          </View>
          <Text style={[styles.hint, timeInvalid && styles.error]}>
            {timeInvalid ? '시는 1~12(또는 0~23), 분은 0~59로 넣어 주세요' : time === null ? '시를 비워 두면 시간 미정으로 저장해요' : timeLabel(time)}
          </Text>
        </Field>

        <Field label="장소 (선택)">
          <TextInput
            value={place}
            onChangeText={setPlace}
            placeholder="예: 성수동"
            placeholderTextColor={colors.textSecondary}
            maxLength={16}
            style={styles.input}
            accessibilityLabel="장소"
          />
        </Field>

        <Field
          label={`무드 (${PLAN_STYLE_MAX}개까지)`}
          hint={autoMoods ? '약속에 어울리는 무드를 골라 뒀어요. 바꿔도 돼요' : '고른 스타일의 저장한 사진으로 먼저 골라 드려요'}>
          <View style={styles.wrap}>
            {STYLES.map((item) => <Chip key={item} selected={moods.includes(item)} onPress={() => toggleMood(item)} label={item} />)}
          </View>
        </Field>

        {existing !== undefined && (
          <Pressable
            onPress={() => {
              removePlan(existing.id);
              back();
            }}
            accessibilityRole="button"
            style={styles.delete}>
            <Text style={styles.deleteText}>이 약속 지우기</Text>
          </Pressable>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton
          label={title.trim().length === 0 ? '무슨 약속인지 골라 주세요' : timeInvalid ? '시간을 다시 확인해 주세요' : '저장하기'}
          disabled={!canSave}
          onPress={() => {
            if (time === 'invalid') return;
            savePlan({ id: existing?.id, date, time, title, place, styles: moods });
            back();
          }}
        />
      </View>
    </SafeAreaView>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint !== undefined && <Text style={[styles.hint, styles.hintTop]}>{hint}</Text>}
      {children}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: layout.screenPaddingX, paddingBottom: 24, gap: 22 },
  field: { gap: 8 },
  label: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  hintTop: { marginTop: -4 },
  error: { color: colors.danger },
  chipRow: { gap: 6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { height: 38, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: glass.border, backgroundColor: glass.background, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.purpleFill, borderColor: colors.purpleFill },
  chipText: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  chipTextSelected: { fontFamily: fonts.bold, color: colors.onPurpleFill },
  input: { height: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: glass.border, backgroundColor: colors.white, fontFamily: fonts.regular, fontSize: 15, color: colors.text },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  half: { width: 128 },
  timeInput: { width: 56, height: 48, borderRadius: 14, borderWidth: 1, borderColor: glass.border, backgroundColor: colors.white, textAlign: 'center', fontFamily: fonts.bold, fontSize: 17, color: colors.text },
  timeUnit: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  tripLink: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.photoPlaceholder },
  tripLinkText: { flex: 1, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.text },
  tripLinkGo: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },
  delete: { alignSelf: 'center', paddingVertical: 8 },
  deleteText: { fontFamily: fonts.medium, fontSize: 14, color: colors.danger },
  footer: { paddingHorizontal: layout.screenPaddingX, paddingTop: 8, paddingBottom: 12 },
});
