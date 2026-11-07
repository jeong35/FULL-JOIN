import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, layout } from '@/theme';

type Props = {
  title: string;
  // 제목 아래 설명(13, 보조 글자색).
  subtitle?: string;
  // 제목 오른쪽에 붙는 버튼 자리(예: 옷장 탭의 '+ 옷 추가').
  headerRight?: ReactNode;
  children?: ReactNode;
};

// 탭 화면 공통 틀: 제목 24 / 800, 자간 -0.4. design/screens/30-tab-recommend.html·22-tab-closet.html 머리 부분 기준.
export function TabScreen({ title, subtitle, headerRight, children }: Props) {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={[styles.header, subtitle !== undefined && styles.headerWithSubtitle]}>
        <View>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {subtitle !== undefined && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        {headerRight}
      </View>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 28,
    paddingBottom: 14,
    paddingHorizontal: layout.screenPaddingX,
  },
  headerWithSubtitle: {
    paddingBottom: 12,
  },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    letterSpacing: -0.4,
    color: colors.text,
  },
  subtitle: {
    marginTop: 4,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },
});
