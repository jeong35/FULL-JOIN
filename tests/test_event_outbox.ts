import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  acknowledgeOutbox,
  compactOutbox,
  markOutboxFailed,
  retryDelayMs,
} from "../mobile/src/data/eventOutboxCore.ts";

const now = Date.parse("2026-11-25T00:00:00.000Z");
const record = (id: string, ageMs = 0, attempts = 0) => ({ event_id: id, enqueued_at: now - ageMs, attempts, payload: id });

describe("analytics event outbox", () => {
  it("keeps a bounded, TTL-limited, deduplicated persistent queue", () => {
    const result = compactOutbox([
      record("event-a"), record("event-a", 10), record("expired", 8 * 24 * 60 * 60 * 1_000),
      record("event-b", 20), record("event-c", 30),
    ], now, 2, 7 * 24 * 60 * 60 * 1_000);
    assert.deepEqual(result.map((item) => item.event_id), ["event-b", "event-a"]);
  });

  it("removes only acknowledged events and retries only failed events", () => {
    const queue = [record("event-a"), record("event-b")];
    assert.deepEqual(acknowledgeOutbox(queue, new Set(["event-a"])).map((item) => item.event_id), ["event-b"]);
    const failed = markOutboxFailed(queue, new Set(["event-b"]));
    assert.equal(failed[0]?.attempts, 0);
    assert.equal(failed[1]?.attempts, 1);
  });

  it("uses capped exponential backoff", () => {
    assert.equal(retryDelayMs(0), 2_000);
    assert.equal(retryDelayMs(3), 16_000);
    assert.equal(retryDelayMs(10), 60_000);
  });
});
