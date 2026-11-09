import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';

// 11/11 뒤에 여는 탭(추천·챗봇·마이)의 안내.
export function ComingSoon({ description }: { description: string }) {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>다음 업데이트에서 열려요</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 32,
    paddingBottom: 80,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
  },
  description: {
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
});
