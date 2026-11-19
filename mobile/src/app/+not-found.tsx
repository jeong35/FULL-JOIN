import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/ui';
import { colors, fonts, layout } from '@/theme';

// 없는 주소로 들어왔을 때. 이 파일이 없으면 expo-router의 영어 기본 화면이 나온다(동료 피드백 11/14).
export default function NotFoundScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        <Text style={styles.title} accessibilityRole="header">
          찾는 화면이 없어요
        </Text>
        <Text style={styles.text}>주소가 바뀌었거나 잘못 들어온 것 같아요.</Text>
      </View>
      <View style={styles.footer}>
        <PrimaryButton label="홈으로 가기" onPress={() => router.replace('/')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: layout.screenPaddingX },
  title: { fontFamily: fonts.extraBold, fontSize: 22, letterSpacing: -0.4, color: colors.text },
  text: { textAlign: 'center', fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  footer: { paddingHorizontal: layout.screenPaddingX, paddingBottom: 24 },
});
