// 다음 할 일 말풍선. 꼬리는 가리키는 버튼·탭·사진 쪽으로 낸다.
// 글라스 느낌: 반투명 바탕(위가 조금 더 밝은 그러데이션) + 반투명 흰 테두리 + 위쪽 빛 반사 선 + 뒤 흐림(웹) + 옅은 그림자.
// 말풍선 몸통과 꼬리를 한 모양(SVG)으로 그려서, 반투명이어도 이음새가 겹쳐 보이지 않는다.
// 말풍선을 누르면 그 다음 할 일로 가고(onPress), ×를 누르면 닫는다. 둘 다 다시 띄우지 않는다(data/hints.ts).
import { useEffect, useId, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { track } from '@/data/events';
import { markHintDone, type HintId } from '@/data/hints';
import { colors, fonts, glass } from '@/theme';

const RADIUS = 16;
const TAIL_HALF = 8;
const TAIL_HEIGHT = 8;

// 흰 글라스: 앱의 다른 카드(DESIGN.md 5절)와 같은 재질에 보라 글씨(11/10 팀 결정, 보라 글라스와 비교해 고름).
const PALETTE = {
  top: 'rgba(255,255,255,0.85)',
  bottom: 'rgba(255,255,255,0.62)',
  edge: glass.border,
  shine: 'rgba(255,255,255,1)',
  text: colors.text,
  action: colors.textPurple,
  close: colors.textSecondary,
} as const;

type Props = {
  id: HintId;
  text: string;
  actionLabel?: string;
  // 꼬리 방향과 위치(말풍선 왼쪽 끝에서 꼬리 가운데까지 px). 'none'이면 꼬리 없이 띄운다.
  tail: 'up' | 'down' | 'none';
  tailX?: number;
  onPress?: () => void;
  // false면 말풍선을 눌러도 닫지 않는다(옷장 5벌까지 진행 상황을 계속 보여 줄 때). ×는 늘 닫는다.
  doneOnPress?: boolean;
  style?: StyleProp<ViewStyle>;
};

// 둥근 네모 + 꼬리를 한 줄의 경로로. 테두리(1px)가 잘리지 않게 0.5px 안쪽에 그린다.
function bubblePath(width: number, height: number, tail: Props['tail'], tailX: number): string {
  const left = 0.5;
  const top = 0.5;
  const right = width - 0.5;
  const bottom = height - 0.5;
  const r = Math.min(RADIUS, (bottom - top) / 2);
  const x = Math.max(left + r + TAIL_HALF, Math.min(right - r - TAIL_HALF, tailX));
  const up = tail === 'up' ? `L${x - TAIL_HALF},${top} L${x},${top - TAIL_HEIGHT} L${x + TAIL_HALF},${top} ` : '';
  const down = tail === 'down' ? `L${x + TAIL_HALF},${bottom} L${x},${bottom + TAIL_HEIGHT} L${x - TAIL_HALF},${bottom} ` : '';
  return (
    `M${left + r},${top} ${up}L${right - r},${top} A${r},${r} 0 0 1 ${right},${top + r} ` +
    `L${right},${bottom - r} A${r},${r} 0 0 1 ${right - r},${bottom} ${down}` +
    `L${left + r},${bottom} A${r},${r} 0 0 1 ${left},${bottom - r} L${left},${top + r} A${r},${r} 0 0 1 ${left + r},${top} Z`
  );
}

// 위쪽 빛 반사 선. 위 꼬리가 있으면 꼬리 자리는 비운다.
function shinePath(width: number, tail: Props['tail'], tailX: number): string {
  const y = 2;
  const from = RADIUS;
  const to = width - RADIUS;
  if (tail !== 'up') return `M${from},${y} L${to},${y}`;
  const x = Math.max(from + TAIL_HALF, Math.min(to - TAIL_HALF, tailX));
  return `M${from},${y} L${x - TAIL_HALF - 2},${y} M${x + TAIL_HALF + 2},${y} L${to},${y}`;
}

// 웹에서만 뒤를 흐린다(흰 글라스 카드와 같은 방식). 앱(iOS·Android)에서는 반투명 바탕만 쓴다.
const webBlur = (Platform.OS === 'web'
  ? { backdropFilter: 'blur(14px) saturate(160%)', WebkitBackdropFilter: 'blur(14px) saturate(160%)' }
  : {}) as unknown as ViewStyle;

export function HintBubble({ id, text, actionLabel, tail, tailX = 28, onPress, doneOnPress = true, style }: Props) {
  const [appear] = useState(() => new Animated.Value(0));
  const [size, setSize] = useState({ width: 0, height: 0 });
  const gradientId = `hint-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const palette = PALETTE;

  useEffect(() => {
    track('hint_view', { hint: id });
    Animated.timing(appear, { toValue: 1, duration: 220, useNativeDriver: false }).start();
  }, [appear, id]);

  function press() {
    track('hint_click', { hint: id });
    if (doneOnPress) markHintDone(id);
    onPress?.();
  }

  function close() {
    track('hint_close', { hint: id });
    markHintDone(id);
  }

  const extra = tail === 'none' ? 0 : TAIL_HEIGHT;
  const shift = appear.interpolate({ inputRange: [0, 1], outputRange: [tail === 'down' ? -6 : 6, 0] });
  return (
    <Animated.View style={[style, { opacity: appear, transform: [{ translateY: shift }] }]}>
      <View
        style={styles.bubble}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width !== size.width || height !== size.height) setSize({ width, height });
        }}>
        <View style={[StyleSheet.absoluteFill, styles.layer, styles.blur, webBlur]} />
        {size.width > 0 && (
          <Svg
            width={size.width}
            height={size.height + extra}
            viewBox={`0 ${tail === 'up' ? -extra : 0} ${size.width} ${size.height + extra}`}
            style={[styles.layer, styles.shape, { top: tail === 'up' ? -extra : 0 }]}
            pointerEvents="none">
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={palette.top} />
                <Stop offset="1" stopColor={palette.bottom} />
              </LinearGradient>
            </Defs>
            <Path d={bubblePath(size.width, size.height, tail, tailX)} fill={`url(#${gradientId})`} stroke={palette.edge} strokeWidth={1} />
            <Path d={shinePath(size.width, tail, tailX)} stroke={palette.shine} strokeWidth={1} strokeLinecap="round" />
          </Svg>
        )}
        <Pressable
          onPress={press}
          disabled={onPress === undefined}
          accessibilityRole={onPress === undefined ? 'text' : 'button'}
          style={styles.body}>
          <Text style={[styles.text, { color: palette.text }]}>{text}</Text>
          {actionLabel !== undefined && <Text style={[styles.action, { color: palette.action }]}>{actionLabel} ›</Text>}
        </Pressable>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="말풍선 닫기" hitSlop={10} style={styles.close}>
          <Text style={[styles.closeText, { color: palette.close }]}>×</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingVertical: 12,
    paddingLeft: 15,
    paddingRight: 11,
    borderRadius: RADIUS,
    boxShadow: '0 8px 24px rgba(46,26,92,0.16)',
  },
  // 웹에서는 겹쳐 놓은 층이 글자 위에 그려지지 않게 내용 뒤로 보낸다(GlassView와 같은 방식).
  layer: Platform.OS === 'web' ? { zIndex: -1 } : {},
  blur: {
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
  shape: {
    position: 'absolute',
    left: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  text: {
    fontFamily: fonts.medium,
    fontSize: 13.5,
    lineHeight: 20,
  },
  action: {
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  close: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontFamily: fonts.medium,
    fontSize: 18,
    lineHeight: 20,
  },
});
