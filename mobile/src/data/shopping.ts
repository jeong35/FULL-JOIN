// 비슷한 상품 검색 링크(무신사·에이블리·지그재그). 서버 src/fulljoin/shopping.ts와 같은 규칙이다
// (parse_query.md 쇼핑 검색어 규칙: [브랜드] + 색 + [핏] + 종류, 색이 멀티·기타·null이면 뺀다).
// 서버가 그 아이템의 검색 링크를 주지 않았을 때(쇼핑몰 상품 링크만 있을 때 등) 화면에서 채운다.
import type { HeartItem, Product } from './types';

const SEARCH_PLATFORMS = [
  { platform: '무신사', baseUrl: 'https://www.musinsa.com/search/goods?keyword=' },
  { platform: '에이블리', baseUrl: 'https://m.a-bly.com/search?keyword=' },
  { platform: '지그재그', baseUrl: 'https://zigzag.kr/search?keyword=' },
] as const;

const OMITTED_SEARCH_COLORS = new Set<string | null | undefined>([null, undefined, '멀티', '기타']);

export function similarSearchQuery(item: HeartItem): string {
  return [
    item.brand_source !== undefined && item.brand_source !== '없음' ? item.brand : null,
    OMITTED_SEARCH_COLORS.has(item.color) ? null : item.color,
    item.visual_fit,
    item.kind,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0).join(' ');
}

export function similarSearchProducts(item: HeartItem): Product[] {
  const query = similarSearchQuery(item);
  return SEARCH_PLATFORMS.map(({ platform, baseUrl }) => ({
    item_id: item.item_id,
    platform,
    url: `${baseUrl}${encodeURIComponent(query)}`,
    match_type: 'similar' as const,
  }));
}

// 쇼핑몰 상품 링크(exact)를 먼저 두고, 검색 링크는 무신사·에이블리·지그재그 순서로 둔다.
// 서버가 준 검색 링크가 있으면 그걸 쓰고, 빠진 쇼핑몰만 화면에서 채운다.
export function shoppingLinksFor(item: HeartItem, fromServer: readonly Product[]): Product[] {
  const exact = fromServer.filter((link) => link.match_type === 'exact');
  const search = similarSearchProducts(item).map((product) =>
    fromServer.find((link) => link.match_type === 'similar' && link.platform === product.platform) ?? product);
  const others = fromServer.filter((link) =>
    link.match_type === 'similar' && !SEARCH_PLATFORMS.some(({ platform }) => platform === link.platform));
  return [...exact, ...search, ...others];
}
