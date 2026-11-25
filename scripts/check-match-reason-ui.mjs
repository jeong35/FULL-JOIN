import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { classifyGap, gapMatchMetadata } from '../src/fulljoin/gap_analysis.ts';
import { resolveMatchReason } from '../mobile/src/data/matchReasonCore.ts';

const wardrobe = [
  { id: 'SLACKS-BLACK', slot: '하의', kind: '슬랙스', color: '블랙', visual_fit: '와이드' },
];
const source = { slot: '하의', kind: '슬랙스', color: '블랙', visual_fit: '와이드', visibility: '전체' };
const gap = classifyGap(source, wardrobe);
const metadata = gapMatchMetadata(source, wardrobe, gap);

const linked = resolveMatchReason(
  { wardrobe_item_ids: gap.wardrobe_item_ids, match_metadata: metadata },
  wardrobe,
  '프론트 fallback',
);
assert.equal(linked.source, 'server');
assert.equal(linked.wardrobe_item_id, 'SLACKS-BLACK');
assert.equal(linked.text, metadata.reason);

const shortReason = resolveMatchReason(
  {
    wardrobe_item_ids: ['SLACKS-BLACK'],
    match_metadata: { wardrobe_item_id: 'SLACKS-BLACK', reason: '내 옷을 활용할 수 있어요.' },
  },
  wardrobe,
  'fallback',
);
assert.equal(shortReason.text, '내 옷을 활용할 수 있어요.');

const longKoreanReason = '같은 종류의 블랙 와이드 슬랙스가 있어요. 사진 속 아이템과 색은 같지만 핏과 세부 속성이 달라 실제로 입었을 때 실루엣이 달라질 수 있어요.';
const longReason = resolveMatchReason(
  {
    wardrobe_item_ids: ['SLACKS-BLACK'],
    match_metadata: { wardrobe_item_id: 'SLACKS-BLACK', reason: longKoreanReason },
  },
  wardrobe,
  'fallback',
);
assert.equal(longReason.text, longKoreanReason);

const mismatched = resolveMatchReason(
  {
    wardrobe_item_ids: ['SLACKS-BLACK'],
    match_metadata: { wardrobe_item_id: 'OTHER-ITEM', reason: '다른 옷을 근거로 한 문구' },
  },
  wardrobe,
  '안전한 프론트 fallback',
);
assert.deepEqual(mismatched, {
  text: '안전한 프론트 fallback',
  wardrobe_item_id: null,
  source: 'fallback',
});

const purchase = resolveMatchReason(
  {
    wardrobe_item_ids: [],
    match_metadata: { wardrobe_item_id: null, reason: '내 옷장에 비교할 코트 후보가 없어요.' },
  },
  wardrobe,
  'fallback',
);
assert.equal(purchase.source, 'server');
assert.equal(purchase.wardrobe_item_id, null);

const resultScreen = await readFile(new URL('../mobile/src/app/result/[id].tsx', import.meta.url), 'utf8');
const outfitsSource = await readFile(new URL('../mobile/src/data/outfits.ts', import.meta.url), 'utf8');
assert.match(resultScreen, /<Text style=\{styles\.cardMeta\}>\{matchReason\.text\}<\/Text>/u);
assert.doesNotMatch(resultScreen, /<Text style=\{styles\.cardMeta\}[^>]*(numberOfLines|ellipsizeMode)/u);
assert.match(
  outfitsSource,
  /item\.wardrobe_item_ids\s*\n\s*\.map\(\(id\) => byId\.get\(id\)\)/u,
  'outfit candidate cards must resolve the same server wardrobe item ids against the loaded wardrobe',
);

function styleBlock(name) {
  const match = resultScreen.match(new RegExp(`\\n  ${name}: \\{([\\s\\S]*?)\\n  \\},`, 'u'));
  assert.ok(match, `${name} style must exist`);
  return match[1];
}

for (const name of ['card', 'cardRow', 'cardText', 'cardMeta']) {
  assert.doesNotMatch(styleBlock(name), /\b(?:height|maxHeight):/u, `${name} must grow with wrapped reason text`);
}
assert.match(styleBlock('cardRow'), /alignItems: 'flex-start'/u);
assert.match(styleBlock('cardText'), /flex: 1/u);
assert.match(styleBlock('cardText'), /minWidth: 0/u);
assert.match(styleBlock('thumb'), /flexShrink: 0/u);
assert.match(styleBlock('tag'), /flexShrink: 0/u);
assert.match(styleBlock('cardMeta'), /lineHeight: 17/u);

console.log('Match reason UI checks passed: server contract linkage, short/long Korean text, and narrow-screen wrapping layout.');
