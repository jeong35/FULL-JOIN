// 여러 화면이 같이 쓰는 작은 부품. 크기·모서리는 design/DESIGN.md 4절 표.
import { usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { GlassView } from '@/components/GlassView';
import { BackIcon } from '@/components/Icons';
import { track } from '@/data/events';
import { colors, fonts, glass, layout } from '@/theme';

// ── 상세 화면 머리: 뒤로 버튼(40×40, 모서리 13) + 제목 18/800 ──
export function DetailHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <BackButton onPress={onBack} size={40} />
      <Text style={styles.headerTitle} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

export function BackButton({
  onPress,
  size,
  style,
}: {
  onPress: () => void;
  size: 40 | 44;
  style?: StyleProp<ViewStyle>;
}) {
  const pathname = usePathname();
  return (
    <Pressable
      onPress={() => {
        track('back_click', { screen: pathname });
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel="뒤로"
      style={style}>
      <GlassView radius={13} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <BackIcon color={colors.text} />
      </GlassView>
    </Pressable>
  );
}

// ── 옷 추가 진행 막대: 4칸, 높이 4 ──
const STEP_LABELS = ['1 부위', '2 종류', '3 색', '4 핏'] as const;

export function ProgressSteps({ current }: { current: readonly number[] }) {
  // current: 지금 화면에 해당하는 단계 번호(0부터). 그 단계까지 막대가 채워진다.
  const last = Math.max(...current);
  return (
    <View style={styles.progress}>
      <View style={styles.progressRow}>
        {STEP_LABELS.map((label, i) => (
          <View
            key={label}
            style={[
              styles.progressBar,
              { backgroundColor: i <= last ? colors.purpleStrong : colors.progressTrack },
            ]}
          />
        ))}
      </View>
      <View style={[styles.progressRow, styles.progressLabels]}>
        {STEP_LABELS.map((label, i) => {
          const active = current.includes(i);
          return (
            <Text
              key={label}
              style={[styles.progressLabel, active ? styles.progressLabelActive : styles.progressLabelIdle]}>
              {label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

// ── 선택 막대: 바깥 모서리 13·여백 4, 안쪽 높이 36·모서리 9 ──
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  fontSize = 14,
  style,
}: {
  options: readonly T[];
  value: T | null;
  onChange: (value: T) => void;
  fontSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <GlassView radius={13} style={[styles.segment, style]}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.segmentItem, selected && styles.segmentItemSelected]}>
            <Text
              style={[
                { fontSize },
                selected ? styles.segmentTextSelected : styles.segmentTextIdle,
              ]}>
              {option}
            </Text>
          </Pressable>
        );
      })}
    </GlassView>
  );
}

// ── 정보 막대: 높이 44, 모서리 14 ──
export function InfoBar({ children, right, style }: { children: ReactNode; right?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <GlassView radius={14} style={[styles.infoBar, style]}>
      <View style={styles.infoBarLeft}>{children}</View>
      {right}
    </GlassView>
  );
}

// ── 작은 흰 버튼: 높이 32, 모서리 9 ──
export function SmallWhiteButton({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.smallWhite}>
      <Text style={styles.smallWhiteText}>{label}</Text>
    </Pressable>
  );
}

// ── 큰 버튼: 높이 54, 모서리 14, 꽉 채움 ──
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[styles.primary, disabled && styles.primaryDisabled]}>
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

// ── 글자 탭 줄(옷장 부위·홈 폴더): 15, 고른 것 700 보라 ──
export function TextTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange?: (value: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.textTabsScroll}
      contentContainerStyle={styles.textTabs}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            onPress={onChange ? () => onChange(option) : undefined}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            hitSlop={8}>
            <Text style={[styles.textTab, selected ? styles.textTabSelected : styles.textTabIdle]}>{option}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 20,
    paddingBottom: 8,
    paddingHorizontal: layout.screenPaddingX,
  },
  headerTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.text,
  },
  progress: {
    paddingTop: 6,
    paddingHorizontal: layout.screenPaddingX,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 999,
  },
  progressLabels: {
    marginTop: 6,
  },
  progressLabel: {
    flex: 1,
    fontSize: 12,
  },
  progressLabelActive: {
    fontFamily: fonts.bold,
    color: colors.textPurple,
  },
  progressLabelIdle: {
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  segment: {
    flexDirection: 'row',
    gap: 2,
    padding: 4,
  },
  segmentItem: {
    flex: 1,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentItemSelected: {
    backgroundColor: colors.white,
    boxShadow: glass.selectedInnerShadow,
  },
  segmentTextSelected: {
    fontFamily: fonts.bold,
    color: colors.onPurpleFill,
  },
  segmentTextIdle: {
    fontFamily: fonts.medium,
    color: colors.textSecondary,
  },
  infoBar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 6,
  },
  infoBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  smallWhite: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 9,
    backgroundColor: colors.white,
    boxShadow: '0 1px 4px rgba(46,26,92,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallWhiteText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textPurple,
  },
  primary: {
    height: 54,
    borderRadius: 14,
    backgroundColor: colors.purpleFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDisabled: {
    opacity: 0.4,
  },
  primaryText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.onPurpleFill,
  },
  textTabsScroll: {
    flexGrow: 0,
  },
  textTabs: {
    flexDirection: 'row',
    gap: 18,
    paddingTop: 4,
    paddingBottom: 12,
    paddingHorizontal: layout.screenPaddingX,
  },
  textTab: {
    fontSize: 15,
  },
  textTabSelected: {
    fontFamily: fonts.bold,
    color: colors.textPurple,
  },
  textTabIdle: {
    fontFamily: fonts.medium,
    color: colors.textSecondary,
  },
});
