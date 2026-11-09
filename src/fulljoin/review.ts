import { z } from "zod";

import { COLORS, KINDS, SLOTS, STYLES, VISUAL_FITS } from "./catalog.ts";
import { analysisItemSchema, VISIBILITIES } from "./analysis.ts";

const reviewedItemSchema = z.object({
  item_id: z.string().trim().regex(/^IMG-[0-9]{3,}-ITEM-[0-9]{2,}$/),
  slot: z.enum(SLOTS),
  kind: z.enum(KINDS),
  color: z.enum(COLORS).nullable(),
  visual_fit: z.enum(VISUAL_FITS).nullable(),
  visibility: z.enum(VISIBILITIES),
}).strict().superRefine((item, context) => {
  const classification = analysisItemSchema.safeParse({
    slot: item.slot,
    kind: item.kind,
    color: item.color,
    visual_fit: item.visual_fit,
    visibility: item.visibility,
    brand: null,
    product_name: null,
    brand_source: "없음",
  });
  if (!classification.success) {
    for (const issue of classification.error.issues) {
      context.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
  }
});

export const styleImageReviewInputSchema = z.object({
  style: z.array(z.enum(STYLES)).min(1).max(2)
    .refine((styles) => new Set(styles).size === styles.length, "스타일이 중복되면 안 돼요")
    .optional(),
  items: z.array(reviewedItemSchema).min(1).max(6)
    .refine((items) => new Set(items.map((item) => item.item_id)).size === items.length, "아이템이 중복되면 안 돼요")
    .optional(),
}).strict();

export const styleImagePublishInputSchema = z.object({
  published: z.boolean().default(true),
}).strict();
