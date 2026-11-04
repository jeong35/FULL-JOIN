import { z } from "zod";

export const STYLES = [
  "캐주얼",
  "미니멀",
  "러블리",
  "청순",
  "엘레강스",
  "시크",
  "스트릿",
  "레트로",
  "프레피",
  "스포티",
  "글램",
] as const;

export const SLOTS = ["상의", "하의", "원피스", "아우터", "신발", "가방"] as const;

export const COLORS = [
  "블랙", "화이트", "아이보리", "그레이", "차콜", "베이지", "브라운", "카키",
  "네이비", "블루", "스카이블루", "연청", "중청", "진청", "흑청", "민트", "그린",
  "레드", "와인", "핑크", "라벤더", "퍼플", "옐로우", "오렌지", "실버", "골드",
  "멀티", "기타",
] as const;

const TOP_KINDS = [
  "반소매티셔츠", "긴소매티셔츠", "민소매", "셔츠", "블라우스", "니트", "맨투맨", "후드",
  "카디건", "후드집업", "베스트",
] as const;
const BOTTOM_KINDS = [
  "데님팬츠", "슬랙스", "코튼팬츠", "조거팬츠", "숏팬츠", "레깅스", "미니스커트",
  "미디스커트", "롱스커트", "점프수트",
] as const;
const DRESS_KINDS = ["미니원피스", "미디원피스", "롱원피스", "점프수트"] as const;
const OUTER_KINDS = [
  "카디건", "재킷", "레더재킷", "데님재킷", "점퍼", "후드집업", "야상", "플리스", "베스트",
  "트렌치코트", "코트", "숏패딩", "롱패딩", "경량패딩",
] as const;
const SHOE_KINDS = ["스니커즈", "로퍼", "플랫슈즈", "힐", "부츠", "샌들", "슬리퍼"] as const;
const BAG_KINDS = ["숄더백", "크로스백", "토트백", "백팩", "에코백", "클러치"] as const;

export const KINDS = [
  "반소매티셔츠", "긴소매티셔츠", "민소매", "셔츠", "블라우스", "니트", "맨투맨", "후드",
  "데님팬츠", "슬랙스", "코튼팬츠", "조거팬츠", "숏팬츠", "레깅스", "미니스커트", "미디스커트",
  "롱스커트", "미니원피스", "미디원피스", "롱원피스", "점프수트", "카디건", "재킷", "레더재킷",
  "데님재킷", "점퍼", "후드집업", "야상", "플리스", "베스트", "트렌치코트", "코트", "숏패딩",
  "롱패딩", "경량패딩", "스니커즈", "로퍼", "플랫슈즈", "힐", "부츠", "샌들", "슬리퍼",
  "숄더백", "크로스백", "토트백", "백팩", "에코백", "클러치",
] as const;

export const VISUAL_FITS = [
  "슬림", "레귤러", "오버사이즈", "스키니", "일자", "와이드", "부츠컷", "A라인", "H라인", "플레어",
] as const;

const UPPER_FITS = ["슬림", "레귤러", "오버사이즈"] as const;
const TROUSER_FITS = ["스키니", "일자", "와이드", "부츠컷"] as const;
const SKIRT_FITS = ["A라인", "H라인", "플레어"] as const;
const TROUSER_KINDS = ["데님팬츠", "슬랙스", "코튼팬츠", "조거팬츠"] as const;
const SKIRT_KINDS = ["미니스커트", "미디스커트", "롱스커트"] as const;
const NO_FIT_KINDS = [
  "숏팬츠", "레깅스", ...SHOE_KINDS, ...BAG_KINDS,
] as const;
const UPPER_FIT_KINDS = KINDS.filter(
  (kind) => !TROUSER_KINDS.includes(kind as (typeof TROUSER_KINDS)[number]) &&
    !SKIRT_KINDS.includes(kind as (typeof SKIRT_KINDS)[number]) &&
    !NO_FIT_KINDS.includes(kind as (typeof NO_FIT_KINDS)[number]),
);

const KINDS_BY_SLOT: Record<(typeof SLOTS)[number], readonly string[]> = {
  상의: TOP_KINDS,
  하의: BOTTOM_KINDS,
  원피스: DRESS_KINDS,
  아우터: OUTER_KINDS,
  신발: SHOE_KINDS,
  가방: BAG_KINDS,
};

export type WardrobeInput = {
  user_id: string;
  slot: (typeof SLOTS)[number];
  kind: (typeof KINDS)[number];
  color: (typeof COLORS)[number];
  visual_fit: (typeof VISUAL_FITS)[number] | null;
};

export const wardrobeInputSchema = z.object({
  user_id: z.string().trim().min(1),
  slot: z.enum(SLOTS),
  kind: z.enum(KINDS),
  color: z.enum(COLORS),
  visual_fit: z.enum(VISUAL_FITS).nullable(),
}).strict().superRefine((value, context) => {
  if (!KINDS_BY_SLOT[value.slot].includes(value.kind)) {
    context.addIssue({ code: "custom", path: ["kind"], message: "선택한 부위에 맞지 않는 종류예요" });
  }

  const allowedFits: readonly string[] = TROUSER_KINDS.includes(value.kind as never)
    ? TROUSER_FITS
    : SKIRT_KINDS.includes(value.kind as never)
      ? SKIRT_FITS
      : NO_FIT_KINDS.includes(value.kind as never)
        ? []
        : UPPER_FIT_KINDS.includes(value.kind)
          ? UPPER_FITS
          : [];

  const validFit = allowedFits.length === 0
    ? value.visual_fit === null
    : value.visual_fit !== null && allowedFits.includes(value.visual_fit);
  if (!validFit) {
    context.addIssue({ code: "custom", path: ["visual_fit"], message: "종류에 맞는 핏을 골라 주세요" });
  }
});

export function invalidEnumField(error: z.ZodError): string | undefined {
  const field = error.issues[0]?.path[0];
  return typeof field === "string" ? field : undefined;
}

export const NEIGHBOR_STYLES: Record<(typeof STYLES)[number], readonly (typeof STYLES)[number][]> = {
  캐주얼: ["스트릿", "스포티"],
  미니멀: ["시크", "청순"],
  러블리: ["청순", "프레피"],
  청순: ["러블리", "미니멀"],
  엘레강스: ["미니멀", "글램"],
  시크: ["미니멀", "글램"],
  스트릿: ["캐주얼", "스포티"],
  레트로: ["캐주얼", "프레피"],
  프레피: ["러블리", "레트로"],
  스포티: ["캐주얼", "스트릿"],
  글램: ["시크", "엘레강스"],
};
