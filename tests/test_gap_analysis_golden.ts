import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type {
  GapAnalysisResult,
  ItemForGapAnalysis,
  WardrobeItemForGapAnalysis,
} from "../src/fulljoin/gap_analysis.ts";

type GapStatus = "활용" | "비슷함" | "구매";

type GoldenCase = {
  name: string;
  ac: string[];
  input: {
    item: ItemForGapAnalysis;
    wardrobe: WardrobeItemForGapAnalysis[];
  };
  expect_gap_status?: GapStatus;
  expect_wardrobe_item_ids?: string[];
  must_not_use_wardrobe_item_ids?: string[];
  note: string;
};

type GoldenFile = {
  _meta?: Record<string, unknown>;
  cases: GoldenCase[];
};

const goldenPath = new URL("./harness/golden_cases.yaml", import.meta.url);
const golden = JSON.parse(await readFile(goldenPath, "utf8")) as GoldenFile;

const expectationKeys = [
  "expect_gap_status",
  "expect_wardrobe_item_ids",
  "must_not_use_wardrobe_item_ids",
] as const;

test("golden case file has valid, uniquely named, judgeable cases", () => {
  assert.ok(Array.isArray(golden.cases), "cases must be an array");
  assert.ok(golden.cases.length > 0, "at least one golden case is required");

  const names = golden.cases.map((entry) => entry.name);
  assert.equal(new Set(names).size, names.length, "case names must be unique");

  for (const entry of golden.cases) {
    assert.match(entry.name, /^[a-z0-9_]+$/, `${entry.name}: invalid test id`);
    assert.ok(entry.ac.length > 0, `${entry.name}: AC trace is required`);
    assert.ok(entry.note.trim().length > 0, `${entry.name}: note is required`);
    assert.ok(
      expectationKeys.some((key) => key in entry),
      `${entry.name}: at least one supported expectation key is required`,
    );
  }
});

let classifyGap:
  | ((
      item: GoldenCase["input"]["item"],
      wardrobe: GoldenCase["input"]["wardrobe"],
    ) => GapAnalysisResult)
  | undefined;

try {
  ({ classifyGap } = await import("../src/fulljoin/gap_analysis.ts"));
} catch (error) {
  const missingImplementation =
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND";

  if (!missingImplementation) {
    throw error;
  }
}

for (const entry of golden.cases) {
  test(entry.name, { skip: classifyGap === undefined ? "gap analysis is not implemented yet" : false }, () => {
    assert.ok(classifyGap, "classifyGap must be available");
    const result = classifyGap(entry.input.item, entry.input.wardrobe);

    if (entry.expect_gap_status !== undefined) {
      assert.equal(result.gap_status, entry.expect_gap_status);
    }

    if (entry.expect_wardrobe_item_ids !== undefined) {
      assert.deepEqual(
        [...result.wardrobe_item_ids].sort(),
        [...entry.expect_wardrobe_item_ids].sort(),
      );
    }

    for (const forbiddenId of entry.must_not_use_wardrobe_item_ids ?? []) {
      assert.ok(
        !result.wardrobe_item_ids.includes(forbiddenId),
        `${forbiddenId} must not be used`,
      );
    }
  });
}
