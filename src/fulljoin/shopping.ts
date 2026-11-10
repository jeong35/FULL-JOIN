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

// 내부 태깅 enum은 바꾸지 않고, 쇼핑몰이 실제 검색에 쓰는 표현만 링크 생성 시 변환한다.
const PLATFORM_KIND_ALIASES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  에이블리: { 카디건: "가디건" },
};

function kindForPlatform(kind: string, platform?: string): string {
  return platform === undefined ? kind : PLATFORM_KIND_ALIASES[platform]?.[kind] ?? kind;
}

export function similarSearchQuery(item: SearchableItem, platform?: string): string {
  return [
    OMITTED_SEARCH_COLORS.has(item.color) ? null : item.color,
    item.visual_fit,
    kindForPlatform(item.kind, platform),
  ].filter((value): value is string => typeof value === "string" && value.length > 0).join(" ");
}

export function similarSearchProducts(item: SearchableItem) {
  return SEARCH_PLATFORMS.map(({ platform, baseUrl, suffix }) => ({
    item_id: item.item_id,
    platform,
    url: `${baseUrl}${encodeURIComponent(similarSearchQuery(item, platform))}${suffix}`,
    match_type: "similar" as const,
  }));
}
