import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PERMISSIONS, SOURCES } from "../src/fulljoin/analysis.ts";
import { STYLES } from "../src/fulljoin/catalog.ts";

function usage(message) {
  if (message) console.error(message);
  console.error(`사용법:
  npm run import:style-images -- (--csv <파일.csv> | --sheet-url <Google Sheets URL>) [--photos <JPG 폴더>] [--storage-prefix feed] [--limit 3] [--apply]

기본 실행은 로컬 CSV/JPG만 검증합니다. 실제 Storage 업로드와 /analyze 호출에는 --apply가 필요합니다.`);
  process.exit(message ? 1 : 0);
}

function parseArgs(values) {
  const options = { apply: false, storagePrefix: "feed", limit: undefined, csv: undefined, sheetUrl: undefined, photos: undefined };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--apply") options.apply = true;
    else if (value === "--csv") options.csv = values[++index];
    else if (value === "--sheet-url") options.sheetUrl = values[++index];
    else if (value === "--photos") options.photos = values[++index];
    else if (value === "--storage-prefix") options.storagePrefix = values[++index] ?? "";
    else if (value === "--limit") options.limit = Number(values[++index]);
    else if (value === "--help" || value === "-h") usage();
    else usage(`알 수 없는 인자: ${value}`);
  }
  if ((!options.csv && !options.sheetUrl) || (options.csv && options.sheetUrl)) usage("--csv와 --sheet-url 중 하나만 지정해야 합니다.");
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) usage("--limit은 1 이상의 정수여야 합니다.");
  if (options.storagePrefix.startsWith("/") || options.storagePrefix.includes("..")) usage("--storage-prefix를 확인해 주세요.");
  return options;
}

async function loadCsv(options) {
  if (options.csv) return readFile(path.resolve(options.csv), "utf8");
  let sheetUrl;
  try {
    sheetUrl = new URL(options.sheetUrl);
  } catch {
    throw new Error("--sheet-url을 확인해 주세요.");
  }
  const match = sheetUrl.pathname.match(/^\/spreadsheets\/d\/([^/]+)/);
  if (sheetUrl.hostname !== "docs.google.com" || !match?.[1]) throw new Error("Google Sheets 공유 URL이 아니에요.");
  const gid = sheetUrl.searchParams.get("gid") ?? "0";
  const exportUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(match[1])}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  const response = await fetch(exportUrl);
  if (!response.ok) throw new Error(`공유 시트를 CSV로 읽지 못했어요 (${response.status}). 링크 공개 범위를 확인해 주세요.`);
  return response.text();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field.length === 0) quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) throw new Error("닫히지 않은 CSV 따옴표가 있어요.");
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((values) => values.some((value) => value.trim() !== ""));
}

function rowsAsObjects(rows) {
  if (rows.length < 2) throw new Error("CSV에 헤더와 데이터 행이 필요합니다.");
  const headers = rows[0].map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim());
  const required = ["image_id", "file_name", "page_url", "permission", "notes", "source"];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length > 0) throw new Error(`CSV에 필요한 열이 없어요: ${missing.join(", ")}`);
  return rows.slice(1).map((values, index) => Object.fromEntries(headers.map((header, column) => [header, values[column]?.trim() ?? ""])))
    .map((value, index) => ({ ...value, rowNumber: index + 2 }));
}

function validateRows(rows) {
  const errors = [];
  const imageIds = new Set();
  const fileNames = new Set();
  const styleSet = new Set(STYLES);
  const sourceSet = new Set(SOURCES);
  const permissionSet = new Set(PERMISSIONS);
  const validated = rows.map((row) => {
    const prefix = `${row.rowNumber}행`;
    if (!/^IMG-[0-9]{3,}$/.test(row.image_id)) errors.push(`${prefix}: image_id는 IMG-001 형식이어야 해요.`);
    if (!/^[A-Za-z0-9_-]+\.(jpg|jpeg)$/i.test(row.file_name)) errors.push(`${prefix}: file_name은 안전한 JPG 파일명이어야 해요.`);
    if (row.file_name.replace(/\.jpe?g$/i, "") !== row.image_id) errors.push(`${prefix}: image_id와 JPG 파일명이 같아야 해요.`);
    if (imageIds.has(row.image_id)) errors.push(`${prefix}: 중복 image_id ${row.image_id}`);
    if (fileNames.has(row.file_name)) errors.push(`${prefix}: 중복 file_name ${row.file_name}`);
    imageIds.add(row.image_id);
    fileNames.add(row.file_name);
    if (!sourceSet.has(row.source)) errors.push(`${prefix}: source는 ${SOURCES.join("/")} 중 하나여야 해요.`);
    if (!permissionSet.has(row.permission)) errors.push(`${prefix}: permission은 ${PERMISSIONS.join("/")} 중 하나여야 해요.`);
    if (row.page_url) {
      try {
        const url = new URL(row.page_url);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch {
        errors.push(`${prefix}: page_url을 확인해 주세요.`);
      }
    }
    const approvedStyle = row.style
      ? row.style.split(/[,|/·\n]+/).map((value) => value.trim()).filter(Boolean)
      : undefined;
    if (approvedStyle && (approvedStyle.length > 2 || approvedStyle.some((style) => !styleSet.has(style)))) {
      errors.push(`${prefix}: style은 목록 안의 값 1~2개여야 해요.`);
    }
    return { ...row, approvedStyle };
  });
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return validated;
}

async function validateLocalJpeg(filePath) {
  const data = await readFile(filePath);
  if (data.length === 0 || data.length > 10 * 1024 * 1024) throw new Error(`${filePath}: JPG는 0바이트보다 크고 10MB 이하여야 해요.`);
  if (data[0] !== 0xff || data[1] !== 0xd8 || data.at(-2) !== 0xff || data.at(-1) !== 0xd9) {
    throw new Error(`${filePath}: 확장자만 JPG이거나 손상된 파일이에요.`);
  }
  return data;
}

async function storageFileExists(storage, storagePath) {
  const folder = path.posix.dirname(storagePath) === "." ? "" : path.posix.dirname(storagePath);
  const fileName = path.posix.basename(storagePath);
  const { data, error } = await storage.list(folder, { search: fileName, limit: 100 });
  if (error) throw error;
  return (data ?? []).some((entry) => entry.name === fileName);
}

async function analyzeWithConflictRetry(url, headers, requestBody) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(requestBody) });
    const body = await response.json();
    if (response.status !== 409 || body?.error?.code !== "analysis_in_progress") return { response, body };
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("같은 사진의 다른 분석 작업이 80초 안에 끝나지 않았어요.");
}

