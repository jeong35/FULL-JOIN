import assert from 'node:assert/strict';

import { chatActionSchema, classifyActionChatIntents, extractChatFilters, rankCompatibleStyles } from '../src/fulljoin/action_chat.ts';
import { explainGarmentMatch } from '../src/fulljoin/garment_similarity.ts';

assert.deepEqual(classifyActionChatIntents('겨울에 입기 좋은 미니멀 코디 보여줘.'), ['find_style']);
assert.ok(classifyActionChatIntents('지금 내 옷으로 입을 수 있는 코디 있어?').includes('wardrobe_outfit_search'));
assert.ok(classifyActionChatIntents('오늘 뭐 입을까?').includes('today_outfit'));
assert.ok(classifyActionChatIntents('매일 아침 코디를 추천받고 싶어.').includes('notify_today_outfit'));
assert.ok(classifyActionChatIntents('비슷한 상품 찾아줘.').includes('find_similar_item'));
assert.deepEqual(extractChatFilters('아이보리 가디건과 미니멀 코디'), { styles: ['미니멀'], kind: '카디건', color: '아이보리' });

const ranked = rankCompatibleStyles([
  { id: 'one', items: [{ item_id: 'top', slot: '상의', kind: '니트', color: '아이보리', visual_fit: '레귤러', visibility: '전체' }] },
  { id: 'two', items: [{ item_id: 'bottom', slot: '하의', kind: '슬랙스', color: '블랙', visual_fit: '일자', visibility: '전체' }] },
], [{ id: 'wardrobe-top', slot: '상의', kind: '니트', color: '아이보리', visual_fit: '레귤러' }]);
assert.equal(ranked[0]?.style_image_id, 'one');
assert.equal(ranked[0]?.usable_item_count, 1);

assert.equal(explainGarmentMatch({ slot: '하의', kind: '미니스커트', color: '블랙', visual_fit: 'A라인' }, null).summary,
  '옷장에 등록된 옷 중 활용할 만한 아이템을 찾지 못했어요.');
assert.equal(explainGarmentMatch({ slot: '상의', kind: '니트', color: '아이보리', visual_fit: '레귤러' }, null).summary,
  '옷장에 등록된 옷 중 활용할 만한 아이템을 찾지 못했어요.');

assert.equal(chatActionSchema.safeParse({
  action_id: '00000000-0000-4000-8000-000000000000', type: 'OPEN_PRODUCT_SEARCH', label: '찾아보기',
  params: { url: 'https://evil.example/search?q=cardigan' },
}).success, false);

console.log('Action-oriented chat contracts passed.');
