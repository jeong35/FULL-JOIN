import {
  COLORS,
  KINDS,
  MATERIALS,
  PATTERNS,
  SEASONS,
  SLOTS,
  VISUAL_FITS,
} from "./catalog.ts";
import { withKoreanParticle } from "./korean.ts";
import { isApprovedSubstituteKind } from "./substitute_kinds.ts";

export type GarmentDetails = Readonly<Record<string, string | readonly string[] | undefined>>;

export type ComparableGarment = {
  slot: string;
  kind: string | null;
  color: string | null;
  visual_fit: string | null;
  material?: readonly string[];
  pattern?: string | null;
  seasons?: readonly string[];
  details?: GarmentDetails;
};

export type SimilarityWardrobeItem = ComparableGarment & { id: string };
export type UserSimilarityWardrobeItem = SimilarityWardrobeItem & { user_id: string };
export type SimilaritySourceItem = ComparableGarment & { item_id: string };

export const GARMENT_FEATURE_WEIGHTS = {
  kind: 0.35,
  color: 0.25,
  visual_fit: 0.15,
  material: 0.10,
  pattern: 0.07,
  seasons: 0.03,
  details: 0.05,
} as const;

export type GarmentFeature = keyof typeof GARMENT_FEATURE_WEIGHTS;

export type GarmentSimilarityConfig = {
  weights: Readonly<Record<GarmentFeature, number>>;
  minimum_comparable_weight: number;
  minimum_comparable_features: number;
  reuse_threshold: number;
  similar_threshold: number;
  // AC9의 종류 동일 조건을 기본으로 보존한다. 대체 후보처럼 호출자가 종류를 먼저
  // 제한한 경우에만 false로 바꿔 서로 다른 종류의 상대 점수를 비교한다.
  require_same_kind: boolean;
};

export const DEFAULT_GARMENT_SIMILARITY_CONFIG: GarmentSimilarityConfig = {
  weights: GARMENT_FEATURE_WEIGHTS,
  minimum_comparable_weight: 0.5,
  minimum_comparable_features: 2,
  reuse_threshold: 0.9,
  similar_threshold: 0.7,
  require_same_kind: true,
};

export type SimilarityReason =
  | "scored"
  | "incompatible_slot"
  | "insufficient_information"
  | "zero_norm";

export type GarmentSimilarity = {
  similarity: number | null;
  comparable_weight: number;
  comparable_features: GarmentFeature[];
  reason: SimilarityReason;
};

export type RankedWardrobeCandidate = GarmentSimilarity & {
  wardrobe_item_id: string;
};

export type BestWardrobeMatch = Omit<GarmentSimilarity, "reason"> & {
  wardrobe_item_id: string | null;
  reason: SimilarityReason | "no_compatible_candidate";
};

export type OutfitSimilarityMatch = {
  item_id: string;
  wardrobe_item_id: string | null;
  similarity: number | null;
  match: "활용" | "비슷함" | "구매";
  comparable_features: GarmentFeature[];
};

export type MatchEvidenceStatus = "same" | "similar" | "different" | "unknown";
export type MatchEvidence = {
  feature: "kind" | "color" | "visual_fit";
  status: MatchEvidenceStatus;
  source_value: string | null;
  candidate_value: string | null;
};
export type GarmentMatchExplanation = {
  code: "no_candidate" | "exact" | "color_similar" | "fit_difference" | "kind_substitute" | "attribute_difference";
  summary: string;
  evidence: MatchEvidence[];
};

const KNOWN_SLOTS = new Set<string>(SLOTS);
const KNOWN_KINDS = new Set<string>(KINDS);
const KNOWN_COLORS = new Set<string>(COLORS);
const KNOWN_FITS = new Set<string>(VISUAL_FITS);
const KNOWN_MATERIALS = new Set<string>(MATERIALS);
const KNOWN_PATTERNS = new Set<string>(PATTERNS);
const KNOWN_SEASONS = new Set<string>(SEASONS);
const CROSS_SLOT_KINDS = new Set(["카디건", "후드집업", "베스트", "점프수트"]);
const NON_COMPARABLE_COLORS = new Set(["멀티", "기타"]);

