// 홈 검색(11/24 '홈 검색 v2 · 돋보기 눌러서' 시안)의 계산만 모은 곳.
// 화면·서버 없이 tests/test_feed_filter.ts에서 시험할 수 있게 다른 파일을 import하지 않는다.
// 스타일·종류·색 목록은 feedFilter.ts가 catalog.ts에서 넣어 준다.
// 사진 속 옷 요약(items)은 GET /feed가 준다(docs/API_MVP.md '홈 피드 검색·필터').

export type SearchItemTag = { slot: string; kind: string; color: string | null };

export type SearchableImage = {
  id: string;
  style: readonly string[];
  // 사진 속 옷의 부위·종류·색. 구버전 서버 응답에는 없다.
  items?: readonly SearchItemTag[];
};

// 스타일은 여러 개(그중 하나라도 붙은 사진), 옷 종류와 색은 하나씩.
// 종류와 색을 같이 고르면 '베이지 니트'처럼 한 벌에 둘 다 맞아야 한다.
export type FeedQuery = {
  styles: readonly string[];
  kind: string | null;
  color: string | null;
};

export const EMPTY_QUERY: FeedQuery = { styles: [], kind: null, color: null };

export function isEmptyQuery(query: FeedQuery): boolean {
  return query.styles.length === 0 && query.kind === null && query.color === null;
}

// 서버가 사진 속 옷 요약을 주는지. 구버전 서버라 안 주면 옷·색으로는 찾을 수 없다.
export function hasItemTags(images: readonly SearchableImage[]): boolean {
  return images.some((image) => image.items !== undefined);
}

export function matchesQuery(image: SearchableImage, query: FeedQuery): boolean {
  if (query.styles.length > 0 && !query.styles.some((style) => image.style.includes(style))) return false;
  if (query.kind === null && query.color === null) return true;
  return (image.items ?? []).some(
    (item) => (query.kind === null || item.kind === query.kind) && (query.color === null || item.color === query.color),
  );
}

// 받은 순서를 그대로 둔다. 홈은 취향 순서(AC15)로 정렬한 목록을 넘기므로 결과도 그 순서다(docs/SPEC.md).
export function searchImages<T extends SearchableImage>(images: readonly T[], query: FeedQuery): T[] {
  return images.filter((image) => matchesQuery(image, query));
}

// ── 결과 화면 위 조건 딱지 ──
// 스타일은 하나씩, 옷 종류와 색은 '베이지 니트'처럼 한 딱지로 묶는다.
export type QueryPart = { key: string; label: string };

export function queryParts(query: FeedQuery, kindLabel: (kind: string) => string): QueryPart[] {
  const parts: QueryPart[] = query.styles.map((style) => ({ key: `style:${style}`, label: style }));
  const clothes = [query.color, query.kind === null ? null : kindLabel(query.kind)].filter((part) => part !== null);
  if (clothes.length > 0) parts.push({ key: 'clothes', label: clothes.join(' ') });
  return parts;
}

export function withoutPart(query: FeedQuery, key: string): FeedQuery {
  if (key === 'clothes') return { ...query, kind: null, color: null };
  if (key.startsWith('style:')) {
    const style = key.slice('style:'.length);
    return { ...query, styles: query.styles.filter((candidate) => candidate !== style) };
  }
  return query;
}

// 0장일 때 '하나 빼고 보기'. 빼면 사진이 생기는 조건만, 원래 순서대로.
export function dropOneOptions(
  images: readonly SearchableImage[],
  query: FeedQuery,
  kindLabel: (kind: string) => string,
): (QueryPart & { count: number })[] {
  const parts = queryParts(query, kindLabel);
  if (parts.length < 2) return [];
  return parts
    .map((part) => ({ ...part, count: searchImages(images, withoutPart(query, part.key)).length }))
    .filter((part) => part.count > 0);
}

// ── 고를 수 있는 값 ──
// '모든 저장' 필터처럼 피드 사진에 실제로 있는 값만 보여 준다. 순서는 넘겨받은 목록 순서.
export function presentStyles(images: readonly SearchableImage[], order: readonly string[]): string[] {
  return order.filter((style) => images.some((image) => image.style.includes(style)));
}

