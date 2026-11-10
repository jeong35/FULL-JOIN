export type SearchableItem = {
  item_id: string;
  kind: string;
  color: string | null;
  visual_fit: string | null;
  brand?: string | null;
  brand_source?: "쇼핑몰_상품정보" | "캡션" | "이미지_글자" | "없음";
};

const SEARCH_PLATFORMS = [
  { platform: "무신사", baseUrl: "https://www.musinsa.com/search/goods?keyword=", suffix: "" },
  { platform: "에이블리", baseUrl: "https://mobile.a-bly.com/search/search-result?query=", suffix: "&search_type=DIRECT" },
  { platform: "지그재그", baseUrl: "https://zigzag.kr/search?keyword=", suffix: "" },
] as const;

const OMITTED_SEARCH_COLORS = new Set([null, "멀티", "기타"]);

export function similarSearchQuery(item: SearchableItem): string {
  return [
    OMITTED_SEARCH_COLORS.has(item.color) ? null : item.color,
    item.visual_fit,
    item.kind,
  ].filter((value): value is string => typeof value === "string" && value.length > 0).join(" ");
}

export function similarSearchProducts(item: SearchableItem) {
  const query = similarSearchQuery(item);
  return SEARCH_PLATFORMS.map(({ platform, baseUrl, suffix }) => ({
    item_id: item.item_id,
    platform,
    url: `${baseUrl}${encodeURIComponent(query)}${suffix}`,
    match_type: "similar" as const,
  }));
}
