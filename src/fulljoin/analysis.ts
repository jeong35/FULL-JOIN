import { z } from "zod";

import { COLORS, KINDS, SLOTS, STYLES, VISUAL_FITS } from "./catalog.ts";

export const SOURCES = ["쇼핑몰", "인플루언서", "연예인", "자체_촬영"] as const;
export const PERMISSIONS = ["미요청", "요청함", "허락", "필요 없음"] as const;
export const VISIBILITIES = ["전체", "일부", "판단불가"] as const;
export const MODEL_BRAND_SOURCES = ["캡션", "이미지_글자", "없음"] as const;

const kindsBySlot: Record<(typeof SLOTS)[number], readonly string[]> = {
  상의: ["반소매티셔츠", "긴소매티셔츠", "민소매", "셔츠", "블라우스", "니트", "맨투맨", "후드", "카디건", "후드집업", "베스트"],
  하의: ["데님팬츠", "슬랙스", "코튼팬츠", "조거팬츠", "숏팬츠", "레깅스", "미니스커트", "미디스커트", "롱스커트", "점프수트"],
  원피스: ["미니원피스", "미디원피스", "롱원피스", "점프수트"],
  아우터: ["카디건", "재킷", "레더재킷", "데님재킷", "점퍼", "후드집업", "야상", "플리스", "베스트", "트렌치코트", "코트", "숏패딩", "롱패딩", "경량패딩"],
  신발: ["스니커즈", "로퍼", "플랫슈즈", "힐", "부츠", "샌들", "슬리퍼"],
  가방: ["숄더백", "크로스백", "토트백", "백팩", "에코백", "클러치"],
};

const upperFits = new Set(["슬림", "레귤러", "오버사이즈"]);
const trouserFits = new Set(["스키니", "일자", "와이드", "부츠컷"]);
const skirtFits = new Set(["A라인", "H라인", "플레어"]);
const trouserKinds = new Set(["데님팬츠", "슬랙스", "코튼팬츠", "조거팬츠"]);
const skirtKinds = new Set(["미니스커트", "미디스커트", "롱스커트"]);
const noFitKinds = new Set(["숏팬츠", "레깅스", "스니커즈", "로퍼", "플랫슈즈", "힐", "부츠", "샌들", "슬리퍼", "숄더백", "크로스백", "토트백", "백팩", "에코백", "클러치"]);

export const analysisItemSchema = z.object({
  slot: z.enum(SLOTS),
  kind: z.enum(KINDS),
  color: z.enum(COLORS).nullable(),
  visual_fit: z.enum(VISUAL_FITS).nullable(),
  visibility: z.enum(VISIBILITIES),
  brand: z.string().trim().min(1).nullable(),
  product_name: z.string().trim().min(1).nullable(),
  brand_source: z.enum(MODEL_BRAND_SOURCES),
}).strict().superRefine((item, context) => {
  if (!kindsBySlot[item.slot].includes(item.kind)) {
    context.addIssue({ code: "custom", path: ["kind"], message: "부위와 종류가 맞지 않아요" });
  }

  if (item.brand_source === "없음" && (item.brand !== null || item.product_name !== null)) {
    context.addIssue({ code: "custom", path: ["brand_source"], message: "근거 없는 브랜드나 제품명이 있어요" });
  }

  if (item.visual_fit === null) return;
  const validFit = trouserKinds.has(item.kind)
    ? trouserFits.has(item.visual_fit)
    : skirtKinds.has(item.kind)
      ? skirtFits.has(item.visual_fit)
      : noFitKinds.has(item.kind)
        ? false
        : upperFits.has(item.visual_fit);
  if (!validFit) {
    context.addIssue({ code: "custom", path: ["visual_fit"], message: "종류와 핏이 맞지 않아요" });
  }
});

export const styleImageAnalysisSchema = z.object({
  style: z.array(z.enum(STYLES)).max(2),
  items: z.array(analysisItemSchema).max(6),
}).strict();

export const analyzeInputSchema = z.object({
  image_id: z.string().trim().regex(/^IMG-[0-9]{3,}$/),
  image_path: z.string().trim().min(1).refine((value) => !value.startsWith("/") && !value.includes(".."), "올바른 Storage 경로가 아니에요"),
  source: z.enum(SOURCES),
  source_url: z.string().url().refine((value) => value.startsWith("https://") || value.startsWith("http://"), "HTTP(S) 주소만 사용할 수 있어요").nullable().optional(),
  permission: z.enum(PERMISSIONS),
  approved_style: z.array(z.enum(STYLES)).min(1).max(2).refine((styles) => new Set(styles).size === styles.length, "스타일이 중복되면 안 돼요").optional(),
  caption: z.string().trim().max(2000).optional(),
}).strict();

export const productLinkInputSchema = z.object({
  product_url: z.string().url().refine((value) => value.startsWith("https://") || value.startsWith("http://"), "HTTP(S) 주소만 사용할 수 있어요").optional(),
  is_representative_product: z.boolean().default(true),
}).strict();

export type StyleImageAnalysis = z.infer<typeof styleImageAnalysisSchema>;

export function normalizeAnalysis(analysis: StyleImageAnalysis): StyleImageAnalysis {
  return {
    style: [...new Set(analysis.style)],
    items: analysis.items.map((item) => item.brand_source === "없음"
      ? { ...item, brand: null, product_name: null }
      : item),
  };
}
