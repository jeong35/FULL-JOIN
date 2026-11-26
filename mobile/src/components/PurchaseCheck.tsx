// 쇼핑몰에 갔다 돌아오면 "○○에서 셔츠 사셨어요?"를 묻는다(11/24 팀 결정 15번). 앱 전체에 하나만 둔다(app/_layout.tsx).
// 11/26: 다른 쇼핑몰도 둘러볼 수 있게 나머지 쇼핑몰 버튼을 같이 둔다(누르면 그 쇼핑몰로 가고, 돌아오면 다시 묻는다).
import { StyleSheet, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/ui';
import { kindLabel } from '@/data/catalog';
import { track } from '@/data/events';
import { addToClosetFrom, dismissPurchaseAsk, openShop, usePurchaseAsk } from '@/data/purchase';
import type { Product } from '@/data/types';
import { colors, fonts, glass, layout } from '@/theme';

export function PurchaseCheck() {
  const ask = usePurchaseAsk();
  const insets = useSafeAreaInsets();
  if (ask === null) return null;
  const name = [ask.color, kindLabel(ask.kind)].filter(Boolean).join(' ');
  const target = { slot: ask.slot, kind: ask.kind, color: ask.color, visual_fit: ask.fit };
  const links = ask.links ?? [];
  const others = links.filter((link) => link.platform !== ask.platform);
  const goOther = (product: Product) => {
    track('shop_link_click', { place: 'purchase_check', platform: product.platform, match_type: product.match_type, kind: ask.kind, via: 'purchase_check' });
    // 그 쇼핑몰에서 돌아오면 다시 묻고, 그때도 나머지 쇼핑몰을 고를 수 있게 목록을 그대로 넘긴다.
    void openShop(target, product, links);
  };
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
            addToClosetFrom(target, 'purchase');
          }}
        />
        {others.length > 0 && (
          <View style={styles.others}>
            <Text style={styles.othersTitle}>다른 쇼핑몰도 볼래요</Text>
            <View style={styles.othersRow}>
              {others.map((product) => (
                <Pressable
                  key={product.platform}
                  onPress={() => goOther(product)}
                  accessibilityRole="link"
                  accessibilityLabel={`${product.platform}에서 비슷한 ${kindLabel(ask.kind)} 찾기`}
                  style={styles.otherButton}>
                  <Text style={styles.otherText} numberOfLines={1}>{product.platform}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
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
  others: { gap: 6 },
  othersTitle: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  othersRow: { flexDirection: 'row', gap: 6 },
  otherButton: { flex: 1, minWidth: 0, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: glass.border, boxShadow: glass.selectedInnerShadow },
  otherText: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },
  no: { alignSelf: 'center', paddingVertical: 4 },
  noText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
});
