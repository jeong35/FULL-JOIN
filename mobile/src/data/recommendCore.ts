export type CompleteLookRank = {
  image: { id: string; saved_at: string };
  pieces: readonly { similar: boolean; substitute: boolean }[];
  weatherFit: boolean;
  styleMatch: boolean;
};

export type AlmostLookRank = {
  image: { id: string; saved_at: string };
  styleMatch: boolean;
};

// 같은 입력에 같은 순서: 날씨→약속/취향→대체·비슷함 최소→최근 저장→ID.
// 원본 배열은 바꾸지 않는다.
export function rankCompleteLooks<T extends CompleteLookRank>(looks: readonly T[], max: number): T[] {
  return [...looks].sort((left, right) =>
    Number(right.weatherFit) - Number(left.weatherFit)
    || Number(right.styleMatch) - Number(left.styleMatch)
    || count(left.pieces, 'substitute') - count(right.pieces, 'substitute')
    || count(left.pieces, 'similar') - count(right.pieces, 'similar')
    || compareSaved(left.image, right.image))
    .slice(0, max);
}

export function rankAlmostLooks<T extends AlmostLookRank>(looks: readonly T[], max: number): T[] {
  return [...looks].sort((left, right) =>
    Number(right.styleMatch) - Number(left.styleMatch)
    || compareSaved(left.image, right.image))
    .slice(0, max);
}

export function compareSaved(left: { id: string; saved_at: string }, right: { id: string; saved_at: string }): number {
  return right.saved_at.localeCompare(left.saved_at) || left.id.localeCompare(right.id);
}

function count(pieces: readonly { similar: boolean; substitute: boolean }[], key: 'similar' | 'substitute'): number {
  return pieces.filter((piece) => piece[key]).length;
}

export type RecommendationEmptyState =
  | 'ready'
  | 'loading'
  | 'empty_wardrobe'
  | 'empty_archive'
  | 'pending_comparison'
  | 'no_complete_look';

export function recommendationEmptyState(input: {
  wardrobeReady: boolean;
  archiveReady: boolean;
  wardrobeCount: number;
  archiveCount: number;
  pending: number;
  completeLookCount: number;
}): RecommendationEmptyState {
  if (!input.wardrobeReady || !input.archiveReady) return 'loading';
  if (input.wardrobeCount === 0) return 'empty_wardrobe';
  if (input.archiveCount === 0) return 'empty_archive';
  if (input.completeLookCount > 0) return 'ready';
  if (input.pending > 0) return 'pending_comparison';
  return 'no_complete_look';
}
