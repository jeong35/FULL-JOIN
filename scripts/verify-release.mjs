import { z } from "zod";

const environmentSchema = z.object({
  RELEASE_HEALTH_URL: z.string().url().startsWith("https://"),
  EXPECTED_GIT_SHA: z.string().regex(/^[0-9a-f]{40}$/u),
  RELEASE_WEATHER_SMOKE_URL: z.string().url().startsWith("https://").optional(),
});

const environment = environmentSchema.parse(process.env);

async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Release smoke failed: HTTP ${response.status}`);
  return body;
}

const health = await json(environment.RELEASE_HEALTH_URL);
if (health?.ok !== true || health?.release?.git_sha !== environment.EXPECTED_GIT_SHA) {
  throw new Error("Release health SHA does not match the approved commit.");
}

if (environment.RELEASE_WEATHER_SMOKE_URL !== undefined) {
  const weather = await json(environment.RELEASE_WEATHER_SMOKE_URL);
  if (weather?.source !== "기상청" || !Array.isArray(weather.days) || weather.days.length === 0) {
    throw new Error("Weather smoke response is not a KMA forecast.");
  }
}

console.log(JSON.stringify({
  ok: true,
  git_sha: health.release.git_sha,
  released_at: health.release.released_at ?? null,
  weather_checked: environment.RELEASE_WEATHER_SMOKE_URL !== undefined,
}));
