import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  COLORS,
  KINDS,
  SLOTS,
  STYLES,
  VISUAL_FITS,
  wardrobeInputSchema,
} from "../src/fulljoin/catalog.ts";
import { filterFeed, orderHomeFeed, type FeedImage } from "../src/fulljoin/feed.ts";

const schemaPath = new URL("../src/fulljoin/schemas/style_image.schema.json", import.meta.url);
const schema = JSON.parse(await readFile(schemaPath, "utf8")) as {
  properties: { style: { items: { enum: string[] } } };
  $defs: { Item: { properties: Record<string, { enum: Array<string | null> }> } };
};

test("server catalog stays aligned with the approved JSON schema", () => {
  const properties = schema.$defs.Item.properties;
  assert.deepEqual([...STYLES], schema.properties.style.items.enum);
  assert.deepEqual([...SLOTS], properties.slot?.enum);
  assert.deepEqual([...KINDS], properties.kind?.enum);
  assert.deepEqual([...COLORS, null], properties.color?.enum);
  assert.deepEqual([...VISUAL_FITS, null], properties.visual_fit?.enum);
});

test("wardrobe validation enforces kind-specific fit and slot", () => {
  assert.equal(wardrobeInputSchema.safeParse({
    user_id: "demo-user",
    slot: "하의",
    kind: "슬랙스",
    color: "블랙",
    visual_fit: "와이드",
  }).success, true);
  assert.equal(wardrobeInputSchema.safeParse({
    user_id: "demo-user",
    slot: "신발",
    kind: "로퍼",
    color: "블랙",
    visual_fit: null,
  }).success, true);
  assert.equal(wardrobeInputSchema.safeParse({
    user_id: "demo-user",
    slot: "하의",
    kind: "슬랙스",
    color: "블랙",
    visual_fit: null,
  }).success, false);
  assert.equal(wardrobeInputSchema.safeParse({
    user_id: "demo-user",
    slot: "신발",
    kind: "로퍼",
    color: "블랙",
    visual_fit: "슬림",
  }).success, false);
  assert.equal(wardrobeInputSchema.safeParse({
    user_id: "demo-user",
    slot: "상의",
    kind: "슬랙스",
    color: "블랙",
    visual_fit: "와이드",
  }).success, false);
});

test("home feed follows preference, neighbor, and other round-robin order", () => {
  const photos: FeedImage[] = [
    {id: "p1", style: ["미니멀"], uploaded_at: "2026-11-01T10:00:00+09:00"},
    {id: "p2", style: ["미니멀"], uploaded_at: "2026-11-03T10:00:00+09:00"},
    {id: "p3", style: ["시크"], uploaded_at: "2026-11-02T10:00:00+09:00"},
    {id: "p4", style: ["청순"], uploaded_at: "2026-11-04T10:00:00+09:00"},
    {id: "p5", style: ["캐주얼"], uploaded_at: "2026-11-05T10:00:00+09:00"},
    {id: "p6", style: ["스트릿"], uploaded_at: "2026-11-02T10:00:00+09:00"},
    {id: "p7", style: ["캐주얼", "미니멀"], uploaded_at: "2026-11-06T10:00:00+09:00"},
    {id: "p8", style: ["시크"], uploaded_at: "2026-11-07T10:00:00+09:00"},
  ];
  assert.deepEqual(
    orderHomeFeed(photos, ["미니멀"]).map((photo) => photo.id),
    ["p7", "p2", "p1", "p4", "p8", "p3", "p5", "p6"],
  );
  assert.deepEqual(filterFeed(photos, "시크").map((photo) => photo.id), ["p8", "p3"]);
});
