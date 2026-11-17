// evals/fixtures/tagging.jsonl 을 만든다.
// 입력: 피드 사진 검수 기록(reviews.json, 저장소 밖 파일). 경로는 인자로 받는다.
// 출력: evalset.jsonl 이 쓰는 사진만, 태그 칸(slot·kind·color·visual_fit·visibility)만 남긴다.
//       상품명·링크·이미지 경로·출처는 넣지 않는다.
// 실행: node evals/export_fixtures.ts <reviews.json 경로>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const reviewsPath = process.argv[2];
if (!reviewsPath) {
  console.error("사용법: node evals/export_fixtures.ts <reviews.json 경로>");
  process.exit(2);
}

type Tag = { slot: string; kind: string; color: string | null; visual_fit: string | null; visibility: string };
const KEEP = ["slot", "kind", "color", "visual_fit", "visibility"] as const;
const pick = (item: Record<string, unknown>): Tag => {
  const out: Record<string, unknown> = {};
  for (const key of KEEP) out[key] = item[key] ?? null;
  return out as Tag;
};

const cases = readFileSync(join(here, "evalset.jsonl"), "utf8").split("\n").filter((line) => line.trim() !== "").map((line) => JSON.parse(line));
const wanted = new Set<string>();
for (const c of cases) {
  if (c.mode === "stored") wanted.add(c.query.photo_id);
  if (c.mode === "code") wanted.add(c.query.style_image_id);
}

const reviews = JSON.parse(readFileSync(reviewsPath, "utf8"));
const lines: string[] = [];
for (const photoId of [...wanted].sort()) {
  const body = reviews[photoId]?.body;
  if (!body) {
    console.error(`검수 기록에 ${photoId} 가 없다`);
    process.exit(1);
  }
  lines.push(JSON.stringify({
    photo_id: photoId,
    model_items: (body.style_image?.tagging?.items ?? []).map(pick),
    label_items: (body.items ?? []).map(pick),
  }));
}
mkdirSync(join(here, "fixtures"), { recursive: true });
writeFileSync(join(here, "fixtures", "tagging.jsonl"), lines.join("\n") + "\n");
console.log(`fixtures/tagging.jsonl: 사진 ${lines.length}장`);
