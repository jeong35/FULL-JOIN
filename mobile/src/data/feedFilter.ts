import {
  BASE_COLORS,
  DENIM_COLORS,
  KINDS_BY_SLOT,
  STYLES,
  kindLabel,
  type Color,
  type Kind,
  type Style,
} from './catalog';
import { feedFilterOptionsCore, filterFeedImagesCore, hasFeedDiscoveryCore } from './feedFilterCore';
import type { StyleImage } from './types';

export type FeedFilter = {
  style: Style | null;
  kind: Kind | null;
  color: Color | null;
};

export type FeedFilterKey = keyof FeedFilter;

export const NO_FEED_FILTER: FeedFilter = { style: null, kind: null, color: null };

const KINDS = [...new Set(Object.values(KINDS_BY_SLOT).flat())] as Kind[];
const COLORS = [...BASE_COLORS, ...DENIM_COLORS] as Color[];

export function filterFeedImages(
  images: readonly StyleImage[],
  query: string,
  filter: FeedFilter,
): StyleImage[] {
  return filterFeedImagesCore(images, query, filter, (kind) => kindLabel(kind as Kind));
}

export function feedFilterOptions(images: readonly StyleImage[]): {
  style: Style[];
  kind: Kind[];
  color: Color[];
} {
  return feedFilterOptionsCore(images, { style: STYLES, kind: KINDS, color: COLORS });
}

export function hasFeedDiscovery(query: string, filter: FeedFilter): boolean {
  return hasFeedDiscoveryCore(query, filter);
}
