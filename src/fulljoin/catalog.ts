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

export const SLOTS = ["상의", "하의", "원피스", "아우터", "신발", "가방", "잡화"] as const;

export const COLORS = [
  "블랙", "화이트", "아이보리", "그레이", "차콜", "베이지", "브라운", "카키",
  "네이비", "블루", "스카이블루", "연청", "중청", "진청", "흑청", "민트", "그린",
  "레드", "와인", "핑크", "라벤더", "퍼플", "옐로우", "오렌지", "실버", "골드",
  "멀티", "기타", "연핑크", "모카", "살구",
] as const;

const TOP_KINDS = [
  "반소매티셔츠", "긴소매티셔츠", "민소매", "셔츠", "블라우스", "니트", "맨투맨", "후드", "트레이닝상의",
  "카디건", "후드집업", "베스트",
] as const;
const BOTTOM_KINDS = [
  "데님팬츠", "슬랙스", "코튼팬츠", "카고팬츠", "조거팬츠", "숏팬츠", "레깅스", "미니스커트",
  "미디스커트", "롱스커트", "점프수트",
] as const;
const DRESS_KINDS = ["미니원피스", "미디원피스", "롱원피스", "점프수트"] as const;
const OUTER_KINDS = [
  "카디건", "재킷", "트위드자켓", "레더재킷", "데님재킷", "점퍼", "후드집업", "야상", "플리스", "베스트",
  "퍼자켓", "퍼코트", "무스탕", "트렌치코트", "코트", "숏코트", "하프코트", "롱코트", "숏패딩", "롱패딩", "경량패딩",
] as const;
const SHOE_KINDS = ["스니커즈", "로퍼", "플랫슈즈", "힐", "부츠", "샌들", "슬리퍼"] as const;
const BAG_KINDS = ["숄더백", "크로스백", "토트백", "백팩", "에코백", "클러치"] as const;
const ACCESSORY_KINDS = ["스타킹", "양말", "모자", "벨트"] as const;

export const KINDS = [
  "반소매티셔츠", "긴소매티셔츠", "민소매", "셔츠", "블라우스", "니트", "맨투맨", "후드", "트레이닝상의",
  "데님팬츠", "슬랙스", "코튼팬츠", "카고팬츠", "조거팬츠", "숏팬츠", "레깅스", "미니스커트", "미디스커트",
  "롱스커트", "미니원피스", "미디원피스", "롱원피스", "점프수트", "카디건", "재킷", "트위드자켓", "레더재킷",
  "데님재킷", "점퍼", "후드집업", "야상", "플리스", "베스트", "퍼자켓", "퍼코트", "무스탕", "트렌치코트", "코트", "숏코트", "하프코트", "롱코트", "숏패딩",
  "롱패딩", "경량패딩", "스니커즈", "로퍼", "플랫슈즈", "힐", "부츠", "샌들", "슬리퍼",
  "숄더백", "크로스백", "토트백", "백팩", "에코백", "클러치", "스타킹", "양말", "모자", "벨트",
] as const;

export const VISUAL_FITS = [
  "슬림", "레귤러", "오버사이즈", "스키니", "일자", "와이드", "부츠컷", "A라인", "H라인", "플레어",
  "벌룬", "조거", "버뮤다", "테니스", "캉캉", "플리츠",
] as const;

export const MATERIALS = ["면", "데님", "니트", "울", "캐시미어", "린넨", "기모", "코듀로이", "플리스", "나일론", "가죽", "스웨이드", "퍼", "기타"] as const;
export const PATTERNS = ["무지", "스트라이프", "체크", "도트", "호피", "플라워", "아가일", "트위드", "기타"] as const;
export const SEASONS = ["봄", "여름", "가을", "겨울"] as const;

const detailsSchema = z.object({
  "목 모양": z.enum(["라운드", "U넥", "딥 U넥", "V넥", "딥 V넥", "스퀘어넥", "보트넥", "하프넥", "터틀넥", "오프숄더", "원숄더", "셔츠 카라", "라운드 카라"]).optional(),
  "기장": z.enum(["기본", "크롭", "긴", "9부", "7부", "숏", "하프", "롱"]).optional(),
  "카라": z.enum(["없음", "셔츠", "라운드", "빅카라", "세일러", "프릴", "스탠드"]).optional(),
  "칼라": z.enum(["테일러드", "숄", "노카라", "스탠드", "퍼", "후드", "셔츠 카라", "큰 칼라"]).optional(),
  "디테일": z.array(z.enum(["허리 끈", "목 끈", "카고 주머니", "더블 버튼", "벨트", "떡볶이 단추"])).optional(),
  "꾸밈": z.array(z.enum(["레이스", "시스루"])).optional(),
  "짜임": z.enum(["민자", "골지", "꽈배기 가운데", "꽈배기 전체", "아가일"]).optional(),
  "팔": z.enum(["같이", "무지"]).optional(),
  "털": z.enum(["짧은 털", "긴 털", "뽀글"]).optional(),
  "어깨": z.enum(["민소매", "끈", "끈 없음"]).optional(),
  "소매": z.enum(["끈", "민소매", "반팔", "긴팔"]).optional(),
  "모양": z.enum(["블루종", "바람막이", "캡", "비니", "베레모"]).optional(),
  "길이": z.enum(["발목", "숏", "앵클", "미들", "롱", "중목", "긴 양말"]).optional(),
  "두께": z.enum(["비침", "기모"]).optional(),
  "무늬 모양": z.enum(["깅엄", "타탄", "버팔로", "윈도페인", "글렌", "하운드투스", "단가라", "굵은줄", "멀티줄", "세로줄", "핀스트라이프"]).optional(),
}).strict();