const options = parseArgs(process.argv.slice(2));
const csvText = await loadCsv(options);
let rows = validateRows(rowsAsObjects(parseCsv(csvText)));
if (options.limit !== undefined) rows = rows.slice(0, options.limit);

if (options.photos) {
  for (const row of rows) await validateLocalJpeg(path.resolve(options.photos, row.file_name));
}

console.log(`검증 완료: ${rows.length}행 · 실제 반영 ${options.apply ? "예" : "아니요"}`);
if (!options.apply) {
  console.log("실제 실행 전 점검이 끝났습니다. 같은 명령 끝에 --apply를 추가하면 업로드와 분석을 시작합니다.");
  process.exit(0);
}

const linkedProjectRef = (await readFile(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").catch(() => "")).trim();
const supabaseUrl = process.env.SUPABASE_URL ?? (/^[a-z0-9]{20}$/.test(linkedProjectRef)
  ? `https://${linkedProjectRef}.supabase.co`
  : undefined);
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminToken = process.env.ANALYZE_ADMIN_TOKEN;
if (!supabaseUrl || !adminToken) {
  throw new Error("환경변수 SUPABASE_URL과 ANALYZE_ADMIN_TOKEN이 필요합니다.");
}
if (options.photos && !serviceRoleKey) {
  throw new Error("로컬 JPG를 Storage에 올리려면 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
}
const storage = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } }).storage.from("feed-images")
  : null;
const report = [];

for (const [index, row] of rows.entries()) {
  const storagePath = path.posix.join(options.storagePrefix, row.file_name);
  const record = { image_id: row.image_id, file_name: row.file_name, image_path: storagePath };
  try {
    const exists = storage === null ? false : await storageFileExists(storage, storagePath);
    if (!exists && options.photos) {
      const jpeg = await validateLocalJpeg(path.resolve(options.photos, row.file_name));
      const { error } = await storage.upload(storagePath, jpeg, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      record.storage = "uploaded";
    } else record.storage = exists ? "existing" : "checked_by_analyze";

    const { response, body } = await analyzeWithConflictRetry(
      `${supabaseUrl}/functions/v1/api/analyze`,
      {
        "content-type": "application/json",
        "x-admin-token": adminToken,
      },
      {
        image_id: row.image_id,
        image_path: storagePath,
        source: row.source,
        source_url: row.page_url || null,
        permission: row.permission,
        ...(row.approvedStyle ? { approved_style: row.approvedStyle } : {}),
      },
    );
    if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
    record.analysis = body.already_analyzed ? "existing" : "created";
    record.style_review_required = body.style_review_required ?? false;
    record.item_count = Array.isArray(body.items) ? body.items.length : 0;
    console.log(`[${index + 1}/${rows.length}] ${row.image_id}: ${record.storage}, 분석 ${record.analysis}`);
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error);
    console.error(`[${index + 1}/${rows.length}] ${row.image_id}: 실패 · ${record.error}`);
  }
  report.push(record);
}

await mkdir(".cache", { recursive: true });
const reportPath = `.cache/style-image-import-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.json`;
await writeFile(reportPath, JSON.stringify(report, null, 2));
const failed = report.filter((record) => record.error).length;
console.log(`완료: 성공 ${report.length - failed}, 실패 ${failed} · 보고서 ${reportPath}`);
if (failed > 0) process.exitCode = 1;
