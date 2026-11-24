import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appendUniqueBatchValues,
  canAddBatchItem,
  findRecoveredBatchValue,
  removeBatchValue,
  savePhotoBatch,
  type BatchSaveState,
} from "../mobile/src/data/photoBatchCore.ts";

type Item = BatchSaveState & { value: string };

function item(id: string, status: Item["saveStatus"] = "pending"): Item {
  return { id, value: id, saveStatus: status, savedWardrobeId: status === "saved" ? `wardrobe-${id}` : null, saveError: null };
}

describe("photo batch save", () => {
  it("adds unique photos within the cap and never removes the last photo", () => {
    assert.deepEqual(appendUniqueBatchValues(["a"], ["a", "b", "c", "d"], (value) => value, 3), ["a", "b", "c"]);
    assert.deepEqual(removeBatchValue(["a", "b", "c"], 1), ["a", "c"]);
    assert.deepEqual(removeBatchValue(["a"], 0), ["a"]);
    assert.equal(canAddBatchItem(11, 3, 12, 4), true);
    assert.equal(canAddBatchItem(12, 3, 12, 4), false);
    assert.equal(canAddBatchItem(8, 4, 12, 4), false);
    assert.deepEqual(
      findRecoveredBatchValue([{ id: "old", value: 1 }, { id: "new", value: 2 }], new Set(["old"]), (value) => value.value === 2),
      { id: "new", value: 2 },
    );
  });

  it("skips successful items and keeps partial failures retryable", async () => {
    const created: string[] = [];
    const first = await savePhotoBatch([item("done", "saved"), item("ok"), item("fail")], {
      create: async (entry) => {
        created.push(entry.id);
        if (entry.id === "fail") throw new Error("network");
        return { id: `wardrobe-${entry.id}` };
      },
      persistPhoto: () => true,
      rollback: async () => true,
      errorMessage: (error) => error instanceof Error ? error.message : "unknown",
    });
    assert.deepEqual(created, ["ok", "fail"]);
    assert.equal(first.items.find((entry) => entry.id === "done")?.saveStatus, "saved");
    assert.equal(first.items.find((entry) => entry.id === "ok")?.saveStatus, "saved");
    assert.equal(first.items.find((entry) => entry.id === "fail")?.saveStatus, "failed");

    created.length = 0;
    const retried = await savePhotoBatch(first.items, {
      create: async (entry) => { created.push(entry.id); return { id: `wardrobe-${entry.id}` }; },
      persistPhoto: () => true,
      rollback: async () => true,
      errorMessage: () => "failed",
    });
    assert.deepEqual(created, ["fail"]);
    assert.equal(retried.items.every((entry) => entry.saveStatus === "saved"), true);
  });

  it("rolls back when local photo persistence fails", async () => {
    const rolledBack: string[] = [];
    const result = await savePhotoBatch([item("photo")], {
      create: async () => ({ id: "wardrobe-photo" }),
      persistPhoto: () => false,
      rollback: async (id) => { rolledBack.push(id); return true; },
      errorMessage: () => "failed",
    });
    assert.deepEqual(rolledBack, ["wardrobe-photo"]);
    assert.equal(result.items[0]?.saveStatus, "failed");
    assert.equal(result.items[0]?.savedWardrobeId, null);
  });

  it("reuses the created id when rollback fails instead of creating a duplicate", async () => {
    let creates = 0;
    const first = await savePhotoBatch([item("photo")], {
      create: async () => { creates += 1; return { id: "wardrobe-photo" }; },
      persistPhoto: () => false,
      rollback: async () => false,
      errorMessage: () => "failed",
    });
    assert.equal(first.items[0]?.savedWardrobeId, "wardrobe-photo");

    const retried = await savePhotoBatch(first.items, {
      create: async () => { creates += 1; return { id: "duplicate" }; },
      persistPhoto: () => true,
      rollback: async () => false,
      errorMessage: () => "failed",
    });
    assert.equal(creates, 1);
    assert.equal(retried.items[0]?.saveStatus, "saved");
    assert.equal(retried.items[0]?.savedWardrobeId, "wardrobe-photo");
  });
});
