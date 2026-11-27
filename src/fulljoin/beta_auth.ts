import { z } from "zod";

export const BETA_NICKNAME_MIN = 2;
export const BETA_NICKNAME_MAX = 12;

export function normalizeBetaNickname(raw: string): string {
  return raw.normalize("NFC").trim().replace(/\s+/gu, " ");
}

export const betaLoginInputSchema = z.object({
  nickname: z.string().transform(normalizeBetaNickname).pipe(z.string().min(BETA_NICKNAME_MIN).max(BETA_NICKNAME_MAX)),
  pin: z.string().regex(/^[0-9]{4}$/u),
}).strict();

export const betaLoginResultSchema = z.object({
  auth_user_id: z.uuid(),
  nickname: z.string().min(BETA_NICKNAME_MIN).max(BETA_NICKNAME_MAX),
  outcome: z.literal("ok"),
}).strict();

export const betaSessionResponseSchema = z.object({
  user: z.object({ id: z.uuid(), nickname: z.string() }).strict(),
  session: z.object({
    access_token: z.string().min(20),
    refresh_token: z.string().min(20),
    expires_at: z.number().int().positive(),
  }).strict(),
  returning: z.boolean(),
  styles: z.array(z.string()),
}).strict();
