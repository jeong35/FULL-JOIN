import { NEIGHBOR_STYLES, STYLES } from "./catalog.ts";

export type FeedImage = {
  id: string;
  style: string[];
  uploaded_at: string;
};

function newestFirst(left: FeedImage, right: FeedImage): number {
  return right.uploaded_at.localeCompare(left.uploaded_at) || left.id.localeCompare(right.id);
}

function roundRobinByStyle(images: readonly FeedImage[], styles: readonly string[]): FeedImage[] {
  const remaining = new Set(images.map((image) => image.id));
  const queues = new Map(
    styles.map((style) => [
      style,
      images.filter((image) => image.style.includes(style)).sort(newestFirst),
    ]),
  );
  const result: FeedImage[] = [];

  while (remaining.size > 0) {
    let added = false;
    for (const style of styles) {
      const queue = queues.get(style) ?? [];
      const next = queue.find((image) => remaining.has(image.id));
      if (next !== undefined) {
        result.push(next);
        remaining.delete(next.id);
        added = true;
      }
    }
    if (!added) break;
  }

  return result;
}

export function orderHomeFeed(
  images: readonly FeedImage[],
  preferredStyles: readonly string[],
): FeedImage[] {
  const preferred = new Set(preferredStyles);
  const neighbors = new Set<string>(
    preferredStyles.flatMap((style) =>
      style in NEIGHBOR_STYLES
        ? NEIGHBOR_STYLES[style as keyof typeof NEIGHBOR_STYLES]
        : [],
    ),
  );
  const preferredImages = images.filter((image) => image.style.some((style) => preferred.has(style)));
  const neighborImages = images.filter(
    (image) => !preferredImages.includes(image) && image.style.some((style) => neighbors.has(style)),
  );
  const otherImages = images.filter(
    (image) => !preferredImages.includes(image) && !neighborImages.includes(image),
  );

  const preferredOrder = STYLES.filter((style) => preferred.has(style));
  const neighborOrder = STYLES.filter((style) => neighbors.has(style));
  const otherOrder = STYLES.filter((style) => !preferred.has(style) && !neighbors.has(style));

  return [
    ...roundRobinByStyle(preferredImages, preferredOrder),
    ...roundRobinByStyle(neighborImages, neighborOrder),
    ...roundRobinByStyle(otherImages, otherOrder),
  ];
}

export function filterFeed(images: readonly FeedImage[], style: string): FeedImage[] {
  return images.filter((image) => image.style.includes(style)).sort(newestFirst);
}
