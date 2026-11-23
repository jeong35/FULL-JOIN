import { z } from "zod";

export type LlmOpsAlertThresholds = {
  minimum_llm_calls: number;
  failure_rate_pct: number;
  fallback_rate_pct: number;
  p95_latency_ms: number;
  daily_cost_usd: number;
};

export type LlmOpsAlert = {
  code: "failure_rate" | "fallback_rate" | "p95_latency" | "daily_cost";
  severity: "warning" | "critical";
  value: number;
  threshold: number;
  message: string;
};

const thresholdsSchema = z.object({
  minimum_llm_calls: z.coerce.number().int().min(1).max(1_000_000).default(10),
  failure_rate_pct: z.coerce.number().min(0).max(100).default(5),
  fallback_rate_pct: z.coerce.number().min(0).max(100).default(10),
  p95_latency_ms: z.coerce.number().int().positive().max(300_000).default(15_000),
  daily_cost_usd: z.coerce.number().nonnegative().max(100_000).default(5),
});

export const DEFAULT_LLMOPS_ALERT_THRESHOLDS: LlmOpsAlertThresholds = thresholdsSchema.parse({});

export function llmOpsAlertThresholdsFromEnvironment(
  environment: Record<string, string | undefined>,
): LlmOpsAlertThresholds {
  return thresholdsSchema.parse({
    minimum_llm_calls: environment.LLMOPS_ALERT_MINIMUM_CALLS,
    failure_rate_pct: environment.LLMOPS_ALERT_FAILURE_RATE_PCT,
    fallback_rate_pct: environment.LLMOPS_ALERT_FALLBACK_RATE_PCT,
    p95_latency_ms: environment.LLMOPS_ALERT_P95_LATENCY_MS,
    daily_cost_usd: environment.LLMOPS_ALERT_DAILY_COST_USD,
  });
}

type LlmOpsAlertInput = {
  summary: {
    llm_calls: number;
    failure_rate_pct: number | null;
    fallback_rate_pct: number | null;
    p95_latency_ms: number | null;
  };
  daily: readonly { day: string; estimated_cost_usd: number }[];
};

export function evaluateLlmOpsAlerts(
  llmops: LlmOpsAlertInput,
  thresholds: LlmOpsAlertThresholds = DEFAULT_LLMOPS_ALERT_THRESHOLDS,
): LlmOpsAlert[] {
  const alerts: LlmOpsAlert[] = [];
  const enoughCalls = llmops.summary.llm_calls >= thresholds.minimum_llm_calls;

  if (enoughCalls && (llmops.summary.failure_rate_pct ?? 0) > thresholds.failure_rate_pct) {
    alerts.push({
      code: "failure_rate",
      severity: "critical",
      value: llmops.summary.failure_rate_pct ?? 0,
      threshold: thresholds.failure_rate_pct,
      message: "LLM 호출 실패율이 실험용 경고 기준을 넘었습니다.",
    });
  }
  if (enoughCalls && (llmops.summary.fallback_rate_pct ?? 0) > thresholds.fallback_rate_pct) {
    alerts.push({
      code: "fallback_rate",
      severity: "warning",
      value: llmops.summary.fallback_rate_pct ?? 0,
      threshold: thresholds.fallback_rate_pct,
      message: "fallback 비율이 실험용 경고 기준을 넘었습니다.",
    });
  }
  if (enoughCalls && (llmops.summary.p95_latency_ms ?? 0) > thresholds.p95_latency_ms) {
    alerts.push({
      code: "p95_latency",
      severity: "warning",
      value: llmops.summary.p95_latency_ms ?? 0,
      threshold: thresholds.p95_latency_ms,
      message: "LLM operation p95 지연이 실험용 경고 기준을 넘었습니다.",
    });
  }

  const highestDailyCost = Math.max(0, ...llmops.daily.map((row) => row.estimated_cost_usd));
  if (highestDailyCost > thresholds.daily_cost_usd) {
    alerts.push({
      code: "daily_cost",
      severity: "warning",
      value: highestDailyCost,
      threshold: thresholds.daily_cost_usd,
      message: "하루 예상 LLM 비용이 실험용 경고 기준을 넘었습니다.",
    });
  }
  return alerts;
}
