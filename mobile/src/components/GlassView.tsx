import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { glass } from '@/theme';

type Props = {
  radius: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

// design/DESIGN.md 5절: BlurView를 뒤에 깔고, 위에 반투명 흰 배경 + 흰 테두리 1px + 옅은 그림자.
export function GlassView({ radius, style, children }: Props) {
  return (
    <View style={[styles.base, { borderRadius: radius }, style]}>
      <View style={[StyleSheet.absoluteFill, styles.layer, { borderRadius: radius, overflow: 'hidden' }]}>
        <BlurView intensity={glass.blurIntensity} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.tint]} />
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
