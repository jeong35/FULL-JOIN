import { BlurView } from 'expo-blur';
import { useId, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { glass } from '@/theme';

type Props = {
  radius: number;
  // 바탕 흰색 진하기(기본 glass.background). 글자가 많이 겹치는 곳(떠 있는 탭바)은 조금 더 진하게.
  tint?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

// design/DESIGN.md 5절: BlurView를 뒤에 깔고, 위에 반투명 흰 배경 + 흰 테두리 1px + 옅은 그림자.
// 11/26: 유리처럼 반짝이게 — 위 가장자리의 빛과 비스듬한 빛줄기를 한 겹 더 얹는다.
export function GlassView({ radius, tint, style, children }: Props) {
  const shine = `shine${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={[styles.base, { borderRadius: radius }, style]}>
      <View style={[StyleSheet.absoluteFill, styles.layer, { borderRadius: radius, overflow: 'hidden' }]}>
        <BlurView intensity={glass.blurIntensity} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.tint, tint !== undefined && { backgroundColor: tint }]} />
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
          <Defs>
            {/* 위 가장자리에만 빛이 들고 그 아래는 고르게. 11/27: 카드 높이에 맞춰 늘어나는 그라데이션이라
                오늘의 룩처럼 긴 카드는 위는 하얗고 아래는 회보랏빛으로 바탕색이 달라 보였다 → 위 72px만, 나머지는 같은 색. */}
            <LinearGradient id={shine} x1="0" y1="0" x2="0" y2="72" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.4} />
            </LinearGradient>
            {/* 비스듬한 빛줄기 하나 — 유리에 빛이 스친 것처럼 */}
            <LinearGradient id={`${shine}g`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0.2" stopColor="#FFFFFF" stopOpacity={0} />
              <Stop offset="0.26" stopColor="#FFFFFF" stopOpacity={0.6} />
              <Stop offset="0.3" stopColor="#FFFFFF" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${shine})`} />
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${shine}g)`} />
        </Svg>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderColor: glass.border,
    boxShadow: glass.shadow,
  },
  // 웹에서는 겹쳐 놓은 흐림 층이 아이콘·입력칸(<svg>·<input>) 위에 그려져 내용까지 흐려진다. 층을 내용 뒤로 보낸다.
  layer: Platform.OS === 'web' ? { zIndex: -1 } : {},
  tint: {
    backgroundColor: glass.background,
  },
});
