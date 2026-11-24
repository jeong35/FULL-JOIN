import assert from "node:assert/strict";
import test from "node:test";

import {
  rankAlmostLooks,
  rankCompleteLooks,
  recommendationEmptyState,
} from "../mobile/src/data/recommendCore.ts";

const piece = (similar = false, substitute = false) => ({ similar, substitute });
const look = (
  id: string,
  overrides: Partial<{
    saved_at: string;
    weatherFit: boolean;
    styleMatch: boolean;
    pieces: { similar: boolean; substitute: boolean }[];
  }> = {},
) => ({
  image: { id, saved_at: overrides.saved_at ?? "2026-11-20T00:00:00.000Z" },
  weatherFit: overrides.weatherFit ?? true,
  styleMatch: overrides.styleMatch ?? true,
  pieces: overrides.pieces ?? [piece()],
});

test("complete recommendations keep weather, style, match quality, and deterministic tie order", () => {
  const input = [
    look("similar", { pieces: [piece(true)] }),
    look("substitute", { pieces: [piece(false, true)] }),
    look("old-b", { saved_at: "2026-11-19T00:00:00.000Z" }),
    look("old-a", { saved_at: "2026-11-19T00:00:00.000Z" }),
    look("no-style", { styleMatch: false, saved_at: "2026-11-23T00:00:00.000Z" }),
    look("no-weather", { weatherFit: false, saved_at: "2026-11-24T00:00:00.000Z" }),
    look("exact", { saved_at: "2026-11-21T00:00:00.000Z" }),
  ];
  const before = input.map((entry) => entry.image.id);

  assert.deepEqual(
    rankCompleteLooks(input, 7).map((entry) => entry.image.id),
    ["exact", "old-a", "old-b", "similar", "substitute", "no-style", "no-weather"],
  );
  assert.deepEqual(input.map((entry) => entry.image.id), before);
  assert.equal(rankCompleteLooks(input, 3).length, 3);
});

test("almost recommendations prefer selected style then recent save and stable id", () => {
  const ranked = rankAlmostLooks([
    { image: { id: "b", saved_at: "2026-11-20T00:00:00.000Z" }, styleMatch: true },
    { image: { id: "a", saved_at: "2026-11-20T00:00:00.000Z" }, styleMatch: true },
    { image: { id: "new-unmatched", saved_at: "2026-11-24T00:00:00.000Z" }, styleMatch: false },
  ], 3);
  assert.deepEqual(ranked.map((entry) => entry.image.id), ["a", "b", "new-unmatched"]);
});

test("recommendation empty-state precedence is stable", () => {
  const base = {
    wardrobeReady: true,
    archiveReady: true,
    wardrobeCount: 3,
    archiveCount: 2,
    pending: 0,
    completeLookCount: 0,
  };
  assert.equal(recommendationEmptyState({ ...base, wardrobeReady: false }), "loading");
  assert.equal(recommendationEmptyState({ ...base, wardrobeCount: 0 }), "empty_wardrobe");
  assert.equal(recommendationEmptyState({ ...base, archiveCount: 0 }), "empty_archive");
  assert.equal(recommendationEmptyState({ ...base, pending: 1 }), "pending_comparison");
  assert.equal(recommendationEmptyState(base), "no_complete_look");
  assert.equal(recommendationEmptyState({ ...base, completeLookCount: 1, pending: 1 }), "ready");
});
