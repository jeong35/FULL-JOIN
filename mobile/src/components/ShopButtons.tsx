// 쇼핑몰 버튼(11/25 다시 정함): 무신사 · 에이블리 · 지그재그 세 버튼을 같은 크기로 한 줄에 둔다 — 한 번 누르면 바로 간다.
// 사진 속 실제 상품 링크가 있으면 '사진 속 ○○ 상품 보기'를 쇼핑몰 버튼 위에 크게(보라색 버튼) 둔다 —
// 사진 속 그 상품이 가장 정확한 답이라 비슷한 상품 찾기보다 먼저 눈에 띄게(11/26). 제목은 한 줄만.
// 쇼핑몰에 갔다 돌아오면 샀는지 묻는다(data/purchase.ts, 11/24 팀 결정 15번).
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { kindLabel } from '@/data/catalog';
import { track } from '@/data/events';
import { openShop, type ShopTarget } from '@/data/purchase';
import type { Product } from '@/data/types';
import { colors, fonts, glass } from '@/theme';

type Props = {
  target: ShopTarget;
  links: readonly Product[];
  // 버튼 줄 위에 붙는 한 줄(예: '비슷한 부츠 찾기'). 없으면 버튼만.
  title?: string;
  // 'big': 코디 탭 카드(높이 44) / 'small': 비교 결과 카드(높이 36)
  size?: 'big' | 'small';
  place: string;
  styleImageId?: string | null;
  style?: StyleProp<ViewStyle>;
};

export function ShopButtons({ target, links, title, size = 'small', place, styleImageId = null, style }: Props) {
  if (links.length === 0) return null;
  const name = kindLabel(target.kind);
  const exact = links.filter((link) => link.match_type === 'exact');
  const search = links.filter((link) => link.match_type === 'similar').slice(0, 3);
  const open = (product: Product) => {
    track('shop_link_click', {
      place,
      platform: product.platform,
      match_type: product.match_type,
      kind: target.kind,
      style_image_id: styleImageId,
      via: 'row',
    });
    void openShop(target, product, search);
  };
  return (
    <View style={[styles.wrap, style]}>
      {title !== undefined && <Text style={styles.title} numberOfLines={1}>{title}</Text>}
      {exact.slice(0, 1).map((product) => (
        <Pressable
          key={product.url}
          onPress={() => open(product)}
          accessibilityRole="link"
          accessibilityLabel={`사진 속 ${name} 상품 보기`}
          style={[styles.exact, size === 'big' ? styles.exactBig : styles.exactSmall]}>
          <Text style={[styles.exactText, size === 'big' && styles.buttonTextBig]} numberOfLines={1}>사진 속 {name} 상품 보기 ›</Text>
        </Pressable>
      ))}
      <View style={styles.row}>
        {search.map((product) => (
          <Pressable
            key={product.platform}
            onPress={() => open(product)}
            accessibilityRole="link"
            accessibilityLabel={`${product.platform}에서 비슷한 ${name} 찾기`}
            style={[styles.button, size === 'big' ? styles.buttonBig : styles.buttonSmall]}>
            <Text style={[styles.buttonText, size === 'big' && styles.buttonTextBig]} numberOfLines={1}>{product.platform}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  title: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  exact: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.purpleFill },
  exactSmall: { height: 42, borderRadius: 10 },
  exactBig: { height: 46, borderRadius: 12 },
  exactText: { fontFamily: fonts.bold, fontSize: 14, color: colors.onPurpleFill },
  row: { flexDirection: 'row', gap: 6 },
  button: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: glass.border, boxShadow: glass.selectedInnerShadow },
  buttonSmall: { height: 36, borderRadius: 10 },
  buttonBig: { height: 44, borderRadius: 12 },
  buttonText: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },
  buttonTextBig: { fontSize: 14 },
});
