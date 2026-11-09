import { readFile } from "node:fs/promises";

function usage(message) {
  if (message) console.error(message);
  console.error("사용법: npm run publish:style-image -- --image-id IMG-001 [--unpublish]");
  process.exit(message ? 1 : 0);
}

const args = process.argv.slice(2);
const options = { imageId: undefined, published: true };
for (let index = 0; index < args.length; index += 1) {
  const value = args[index];
  if (value === "--image-id") options.imageId = args[++index];
  else if (value === "--unpublish") options.published = false;
  else if (value === "--help" || value === "-h") usage();
  else usage(`알 수 없는 인자: ${value}`);
}
if (!options.imageId) usage("--image-id가 필요합니다.");

const linkedProjectRef = (await readFile(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8").catch(() => "")).trim();
const supabaseUrl = process.env.SUPABASE_URL ?? (/^[a-z0-9]{20}$/.test(linkedProjectRef)
  ? `https://${linkedProjectRef}.supabase.co`
  : undefined);
const adminToken = process.env.ANALYZE_ADMIN_TOKEN;
if (!supabaseUrl || !adminToken) throw new Error("Supabase 연결 정보와 ANALYZE_ADMIN_TOKEN이 필요합니다.");

const response = await fetch(
  `${supabaseUrl}/functions/v1/api/style-images/${encodeURIComponent(options.imageId)}/publish`,
  {
    method: "PUT",
    headers: { "content-type": "application/json", "x-admin-token": adminToken },
    body: JSON.stringify({ published: options.published }),
  },
);
const result = await response.json();
if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(result)}`);
console.log(JSON.stringify(result, null, 2));
