// 코디 대체에 사람이 승인한 가까운 종류 짝. 판정(AC9)은 바꾸지 않는다.
export const SUBSTITUTE_KIND_PAIRS = [
  ["민소매", "반소매티셔츠"], ["반소매티셔츠", "긴소매티셔츠"], ["셔츠", "블라우스"],
  ["니트", "맨투맨"], ["맨투맨", "후드"], ["슬랙스", "코튼팬츠"], ["데님팬츠", "코튼팬츠"],
  ["카고팬츠", "코튼팬츠"], ["미디스커트", "롱스커트"], ["미니원피스", "미디원피스"],
  ["미디원피스", "롱원피스"], ["트렌치코트", "코트"], ["트위드자켓", "재킷"],
  ["퍼자켓", "무스탕"], ["퍼코트", "코트"], ["숏코트", "코트"], ["하프코트", "코트"],
  ["롱코트", "코트"], ["숏코트", "트렌치코트"], ["하프코트", "트렌치코트"],
  ["롱코트", "트렌치코트"], ["점퍼", "야상"], ["숏패딩", "롱패딩"], ["샌들", "슬리퍼"],
  ["숄더백", "토트백"], ["숄더백", "크로스백"], ["토트백", "에코백"],
] as const;

const SUBSTITUTE_KINDS = new Map<string, Set<string>>();
for (const [left, right] of SUBSTITUTE_KIND_PAIRS) {
  SUBSTITUTE_KINDS.set(left, (SUBSTITUTE_KINDS.get(left) ?? new Set()).add(right));
  SUBSTITUTE_KINDS.set(right, (SUBSTITUTE_KINDS.get(right) ?? new Set()).add(left));
}

export function substituteKindsFor(kind: string): string[] {
  return [...(SUBSTITUTE_KINDS.get(kind) ?? [])];
}

export function isApprovedSubstituteKind(sourceKind: string | null, candidateKind: string | null): boolean {
  return sourceKind !== null && candidateKind !== null && SUBSTITUTE_KINDS.get(sourceKind)?.has(candidateKind) === true;
}