export function presentKinds(images: readonly SearchableImage[], order: readonly string[]): string[] {
  const kinds = new Set(images.flatMap((image) => (image.items ?? []).map((item) => item.kind)));
  return order.filter((kind) => kinds.has(kind));
}

// 종류를 골랐으면 그 종류에 있는 색만.
export function presentColors(images: readonly SearchableImage[], order: readonly string[], kind: string | null): string[] {
  const colors = new Set(
    images.flatMap((image) =>
      (image.items ?? []).filter((item) => kind === null || item.kind === kind).map((item) => item.color),
    ),
  );
  return order.filter((color) => colors.has(color));
}

// ── 글자로 찾기 ──
// 동의어는 초안이다(서버 문서: '동의어 표를 프론트와 합의한다'). 정해지면 이 목록만 고친다.
export type SearchWord = { value: string; label: string; aliases?: readonly string[] };
export type SearchVocab = {
  styles: readonly SearchWord[];
  kinds: readonly SearchWord[];
  colors: readonly SearchWord[];
};
export type SuggestionTag = '스타일' | '옷' | '색' | '색 + 옷';
export type Suggestion = { label: string; tag: SuggestionTag; style?: string; kind?: string; color?: string };

const compact = (text: string) => text.replace(/\s+/g, '').toLowerCase();

function words(word: SearchWord): string[] {
  return [word.label, word.value, ...(word.aliases ?? [])].map(compact);
}

// 글자가 이 단어의 앞부분이면 맞다. 두 글자부터는 중간에 있어도 맞다('패딩' → 숏패딩·롱패딩).
function matchesWord(word: SearchWord, text: string): boolean {
  return words(word).some((candidate) => candidate.startsWith(text) || (text.length >= 2 && candidate.includes(text)));
}

// 글자 앞이 색 이름이면 그 색과 나머지 글자로 나눈다('베이지니' → 베이지 + 니). 가장 긴 이름을 고른다.
function splitColor(text: string, colors: readonly SearchWord[]): { color: SearchWord; rest: string } | null {
  let best: { color: SearchWord; name: string } | null = null;
  for (const color of colors) {
    for (const name of words(color)) {
      if (name !== '' && text.startsWith(name) && (best === null || name.length > best.name.length)) best = { color, name };
    }
  }
  return best === null ? null : { color: best.color, rest: text.slice(best.name.length) };
}

export function suggest(input: string, vocab: SearchVocab, limit = 8): Suggestion[] {
  const text = compact(input);
  if (text === '') return [];
  const out: Suggestion[] = [];
  const split = splitColor(text, vocab.colors);
  if (split !== null && split.rest !== '') {
    for (const kind of vocab.kinds.filter((candidate) => matchesWord(candidate, split.rest))) {
      out.push({ label: `${split.color.label} ${kind.label}`, tag: '색 + 옷', color: split.color.value, kind: kind.value });
    }
    for (const kind of vocab.kinds.filter((candidate) => matchesWord(candidate, split.rest))) {
      out.push({ label: kind.label, tag: '옷', kind: kind.value });
    }
  }
  if (split !== null) out.push({ label: split.color.label, tag: '색', color: split.color.value });
  for (const style of vocab.styles.filter((candidate) => matchesWord(candidate, text))) {
    out.push({ label: style.label, tag: '스타일', style: style.value });
  }
  for (const kind of vocab.kinds.filter((candidate) => matchesWord(candidate, text))) {
    out.push({ label: kind.label, tag: '옷', kind: kind.value });
  }
  for (const color of vocab.colors.filter((candidate) => matchesWord(candidate, text))) {
    out.push({ label: color.label, tag: '색', color: color.value });
  }
  const seen = new Set<string>();
  return out
    .filter((suggestion) => {
      const key = `${suggestion.tag}:${suggestion.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

// 추천 단어를 누르면 지금 고른 조건에 더한다. 스타일은 더하고, 종류·색은 바꾼다.
export function applySuggestion(query: FeedQuery, suggestion: Suggestion): FeedQuery {
  const styles =
    suggestion.style === undefined || query.styles.includes(suggestion.style) ? query.styles : [...query.styles, suggestion.style];
  if (suggestion.kind === undefined && suggestion.color === undefined) return { ...query, styles };
  return { styles, kind: suggestion.kind ?? null, color: suggestion.color ?? null };
}
