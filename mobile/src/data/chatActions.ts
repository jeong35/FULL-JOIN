import type { ChatAction } from './types';

const TYPES = new Set([
  'OPEN_RECOMMENDATION', 'OPEN_FILTERED_FEED', 'OPEN_STYLE_DETAIL', 'OPEN_COMPARISON', 'OPEN_WARDROBE',
  'OPEN_WARDROBE_ADD', 'OPEN_PHOTO_ADD', 'OPEN_ARCHIVE', 'OPEN_PRODUCT_SEARCH', 'OFFER_DAILY_REMINDER',
  'OFFER_WARDROBE_REMINDER', 'OFFER_STYLE_ALERT', 'NONE',
]);

export function safeProductUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['www.musinsa.com', 'mobile.a-bly.com', 'zigzag.kr'].includes(url.hostname) ? value : null;
  } catch { return null; }
}

export function validChatAction(value: unknown): value is ChatAction {
  if (value === null || typeof value !== 'object') return false;
  const action = value as Partial<ChatAction>;
  if (typeof action.action_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(action.action_id)) return false;
  if (typeof action.type !== 'string' || !TYPES.has(action.type)) return false;
  if (typeof action.label !== 'string' || action.label.length < 1 || action.label.length > 80) return false;
  if (action.params === null || typeof action.params !== 'object') return false;
  if (action.type === 'OPEN_PRODUCT_SEARCH' && safeProductUrl(action.params.url) === null) return false;
  if (['OPEN_STYLE_DETAIL', 'OPEN_COMPARISON'].includes(action.type) && typeof action.params.style_image_id !== 'string') return false;
  return true;
}

export function actionTarget(action: ChatAction): string {
  if (action.type === 'OPEN_RECOMMENDATION' || action.type === 'OFFER_DAILY_REMINDER') return 'recommend';
  if (action.type === 'OPEN_FILTERED_FEED') return 'search_results';
  if (action.type === 'OPEN_STYLE_DETAIL') return 'style_detail';
  if (action.type === 'OPEN_COMPARISON') return 'result';
  if (action.type === 'OPEN_WARDROBE') return 'wardrobe';
  if (action.type === 'OPEN_WARDROBE_ADD' || action.type === 'OPEN_PHOTO_ADD') return 'wardrobe_add';
  if (action.type === 'OPEN_ARCHIVE') return 'archive';
  if (action.type === 'OPEN_PRODUCT_SEARCH') return 'product_search';
  return 'chat';
}

export function chatClock(): number {
  return Date.now();
}
