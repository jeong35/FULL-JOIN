// 쇼핑몰에 갔다 돌아오면 "○○에서 셔츠 사셨어요?"를 묻는다(11/24 팀 결정 15번). 앱 전체에 하나만 둔다(app/_layout.tsx).
import { StyleSheet, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/ui';
import { kindLabel } from '@/data/catalog';
import { track } from '@/data/events';
import { addToClosetFrom, dismissPurchaseAsk, usePurchaseAsk } from '@/data/purchase';
import { colors, fonts, layout } from '@/theme';

export function PurchaseCheck() {
  const ask = usePurchaseAsk();
  const insets = useSafeAreaInsets();
  if (ask === null) return null;
  const name = [ask.color, kindLabel(ask.kind)].filter(Boolean).join(' ');
  return (
    <View style={[styles.wrap, { bottom: Math.max(16, insets.bottom + 8) }]} pointerEvents="box-none">
      <View style={styles.card} accessibilityRole="alert">
        <Text style={styles.title}>{ask.platform}에서 {name} 사셨어요?</Text>
        <Text style={styles.sub}>샀으면 내 옷장에 넣어 둘게요. 종류와 색은 미리 채워 드려요</Text>
        <PrimaryButton
          label="샀어요, 옷장에 넣기"
          onPress={() => {
            track('wardrobe_add_start', { source: 'purchase', kind: ask.kind, platform: ask.platform });
            dismissPurchaseAsk();
            addToClosetFrom({ slot: ask.slot, kind: ask.kind, color: ask.color, visual_fit: ask.fit }, 'purchase');
          }}
        />
        <Pressable onPress={dismissPurchaseAsk} accessibilityRole="button" hitSlop={8} style={styles.no}>
          <Text style={styles.noText}>아니요, 안 샀어요</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: layout.screenPaddingX, right: layout.screenPaddingX },
  card: { padding: 16, gap: 10, borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, boxShadow: '0 10px 30px rgba(30,20,50,0.18)' },
  title: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.text },
  sub: { marginTop: -4, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  no: { alignSelf: 'center', paddingVertical: 4 },
  noText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
});
