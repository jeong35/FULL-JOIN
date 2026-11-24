import assert from 'node:assert/strict';
import test from 'node:test';

import {
  feedFilterOptionsCore,
  filterFeedImagesCore,
  hasFeedDiscoveryCore,
  type CoreFeedFilter,
  type FeedSearchImage,
} from '../mobile/src/data/feedFilterCore.ts';

const NO_FEED_FILTER: CoreFeedFilter = { style: null, kind: null, color: null };
const label = (kind: string) => kind === '트레이닝상의' ? '트레이닝 상의' : kind;

const images: (FeedSearchImage & { id: string; thumbnail_url: string })[] = [
  {
    id: 'preferred-new', thumbnail_url: 'https://example.test/1', style: ['미니멀'], source: '자체_촬영',
    items: [{ slot: '상의', kind: '니트', color: '아이보리' }, { slot: '하의', kind: '슬랙스', color: '블랙' }],
  },
  {
    id: 'casual', thumbnail_url: 'https://example.test/2', style: ['캐주얼'], source: '쇼핑몰',
    items: [{ slot: '상의', kind: '트레이닝상의', color: '그레이' }, { slot: '하의', kind: '데님팬츠', color: '중청' }],
  },
  {
    id: 'minimal-old', thumbnail_url: 'https://example.test/3', style: ['미니멀'], source: '인플루언서',
    items: [{ slot: '원피스', kind: '롱원피스', color: null }],
  },
];

test('feed search matches style, display kind label, color, and multiple terms without reordering', () => {
  assert.deepEqual(filterFeedImagesCore(images, '미니멀', NO_FEED_FILTER, label).map((image) => image.id), ['preferred-new', 'minimal-old']);
  assert.deepEqual(filterFeedImagesCore(images, '트레이닝 상의', NO_FEED_FILTER, label).map((image) => image.id), ['casual']);
  assert.deepEqual(filterFeedImagesCore(images, '블랙 니트', NO_FEED_FILTER, label).map((image) => image.id), ['preferred-new']);
  assert.deepEqual(images.map((image) => image.id), ['preferred-new', 'casual', 'minimal-old']);
});

test('feed filters combine style, kind, and color and keep empty denominators explicit', () => {
  assert.deepEqual(filterFeedImagesCore(images, '', { style: '미니멀', kind: '니트', color: '아이보리' }).map((image) => image.id), ['preferred-new']);
  assert.deepEqual(filterFeedImagesCore(images, '', { style: '캐주얼', kind: '니트', color: null }), []);
  assert.equal(hasFeedDiscoveryCore('', NO_FEED_FILTER), false);
  assert.equal(hasFeedDiscoveryCore('  니트  ', NO_FEED_FILTER), true);
});

test('feed filter options expose only values present in the current feed in canonical order', () => {
  assert.deepEqual(feedFilterOptionsCore(images, {
    style: ['캐주얼', '미니멀', '스트릿'],
    kind: ['니트', '트레이닝상의', '데님팬츠', '슬랙스', '롱원피스'],
    color: ['블랙', '아이보리', '그레이', '중청', '화이트'],
  }), {
    style: ['캐주얼', '미니멀'],
    kind: ['니트', '트레이닝상의', '데님팬츠', '슬랙스', '롱원피스'],
    color: ['블랙', '아이보리', '그레이', '중청'],
  });
});
