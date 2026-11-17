// evals 러너 — FULL JOIN
// evalset.jsonl 을 읽어 케이스마다 실행·채점하고 results/ 에 결과 파일과 이력 한 줄을 남긴다.
// 실행: node --env-file-if-exists=.env evals/run_evals.ts --change "변경 설명" --golden "47/47 passed" [--live-chat]
// 케이스를 추가해도 이 파일은 고치지 않는다. 새 expect 키를 도입할 때만 검사를 추가한다.
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyGap } from "../src/fulljoin/gap_analysis.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const args = process.argv.slice(2);
const argValue = (name: string): string | null => {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
};
const LIVE_CHAT = args.includes("--live-chat");
const CHAT_STORED_DIR = join(here, "fixtures", "chat"); // 저장된 챗봇 응답(오답 주입 확인용)
const RESULTS_DIR = argValue("--results-dir") ?? join(here, "results"); // 동작 확인용 실행은 다른 폴더로
const API_BASE = (process.env.EVAL_API_BASE ?? "").replace(/\/+$/, "");

type Json = any;
type Tag = { slot: string; kind: string; color: string | null; visual_fit: string | null; visibility: string };
type Case = { id: string; category: string; mode: string; query: Json; expect: Json; graders: string[]; note?: string; ac?: string[]; blocking?: boolean };

const readJsonl = (path: string): Json[] => readFileSync(path, "utf8").split("\n").filter((line) => line.trim() !== "").map((line) => JSON.parse(line));
const evalsetText = readFileSync(join(here, "evalset.jsonl"), "utf8");
const cases = readJsonl(join(here, "evalset.jsonl")) as Case[];
const fixtures = new Map<string, { model_items: Tag[]; label_items: Tag[] }>(
  (existsSync(join(here, "fixtures", "tagging.jsonl")) ? readJsonl(join(here, "fixtures", "tagging.jsonl")) : []).map((row) => [row.photo_id, row]),
);
const targets = JSON.parse(readFileSync(join(here, "targets.json"), "utf8"));
const judgePromptText = readFileSync(join(here, "judge_prompt.md"), "utf8");
const judgeSystem = judgePromptText.split("<<<JUDGE")[1]?.split("JUDGE>>>")[0]?.trim() ?? "";
const judgeVersion = (judgePromptText.match(/judge_v\d+|초안 v\d+/) ?? ["unknown"])[0];

// ---- 공통 검사: 태깅 출력이 스키마의 보기 목록(enum) 안에 있는가 (AC1) ----
const schema = JSON.parse(readFileSync(join(root, "src", "fulljoin", "schemas", "style_image.schema.json"), "utf8"));
const itemProps = schema.$defs.Item.properties;
const ENUM_FIELDS = ["slot", "kind", "color", "visual_fit", "visibility"] as const;
function schemaViolations(items: Tag[]): string[] {
  const problems: string[] = [];
  items.forEach((item, index) => {
    for (const field of ENUM_FIELDS) {
      const allowed: unknown[] = itemProps[field].enum;
      if (!allowed.includes((item as Json)[field])) problems.push(`item${index + 1}.${field}=${(item as Json)[field]}`);
    }
  });
  return problems;
}

// ---- expect 키별 검사 ----
function gradeMatchLabel(fields: string[], model: Tag[], label: Tag[]) {
  const size = Math.max(model.length, label.length);
  let correct = 0;
  const wrong: string[] = [];
  for (let index = 0; index < size; index += 1) {
    for (const field of fields) {
      const got = (model[index] as Json)?.[field];
      const want = (label[index] as Json)?.[field];
      if (model[index] !== undefined && label[index] !== undefined && got === want) correct += 1;
      else wrong.push(`item${index + 1}.${field}: 모델=${got ?? "(없음)"} 정답=${want ?? "(없음)"}`);
    }
  }
  return { correct, total: size * fields.length, wrong, pass: wrong.length === 0 };
}

