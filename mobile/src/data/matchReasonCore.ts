export type MatchReasonMetadata = {
  wardrobe_item_id: string | null;
  reason: string;
};

export type MatchReasonItem = {
  wardrobe_item_ids: readonly string[];
  match_metadata?: MatchReasonMetadata;
};

export type MatchReasonWardrobeItem = {
  id: string;
};

export type ResolvedMatchReason = {
  text: string;
  wardrobe_item_id: string | null;
  source: 'server' | 'fallback';
};

// 서버 reason은 같은 응답의 첫 후보 ID와 실제 로드된 옷장이 모두 일치할 때만 표시한다.
// 구버전 서버 또는 불일치 응답에서는 기존 프론트 설명을 유지해 잘못된 옷을 근거로 들지 않는다.
export function resolveMatchReason(
  item: MatchReasonItem,
  wardrobe: readonly MatchReasonWardrobeItem[],
  fallback: string,
): ResolvedMatchReason {
  const metadata = item.match_metadata;
  const reason = metadata?.reason.trim() ?? '';
  const firstCandidateId = item.wardrobe_item_ids[0] ?? null;

  if (metadata !== undefined && reason.length > 0) {
    if (metadata.wardrobe_item_id === null && firstCandidateId === null) {
      return { text: reason, wardrobe_item_id: null, source: 'server' };
    }

    if (
      metadata.wardrobe_item_id !== null
      && metadata.wardrobe_item_id === firstCandidateId
      && wardrobe.some((candidate) => candidate.id === metadata.wardrobe_item_id)
    ) {
      return {
        text: reason,
        wardrobe_item_id: metadata.wardrobe_item_id,
        source: 'server',
      };
    }
  }

  return { text: fallback, wardrobe_item_id: null, source: 'fallback' };
}
