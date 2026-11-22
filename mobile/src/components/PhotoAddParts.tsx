// 사진으로 옷 추가 화면들이 같이 쓰는 부품: 진행 막대(사진 · 네모 · 확인), 네모 편집기, 아래에서 올라오는 고르기 판.
import { useRef, useState, type ReactNode } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { ColorSwatch } from '@/components/ColorSwatch';
import { KindIcon } from '@/components/KindIcon';
import { SegmentedControl } from '@/components/ui';
import { BASE_COLORS, colorsForKind, KIND_GROUPS, kindLabel, SLOTS, type Color, type Kind, type Slot } from '@/data/catalog';
import type { Box, PhotoSource } from '@/data/photoAdd';
import { colors, fonts, layout } from '@/theme';

// ── 진행 막대: 3칸 ──
export function PhotoSteps({ labels, current }: { labels: readonly string[]; current: number }) {
  return (
    <View style={styles.steps}>
      <View style={styles.stepRow}>
        {labels.map((label, i) => (
          <View key={label} style={[styles.stepBar, i <= current && styles.stepBarOn]} />
        ))}
      </View>
      <View style={styles.stepRow}>
        {labels.map((label, i) => (
          <Text key={label} style={[styles.stepLabel, i <= current && styles.stepLabelOn]}>
            {i + 1} {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ── 네모 편집기 ──
export const BOX_COLORS = ['#FFFFFF', '#D6CCF1', '#FFE08A', '#BDE7D6'] as const;
const MIN_SIDE = 0.08;
const HANDLE = 26;
// 웹에서 네모를 끄는 동안 화면이 같이 스크롤되지 않게 한다.
const noTouchScroll = (Platform.OS === 'web' ? { touchAction: 'none', userSelect: 'none' } : {}) as unknown as ViewStyle;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

// 끌기: 누른 곳에서 얼마나 움직였는지(dx, dy)를 알려 준다. 웹(마우스·터치)과 앱에서 같이 동작한다.
function useDrag(onStart: () => void, onDrag: (dx: number, dy: number) => void) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  return {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      origin.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      onStart();
    },
    onResponderMove: (e: GestureResponderEvent) => {
      const o = origin.current;
      if (o !== null) onDrag(e.nativeEvent.pageX - o.x, e.nativeEvent.pageY - o.y);
    },
    onResponderRelease: () => {
      origin.current = null;
    },
  };
}

type Corner = 'tl' | 'tr' | 'bl' | 'br';

function resize(start: Box, corner: Corner, dx: number, dy: number): Box {
  let { x, y, w, h } = start;
  if (corner === 'tl' || corner === 'bl') {
    const nx = clamp(x + dx, 0, x + w - MIN_SIDE);
    w += x - nx;
    x = nx;
  } else {
    w = clamp(w + dx, MIN_SIDE, 1 - x);
  }
  if (corner === 'tl' || corner === 'tr') {
    const ny = clamp(y + dy, 0, y + h - MIN_SIDE);
    h += y - ny;
    y = ny;
  } else {
    h = clamp(h + dy, MIN_SIDE, 1 - y);
  }
  return { ...start, x, y, w, h };
}

function BoxView({
  box,
  index,
  width,
  height,
  removable,
  onChange,
  onRemove,
}: {
  box: Box;
  index: number;
  width: number;
  height: number;
  removable: boolean;
  onChange: (box: Box) => void;
  onRemove: () => void;
}) {
  const start = useRef(box);
  const color = BOX_COLORS[index % BOX_COLORS.length];
  const begin = () => {
    start.current = box;
  };
  const move = useDrag(begin, (dx, dy) => {
    const s = start.current;
    onChange({ ...s, x: clamp(s.x + dx / width, 0, 1 - s.w), y: clamp(s.y + dy / height, 0, 1 - s.h) });
  });
  const tl = useDrag(begin, (dx, dy) => onChange(resize(start.current, 'tl', dx / width, dy / height)));
  const tr = useDrag(begin, (dx, dy) => onChange(resize(start.current, 'tr', dx / width, dy / height)));
  const bl = useDrag(begin, (dx, dy) => onChange(resize(start.current, 'bl', dx / width, dy / height)));
  const br = useDrag(begin, (dx, dy) => onChange(resize(start.current, 'br', dx / width, dy / height)));

  const left = box.x * width;
  const top = box.y * height;
  const w = box.w * width;
  const h = box.h * height;
  const handles: [Corner, typeof tl, number, number][] = [
    ['tl', tl, left, top],
    ['tr', tr, left + w, top],
    ['bl', bl, left, top + h],
    ['br', br, left + w, top + h],
  ];

  return (
    <>
      <View
        {...move}
        accessibilityLabel={`${index + 1}번 네모, 끌어서 옮기기`}
        style={[styles.box, noTouchScroll, { left, top, width: w, height: h, borderColor: color }]}
      />
      {handles.map(([corner, handlers, cx, cy]) => (
        <View
          key={corner}
          {...handlers}
          accessibilityLabel={`${index + 1}번 네모 크기 바꾸기`}
          style={[styles.handleArea, noTouchScroll, { left: cx - HANDLE / 2, top: cy - HANDLE / 2 }]}>
          <View style={[styles.handle, { backgroundColor: color }]} />
        </View>
      ))}
      <View style={[styles.boxTag, { left, top: Math.max(0, top - 30), backgroundColor: color }]}>
        <Text style={styles.boxTagText}>{index + 1}</Text>
        {removable && (
          <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`${index + 1}번 네모 빼기`} hitSlop={8}>
            <Svg width={12} height={12} viewBox="0 0 24 24">
              <Path d="M6 6l12 12M18 6L6 18" stroke={colors.onPurpleFill} strokeWidth={3} strokeLinecap="round" />
            </Svg>
          </Pressable>
        )}
      </View>
    </>
  );
}

export function PhotoBoxEditor({
  source,
  boxes,
  maxWidth,
  maxHeight,
  onChange,
}: {
  source: PhotoSource;
  boxes: readonly Box[];
  maxWidth: number;
  maxHeight: number;
  onChange: (boxes: Box[]) => void;
}) {
  const scale = Math.min(maxWidth / source.width, maxHeight / source.height);
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  return (
    <View style={[styles.editor, { width, height }]}>
      <Image source={{ uri: source.uri }} style={{ width, height }} resizeMode="cover" accessibilityIgnoresInvertColors />
      {boxes.map((box, index) => (
        <BoxView
          key={box.id}
          box={box}
          index={index}
          width={width}
          height={height}
          removable={boxes.length > 1}
          onChange={(next) => onChange(boxes.map((b) => (b.id === next.id ? next : b)))}
          onRemove={() => onChange(boxes.filter((b) => b.id !== box.id))}
        />
      ))}
    </View>
  );
}

// ── 아래에서 올라오는 판 ──
export function BottomSheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="닫기" />
        <View style={[styles.sheet, { paddingBottom: Math.max(20, insets.bottom + 8) }]}>
          <View style={styles.sheetGrip} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle} accessibilityRole="header">
              {title}
            </Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" hitSlop={10}>
              <Svg width={20} height={20} viewBox="0 0 24 24">
                <Path d="M6 6l12 12M18 6L6 18" stroke={colors.textSecondary} strokeWidth={2} strokeLinecap="round" />
              </Svg>
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

// 부위 · 종류 고르기(옷 추가 ①과 같은 묶음).
export function KindPicker({
  slot: initialSlot,
  kind,
  onPick,
}: {
  slot: Slot | null;
  kind: Kind | null;
  onPick: (slot: Slot, kind: Kind) => void;
}) {
  const [slot, setSlot] = useState<Slot>(initialSlot ?? '상의');
  const { width, height } = useWindowDimensions();
  const cell = Math.floor((width - layout.screenPaddingX * 2 - 8 * 3) / 4);
  return (
    <>
      <SegmentedControl options={SLOTS} value={slot} onChange={setSlot} fontSize={12.5} evenGaps style={styles.sheetSegment} />
      <ScrollView style={{ maxHeight: height * 0.5 }} contentContainerStyle={styles.sheetScroll}>
        {KIND_GROUPS[slot].map((group) => (
          <View key={`${slot}-${group.title}`}>
            {KIND_GROUPS[slot].length > 1 && <Text style={styles.groupTitle}>{group.title}</Text>}
            <View style={styles.kindGrid}>
              {group.kinds.map((k) => {
                const on = k === kind && slot === initialSlot;
                return (
                  <Pressable
                    key={k}
                    onPress={() => onPick(slot, k)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={kindLabel(k)}
                    style={[styles.kindCell, { width: cell }, on && styles.cellOn]}>
                    <KindIcon kind={k} size={42} />
                    <Text style={styles.kindName} numberOfLines={1}>
                      {kindLabel(k)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </>
  );
}

// 종류를 아직 안 골랐으면 기본 색 칩만(데님 색은 데님 종류일 때 앞에 나온다).
export function ColorPicker({ kind, value, onPick }: { kind: Kind | null; value: Color | null; onPick: (color: Color) => void }) {
  const { width } = useWindowDimensions();
  const cell = Math.floor((width - layout.screenPaddingX * 2 - 8 * 5) / 6);
  return (
    <View style={styles.colorGrid}>
      {(kind === null ? BASE_COLORS : colorsForKind(kind)).map((c) => {
        const on = c === value;
        return (
          <Pressable
            key={c}
            onPress={() => onPick(c)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={c}
            style={[styles.colorCell, { width: cell }]}>
            <View style={[styles.colorSwatchWrap, on && styles.colorSwatchOn]}>
              <ColorSwatch color={c} width={cell - 8} height={Math.round((cell - 8) * 0.8)} questionSize={14} />
            </View>
            <Text style={[styles.colorName, on && styles.colorNameOn]} numberOfLines={1}>
              {c}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  steps: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: 14,
    gap: 8,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 6,
  },
  stepBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.progressTrack,
  },
  stepBarOn: {
    backgroundColor: colors.purpleStrong,
  },
  stepLabel: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  stepLabelOn: {
    fontFamily: fonts.bold,
    color: colors.textPurple,
  },
  editor: {
    alignSelf: 'center',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.photoPlaceholder,
  },
  box: {
    position: 'absolute',
    borderWidth: 2.5,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  handleArea: {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 14,
    height: 14,
    borderRadius: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  boxTag: {
    position: 'absolute',
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  boxTagText: {
    fontFamily: fonts.extraBold,
    fontSize: 12.5,
    color: colors.onPurpleFill,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(31,28,38,0.42)',
  },
  sheet: {
    paddingTop: 10,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.white,
  },
  sheetGrip: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.line,
    marginBottom: 12,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPaddingX + 4,
    paddingBottom: 10,
  },
  sheetTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    letterSpacing: -0.3,
    color: colors.text,
  },
  sheetSegment: {
    marginHorizontal: layout.screenPaddingX,
    marginBottom: 6,
  },
  sheetScroll: {
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: 8,
  },
  groupTitle: {
    marginTop: 12,
    marginBottom: 8,
    fontFamily: fonts.bold,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  kindGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kindCell: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  cellOn: {
    borderColor: colors.purpleStrong,
    backgroundColor: colors.photoPlaceholder,
  },
  kindName: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.text,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: 8,
  },
  colorCell: {
    alignItems: 'center',
    gap: 4,
  },
  colorSwatchWrap: {
    padding: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchOn: {
    borderColor: colors.purpleStrong,
  },
  colorName: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  colorNameOn: {
    fontFamily: fonts.bold,
    color: colors.textPurple,
  },
});