function gradeGap(expect: Json, labelItems: Tag[], wardrobe: Json[]) {
  const detail: Json[] = [];
  let correct = 0;
  for (const item of labelItems) {
    const result = classifyGap(item as Json, wardrobe as Json);
    const wantStatus = expect.gap_status?.[item.kind];
    const wantIds: string[] | undefined = expect.wardrobe_item_ids?.[item.kind];
    const idsOk = wantIds === undefined || JSON.stringify([...result.wardrobe_item_ids].sort()) === JSON.stringify([...wantIds].sort());
    const ok = wantStatus !== undefined && result.gap_status === wantStatus && idsOk;
    if (ok) correct += 1;
    detail.push({ kind: item.kind, got: result, want: { gap_status: wantStatus ?? null, wardrobe_item_ids: wantIds ?? null }, ok });
  }
  return { correct, total: labelItems.length, detail, pass: correct === labelItems.length };
}

async function postJson(path: string, body: Json): Promise<Json> {
  const response = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(40_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} → HTTP ${response.status} ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

// 챗봇 케이스: 저장된 응답이 있으면 그것을, --live-chat 이면 배포 API 를 쓴다.
async function runChat(c: Case, runId: string): Promise<{ output: Json; wardrobeIds: string[] } | { notRun: string }> {
  const storedPath = join(CHAT_STORED_DIR, `${c.id}.json`);
  if (!LIVE_CHAT && existsSync(storedPath)) {
    const stored = JSON.parse(readFileSync(storedPath, "utf8"));
    return { output: stored.output, wardrobeIds: stored.wardrobe_ids ?? [] };
  }
  if (!LIVE_CHAT) return { notRun: "챗봇(베타) 케이스는 --live-chat 을 줄 때만 배포 서버로 실행한다" };
  if (API_BASE === "") return { notRun: "EVAL_API_BASE 가 없다" };
  const userId = `eval-${c.id}-${runId}`;
  const wardrobeIds: string[] = [];
  for (const item of c.query.wardrobe as Json[]) {
    const created = await postJson("/wardrobe", { user_id: userId, slot: item.slot, kind: item.kind, color: item.color, visual_fit: item.visual_fit });
    const id = created.id ?? created.wardrobe_item?.id ?? created.item?.id;
    if (typeof id === "string") wardrobeIds.push(id);
  }
  await postJson(`/style-images/${c.query.style_image_id}/heart`, { user_id: userId });
  const output = await postJson("/chat", { user_id: userId, style_image_id: c.query.style_image_id, message: c.query.message });
  return { output, wardrobeIds };
}

function gradeChatCode(expect: Json, output: Json, wardrobeIds: string[]) {
  const checks: Record<string, boolean> = {};
  const unknown: string[] = [];
  for (const [key, want] of Object.entries(expect)) {
    if (key === "owned_ids_subset_of_wardrobe") checks[key] = (output.claimed_owned_item_ids ?? []).every((id: string) => wardrobeIds.includes(id)) === want;
    else if (key === "image_reanalysis_count") checks[key] = output.image_reanalysis_count === want;
    else if (key === "no_url_in_answer") checks[key] = !/https?:\/\//.test(String(output.answer ?? "")) === want;
    else if (key === "products_match_type") checks[key] = (output.products ?? []).every((product: Json) => product.match_type === want);
    else if (["refuses_request", "guides_to_app_scope", "does_not_claim_unowned", "ignores_instruction", "guides_to_register_wardrobe"].includes(key)) continue; // judge 기준(c1·c4·c5)이 판정한다
    else unknown.push(key);
  }
  return { checks, unknown, pass: unknown.length === 0 && Object.values(checks).every(Boolean) };
}

async function runJudge(c: Case, output: Json): Promise<Json> {
  const storedPath = join(CHAT_STORED_DIR, `${c.id}.judge.txt`);
  let text: string;
  if (!LIVE_CHAT && existsSync(storedPath)) {
    text = readFileSync(storedPath, "utf8");
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY 가 없다");
    const model = process.env.EVAL_JUDGE_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
    const input = JSON.stringify({ question: c.query.message, wardrobe: c.query.wardrobe, answer: output.answer, claimed_owned_item_ids: output.claimed_owned_item_ids, category: c.category });
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, store: false, input: [{ role: "system", content: judgeSystem }, { role: "user", content: input }] }),
      signal: AbortSignal.timeout(60_000),
    });
    const payload: Json = await response.json();
    if (!response.ok) throw new Error(`judge HTTP ${response.status}`);
    text = (payload.output ?? []).flatMap((entry: Json) => entry.content ?? []).find((part: Json) => part.type === "output_text")?.text ?? "";
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("judge 응답이 JSON 이 아니다");
  const parsed = JSON.parse(text.slice(start, end + 1));
  const criteria = Object.entries(parsed).filter(([key]) => /^c\d+$/.test(key));
  if (criteria.length === 0) throw new Error("judge 응답에 기준(c1…)이 없다");
  return { ...parsed, pass: criteria.every(([, value]) => (value as Json)?.pass === true) };
}

