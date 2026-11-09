import assert from "node:assert/strict";

import { filterArchive, seasonForSavedAt } from "../src/fulljoin/archive.ts";

const records = [
  { id: "s-old", image_path: "feed/s-old.jpg", style: ["미니멀"], source: "쇼핑몰", saved_at: "2026-10-01T09:00:00Z" },
  { id: "s-other", image_path: "feed/s-other.jpg", style: ["스트릿"], source: "인플루언서", saved_at: "2026-10-12T09:00:00Z" },
  { id: "s-new", image_path: "feed/s-new.jpg", style: ["미니멀"], source: "쇼핑몰", saved_at: "2026-10-10T09:00:00Z" },
];

assert.deepEqual(filterArchive(records, { style: "미니멀" }).map((record) => record.id), ["s-new", "s-old"]);
assert.deepEqual(filterArchive(records, { season: "가을" }).map((record) => record.id), ["s-other", "s-new", "s-old"]);
assert.deepEqual(seasonForSavedAt("2026-03-01T00:00:00Z"), { season: "봄", season_year: 2026 });
assert.deepEqual(seasonForSavedAt("2026-06-01T00:00:00Z"), { season: "여름", season_year: 2026 });
assert.deepEqual(seasonForSavedAt("2026-09-01T00:00:00Z"), { season: "가을", season_year: 2026 });
assert.deepEqual(seasonForSavedAt("2026-12-01T00:00:00Z"), { season: "겨울", season_year: 2026 });

console.log("Archive checks passed.");
