// 사용 기록(이벤트). 사람들이 어느 화면에서 멈추는지(이탈 지점)와 최종 목표(활성화·도달·재방문)를 재려고
// 앱이 보낸다(docs/EVENTS.md). 닉네임·숫자 같은 개인 정보는 받지 않는다 — user_id는 닉네임·숫자의 해시,
// device_id·session_id는 브라우저가 만든 무작위 값이다. 이름은 닫힌 목록만 받는다.
// mobile/src/data/events.ts의 EVENT_NAMES와 같아야 한다.
import { z } from "zod";

export const EVENT_NAMES = [
  "app_open",
  "intro_view",
  "intro_next",
  "intro_skip",
  "intro_done",
  "login_view",
  "login_success",
  "taste_view",
  "taste_done",
  "taste_later",
  "ready_view",
  "ready_choice",
  "feed_view",
  "photo_open",
  "photo_save",
  "compare_open",
  "result_view",
  "item_choice",
  "shop_link_click",
  "chat_send",
  "wardrobe_add_start",
  "wardrobe_add_done",
  "hint_view",
  "hint_click",
  "hint_close",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export const MAX_EVENTS_PER_BATCH = 20;
export const MAX_EVENT_PROPS = 12;

const randomIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const propValueSchema = z.union([z.string().max(80), z.number().finite(), z.boolean(), z.null()]);

const eventSchema = z.object({
  name: z.enum(EVENT_NAMES),
  ts: z.iso.datetime({ offset: true }).optional(),
  user_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).nullable().optional(),
  props: z.record(z.string().regex(/^[a-z_]{1,32}$/), propValueSchema)
    .refine((props) => Object.keys(props).length <= MAX_EVENT_PROPS, { message: "too many props" })
    .optional(),
}).strict();

export const eventBatchSchema = z.object({
  device_id: randomIdSchema,
  session_id: randomIdSchema,
  platform: z.enum(["web", "ios", "android"]).optional(),
  events: z.array(eventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
}).strict();

export type EventBatch = z.infer<typeof eventBatchSchema>;

export type EventRow = {
  device_id: string;
  session_id: string;
  platform: string | null;
  user_id: string | null;
  name: EventName;
  client_ts: string | null;
  props: Record<string, string | number | boolean | null>;
};

export function eventRows(batch: EventBatch): EventRow[] {
  return batch.events.map((event) => ({
    device_id: batch.device_id,
    session_id: batch.session_id,
    platform: batch.platform ?? null,
    user_id: event.user_id ?? null,
    name: event.name,
    client_ts: event.ts ?? null,
    props: event.props ?? {},
  }));
}
