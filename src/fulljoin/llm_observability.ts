import { z } from "zod";

export type LlmFeature = "style_tagging" | "chat" | "wardrobe_photo_tagging" | "image_enhancement";
export type LlmResponseMode = "llm" | "grounded" | "fallback";
export type LlmOperationStatus = "success" | "failure" | "fallback" | "grounded";
export type LlmErrorType =
  | "configuration"
  | "timeout"
  | "http_error"
  | "refusal"
  | "invalid_output"
  | "unknown";

export type LlmTokenUsage = {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
};

export type LlmOperationMetric = {
  feature: LlmFeature;
  response_mode: LlmResponseMode;
  llm_called: boolean;
  model: string | null;
  prompt_version: string;
  release_git_sha: string | null;
  status: LlmOperationStatus;
  error_type: LlmErrorType | null;
  http_status: number | null;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  pricing_version: string | null;
  estimated_cost_usd: number | null;
  latency_ms: number;
  fallback_used: boolean;
  fallback_reason: string | null;
};

const usageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  input_tokens_details: z.object({
    cached_tokens: z.number().int().nonnegative().optional(),
  }).passthrough().optional(),
}).passthrough();

type ModelPrice = {
  version: string;
  input_per_million_usd: number;
  cached_input_per_million_usd: number;
  output_per_million_usd: number;
};

// 호출 당시 단가를 코드 버전과 함께 고정한다. 알 수 없는 모델은 비용을 추정하지 않는다.
const MODEL_PRICES = new Map<string, ModelPrice>([
  ["gpt-4.1-mini-2025-04-14", {
    version: "openai-2026-11-20",
    input_per_million_usd: 0.4,
    cached_input_per_million_usd: 0.1,
    output_per_million_usd: 1.6,
  }],
  ["gpt-4.1-mini", {
    version: "openai-2026-11-20",
    input_per_million_usd: 0.4,
    cached_input_per_million_usd: 0.1,
    output_per_million_usd: 1.6,
  }],
]);

export function parseLlmUsage(payload: unknown): LlmTokenUsage | null {
  if (typeof payload !== "object" || payload === null || !("usage" in payload)) return null;
  const parsed = usageSchema.safeParse(payload.usage);
  if (!parsed.success) return null;
  return {
    input_tokens: parsed.data.input_tokens,
    cached_input_tokens: Math.min(
      parsed.data.input_tokens_details?.cached_tokens ?? 0,
      parsed.data.input_tokens,
    ),
    output_tokens: parsed.data.output_tokens,
  };
}

export function estimateLlmCost(
  model: string,
  usage: LlmTokenUsage,
): { pricing_version: string; estimated_cost_usd: number } | null {
  const price = MODEL_PRICES.get(model);
  if (price === undefined) return null;
  const uncachedInput = Math.max(0, usage.input_tokens - usage.cached_input_tokens);
  const estimatedCost = (
    uncachedInput * price.input_per_million_usd +
    usage.cached_input_tokens * price.cached_input_per_million_usd +
    usage.output_tokens * price.output_per_million_usd
  ) / 1_000_000;
  return {
    pricing_version: price.version,
    estimated_cost_usd: Number(estimatedCost.toFixed(8)),
  };
}

export class LlmOperationError extends Error {
  readonly errorType: LlmErrorType;
  readonly httpStatus: number | null;

  constructor(errorType: LlmErrorType, message: string, httpStatus: number | null = null) {
    super(message);
    this.name = "LlmOperationError";
    this.errorType = errorType;
    this.httpStatus = httpStatus;
  }
}

export function classifyLlmError(error: unknown): { error_type: LlmErrorType; http_status: number | null } {
  if (error instanceof LlmOperationError) {
    return { error_type: error.errorType, http_status: error.httpStatus };
  }
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return { error_type: "timeout", http_status: null };
  }
  return { error_type: "unknown", http_status: null };
}

export function buildLlmOperationMetric(input: {
  feature: LlmFeature;
  response_mode: LlmResponseMode;
  model?: string | null;
  prompt_version: string;
  release_git_sha?: string | null;
  status: LlmOperationStatus;
  error?: unknown;
  usage?: LlmTokenUsage | null;
  latency_ms: number;
  fallback_reason?: string | null;
}): LlmOperationMetric {
  const usage = input.usage ?? { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 };
  const model = input.model ?? null;
  const cost = model === null ? null : estimateLlmCost(model, usage);
  const classified = input.error === undefined
    ? { error_type: null, http_status: null }
    : classifyLlmError(input.error);
  const llmCalled = input.response_mode !== "grounded" && classified.error_type !== "configuration";
  return {
    feature: input.feature,
    response_mode: input.response_mode,
    llm_called: llmCalled,
    model,
    prompt_version: input.prompt_version,
    release_git_sha: input.release_git_sha ?? null,
    status: input.status,
    error_type: classified.error_type,
    http_status: classified.http_status,
    input_tokens: usage.input_tokens,
    cached_input_tokens: usage.cached_input_tokens,
    output_tokens: usage.output_tokens,
    pricing_version: cost?.pricing_version ?? null,
    estimated_cost_usd: cost?.estimated_cost_usd ?? null,
    latency_ms: Math.max(0, Math.round(input.latency_ms)),
    fallback_used: input.response_mode === "fallback",
    fallback_reason: input.fallback_reason ?? null,
  };
}

function percentile(values: readonly number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))] ?? 0;
}

export function summarizeLlmOperations(records: readonly LlmOperationMetric[]) {
  const total = records.length;
  const chatRecords = records.filter((record) => record.feature === "chat");
  const successfulCalls = records.filter((record) => record.llm_called && record.status === "success").length;
  const failedCalls = records.filter((record) => record.llm_called && record.status !== "success").length;
  return {
    total_operations: total,
    llm_calls: records.filter((record) => record.llm_called).length,
    successful_calls: successfulCalls,
    failed_calls: failedCalls,
    fallback_count: records.filter((record) => record.fallback_used).length,
    grounded_chat_ratio: chatRecords.length === 0
      ? 0
      : chatRecords.filter((record) => record.response_mode === "grounded").length / chatRecords.length,
    total_input_tokens: records.reduce((sum, record) => sum + record.input_tokens, 0),
    total_output_tokens: records.reduce((sum, record) => sum + record.output_tokens, 0),
    estimated_cost_usd: Number(records.reduce(
      (sum, record) => sum + (record.estimated_cost_usd ?? 0),
      0,
    ).toFixed(8)),
    average_latency_ms: total === 0
      ? 0
      : Math.round(records.reduce((sum, record) => sum + record.latency_ms, 0) / total),
    p95_latency_ms: percentile(records.map((record) => record.latency_ms), 95),
  };
}
