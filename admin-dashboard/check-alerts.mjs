import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { summarizeLlmOps } from "../src/fulljoin/admin_metrics.ts";
import { evaluateLlmOpsAlerts, llmOpsAlertThresholdsFromEnvironment } from "../src/fulljoin/llmops_alerts.ts";

const environmentSchema = z.object({
  SUPABASE_URL: z.string().url().startsWith("https://"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  DASHBOARD_ALLOW_REMOTE_READONLY: z.literal("true"),
  LLMOPS_ALERT_WINDOW_HOURS: z.coerce.number().int().min(1).max(24 * 31).default(24),
  LLMOPS_ALERT_WEBHOOK_URL: z.string().url().startsWith("https://").optional(),
  LLMOPS_ALERT_WEBHOOK_BEARER: z.string().min(1).optional(),
});

const environment = environmentSchema.parse(process.env);
const to = new Date();
const from = new Date(to.getTime() - environment.LLMOPS_ALERT_WINDOW_HOURS * 60 * 60 * 1_000);
const range = { from: from.toISOString(), to: to.toISOString() };
const db = createClient(environment.SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const rows = [];
for (let offset = 0; ; offset += 1_000) {
  const { data, error } = await db.from("llm_operation_metrics")
    .select("feature,response_mode,llm_called,model,prompt_version,release_git_sha,status,error_type,input_tokens,cached_input_tokens,output_tokens,estimated_cost_usd,latency_ms,fallback_used,fallback_reason,created_at")
    .gte("created_at", range.from)
    .lt("created_at", range.to)
    .order("created_at", { ascending: true })
    .range(offset, offset + 999);
  if (error !== null) throw new Error(`LLMOps metric query failed: ${error.code ?? "db_error"}`);
  rows.push(...(data ?? []));
  if ((data?.length ?? 0) < 1_000) break;
}

const llmops = summarizeLlmOps(rows.map((row) => ({
  ...row,
  estimated_cost_usd: row.estimated_cost_usd === null ? null : Number(row.estimated_cost_usd),
})), range);
const alerts = evaluateLlmOpsAlerts(llmops, llmOpsAlertThresholdsFromEnvironment(process.env));
const result = {
  checked_at: to.toISOString(),
  window_hours: environment.LLMOPS_ALERT_WINDOW_HOURS,
  operations: llmops.summary.operations,
  llm_calls: llmops.summary.llm_calls,
  alerts,
};

if (environment.LLMOPS_ALERT_WEBHOOK_URL !== undefined && alerts.length > 0) {
  const response = await fetch(environment.LLMOPS_ALERT_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(environment.LLMOPS_ALERT_WEBHOOK_BEARER === undefined
        ? {}
        : { authorization: `Bearer ${environment.LLMOPS_ALERT_WEBHOOK_BEARER}` }),
    },
    body: JSON.stringify({ service: "odit", type: "llmops_alert", ...result }),
  });
  if (!response.ok) throw new Error(`LLMOps alert webhook failed: HTTP ${response.status}`);
}

console.log(JSON.stringify(result, null, 2));
if (alerts.length > 0) process.exitCode = 2;
