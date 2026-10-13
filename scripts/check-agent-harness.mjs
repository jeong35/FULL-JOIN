import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const approvedCandidateHashes = new Map([
  [
    "tests/harness/golden_cases.yaml",
    "0ab6e8c7a1a63c5f50e31bf55f2822f1665bdfad3337a2b9f46c144715f78d2c",
  ],
  [
    "tests/test_gap_analysis_golden.ts",
    "c75383df8249574cda624a341cd047c4d715f6fbc08cf00ca06114edbfe31155",
  ],
]);

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

async function sha256(path) {
  const content = await readFile(new URL(`../${path}`, import.meta.url));
  return createHash("sha256").update(content).digest("hex");
}

const [agents, claude, delegation, packageJsonText] = await Promise.all([
  readText("AGENTS.md"),
  readText("CLAUDE.md"),
  readText("docs/prompts/delegation_gap_analysis.md"),
  readText("package.json"),
]);

assert.match(claude, /^@AGENTS\.md$/m, "CLAUDE.md must load AGENTS.md");
assert.match(agents, /테스트와 골든 케이스를 고치지 않는다/);
assert.match(agents, /같은 원인으로 검증에 두 번 실패/);
assert.match(agents, /최종 수용은 사람이 한다/);
assert.match(delegation, /중단 조건: 2회 실패/);

const packageJson = JSON.parse(packageJsonText);
for (const scriptName of [
  "check:harness",
  "check:syntax",
  "check:types",
  "test:golden",
  "check",
]) {
  assert.equal(
    typeof packageJson.scripts?.[scriptName],
    "string",
    `missing npm script: ${scriptName}`,
  );
}

for (const [path, expectedHash] of approvedCandidateHashes) {
  assert.equal(
    await sha256(path),
    expectedHash,
    `${path} changed after the review candidate was frozen; stop and request human approval`,
  );
}

console.log("Agent harness contract and frozen review candidate are valid.");
