import { z } from "zod";

import { COLORS, KINDS, slotForKind, SLOTS, STYLES } from "./catalog.ts";
import { classifyGap, type ItemForGapAnalysis, type WardrobeItemForGapAnalysis } from "./gap_analysis.ts";

export const ACTION_CHAT_INTENTS = [
  "today_outfit",
  "wardrobe_outfit_search",
  "find_style",
  "find_similar_item",
  "add_wardrobe_item",
  "compare_saved_style",
  "browse_saved_styles",
  "notify_today_outfit",
  "notify_new_style",
  "general_question",
  "out_of_scope",
] as const;

export type ActionChatIntent = (typeof ACTION_CHAT_INTENTS)[number];

const actionBase = {
  action_id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
};

export const chatActionSchema = z.discriminatedUnion("type", [
  z.object({ ...actionBase, type: z.literal("OPEN_RECOMMENDATION"), params: z.object({}).strict() }).strict(),
  z.object({ ...actionBase, type: z.literal("OPEN_FILTERED_FEED"), params: z.object({
    styles: z.array(z.enum(STYLES)).max(2).default([]),
    kind: z.enum(KINDS).nullable().default(null),
    color: z.enum(COLORS).nullable().default(null),
  }).strict() }).strict(),
  z.object({ ...actionBase, type: z.literal("OPEN_STYLE_DETAIL"), params: z.object({ style_image_id: z.string().min(1).max(128) }).strict() }).strict(),
  z.object({ ...actionBase, type: z.literal("OPEN_COMPARISON"), params: z.object({ style_image_id: z.string().min(1).max(128) }).strict() }).strict(),
  z.object({ ...actionBase, type: z.literal("OPEN_WARDROBE"), params: z.object({}).strict() }).strict(),
  z.object({ ...actionBase, type: z.literal("OPEN_WARDROBE_ADD"), params: z.object({
    slot: z.enum(["상의", "하의", "원피스", "아우터", "신발", "가방", "잡화"]).nullable(),
    kind: z.enum(KINDS).nullable(),
    color: z.enum(COLORS).nullable(),
  }).strict() }).strict(),
  z.object({ ...actionBase, type: z.literal("OPEN_PHOTO_ADD"), params: z.object({}).strict() }).strict(),
  z.object({ ...actionBase, type: z.literal("OPEN_ARCHIVE"), params: z.object({}).strict() }).strict(),
  z.object({ ...actionBase, type: z.literal("OPEN_PRODUCT_SEARCH"), params: z.object({
    url: z.string().url().refine((value) => ["www.musinsa.com", "mobile.a-bly.com", "zigzag.kr"].includes(new URL(value).hostname)),
  }).strict() }).strict(),
  z.object({ ...actionBase, type: z.literal("OFFER_DAILY_REMINDER"), params: z.object({}).strict() }).strict(),
  z.object({ ...actionBase, type: z.literal("OFFER_WARDROBE_REMINDER"), params: z.object({}).strict() }).strict(),
  z.object({ ...actionBase, type: z.literal("OFFER_STYLE_ALERT"), params: z.object({}).strict() }).strict(),
  z.object({ ...actionBase, type: z.literal("NONE"), params: z.object({}).strict() }).strict(),
]);

export type ChatAction = z.infer<typeof chatActionSchema>;
export type ChatActionDraft = Omit<ChatAction, "action_id">;

export type ChatFilters = {
  styles: (typeof STYLES)[number][];
  kind: (typeof KINDS)[number] | null;
  color: (typeof COLORS)[number] | null;
};

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export function extractChatFilters(message: string): ChatFilters {
  const styles = STYLES.filter((style) => message.includes(style)).slice(0, 2);
  const aliasKind = message.includes("청바지") ? "데님팬츠" : message.includes("가디건") ? "카디건" : null;
  const kind = KINDS.find((candidate) => message.includes(candidate)) ?? aliasKind;
  const colorAliases: Readonly<Record<string, (typeof COLORS)[number]>> = {
    검정: "블랙", 흰색: "화이트", 하얀: "화이트", 회색: "그레이", 갈색: "브라운", 남색: "네이비", 분홍: "핑크", 보라: "퍼플",
  };
  const color = COLORS.find((candidate) => message.includes(candidate))
    ?? Object.entries(colorAliases).find(([alias]) => message.includes(alias))?.[1]
    ?? null;
  return { styles: [...styles], kind, color };
}

