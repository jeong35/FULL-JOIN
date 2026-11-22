import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  summarizeLlmOps,
  summarizeProductAnalytics,
  type AnalyticsEventRow,
  type LlmMetricRow,
} from "../src/fulljoin/admin_metrics.ts";

const range = { from: "2026-11-01T15:00:00.000Z", to: "2026-11-08T15:00:00.000Z" };

function event(userId: string, name: string, day: number, props: Record<string, unknown> = {}): AnalyticsEventRow {
  return {
    received_at: `2026-11-0${day}T01:00:00.000Z`,
    client_ts: null,
    device_id: `device-${userId}`,
    session_id: `session-${userId}`,
    platform: "web",
    user_id: userId,
    name,
    props,
  };
}

describe("admin product metrics", () => {
  it("uses KST periods, distinct users, sequential funnel, and excludes test traffic", () => {
    const events = [
      event("user-a", "login_success", 2), event("user-a", "intro_view", 2), event("user-a", "intro_done", 2),
      event("user-a", "taste_done", 2), event("user-a", "wardrobe_add_done", 2),
      event("user-a", "photo_save_done", 3), event("user-a", "result_view", 3), event("user-a", "shop_link_click", 3),
      event("user-a", "chat_send", 3), event("user-a", "screen_leave", 3, { screen: "result", duration_ms: 12_000 }),
      event("user-b", "login_success", 3), event("user-b", "intro_view", 3),
      event("test-bot", "login_success", 3, { smoke_test: true }),
    ];
    const wardrobe = Array.from({ length: 5 }, () => ({ user_id: "user-a" }));
    const result = summarizeProductAnalytics(events, wardrobe, range);

    assert.equal(result.active_users, 2);
    assert.equal(result.new_users, 2);
    assert.equal(result.excluded_test_event_count, 1);
    assert.equal(result.wardrobe.new_user_five_item_rate_pct, 50);
    assert.equal(result.tutorial.completion_rate_pct, 50);
    assert.equal(result.activity.shopping_click_user_rate_pct, 100);
    assert.equal(result.activity.chatbot_user_rate_pct, 50);
    assert.equal(result.screen_duration[0]?.average_seconds, 12);
    assert.deepEqual(result.funnel.map((step) => step.users), [2, 1, 1, 1, 1, 1]);
    assert.deepEqual(result.dau.map((entry) => entry.users), [1, 2]);
  });

  it("returns null instead of invented percentages when no denominator exists", () => {
    const result = summarizeProductAnalytics([], [], range);
    assert.equal(result.wardrobe.average_items_per_active_user, null);
    assert.equal(result.wardrobe.new_user_five_item_rate_pct, null);
    assert.equal(result.tutorial.completion_rate_pct, null);
  });
});

function llm(overrides: Partial<LlmMetricRow>): LlmMetricRow {
  return {
    feature: "chat",
    response_mode: "llm",
    llm_called: true,
    model: "gpt-4.1-mini",
    prompt_version: "chat-v2",
    release_git_sha: "097d7b3",
    status: "success",
    error_type: null,
    input_tokens: 100,
    cached_input_tokens: 0,
    output_tokens: 25,
    estimated_cost_usd: 0.00008,
    latency_ms: 400,
    fallback_used: false,
    fallback_reason: null,
    created_at: "2026-11-03T01:00:00.000Z",
    ...overrides,
  };
}

describe("admin LLMOps metrics", () => {
  it("separates calls, grounded responses, fallback, costs, and future unit costs", () => {
    const result = summarizeLlmOps([
      llm({}),
      llm({ response_mode: "grounded", llm_called: false, model: null, status: "grounded", input_tokens: 0, output_tokens: 0, estimated_cost_usd: null, latency_ms: 20 }),
      llm({ response_mode: "fallback", status: "fallback", error_type: "timeout", fallback_used: true, fallback_reason: "timeout", estimated_cost_usd: 0, latency_ms: 1_000 }),
      llm({ feature: "image_enhancement", estimated_cost_usd: 0.02 }),
    ], range);

    assert.equal(result.summary.operations, 4);
    assert.equal(result.summary.llm_calls, 3);
    assert.equal(result.summary.success_rate_pct, 66.7);
    assert.equal(result.summary.fallback_rate_pct, 25);
    assert.equal(result.summary.grounded_chat_rate_pct, 33.3);
    assert.equal(result.summary.p95_latency_ms, 1_000);
    assert.equal(result.errors[0]?.error_type, "timeout");
    assert.equal(result.future_feature_unit_costs.find((entry) => entry.feature === "image_enhancement")?.average_cost_usd, 0.02);
    assert.equal(result.future_feature_unit_costs.find((entry) => entry.feature === "wardrobe_photo_tagging")?.status, "unavailable");
  });
});
