import { execFileSync } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { summarizeLlmOps, summarizeProductAnalytics } from "../src/fulljoin/admin_metrics.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const PORT = Number(process.env.DASHBOARD_PORT ?? "4173");
const HOST = "127.0.0.1";

function localSupabaseEnvironment() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { url: process.env.SUPABASE_URL, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY };
  }
  const output = execFileSync(join(ROOT, "node_modules/.bin/supabase"), ["status", "-o", "env"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const values = new Map([...output.matchAll(/^([A-Z_]+)="([^"]*)"$/gmu)].map((match) => [match[1], match[2]]));
  return { url: values.get("API_URL"), serviceRoleKey: values.get("SERVICE_ROLE_KEY") };
}

const environment = localSupabaseEnvironment();
if (!environment.url || !environment.serviceRoleKey) throw new Error("로컬 Supabase URL과 service role 키를 찾지 못했습니다.");
const supabaseUrl = new URL(environment.url);
if (!["127.0.0.1", "localhost"].includes(supabaseUrl.hostname)) {
  throw new Error("관리자 대시보드는 로컬 Supabase에만 연결할 수 있습니다.");
}
const db = createClient(environment.url, environment.serviceRoleKey, { auth: { persistSession: false } });

async function paged(table, select, configure = (query) => query) {
  const rows = [];
  for (let from = 0; ; from += 1_000) {
    const query = configure(db.from(table).select(select)).range(from, from + 999);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1_000) return rows;
  }
}

function validRange(url) {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(from) >= Date.parse(to)) {
    return null;
  }
  const maximumDays = 366;
  if (Date.parse(to) - Date.parse(from) > maximumDays * 24 * 60 * 60 * 1_000) return null;
  return { from, to };
}

async function dashboardPayload(range) {
  const [events, wardrobe, llmOperations] = await Promise.all([
    paged(
      "user_events",
      "received_at,client_ts,device_id,session_id,platform,user_id,name,props",
      (query) => query.lt("received_at", range.to).order("received_at", { ascending: true }),
    ),
    paged("wardrobe_items", "user_id"),
    paged(
      "llm_operation_metrics",
      "feature,response_mode,llm_called,model,prompt_version,release_git_sha,status,error_type,input_tokens,cached_input_tokens,output_tokens,estimated_cost_usd,latency_ms,fallback_used,fallback_reason,created_at",
      (query) => query.gte("created_at", range.from).lt("created_at", range.to).order("created_at", { ascending: true }),
    ),
  ]);
  return {
    generated_at: new Date().toISOString(),
    data_source: "local_supabase_only",
    product: summarizeProductAnalytics(events, wardrobe, range),
    llmops: summarizeLlmOps(llmOperations.map((row) => ({
      ...row,
      estimated_cost_usd: row.estimated_cost_usd === null ? null : Number(row.estimated_cost_usd),
    })), range),
  };
}

const types = new Map([
  [".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"], [".svg", "image/svg+xml"],
]);

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);
    if (url.pathname === "/api/dashboard") {
      const range = validRange(url);
      if (!range) return sendJson(response, 400, { error: "from/to 기간은 최대 366일의 유효한 ISO 시각이어야 합니다." });
      return sendJson(response, 200, await dashboardPayload(range));
    }
    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = normalize(join(PUBLIC_DIR, requested));
    if (!file.startsWith(PUBLIC_DIR) || !existsSync(file)) return sendJson(response, 404, { error: "not_found" });
    response.writeHead(200, { "content-type": types.get(extname(file)) ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(response);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "dashboard_error");
    sendJson(response, 500, { error: "로컬 지표를 불러오지 못했습니다." });
  }
}).listen(PORT, HOST, () => {
  console.log(`ODIT local admin dashboard: http://${HOST}:${PORT}`);
  console.log("Connected only to local Supabase; service role key remains in this server process.");
});