export function classifyActionChatIntents(message: string): ActionChatIntent[] {
  const intents: ActionChatIntent[] = [];
  const normalized = message.replace(/\s+/g, " ").trim();
  const wantsNotification = /(알림|알려\s*줘|알려\s*주세요|추천받)/u.test(normalized);
  const wantsToday = /(오늘|지금).*(뭐\s*입|코디|옷)|오늘의\s*룩/u.test(normalized);
  const wantsOwned = /(내\s*옷|옷장|가지고\s*있는|등록한).*(코디|입을|추천|찾)/u.test(normalized);
  const wantsSimilar = /(비슷한|유사한).*(상품|제품|옷)|상품.*찾/u.test(normalized);
  const wantsPhotoAnalysis = /(이\s*사진|사진\s*속).*(무슨\s*옷|아이템|분석)/u.test(normalized);
  const wantsAdd = /(등록|추가|옷장에\s*넣)/u.test(normalized) && /(옷|상의|하의|아우터|신발|가방|카디건|가디건|니트|팬츠|스커트)/u.test(normalized);
  const wantsSaved = /(저장한|전에\s*저장|아카이브)/u.test(normalized);
  const wantsCompare = /(비교|처럼\s*입|활용|입을\s*수)/u.test(normalized) && /(사진|코디|저장)/u.test(normalized);
  const hasStyleFilter = extractChatFilters(normalized).styles.length > 0;
  const wantsStyle = hasStyleFilter && /(코디|스타일|룩|보여|찾|추천)/u.test(normalized);
  const wantsNewStyle = wantsNotification && /(새로운|새\s*코디|나오면)/u.test(normalized);
  const general = /(관리|세탁|보관|어울리는\s*색|패션|스타일링|면접|데이트|하객|어떻게\s*입)/u.test(normalized);

  if (wantsToday) intents.push("today_outfit");
  if (wantsOwned) intents.push("wardrobe_outfit_search");
  if (wantsStyle && !wantsOwned) intents.push("find_style");
  if (wantsSimilar) intents.push("find_similar_item");
  if (wantsAdd) intents.push("add_wardrobe_item");
  if (wantsCompare || wantsPhotoAnalysis) intents.push("compare_saved_style");
  if (wantsSaved && !wantsCompare) intents.push("browse_saved_styles");
  if (wantsNotification && !wantsNewStyle && (wantsToday || /매일|아침|코디/u.test(normalized))) intents.push("notify_today_outfit");
  if (wantsNewStyle) intents.push("notify_new_style");
  if (general && intents.length === 0) intents.push("general_question");
  return unique(intents.length > 0 ? intents : ["out_of_scope"]);
}

export function actionChatRequiresLlm(intents: readonly ActionChatIntent[]): boolean {
  return intents.includes("general_question");
}

export type CompatibleStyleItem = ItemForGapAnalysis & { item_id: string };
export type CompatibleStyle = { id: string; items: readonly CompatibleStyleItem[] };

export type CompatibilityScore = {
  style_image_id: string;
  usable_item_count: number;
  similar_item_count: number;
  total_item_count: number;
};

export function rankCompatibleStyles(
  styles: readonly CompatibleStyle[],
  wardrobe: readonly WardrobeItemForGapAnalysis[],
  limit = 3,
): CompatibilityScore[] {
  return styles.map((style) => {
    const gaps = style.items.map((item) => classifyGap(item, wardrobe).gap_status);
    return {
      style_image_id: style.id,
      usable_item_count: gaps.filter((status) => status === "활용").length,
      similar_item_count: gaps.filter((status) => status === "비슷함").length,
      total_item_count: gaps.length,
    };
  }).filter((score) => score.total_item_count > 0)
    .sort((left, right) =>
      right.usable_item_count - left.usable_item_count ||
      right.similar_item_count - left.similar_item_count ||
      left.total_item_count - right.total_item_count ||
      left.style_image_id.localeCompare(right.style_image_id))
    .slice(0, limit);
}

export function wardrobeRegistrationDraft(message: string, missingSlots: readonly string[]): ChatActionDraft {
  const filters = extractChatFilters(message);
  const slot = filters.kind === null ? null : slotForKind(filters.kind);
  const fallbackSlot = missingSlots.find((candidate): candidate is (typeof SLOTS)[number] =>
    (SLOTS as readonly string[]).includes(candidate)) ?? null;
  return {
    type: "OPEN_WARDROBE_ADD",
    label: filters.kind === null ? `${slot ?? fallbackSlot ?? "옷"} 등록하기` : `${filters.kind} 등록하기`,
    params: { slot: slot ?? fallbackSlot, kind: filters.kind, color: filters.color },
  };
}
