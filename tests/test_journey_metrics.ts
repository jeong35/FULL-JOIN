import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  analyzeJourneys,
  type JourneyOptions,
} from "../src/fulljoin/journey_metrics.ts";
import type { AnalyticsEventRow } from "../src/fulljoin/admin_metrics.ts";

const range = { from: "2026-11-01T15:00:00.000Z", to: "2026-11-08T15:00:00.000Z" };
const defaultOptions: JourneyOptions = {
  unit: "user",
  startKey: "app_open",
  depth: 4,
  minimumCount: 1,
  includeTests: false,
  platform: null,
  appVersion: null,
  analyticsVersion: null,
  cohort: "all",
};

function event(
  userId: string | null,
  name: string,
  at: string,
  overrides: Partial<AnalyticsEventRow> = {},
): AnalyticsEventRow {
  return {
    received_at: at,
    client_ts: at,
    device_id: `device-${userId ?? "anon"}`,
    session_id: `session-${userId ?? "anon"}`,
    platform: "web",
    user_id: userId,
    name,
    props: { app_version: "1.0.0", analytics_version: "journey-v1" },
    ...overrides,
  };
}

describe("journey metrics", () => {
  it("builds ordered Sankey links, retains repeated screens, and marks dead ends", () => {
    const events = [
      event("user-a", "app_open", "2026-11-02T00:00:00.000Z"),
      event("user-a", "screen_view", "2026-11-02T00:00:01.000Z", { props: { screen: "feed" } }),
      event("user-a", "screen_view", "2026-11-02T00:00:02.000Z", { props: { screen: "feed" } }),
      event("user-a", "photo_open", "2026-11-02T00:00:03.000Z"),
      event("user-b", "app_open", "2026-11-02T01:00:00.000Z"),
      event("user-b", "screen_view", "2026-11-02T01:00:01.000Z", { props: { screen: "wardrobe" } }),
    ];
    const result = analyzeJourneys(events, [], range, defaultOptions);

    assert.ok(result.journey.links.some((link) => link.source === "0:app_open" && link.target === "1:screen:feed"));
    assert.ok(result.journey.links.some((link) => link.source === "1:screen:feed" && link.target === "2:screen:feed"));
    assert.ok(result.journey.nodes.some((node) => node.key === "__end__"));
    assert.equal(result.journey.nodes.find((node) => node.id === "0:app_open")?.users, 2);
    assert.equal(result.journey.links.filter((link) => link.source === "0:app_open").reduce((sum, link) => sum + link.users, 0), 2);
  });

  it("sorts out-of-order input, applies timestamp tie-breaks, and enforces sequential funnels", () => {
    const events = [
      event("user-a", "taste_done", "2026-11-02T00:00:01.000Z"),
      event("user-b", "taste_done", "2026-11-02T00:00:00.000Z"),
      event("user-a", "login_success", "2026-11-02T00:00:00.000Z"),
      event("user-b", "login_success", "2026-11-02T00:00:01.000Z"),
      event("user-a", "wardrobe_add_done", "2026-11-02T00:00:02.000Z"),
    ];
    const result = analyzeJourneys(events, [], range, { ...defaultOptions, startKey: null });
    const core = result.sequential_funnels.find((funnel) => funnel.key === "core")!;

    assert.deepEqual(core.stages.slice(0, 3).map((stage) => stage.users), [2, 1, 1]);
    assert.equal(core.stages[1]?.conversion_from_previous_pct, 50);
    assert.equal(core.stages[1]?.not_reached_from_previous, 1);
  });

  it("deduplicates client event ids and splits a reused session after 30 minutes", () => {
    const first = event("user-a", "app_open", "2026-11-02T00:00:00.000Z", {
      props: { client_event_id: "event-12345678" },
    });
    const events = [
      first,
      { ...first, received_at: "2026-11-02T00:00:00.500Z" },
      event("user-a", "app_open", "2026-11-02T00:31:00.000Z"),
    ];
    const result = analyzeJourneys(events, [], range, { ...defaultOptions, unit: "session", depth: 1 });

    assert.equal(result.selected_event_count, 2);
    assert.equal(result.selected_session_count, 2);
    assert.equal(result.journey.nodes.find((node) => node.id === "0:app_open")?.sessions, 2);
  });

  it("uses received_at for invalid client clocks and gives deterministic same-time ordering", () => {
    const events = [
      event("user-a", "photo_open", "2026-11-02T00:00:02.000Z", { client_ts: "2030-01-01T00:00:00.000Z" }),
      event("user-a", "app_open", "2026-11-02T00:00:00.000Z", { client_ts: "2026-11-02T00:00:01.000Z" }),
      event("user-a", "screen_view", "2026-11-02T00:00:01.000Z", { client_ts: "2026-11-02T00:00:01.000Z", props: { screen: "feed" } }),
    ];
    const result = analyzeJourneys(events, [], range, { ...defaultOptions, depth: 2 });

    assert.equal(result.ordering.invalid_client_clock_events, 1);
    assert.ok(result.journey.links.some((link) => link.target === "1:screen:feed"));
    assert.ok(result.journey.links.some((link) => link.target === "2:photo_open"));
  });

  it("excludes test traffic and the exclusive range boundary", () => {
    const events = [
      event("user-a", "app_open", range.from),
      event("smoke-bot", "app_open", "2026-11-02T00:00:00.000Z", { props: { is_test: true } }),
      event("user-c", "app_open", range.to),
    ];
    const result = analyzeJourneys(events, [], range, defaultOptions);

    assert.equal(result.selected_event_count, 1);
    assert.equal(result.selected_user_count, 1);
    assert.equal(result.excluded_test_event_count, 1);
  });

  it("returns N/A-compatible null rates for empty periods and aggregates rare paths as other", () => {
    const empty = analyzeJourneys([], [], range, defaultOptions);
    assert.equal(empty.overview.activation_rate_pct, null);
    assert.equal(empty.retention.d1.rate_pct, null);
    assert.deepEqual(empty.journey.nodes, []);

    const events = [
      event("user-a", "app_open", "2026-11-02T00:00:00.000Z"),
      event("user-a", "photo_open", "2026-11-02T00:00:01.000Z"),
      event("user-b", "app_open", "2026-11-02T01:00:00.000Z"),
      event("user-b", "screen_view", "2026-11-02T01:00:01.000Z", { props: { screen: "wardrobe" } }),
    ];
    const grouped = analyzeJourneys(events, [], range, { ...defaultOptions, depth: 1, minimumCount: 2 });
    assert.ok(grouped.journey.nodes.some((node) => node.key === "__other__"));
    assert.equal(grouped.journey.links.length, 1);
    assert.equal(grouped.journey.links[0]?.value, 2);
  });

  it("computes overview activation and matured D1 retention without inventing a denominator", () => {
    const events = [
      event("user-a", "login_success", "2026-11-02T00:00:00.000Z"),
      event("user-a", "photo_save_done", "2026-11-02T00:01:00.000Z"),
      event("user-a", "result_view", "2026-11-02T00:02:00.000Z"),
      event("user-a", "app_open", "2026-11-03T00:00:00.000Z"),
      event("user-b", "login_success", "2026-11-08T00:00:00.000Z"),
    ];
    const wardrobe = Array.from({ length: 5 }, () => ({ user_id: "user-a" }));
    const result = analyzeJourneys(events, wardrobe, range, { ...defaultOptions, startKey: null });

    assert.equal(result.overview.activation_users, 1);
    assert.equal(result.retention.d1.eligible_users, 1);
    assert.equal(result.retention.d1.retained_users, 1);
    assert.equal(result.retention.d7.eligible_users, 0);
    assert.equal(result.retention.d7.rate_pct, null);
  });
});
