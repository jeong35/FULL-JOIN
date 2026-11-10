// 비슷한 상품 검색 링크(무신사·에이블리·지그재그). 서버 src/fulljoin/shopping.ts와 같은 규칙이다
// (parse_query.md 쇼핑 검색어 규칙: 색 + [핏] + 종류, 색이 멀티·기타·null이면 뺀다).
// 서버가 그 아이템의 검색 링크를 주지 않았을 때(쇼핑몰 상품 링크만 있을 때 등) 화면에서 채운다.
import type { HeartItem, Product } from './types';

const SEARCH_PLATFORMS = [
  { platform: '무신사', baseUrl: 'https://www.musinsa.com/search/goods?keyword=', suffix: '' },
  { platform: '에이블리', baseUrl: 'https://mobile.a-bly.com/search/search-result?query=', suffix: '&search_type=DIRECT' },
  { platform: '지그재그', baseUrl: 'https://zigzag.kr/search?keyword=', suffix: '' },
] as const;

const OMITTED_SEARCH_COLORS = new Set<string | null | undefined>([null, undefined, '멀티', '기타']);

export function similarSearchQuery(item: HeartItem): string {
  return [
    OMITTED_SEARCH_COLORS.has(item.color) ? null : item.color,
    item.visual_fit,
    item.kind,
  ].filter((value) => typeof value === 'string' && value.length > 0).join(' ');
}

export function similarSearchProducts(item: HeartItem): Product[] {
  const query = similarSearchQuery(item);
  return SEARCH_PLATFORMS.map(({ platform, baseUrl, suffix }) => ({
    item_id: item.item_id,
    platform,
    url: `${baseUrl}${encodeURIComponent(query)}${suffix}`,
    match_type: 'similar' as const,
  }));
}

// 쇼핑몰 상품 링크(exact)를 먼저 두고, 검색 링크는 무신사·에이블리·지그재그 순서로 둔다.
// 알려진 세 쇼핑몰은 앱의 최신 검색 URL을 항상 쓴다. 서버 응답이나 캐시에 예전 에이블리 URL이 남아 있어도 교체된다.
export function shoppingLinksFor(item: HeartItem, fromServer: readonly Product[]): Product[] {
  const exact = fromServer.filter((link) => link.match_type === 'exact');
  const search = similarSearchProducts(item);
  const others = fromServer.filter((link) =>
    link.match_type === 'similar' && !SEARCH_PLATFORMS.some(({ platform }) => platform === link.platform));
  return [...exact, ...search, ...others];
}
