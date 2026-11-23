import { z } from "zod";

import { COLORS, KINDS, SLOTS, VISUAL_FITS, wardrobeInputSchema } from "./catalog.ts";

export const WARDROBE_PHOTO_MAX_BYTES = 3 * 1024 * 1024;
export const WARDROBE_CUTOUT_INPUT_MAX_BYTES = 8 * 1024 * 1024;

export const photoColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable();

export const wardrobePhotoTagSchema = z.object({
  slot: z.enum(SLOTS),
  kind: z.enum(KINDS),
  color: z.enum(COLORS).nullable(),
  visual_fit: z.enum(VISUAL_FITS).nullable(),
}).strict().superRefine((tag, context) => {
  const checked = wardrobeInputSchema.safeParse({
    user_id: "photo-tag-validation",
    slot: tag.slot,
    kind: tag.kind,
    color: tag.color ?? "블랙",
    visual_fit: tag.visual_fit,
  });
  for (const issue of checked.success ? [] : checked.error.issues) {
    if (issue.path[0] === "kind" || issue.path[0] === "visual_fit") {
      context.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
  }
});

export const wardrobePhotoTagInputSchema = z.object({
  user_id: z.string().trim().min(1),
  image: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).max(4_500_000),
}).strict();

export function wardrobePhotoPath(userId: string, wardrobeItemId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("invalid_user_id");
  if (!/^[0-9a-f-]{36}$/i.test(wardrobeItemId)) throw new Error("invalid_wardrobe_item_id");
  return `${userId}/${wardrobeItemId}.png`;
}

export function decodedDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export const WARDROBE_PHOTO_TAG_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    slot: { type: "string", enum: SLOTS },
    kind: { type: "string", enum: KINDS },
    color: { anyOf: [{ type: "string", enum: COLORS }, { type: "null" }] },
    visual_fit: { anyOf: [{ type: "string", enum: VISUAL_FITS }, { type: "null" }] },
  },
  required: ["slot", "kind", "color", "visual_fit"],
} as const;