const UPPER_FITS = ["슬림", "레귤러", "오버사이즈"] as const;
const TROUSER_FITS = ["스키니", "일자", "와이드", "부츠컷", "벌룬"] as const;
const JOGGER_FITS = ["조거", "일자", "와이드"] as const;
const SHORTS_FITS = ["슬림", "일자", "와이드", "버뮤다"] as const;
const MINI_SKIRT_FITS = ["A라인", "H라인", "플레어", "테니스", "캉캉"] as const;
const LONG_SKIRT_FITS = ["A라인", "H라인", "플레어", "플리츠", "캉캉"] as const;
const TROUSER_KINDS = ["데님팬츠", "슬랙스", "코튼팬츠", "카고팬츠"] as const;
const NO_FIT_KINDS = [
  "레깅스", ...SHOE_KINDS, ...BAG_KINDS, ...ACCESSORY_KINDS,
] as const;
const UPPER_FIT_KINDS = KINDS.filter(
  (kind) => !TROUSER_KINDS.includes(kind as (typeof TROUSER_KINDS)[number]) &&
    kind !== "조거팬츠" && kind !== "숏팬츠" &&
    !["미니스커트", "미디스커트", "롱스커트"].includes(kind) &&
    !NO_FIT_KINDS.includes(kind as (typeof NO_FIT_KINDS)[number]),
);

const KINDS_BY_SLOT: Record<(typeof SLOTS)[number], readonly string[]> = {
  상의: TOP_KINDS,
  하의: BOTTOM_KINDS,
  원피스: DRESS_KINDS,
  아우터: OUTER_KINDS,
  신발: SHOE_KINDS,
  가방: BAG_KINDS,
  잡화: ACCESSORY_KINDS,
};

export type WardrobeInput = {
  user_id: string;
  slot: (typeof SLOTS)[number];
  kind: (typeof KINDS)[number];
  color: (typeof COLORS)[number];
  visual_fit: (typeof VISUAL_FITS)[number] | null;
  material: (typeof MATERIALS)[number][];
  pattern: (typeof PATTERNS)[number] | null;
  seasons: (typeof SEASONS)[number][];
  details: z.infer<typeof detailsSchema>;
};

export const wardrobeInputSchema = z.object({
  user_id: z.string().trim().min(1),
  slot: z.enum(SLOTS),
  kind: z.enum(KINDS),
  color: z.enum(COLORS),
  visual_fit: z.enum(VISUAL_FITS).nullable(),
  material: z.array(z.enum(MATERIALS)).default([]),
  pattern: z.enum(PATTERNS).nullable().default(null),
  seasons: z.array(z.enum(SEASONS)).default([]),
  details: detailsSchema.default({}),
}).strict().superRefine((value, context) => {
  if (!KINDS_BY_SLOT[value.slot].includes(value.kind)) {
    context.addIssue({ code: "custom", path: ["kind"], message: "선택한 부위에 맞지 않는 종류예요" });
  }

  const allowedFits: readonly string[] = TROUSER_KINDS.includes(value.kind as never)
    ? TROUSER_FITS
    : value.kind === "조거팬츠"
      ? JOGGER_FITS
      : value.kind === "숏팬츠"
        ? SHORTS_FITS
        : value.kind === "미니스커트"
          ? MINI_SKIRT_FITS
          : value.kind === "미디스커트" || value.kind === "롱스커트"
            ? LONG_SKIRT_FITS
          : NO_FIT_KINDS.includes(value.kind as never)
            ? []
            : UPPER_FIT_KINDS.includes(value.kind)
              ? UPPER_FITS
              : [];

  const validFit = value.visual_fit === null || allowedFits.includes(value.visual_fit);
  if (!validFit) {
    context.addIssue({ code: "custom", path: ["visual_fit"], message: "종류에 맞는 핏을 골라 주세요" });
  }

  const patternDetail = value.details["무늬 모양"];
  if (patternDetail !== undefined) {
    const checkDetails = ["깅엄", "타탄", "버팔로", "윈도페인", "글렌", "하운드투스"];
    const stripeDetails = ["단가라", "굵은줄", "멀티줄", "세로줄", "핀스트라이프"];
    if ((value.pattern !== "체크" || !checkDetails.includes(patternDetail)) &&
        (value.pattern !== "스트라이프" || !stripeDetails.includes(patternDetail))) {
      context.addIssue({ code: "custom", path: ["details", "무늬 모양"], message: "무늬에 맞는 세부 모양을 골라 주세요" });
    }
  }
  if (value.details["팔"] !== undefined && value.details["짜임"] === undefined) {
    context.addIssue({ code: "custom", path: ["details", "팔"], message: "팔 모양은 짜임과 함께 골라 주세요" });
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
