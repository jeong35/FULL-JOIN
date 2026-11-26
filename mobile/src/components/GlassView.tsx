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
// 11/26: 유리처럼 반짝이게 — 위 왼쪽에서 비스듬히 빛이 들어오는 흰 그라데이션을 한 겹 더 얹는다.
export function GlassView({ radius, tint, style, children }: Props) {
  const shine = `shine${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={[styles.base, { borderRadius: radius }, style]}>
      <View style={[StyleSheet.absoluteFill, styles.layer, { borderRadius: radius, overflow: 'hidden' }]}>
        <BlurView intensity={glass.blurIntensity} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.tint, tint !== undefined && { backgroundColor: tint }]} />
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" pointerEvents="none">
          <Defs>
            {/* 위는 밝고 아래로 갈수록 살짝 어두워지는 볼록한 면 */}
            <LinearGradient id={shine} x1="0" y1="0" x2="0.35" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.95} />
              <Stop offset="0.28" stopColor="#FFFFFF" stopOpacity={0.35} />
              <Stop offset="0.7" stopColor="#E9E5F5" stopOpacity={0.25} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.5} />
            </LinearGradient>
            {/* 비스듬한 빛줄기 하나 — 유리에 빛이 스친 것처럼 */}
            <LinearGradient id={`${shine}g`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0.2" stopColor="#FFFFFF" stopOpacity={0} />
              <Stop offset="0.26" stopColor="#FFFFFF" stopOpacity={0.6} />
              <Stop offset="0.3" stopColor="#FFFFFF" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill={`url(#${shine})`} />
          <Rect x="0" y="0" width="100" height="100" fill={`url(#${shine}g)`} />
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
