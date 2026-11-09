import { STYLES } from "./catalog.ts";

export type Style = typeof STYLES[number];

export const SEASONS = ["봄", "여름", "가을", "겨울"] as const;
export type Season = typeof SEASONS[number];

export type ArchiveRecord = {
  id: string;
  image_path: string;
  style: Style[];
  source: "쇼핑몰" | "인플루언서" | "연예인" | "자체_촬영";
  saved_at: string;
};

export type ArchiveFilter = {
  style?: Style;
  season?: Season;
};

export function seasonForSavedAt(savedAt: string): { season: Season; season_year: number } {
  const date = new Date(savedAt);
  const month = date.getUTCMonth() + 1;
  const season = month >= 3 && month <= 5
    ? "봄"
    : month >= 6 && month <= 8
    ? "여름"
    : month >= 9 && month <= 11
    ? "가을"
    : "겨울";
  return { season, season_year: date.getUTCFullYear() };
}

export function filterArchive(
  records: readonly ArchiveRecord[],
  filter: ArchiveFilter = {},
): ArchiveRecord[] {
  return records
    .filter((record) => filter.style === undefined || record.style.includes(filter.style))
    .filter((record) => filter.season === undefined || seasonForSavedAt(record.saved_at).season === filter.season)
    .sort((left, right) => {
      const bySavedAt = right.saved_at.localeCompare(left.saved_at);
      return bySavedAt === 0 ? left.id.localeCompare(right.id) : bySavedAt;
    });
}
