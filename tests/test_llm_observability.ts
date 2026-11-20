import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLlmOperationMetric,
  estimateLlmCost,
  LlmOperationError,
  parseLlmUsage,
  summarizeLlmOperations,
} from "../src/fulljoin/llm_observability.ts";

test("Responses API usage is parsed without retaining request or response content", () => {
  assert.deepEqual(parseLlmUsage({
    usage: {
      input_tokens: 1_000,
      output_tokens: 100,
      input_tokens_details: { cached_tokens: 400 },
    },
    output: [{ text: "민감한 답변 원문" }],
  }), { input_tokens: 1_000, cached_input_tokens: 400, output_tokens: 100 });
});

test("known model cost separates cached input from uncached input", () => {
  assert.deepEqual(estimateLlmCost("gpt-4.1-mini-2025-04-14", {
    input_tokens: 1_000_000,
    cached_input_tokens: 250_000,
    output_tokens: 500_000,
  }), {
    pricing_version: "openai-2026-11-20",
    estimated_cost_usd: 1.125,
  });
  assert.equal(estimateLlmCost("unknown-model", {
    input_tokens: 1,
    cached_input_tokens: 0,
    output_tokens: 1,
  }), null);
});

test("grounded chat operation records no model, token, or cost", () => {
  const metric = buildLlmOperationMetric({
    feature: "chat",
    response_mode: "grounded",
    prompt_version: "chat-v2",
    status: "grounded",
    latency_ms: 12.4,
  });
  assert.equal(metric.llm_called, false);
  assert.equal(metric.model, null);
  assert.equal(metric.estimated_cost_usd, null);
  assert.equal(metric.latency_ms, 12);
});

test("fallback stores only allowlisted error classification", () => {
  const metric = buildLlmOperationMetric({
    feature: "chat",
    response_mode: "fallback",
    model: "gpt-4.1-mini-2025-04-14",
    prompt_version: "chat-v2",
    status: "fallback",
    error: new LlmOperationError("http_error", "sensitive upstream body", 429),
    latency_ms: 300,
    fallback_reason: "model_unavailable",
  });
  assert.equal(metric.error_type, "http_error");
  assert.equal(metric.http_status, 429);
  assert.equal(metric.fallback_reason, "model_unavailable");
  assert.ok(!Object.values(metric).includes("sensitive upstream body"));
});

test("configuration failure is not counted as an external model call", () => {
  const metric = buildLlmOperationMetric({
    feature: "chat",
    response_mode: "fallback",
    model: "gpt-4.1-mini-2025-04-14",
    prompt_version: "chat-v2",
    status: "fallback",
    error: new LlmOperationError("configuration", "missing secret"),
    latency_ms: 1,
    fallback_reason: "configuration",
  });
  assert.equal(metric.llm_called, false);
  assert.equal(metric.error_type, "configuration");
});

test("summary reports grounded ratio, fallback, cost, average, and p95", () => {
  const grounded = buildLlmOperationMetric({
    feature: "chat",
    response_mode: "grounded",
    prompt_version: "chat-v2",
    status: "grounded",
    latency_ms: 10,
  });
  const llm = buildLlmOperationMetric({
    feature: "chat",
    response_mode: "llm",
    model: "gpt-4.1-mini-2025-04-14",
    prompt_version: "chat-v2",
    status: "success",
    usage: { input_tokens: 1_000, cached_input_tokens: 0, output_tokens: 100 },
    latency_ms: 100,
  });
  const fallback = buildLlmOperationMetric({
    feature: "chat",
    response_mode: "fallback",
    model: "gpt-4.1-mini-2025-04-14",
    prompt_version: "chat-v2",
    status: "fallback",
    latency_ms: 1_000,
    fallback_reason: "model_unavailable",
  });
  const summary = summarizeLlmOperations([grounded, llm, fallback]);
  assert.equal(summary.llm_calls, 2);
  assert.equal(summary.successful_calls, 1);
  assert.equal(summary.failed_calls, 1);
  assert.equal(summary.fallback_count, 1);
  assert.equal(summary.grounded_chat_ratio, 1 / 3);
  assert.equal(summary.average_latency_ms, 370);
  assert.equal(summary.p95_latency_ms, 1_000);
  assert.ok(summary.estimated_cost_usd > 0);
});
