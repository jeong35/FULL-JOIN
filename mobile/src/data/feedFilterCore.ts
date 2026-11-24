export type FeedSearchItem = {
  slot: string;
  kind: string;
  color: string | null;
};

export type FeedSearchImage = {
  style: readonly string[];
  source: string;
  items?: readonly FeedSearchItem[];
};

export type CoreFeedFilter = {
  style: string | null;
  kind: string | null;
  color: string | null;
};

function normalized(value: string): string {
  return value.normalize('NFC').trim().toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
}

function searchTerms(query: string): string[] {
  return query.normalize('NFC').trim().toLocaleLowerCase('ko-KR').split(/\s+/).map(normalized).filter(Boolean);
}

export function filterFeedImagesCore<T extends FeedSearchImage>(
  images: readonly T[],
  query: string,
  filter: CoreFeedFilter,
  kindLabel: (kind: string) => string = (kind) => kind,
): T[] {
  const terms = searchTerms(query);
  return images.filter((image) => {
    const items = image.items ?? [];
    if (filter.style !== null && !image.style.includes(filter.style)) return false;
    if (filter.kind !== null && !items.some((item) => item.kind === filter.kind)) return false;
    if (filter.color !== null && !items.some((item) => item.color === filter.color)) return false;
    if (terms.length === 0) return true;
    const values = [
      ...image.style,
      image.source,
      ...items.flatMap((item) => [item.slot, item.kind, kindLabel(item.kind), item.color ?? '']),
    ].map(normalized).filter(Boolean);
    return terms.every((term) => values.some((value) => value.includes(term)));
  });
}

export function feedFilterOptionsCore<Style extends string, Kind extends string, Color extends string>(
  images: readonly FeedSearchImage[],
  order: { style: readonly Style[]; kind: readonly Kind[]; color: readonly Color[] },
): { style: Style[]; kind: Kind[]; color: Color[] } {
  const styles = new Set(images.flatMap((image) => image.style));
  const kinds = new Set(images.flatMap((image) => (image.items ?? []).map((item) => item.kind)));
  const colors = new Set(images.flatMap((image) => (image.items ?? []).map((item) => item.color).filter((value): value is string => value !== null)));
  return {
    style: order.style.filter((style) => styles.has(style)),
    kind: order.kind.filter((kind) => kinds.has(kind)),
    color: order.color.filter((color) => colors.has(color)),
  };
}

export function hasFeedDiscoveryCore(query: string, filter: CoreFeedFilter): boolean {
  return query.trim() !== '' || Object.values(filter).some((value) => value !== null);
}