const COLOR_FAMILY = new Map<string, string>();
for (const family of [
  ["화이트", "아이보리"],
  ["베이지", "브라운", "모카"],
  ["블랙", "차콜", "그레이"],
  ["네이비", "블루", "스카이블루"],
  ["연청", "중청"],
  ["진청", "흑청"],
  ["그린", "카키", "민트"],
  ["레드", "와인", "핑크", "연핑크"],
  ["퍼플", "라벤더"],
  ["옐로우", "오렌지", "살구"],
  ["실버", "골드"],
] as const) {
  const familyId = family.join("/");
  for (const color of family) COLOR_FAMILY.set(color, familyId);
}
type FeatureBlock = { source: Map<string, number>; candidate: Map<string, number> };

function oneHot(value: string, prefix: string): Map<string, number> {
  return new Map([[`${prefix}:${value}`, 1]]);
}

function multiHot(values: readonly string[], prefix: string): Map<string, number> {
  return new Map([...new Set(values)].sort().map((value) => [`${prefix}:${value}`, 1]));
}

function colorVector(color: string): Map<string, number> {
  const entries: Array<[string, number]> = [[`color:${color}`, Math.sqrt(0.7)]];
  const family = COLOR_FAMILY.get(color);
  if (family !== undefined) entries.push([`color-family:${family}`, Math.sqrt(0.3)]);
  return new Map(entries);
}

function detailsVector(details: GarmentDetails): Map<string, number> {
  const tokens: string[] = [];
  for (const key of Object.keys(details).sort()) {
    const raw = details[key];
    const values = typeof raw === "string" ? [raw] : raw;
    for (const value of values ?? []) {
      if (value.trim().length > 0) tokens.push(`${key}=${value}`);
    }
  }
  return multiHot(tokens, "detail");
}

function nonEmpty(values: readonly string[] | undefined, known: ReadonlySet<string>): string[] {
  return [...new Set((values ?? []).filter((value) => known.has(value)))].sort();
}

function featureBlocks(source: ComparableGarment, candidate: ComparableGarment): Partial<Record<GarmentFeature, FeatureBlock>> {
  const blocks: Partial<Record<GarmentFeature, FeatureBlock>> = {};
  if (source.kind !== null && candidate.kind !== null && KNOWN_KINDS.has(source.kind) && KNOWN_KINDS.has(candidate.kind)) {
    blocks.kind = { source: oneHot(source.kind, "kind"), candidate: oneHot(candidate.kind, "kind") };
  }
  if (source.color !== null && candidate.color !== null &&
      KNOWN_COLORS.has(source.color) && KNOWN_COLORS.has(candidate.color) &&
      !NON_COMPARABLE_COLORS.has(source.color) && !NON_COMPARABLE_COLORS.has(candidate.color)) {
    blocks.color = { source: colorVector(source.color), candidate: colorVector(candidate.color) };
  }
  if (source.visual_fit !== null && candidate.visual_fit !== null && KNOWN_FITS.has(source.visual_fit) && KNOWN_FITS.has(candidate.visual_fit)) {
    blocks.visual_fit = { source: oneHot(source.visual_fit, "fit"), candidate: oneHot(candidate.visual_fit, "fit") };
  }
  const sourceMaterials = nonEmpty(source.material, KNOWN_MATERIALS);
  const candidateMaterials = nonEmpty(candidate.material, KNOWN_MATERIALS);
  if (sourceMaterials.length > 0 && candidateMaterials.length > 0) {
    blocks.material = { source: multiHot(sourceMaterials, "material"), candidate: multiHot(candidateMaterials, "material") };
  }
  if (source.pattern !== null && source.pattern !== undefined && candidate.pattern !== null && candidate.pattern !== undefined &&
      KNOWN_PATTERNS.has(source.pattern) && KNOWN_PATTERNS.has(candidate.pattern)) {
    blocks.pattern = { source: oneHot(source.pattern, "pattern"), candidate: oneHot(candidate.pattern, "pattern") };
  }
  const sourceSeasons = nonEmpty(source.seasons, KNOWN_SEASONS);
  const candidateSeasons = nonEmpty(candidate.seasons, KNOWN_SEASONS);
  if (sourceSeasons.length > 0 && candidateSeasons.length > 0) {
    blocks.seasons = { source: multiHot(sourceSeasons, "season"), candidate: multiHot(candidateSeasons, "season") };
  }
  const sourceDetails = detailsVector(source.details ?? {});
  const candidateDetails = detailsVector(candidate.details ?? {});
  if (sourceDetails.size > 0 && candidateDetails.size > 0) {
    blocks.details = { source: sourceDetails, candidate: candidateDetails };
  }
  return blocks;
}

