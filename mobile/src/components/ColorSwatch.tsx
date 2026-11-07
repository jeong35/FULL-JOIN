import { StyleSheet, Text, View } from 'react-native';

import { COLOR_HEX, LIGHT_COLORS, MULTI_SWATCH, type Color } from '@/data/catalog';
import { colors, fonts } from '@/theme';

// 색 칩: 각진 네모(모서리 0, DESIGN.md 4절). 멀티는 4색 칸, 기타는 점선 칸에 "?".
export function ColorSwatch({
  color,
  width,
  height,
  questionSize,
  lightBorderColor = 'rgba(36,27,51,0.1)',
}: {
  color: Color;
  width: number;
  height: number;
  questionSize: number;
  // 화이트·아이보리 칩 테두리. 옷 추가는 기본값, 옷장 목록은 #C9BFDB(각 시안 값).
  lightBorderColor?: string;
}) {
  const size = { width, height };

  if (color === '멀티') {
    return (
      <View style={[size, styles.multi]}>
        {MULTI_SWATCH.map((hex) => (
          <View key={hex} style={{ width: width / 2, height: height / 2, backgroundColor: hex }} />
        ))}
      </View>
    );
  }

  if (color === '기타') {
    return (
      <View style={[size, styles.other]}>
        <Text style={[styles.otherText, { fontSize: questionSize }]}>?</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        size,
        { backgroundColor: COLOR_HEX[color] },
        LIGHT_COLORS.has(color) && { borderWidth: 1, borderColor: lightBorderColor },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  multi: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
  },
  other: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.purpleStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otherText: {
    fontFamily: fonts.bold,
    color: colors.textSecondary,
  },
});
