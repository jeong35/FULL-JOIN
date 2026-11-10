// AGENTS.md 2절 용어집의 대표어를 그대로 쓴다. 서버 응답(docs/API_MVP.md)과 같은 모양이다.
import type { Color, Kind, Slot, Style, VisualFit } from './catalog';

// 사용자가 가진 옷(옷장 칩으로 등록).
export type WardrobeItem = {
  id: string;
  slot: Slot;
  kind: Kind;
  color: Color;
  visual_fit: VisualFit | null;
};

export type StyleImageSource = '쇼핑몰' | '인플루언서' | '연예인' | '자체_촬영';

// 피드 사진(GET /feed). thumbnail_url은 1시간 뒤 만료되는 서명 주소다.
export type StyleImage = {
  id: string;
  thumbnail_url: string;
  style: Style[];
  source: StyleImageSource;
};

export type StyleImageDetailItem = {
  item_id: string;
  slot: Slot;
  kind: Kind;
  color: Color | null;
  visual_fit: VisualFit | null;
  brand: string | null;
  product_name: string | null;
  brand_source: '캡션' | '이미지_글자' | '쇼핑몰_상품정보' | '없음';
  shop: string | null;
  product_url: string | null;
  is_representative_product: boolean;
};

export type StyleImageDetail = {
  style_image: StyleImage;
  items: StyleImageDetailItem[];
};

export type Season = '봄' | '여름' | '가을' | '겨울';

export type ArchiveImage = StyleImage & {
  season: Season;
  season_year: number;
  saved_at: string;
};

export type GapStatus = '활용' | '비슷함' | '구매';

// 하트 응답의 아이템 한 개. slot~brand_source는 서버가 아이템 정보를 같이 줄 때만 온다.
export type HeartItem = {
  item_id: string;
  // 옷장이 비어 있으면 null.
  gap_status: GapStatus | null;
  wardrobe_item_ids: string[];
  decision_options: GapStatus[];
  slot?: Slot;
  kind?: Kind;
  color?: Color | null;
  visual_fit?: VisualFit | null;
  visibility?: '전체' | '일부' | '판단불가';
  brand?: string | null;
  product_name?: string | null;
  brand_source?: '캡션' | '이미지_글자' | '쇼핑몰_상품정보' | '없음';
};

// 정확한 상품 또는 비슷한 상품 검색 결과.
export type Product = {
  item_id: string;
  platform: string;
  url: string;
  match_type: 'exact' | 'similar';
};

export type Outfit = {
  outfit_id: string;
  wardrobe_item_ids: string[];
  item_ids: string[];
};

export type ItemDecisionResult = {
  item_id: string;
  decision: '활용' | '구매';
  outfits: Outfit[];
  products: Product[];
};

export type ChatResult = {
  answer: string;
  analysis_id_used: string;
  claimed_owned_item_ids: string[];
  products: Product[];
  image_reanalysis_count: 0;
  external_instruction_applied: false;
  answer_source?: 'openai' | 'fallback';
};

// POST /style-images/{id}/heart. shop~product_url은 사진 출처(쇼핑몰 상품)로, 서버가 줄 때만 온다.
export type HeartResult = {
  style_image_id: string;
  saved_at: string;
  items: HeartItem[];
  products: Product[];
  message?: string;
  shop?: string | null;
  product_name?: string | null;
  product_url?: string | null;
};
