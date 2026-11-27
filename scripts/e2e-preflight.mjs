import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const target = process.env.E2E_ENVIRONMENT;
const phase = process.env.E2E_PREFLIGHT_PHASE ?? "artifact";
const expectedPorts = { staging: "4174", production: "4175" };

assert.ok(target === "staging" || target === "production", "E2E_ENVIRONMENT must be staging or production");
assert.ok(phase === "artifact" || phase === "browser", "E2E_PREFLIGHT_PHASE must be artifact or browser");

const artifactInput = process.env.E2E_ARTIFACT_DIR;
const expectedSupabaseUrl = normalizedUrl(process.env.E2E_EXPECTED_SUPABASE_URL, "E2E_EXPECTED_SUPABASE_URL");
const expectedApiUrl = `${expectedSupabaseUrl}/functions/v1/api`;
const expectedReleaseSha = required(process.env.E2E_EXPECTED_RELEASE_SHA, "E2E_EXPECTED_RELEASE_SHA");
assert.match(expectedReleaseSha, /^[0-9a-f]{40}$/u, "E2E_EXPECTED_RELEASE_SHA must be a 40-character git SHA");
assert.ok(artifactInput && path.isAbsolute(artifactInput), "E2E_ARTIFACT_DIR must be an absolute path");

const artifactDir = await realpath(artifactInput);
assert.ok((await stat(artifactDir)).isDirectory(), "E2E_ARTIFACT_DIR must be a directory");
assert.ok(artifactDir.split(path.sep).includes(target), `artifact path must contain a '${target}' directory segment`);
assert.notEqual(artifactDir, path.join(root, "mobile", "dist"), "Do not serve mobile/dist for E2E; use an environment-specific export directory");

const gitSha = git("rev-parse", "HEAD");
const expectedGitSha = process.env.E2E_EXPECTED_GIT_SHA ?? gitSha;
assert.equal(gitSha, expectedGitSha, `current git SHA ${gitSha} does not match E2E_EXPECTED_GIT_SHA ${expectedGitSha}`);
const dirty = git("status", "--porcelain");
assert.ok(dirty === "" || process.env.E2E_ALLOW_DIRTY === "1", "worktree is dirty; commit it or explicitly set E2E_ALLOW_DIRTY=1 for staging-only diagnostics");

const files = await walk(artifactDir);
const readableFiles = files.filter((file) => /\.(?:html|js|json)$/u.test(file));
const contents = await Promise.all(readableFiles.map(async (file) => [file, await readFile(file, "utf8")]));
const supabaseUrls = new Set();
for (const [, content] of contents) {
  for (const match of content.matchAll(/https:\/\/[a-z]{20}\.supabase\.co(?:\/functions\/v1\/[a-z0-9_-]+)?/giu)) {
    supabaseUrls.add(match[0].replace(/\/$/u, ""));
  }
}
assert.ok(supabaseUrls.has(expectedSupabaseUrl), `artifact does not contain expected Supabase URL ${expectedSupabaseUrl}`);
assert.ok(supabaseUrls.has(expectedApiUrl), `artifact does not contain expected API URL ${expectedApiUrl}`);

const serviceWorkerFiles = files.filter((file) => /(?:^|\/)[^/]*service[^/]*worker[^/]*\.js$|(?:^|\/)notification-sw\.js$/iu.test(file));
const serviceWorkers = Object.fromEntries(await Promise.all(serviceWorkerFiles.map(async (file) => [
  path.basename(file),
  sha256(await readFile(file)),
])));

const healthResponse = await fetch(`${expectedApiUrl}/health`, { headers: { "cache-control": "no-cache" } });
assert.equal(healthResponse.status, 200, `Edge health returned ${healthResponse.status}`);
const health = await healthResponse.json();
assert.equal(health?.ok, true, "Edge health did not return ok=true");
assert.equal(health?.release?.git_sha, expectedReleaseSha, "Edge Function release SHA does not match the approved E2E target");

const report = {
  phase,
  environment: target,
  git_sha: gitSha,
  dirty_worktree: dirty !== "",
  artifact_dir: artifactDir,
  embedded_supabase_urls: [...supabaseUrls].sort(),
  expected_api_url: expectedApiUrl,
  edge_release_sha: health.release.git_sha,
  service_worker_artifacts: serviceWorkers,
};

if (phase === "browser") {
  const previewUrl = new URL(required(process.env.E2E_PREVIEW_URL, "E2E_PREVIEW_URL"));
  assert.equal(previewUrl.port, expectedPorts[target], `${target} preview must use port ${expectedPorts[target]}`);
  const statePath = required(process.env.E2E_BROWSER_STATE_FILE, "E2E_BROWSER_STATE_FILE");
  const state = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(new URL(state.page_url).origin, previewUrl.origin, "browser page origin does not match E2E_PREVIEW_URL");
  assert.ok(Array.isArray(state.network_urls), "browser state must include network_urls");
  const apiRequests = state.network_urls.filter((url) => url.startsWith(expectedApiUrl));
  assert.ok(apiRequests.length > 0, `browser Network does not contain a request to ${expectedApiUrl}`);
  const wrongApiRequests = state.network_urls.filter((url) => /\.supabase\.co\/functions\/v1\/api/u.test(url) && !url.startsWith(expectedApiUrl));
  assert.deepEqual(wrongApiRequests, [], `browser called a different Supabase API: ${wrongApiRequests.join(", ")}`);

  assert.ok(Array.isArray(state.loaded_scripts), "browser state must include loaded_scripts");
  const artifactBasenames = new Set(files.map((file) => path.basename(file)));
  assert.ok(state.loaded_scripts.some((url) => artifactBasenames.has(path.basename(new URL(url).pathname))), "browser did not load a JavaScript asset from the selected artifact directory");

  assert.ok(Array.isArray(state.cache_names), "browser state must include cache_names");
  assert.deepEqual(state.cache_names, [], "Cache Storage is not empty; clear site data before E2E");
  assert.ok(Array.isArray(state.service_workers), "browser state must include service_workers");
  for (const worker of state.service_workers) {
    assert.equal(new URL(worker.script_url).origin, previewUrl.origin, "Service Worker belongs to a different preview origin");
    const expectedHash = serviceWorkers[path.basename(new URL(worker.script_url).pathname)];
    assert.ok(expectedHash, `unexpected Service Worker ${worker.script_url}`);
    assert.equal(worker.sha256, expectedHash, `stale Service Worker script ${worker.script_url}`);
  }
  report.preview_url = previewUrl.href;
  report.observed_api_requests = apiRequests;
  report.browser_service_workers = state.service_workers;
  report.browser_cache_names = state.cache_names;
}

console.log(JSON.stringify(report, null, 2));

function required(value, name) {
  assert.ok(typeof value === "string" && value.trim() !== "", `${name} is required`);
  return value.trim();
}

function normalizedUrl(value, name) {
  const parsed = new URL(required(value, name));
  assert.equal(parsed.protocol, "https:", `${name} must use HTTPS`);
  assert.match(parsed.hostname, /^[a-z]{20}\.supabase\.co$/u, `${name} must be a Supabase project URL`);
  return parsed.origin;
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? await walk(fullPath) : [fullPath];
  }));
  return nested.flat();
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
