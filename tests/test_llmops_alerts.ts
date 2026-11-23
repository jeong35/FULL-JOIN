import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateLlmOpsAlerts,
  llmOpsAlertThresholdsFromEnvironment,
} from "../src/fulljoin/llmops_alerts.ts";

test("LLMOps alerts wait for a minimum sample before rate and latency warnings", () => {
  const alerts = evaluateLlmOpsAlerts({
    summary: { llm_calls: 3, failure_rate_pct: 100, fallback_rate_pct: 100, p95_latency_ms: 50_000 },
    daily: [{ day: "2026-11-23", estimated_cost_usd: 0.02 }],
  });
  assert.deepEqual(alerts, []);
});

test("LLMOps alerts report only threshold breaches without retaining operation content", () => {
  const alerts = evaluateLlmOpsAlerts({
    summary: { llm_calls: 20, failure_rate_pct: 10, fallback_rate_pct: 25, p95_latency_ms: 20_000 },
    daily: [{ day: "2026-11-23", estimated_cost_usd: 7 }],
  });
  assert.deepEqual(alerts.map((alert) => alert.code), [
    "failure_rate", "fallback_rate", "p95_latency", "daily_cost",
  ]);
  assert.equal(JSON.stringify(alerts).includes("prompt"), false);
  assert.equal(JSON.stringify(alerts).includes("user"), false);
});

test("LLMOps alert environment is validated and supports explicit experimental thresholds", () => {
  assert.deepEqual(llmOpsAlertThresholdsFromEnvironment({
    LLMOPS_ALERT_MINIMUM_CALLS: "50",
    LLMOPS_ALERT_FAILURE_RATE_PCT: "3",
    LLMOPS_ALERT_FALLBACK_RATE_PCT: "8",
    LLMOPS_ALERT_P95_LATENCY_MS: "12000",
    LLMOPS_ALERT_DAILY_COST_USD: "2.5",
  }), {
    minimum_llm_calls: 50,
    failure_rate_pct: 3,
    fallback_rate_pct: 8,
    p95_latency_ms: 12_000,
    daily_cost_usd: 2.5,
  });
});