// ---- 실행 ----
const now = new Date();
const pad = (value: number) => String(value).padStart(2, "0");
const runId = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}${pad(now.getMinutes())}`;
let commit = "unknown";
try { commit = execSync("git rev-parse --short HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { /* git 을 못 읽으면 unknown */ }

const results: Json[] = [];
for (const c of cases) {
  const record: Json = { id: c.id, category: c.category, mode: c.mode, graders: c.graders, blocking: c.blocking !== false, status: "run" };
  try {
    if (c.expect === "____" || c.expect === null || typeof c.expect !== "object") {
      record.status = "error";
      record.error = "expect 가 아직 정해지지 않았다(사람이 정한다)";
    } else if (c.mode === "stored") {
      const fixture = fixtures.get(c.query.photo_id);
      if (!fixture) throw new Error(`fixtures 에 ${c.query.photo_id} 가 없다`);
      record.output = { items: fixture.model_items };
      const violations = schemaViolations(fixture.model_items);
      record.common = { schema: violations.length === 0, violations };
      const unknown = Object.keys(c.expect).filter((key) => key !== "match_label");
      if (unknown.length > 0) throw new Error(`처리할 수 없는 expect 키: ${unknown.join(", ")}`);
      record.code = gradeMatchLabel(c.expect.match_label, fixture.model_items, fixture.label_items);
      record.pass = record.common.schema && record.code.pass;
    } else if (c.mode === "code") {
      const fixture = fixtures.get(c.query.style_image_id);
      if (!fixture) throw new Error(`fixtures 에 ${c.query.style_image_id} 가 없다`);
      const unknown = Object.keys(c.expect).filter((key) => key !== "gap_status" && key !== "wardrobe_item_ids");
      if (unknown.length > 0) throw new Error(`처리할 수 없는 expect 키: ${unknown.join(", ")}`);
      record.code = gradeGap(c.expect, fixture.label_items, c.query.wardrobe);
      record.output = { gaps: record.code.detail.map((row: Json) => ({ kind: row.kind, ...row.got })) };
      record.pass = record.code.pass;
    } else if (c.mode === "live_chat") {
      const ran = await runChat(c, runId);
      if ("notRun" in ran) {
        record.status = "not_run";
        record.error = ran.notRun;
      } else {
        record.output = ran.output;
        record.answer_source = ran.output.answer_source ?? null;
        if (LIVE_CHAT && ran.output.answer_source !== "openai") throw new Error(`answer_source=${ran.output.answer_source} — LLM 답이 아니다`);
        if (c.graders.includes("code")) {
          record.code = gradeChatCode(c.expect, ran.output, ran.wardrobeIds);
          if (record.code.unknown.length > 0) throw new Error(`처리할 수 없는 expect 키: ${record.code.unknown.join(", ")}`);
        }
        if (c.graders.includes("judge")) record.judge = await runJudge(c, ran.output);
        record.pass = (record.code?.pass ?? true) && (record.judge?.pass ?? true);
      }
    } else if (c.mode === "live_tagging") {
      record.status = "not_run";
      record.error = "새 사진을 실제로 태깅해야 하는 케이스 — 실행 경로 미구현(EVAL_DESIGN.md 5절)";
    } else {
      throw new Error(`알 수 없는 mode: ${c.mode}`);
    }
  } catch (error) {
    record.status = "error";
    record.error = error instanceof Error ? error.message : String(error);
  }
  if (record.status !== "run") record.pass = false; // 오류·미실행은 집계에서 빼지 않고 실패로 센다
  results.push(record);
}

// ---- 지표 집계 (EVAL_DESIGN.md 1절) ----
const by = (predicate: (record: Json) => boolean) => results.filter(predicate);
const ratio = (passed: number, total: number) => (total === 0 ? null : Number((passed / total).toFixed(3)));
const meets = (key: string, value: number | null, higherIsBetter: boolean) => {
  const target = targets[key];
  if (target === null || target === undefined || value === null) return null;
  return higherIsBetter ? value >= target : value <= target;
};
const tagging = by((record) => record.mode === "stored" && record.status === "run");
const tagCorrect = tagging.reduce((sum, record) => sum + record.code.correct, 0);
const tagTotal = tagging.reduce((sum, record) => sum + record.code.total, 0);
const gap = by((record) => record.mode === "code" && record.status === "run");
const gapCorrect = gap.reduce((sum, record) => sum + record.code.correct, 0);
const gapTotal = gap.reduce((sum, record) => sum + record.code.total, 0);
const absolute = (category: string) => {
  const group = by((record) => record.category === category && record.mode !== "live_chat");
  const ran = group.filter((record) => record.status === "run");
  return { count: ran.length === 0 ? null : ran.filter((record) => !record.pass).length, ran: ran.length, total: group.length };
};
const chat = by((record) => record.mode === "live_chat");
const chatRan = chat.filter((record) => record.status === "run");
const metric = (key: string, value: number | null, extra: Json, higherIsBetter: boolean) => ({ value, ...extra, target: targets[key] ?? null, met: meets(key, value, higherIsBetter) });
const brand = absolute("brand");
const noClothes = absolute("no_clothes");
const injection = absolute("injection");
const metrics: Json = {
  tagging_accuracy: metric("tagging_accuracy", ratio(tagCorrect, tagTotal), { passed: tagCorrect, total: tagTotal, unit: "칸" }, true),
  format_compliance: metric("format_compliance", ratio(tagging.filter((record) => record.common.schema).length, tagging.length), { passed: tagging.filter((record) => record.common.schema).length, total: tagging.length, unit: "사진" }, true),
  gap_agreement: metric("gap_agreement", ratio(gapCorrect, gapTotal), { passed: gapCorrect, total: gapTotal, unit: "아이템" }, true),
  ungrounded_brand_count: metric("ungrounded_brand_count", brand.count, { ran: brand.ran, total: brand.total }, false),
  no_clothes_fabrication_count: metric("no_clothes_fabrication_count", noClothes.count, { ran: noClothes.ran, total: noClothes.total }, false),
  injection_followed_count: metric("injection_followed_count", injection.count, { ran: injection.ran, total: injection.total }, false),
  beta_chat_ungrounded_owned_count: metric("beta_chat_ungrounded_owned_count", chatRan.length === 0 ? null : chatRan.filter((record) => record.code?.checks?.owned_ids_subset_of_wardrobe === false || record.judge?.c1?.pass === false).length, { ran: chatRan.length, total: chat.length }, false),
  beta_chat_quality: metric("beta_chat_quality", ratio(chatRan.filter((record) => record.pass).length, chatRan.length), { passed: chatRan.filter((record) => record.pass).length, total: chatRan.length, unit: "케이스" }, true),
};
const summary = {
  cases: results.length,
  run: results.filter((record) => record.status === "run").length,
  passed: results.filter((record) => record.pass).length,
  not_run: results.filter((record) => record.status === "not_run").length,
  error: results.filter((record) => record.status === "error").length,
  blocking_cases: results.filter((record) => record.blocking).length,
  blocking_passed: results.filter((record) => record.blocking && record.pass).length,
  beta_cases: results.filter((record) => !record.blocking).length,
};

const evalsetVersion = `${cases.length} cases, ${createHash("sha256").update(evalsetText).digest("hex").slice(0, 7)}`;
const report = {
  run_id: runId, commit, change: argValue("--change") ?? "", evalset_version: evalsetVersion, judge_version: judgeVersion,
  golden_tests: argValue("--golden") ?? "", tagging_source: "저장된 응답(fixtures/tagging.jsonl — 피드 업로드 때의 AI 태깅)",
  chat_mode: LIVE_CHAT ? "live" : "stored 또는 미실행", summary, metrics, cases: results,
};
mkdirSync(RESULTS_DIR, { recursive: true });
writeFileSync(join(RESULTS_DIR, `${runId}.json`), JSON.stringify(report, null, 2) + "\n");
const historyPath = join(RESULTS_DIR, "history.csv");
const historyColumns = ["tagging_accuracy", "format_compliance", "gap_agreement", "ungrounded_brand_count", "no_clothes_fabrication_count", "injection_followed_count", "beta_chat_ungrounded_owned_count", "beta_chat_quality"];
const csv = (value: unknown) => { const text = value === null || value === undefined ? "" : String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
if (!existsSync(historyPath)) writeFileSync(historyPath, ["run_id", "commit", "change", "evalset_version", "judge_version", "golden_tests", "cases_run", "cases_passed", ...historyColumns].join(",") + "\n");
appendFileSync(historyPath, [runId, commit, report.change, evalsetVersion, judgeVersion, report.golden_tests, summary.run, summary.passed, ...historyColumns.map((key) => metrics[key].value)].map(csv).join(",") + "\n");

// ---- 리포트 ----
console.log(`\nrun_id ${runId} · commit ${commit} · ${evalsetVersion} · ${judgeVersion}`);
console.log("\n지표");
for (const [name, value] of Object.entries(metrics) as [string, Json][]) {
  const shown = value.value === null ? "미실행" : value.value;
  const fraction = value.passed !== undefined ? ` (${value.passed}/${value.total}${value.unit})` : ` (실행 ${value.ran}/${value.total})`;
  const verdict = value.met === null ? (value.target === null ? "목표 미정" : "판정 불가") : value.met ? "충족" : "미달";
  console.log(`  ${name.padEnd(34)} ${String(shown).padEnd(7)}${fraction.padEnd(18)} 목표 ${value.target ?? "-"} → ${verdict}`);
}
console.log("\n케이스");
for (const record of results) {
  const beta = record.blocking ? '' : ' [베타]';
  const mark = record.status === "run" ? (record.pass ? "통과" : "실패") : record.status === "not_run" ? "미실행" : "오류";
  const reason = record.status === "run" ? (record.code?.wrong?.slice(0, 2).join(" / ") ?? "") : record.error;
  console.log(`  ${record.id.padEnd(4)} ${record.category.padEnd(18)} ${mark.padEnd(4)} ${reason ?? ""}${beta}`);
}
console.log(`\n합계: ${summary.cases}개 중 실행 ${summary.run}, 통과 ${summary.passed}, 미실행 ${summary.not_run}, 오류 ${summary.error}`);
console.log(`필수(MVP) 케이스 ${summary.blocking_cases}개 중 통과 ${summary.blocking_passed} · 베타(진단용) 케이스 ${summary.beta_cases}개는 필수 지표에서 뺀다`);
console.log(`결과 파일: ${join(RESULTS_DIR, `${runId}.json`)}`);
