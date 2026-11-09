export type HeartItemRow = {
  item_id: string;
  slot: string;
  kind: string;
  color: string | null;
  visual_fit: string | null;
  visibility: string;
  brand: string | null;
  product_name: string | null;
  brand_source: string;
  shop: string | null;
  product_url: string | null;
  is_representative_product: boolean;
};

export type GapResult = {
  gap_status: "활용" | "비슷함" | "구매" | null;
  wardrobe_item_ids: string[];
};

export function heartItemResponse(row: HeartItemRow, gap: GapResult) {
  return {
    item_id: row.item_id,
    slot: row.slot,
    kind: row.kind,
    color: row.color,
    visual_fit: row.visual_fit,
    visibility: row.visibility,
    brand: row.brand,
    product_name: row.product_name,
    brand_source: row.brand_source,
    ...gap,
    decision_options: gap.gap_status === "비슷함" ? ["활용", "구매"] as const : [],
  };
}
export function representativeProductFields(rows: readonly HeartItemRow[]) {
  const representative = rows.find((row) => row.is_representative_product && row.product_url !== null);
  return representative === undefined
    ? {}
    : {
        shop: representative.shop,
        product_name: representative.product_name,
        product_url: representative.product_url,
      };
}