function normalizeBlock(values: ReadonlyMap<string, number>, scale: number): Map<string, number> {
  const norm = Math.sqrt([...values.values()].reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return new Map();
  return new Map([...values].map(([key, value]) => [key, (value / norm) * scale]));
}

export function cosineSimilarity(left: ReadonlyMap<string, number>, right: ReadonlyMap<string, number>): number | null {
  const leftNorm = Math.sqrt([...left.values()].reduce((sum, value) => sum + value * value, 0));
  const rightNorm = Math.sqrt([...right.values()].reduce((sum, value) => sum + value * value, 0));
  if (leftNorm === 0 || rightNorm === 0) return null;
  let dot = 0;
  for (const [key, value] of left) dot += value * (right.get(key) ?? 0);
  return dot / (leftNorm * rightNorm);
}

export function slotsAreCompatible(source: ComparableGarment, candidate: ComparableGarment): boolean {
  if (!KNOWN_SLOTS.has(source.slot) || !KNOWN_SLOTS.has(candidate.slot)) return false;
  if (source.slot === candidate.slot) return true;
  return source.kind !== null && source.kind === candidate.kind && CROSS_SLOT_KINDS.has(source.kind);
}

function evidenceStatus(
  feature: MatchEvidence["feature"],
  sourceValue: string | null,
  candidateValue: string | null,
): MatchEvidenceStatus {
  if (sourceValue === null || candidateValue === null) return "unknown";
  if (sourceValue === candidateValue) return "same";
  if (feature === "color") {
    const sourceFamily = COLOR_FAMILY.get(sourceValue);
    if (sourceFamily !== undefined && sourceFamily === COLOR_FAMILY.get(candidateValue)) return "similar";
  }
  return "different";
}

function differenceSummary(
  evidence: ReadonlyMap<MatchEvidence["feature"], MatchEvidenceStatus>,
  candidate: ComparableGarment,
): string {
  const color = evidence.get("color");
  const fit = evidence.get("visual_fit");
  if (color === "different" && fit === "different" && candidate.color !== null && candidate.visual_fit !== null) {
    return `같은 종류의 옷이 있지만, 내 옷은 ${withKoreanParticle(`${candidate.color}·${candidate.visual_fit}`, "이라/라")} 색상과 핏이 달라요.`;
  }
  if (color === "different" && candidate.color !== null) {
    const prefix = fit === "same" ? "종류와 핏은 같지만" : "같은 종류의 옷이 있지만";
    return `${prefix}, 내 옷은 ${withKoreanParticle(candidate.color, "이라/라")} 색상이 달라요.`;
  }
  if (fit === "different" && candidate.visual_fit !== null) {
    return `같은 종류의 옷이 있지만, 내 옷은 ${withKoreanParticle(candidate.visual_fit, "이라/라")} 핏이 달라요.`;
  }
  return "같은 종류의 옷이 있지만 일부 속성이 달라요.";
}

export function explainGarmentMatch(
  source: ComparableGarment,
  candidate: ComparableGarment | null,
  gapStatus?: "활용" | "비슷함" | "구매",
): GarmentMatchExplanation {
  if (candidate === null) {
    return {
      code: "no_candidate",
      summary: "옷장에 등록된 옷 중 활용할 만한 아이템을 찾지 못했어요.",
      evidence: [],
    };
  }

  const evidence: MatchEvidence[] = [
    { feature: "kind", status: evidenceStatus("kind", source.kind, candidate.kind), source_value: source.kind, candidate_value: candidate.kind },
    { feature: "color", status: evidenceStatus("color", source.color, candidate.color), source_value: source.color, candidate_value: candidate.color },
    { feature: "visual_fit", status: evidenceStatus("visual_fit", source.visual_fit, candidate.visual_fit), source_value: source.visual_fit, candidate_value: candidate.visual_fit },
  ];
  const byFeature = new Map(evidence.map((entry) => [entry.feature, entry.status]));
  if (byFeature.get("kind") === "different") {
    const approved = isApprovedSubstituteKind(source.kind, candidate.kind);
    return {
      code: "kind_substitute",
      summary: approved
        ? "종류는 다르지만 대신 활용할 수 있는 옷이에요."
        : "종류가 달라 같은 용도로 활용할 수 있는지 확인이 필요해요.",
      evidence,
    };
  }
  if (gapStatus === "구매") {
    return {
      code: "attribute_difference",
      summary: differenceSummary(byFeature, candidate),
      evidence,
    };
  }
  if (byFeature.get("color") === "similar") {
    const colorDetail = candidate.color === null
      ? ""
      : ` 내 옷의 색상은 ${withKoreanParticle(candidate.color, "이에요/예요")}.`;
    const fitDetail = byFeature.get("visual_fit") === "different" && candidate.visual_fit !== null
      ? ` 핏은 ${withKoreanParticle(candidate.visual_fit, "이라/라")} 실루엣이 달라질 수 있어요.`
      : "";
    return {
      code: "color_similar",
      summary: `종류가 같고 색상도 비슷해요.${colorDetail}${fitDetail}`,
      evidence,
    };
  }
  if (byFeature.get("visual_fit") === "different") {
    const fitSummary = candidate.visual_fit === null
      ? "핏이 달라 실루엣이 달라질 수 있어요."
      : `내 옷은 ${withKoreanParticle(candidate.visual_fit, "이라/라")} 실루엣이 달라질 수 있어요.`;
    return {
      code: "fit_difference",
      summary: `종류와 색은 같지만, ${fitSummary}`,
      evidence,
    };
  }
  if ([...byFeature.values()].every((status) => status === "same" || status === "unknown")) {
    const summary = byFeature.get("visual_fit") === "same"
      ? "종류와 색, 핏이 모두 같아 활용할 수 있어요."
      : byFeature.get("color") === "same"
        ? "종류와 색이 같아요."
        : "같은 종류의 옷을 활용할 수 있어요.";
    return { code: "exact", summary, evidence };
  }
  return {
    code: "attribute_difference",
    summary: differenceSummary(byFeature, candidate),
    evidence,
  };
}

export function scoreGarmentSimilarity(
  source: ComparableGarment,
  candidate: ComparableGarment,
  config: GarmentSimilarityConfig = DEFAULT_GARMENT_SIMILARITY_CONFIG,
): GarmentSimilarity {
  if (!slotsAreCompatible(source, candidate)) {
    return { similarity: null, comparable_weight: 0, comparable_features: [], reason: "incompatible_slot" };
  }
  const blocks = featureBlocks(source, candidate);
  const comparableFeatures = (Object.keys(blocks) as GarmentFeature[])
    .filter((feature) => (config.weights[feature] ?? 0) > 0)
    .sort();
  const comparableWeight = comparableFeatures.reduce((sum, feature) => sum + config.weights[feature], 0);
  if (comparableFeatures.length < config.minimum_comparable_features || comparableWeight < config.minimum_comparable_weight) {
    return {
      similarity: null,
      comparable_weight: comparableWeight,
      comparable_features: comparableFeatures,
      reason: "insufficient_information",
    };
  }
  const left = new Map<string, number>();
  const right = new Map<string, number>();
  for (const feature of comparableFeatures) {
    const block = blocks[feature];
    if (block === undefined) continue;
    const scale = Math.sqrt(config.weights[feature]);
    for (const [key, value] of normalizeBlock(block.source, scale)) left.set(`${feature}/${key}`, value);
    for (const [key, value] of normalizeBlock(block.candidate, scale)) right.set(`${feature}/${key}`, value);
  }
  const similarity = cosineSimilarity(left, right);
  return {
    similarity,
    comparable_weight: comparableWeight,
    comparable_features: comparableFeatures,
    reason: similarity === null ? "zero_norm" : "scored",
  };
}

export function rankWardrobeCandidates(
  source: ComparableGarment,
  wardrobe: readonly SimilarityWardrobeItem[],
  config: GarmentSimilarityConfig = DEFAULT_GARMENT_SIMILARITY_CONFIG,
): RankedWardrobeCandidate[] {
  return wardrobe.flatMap((candidate): RankedWardrobeCandidate[] => {
    if (config.require_same_kind && source.kind !== candidate.kind) return [];
    const score = scoreGarmentSimilarity(source, candidate, config);
    if (score.similarity === null) return [];
    return [{ wardrobe_item_id: candidate.id, ...score }];
  }).sort((left, right) =>
    (right.similarity ?? -1) - (left.similarity ?? -1) || left.wardrobe_item_id.localeCompare(right.wardrobe_item_id));
}

export function bestWardrobeMatch(
  source: ComparableGarment,
  wardrobe: readonly SimilarityWardrobeItem[],
  config: GarmentSimilarityConfig = DEFAULT_GARMENT_SIMILARITY_CONFIG,
): BestWardrobeMatch {
  const ranked = rankWardrobeCandidates(source, wardrobe, config);
  const best = ranked[0];
  if (best !== undefined) return best;

  const compatible = wardrobe
    .filter((candidate) => (!config.require_same_kind || source.kind === candidate.kind) && slotsAreCompatible(source, candidate))
    .sort((left, right) => left.id.localeCompare(right.id));
  const fallback = compatible[0];
  if (fallback === undefined) {
    return {
      wardrobe_item_id: null,
      similarity: null,
      comparable_weight: 0,
      comparable_features: [],
      reason: "no_compatible_candidate",
    };
  }
  return { wardrobe_item_id: fallback.id, ...scoreGarmentSimilarity(source, fallback, config) };
}

export function bestUserWardrobeMatch(
  userId: string,
  source: ComparableGarment,
  wardrobe: readonly UserSimilarityWardrobeItem[],
  config: GarmentSimilarityConfig = DEFAULT_GARMENT_SIMILARITY_CONFIG,
): BestWardrobeMatch {
  return bestWardrobeMatch(source, wardrobe.filter((candidate) => candidate.user_id === userId), config);
}

function matchLabel(score: number | null, config: GarmentSimilarityConfig): "활용" | "비슷함" | "구매" {
  if (score === null || score < config.similar_threshold) return "구매";
  return score >= config.reuse_threshold ? "활용" : "비슷함";
}

// 실험/오프라인 비교 전용이다. 운영 AC9 판정에는 연결하지 않는다.
// 가중치와 임계값은 팀 합의 전 제품 정책으로 사용하면 안 된다.
export function matchOutfitItems(
  items: readonly SimilaritySourceItem[],
  wardrobe: readonly SimilarityWardrobeItem[],
  config: GarmentSimilarityConfig = DEFAULT_GARMENT_SIMILARITY_CONFIG,
): OutfitSimilarityMatch[] {
  const pairs = items.flatMap((item, itemIndex) =>
    rankWardrobeCandidates(item, wardrobe, config).map((candidate) => ({ itemIndex, candidate })),
  ).sort((left, right) =>
    (right.candidate.similarity ?? -1) - (left.candidate.similarity ?? -1) ||
    left.itemIndex - right.itemIndex ||
    left.candidate.wardrobe_item_id.localeCompare(right.candidate.wardrobe_item_id));

  const chosenByItem = new Map<number, RankedWardrobeCandidate>();
  const usedWardrobeIds = new Set<string>();
  for (const pair of pairs) {
    if (chosenByItem.has(pair.itemIndex) || usedWardrobeIds.has(pair.candidate.wardrobe_item_id)) continue;
    if ((pair.candidate.similarity ?? -1) < config.similar_threshold) continue;
    chosenByItem.set(pair.itemIndex, pair.candidate);
    usedWardrobeIds.add(pair.candidate.wardrobe_item_id);
  }

  return items.map((item, index): OutfitSimilarityMatch => {
    const chosen = chosenByItem.get(index);
    return {
      item_id: item.item_id,
      wardrobe_item_id: chosen?.wardrobe_item_id ?? null,
      similarity: chosen?.similarity ?? null,
      match: matchLabel(chosen?.similarity ?? null, config),
      comparable_features: chosen?.comparable_features ?? [],
    };
  });
}
