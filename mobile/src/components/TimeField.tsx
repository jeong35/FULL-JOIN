// 알림 시간 입력(11/25: 사람이 직접 입력해서 고친다). 오전·오후를 고르고 시(1~12)·분(0~59)을 숫자로 친다.
// 값은 'HH:MM'(24시간). 칸을 벗어나면(blur) 범위 밖 숫자를 맞춰 다시 보여 준다.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts, glass } from '@/theme';

const pad = (n: number) => String(n).padStart(2, '0');
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function parts(value: string) {
  const [h, m] = value.split(':').map(Number);
  return { pm: h >= 12, hour: h % 12 === 0 ? 12 : h % 12, minute: m };
}

export function TimeField({ value, onChange }: { value: string; onChange: (time: string) => void }) {
  const now = parts(value);
  const [hourText, setHourText] = useState(String(now.hour));
  const [minuteText, setMinuteText] = useState(pad(now.minute));

  function commit(pm: boolean, hourRaw: string, minuteRaw: string) {
    const hour = clamp(Number(hourRaw) || 12, 1, 12);
    const minute = clamp(Number(minuteRaw) || 0, 0, 59);
    onChange(`${pad((hour % 12) + (pm ? 12 : 0))}:${pad(minute)}`);
  }

  return (
    <View style={styles.row}>
      <View style={styles.segment}>
        {(['오전', '오후'] as const).map((label) => {
          const on = (label === '오후') === now.pm;
          return (
            <Pressable
              key={label}
              onPress={() => commit(label === '오후', hourText, minuteText)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.segmentItem, on && styles.segmentItemOn]}>
              <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={hourText}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, '').slice(0, 2);
          setHourText(digits);
          if (digits !== '') commit(now.pm, digits, minuteText);
        }}
        onBlur={() => setHourText(String(clamp(Number(hourText) || 12, 1, 12)))}
        keyboardType="number-pad"
        maxLength={2}
        selectTextOnFocus
        accessibilityLabel="시"
        style={styles.input}
      />
      <Text style={styles.unit}>시</Text>
      <TextInput
        value={minuteText}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, '').slice(0, 2);
          setMinuteText(digits);
          if (digits !== '') commit(now.pm, hourText, digits);
        }}
        onBlur={() => setMinuteText(pad(clamp(Number(minuteText) || 0, 0, 59)))}
        keyboardType="number-pad"
        maxLength={2}
        selectTextOnFocus
        accessibilityLabel="분"
        style={styles.input}
      />
      <Text style={styles.unit}>분</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  segment: { flexDirection: 'row', padding: 3, borderRadius: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: glass.border },
  segmentItem: { height: 34, paddingHorizontal: 10, borderRadius: 8, justifyContent: 'center' },
  segmentItemOn: { backgroundColor: colors.purpleFill },
  segmentText: { fontFamily: fonts.medium, fontSize: 14, color: colors.textSecondary },
  segmentTextOn: { fontFamily: fonts.bold, color: colors.onPurpleFill },
  // 웹·앱 모두 16px 이상이어야 아이폰에서 누를 때 화면이 확대되지 않는다(동료 피드백 11/17).
  input: { width: 52, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.purpleLine, backgroundColor: colors.white, textAlign: 'center', fontFamily: fonts.bold, fontSize: 18, color: colors.text },
  unit: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
});
