# 갭 분석 테스트 하니스 사람 리뷰

> 상태: **최종 사람 리뷰 대기**  
> 작성일: 2026-10-13  
> 최초 구현 커밋: `232cbd2`

## 검증 범위

이 리뷰 대상은 AC9의 `classifyGap()` 경계값과 판정 근거 ID에 한정된다. 전체 제품의 다른 수용 기준까지 검증한 것이 아니다. 이후 각 기능을 구현할 때 관련 AC에 맞는 테스트 하니스 또는 evals를 별도로 추가한다.

## 고정된 리뷰 대상

| 파일 | SHA-256 |
|---|---|
| `tests/harness/golden_cases.yaml` | `0ab6e8c7a1a63c5f50e31bf55f2822f1665bdfad3337a2b9f46c144715f78d2c` |
| `tests/test_gap_analysis_golden.ts` | `c75383df8249574cda624a341cd047c4d715f6fbc08cf00ca06114edbfe31155` |

`npm run check:harness`는 위 두 파일이 바뀌면 실패한다. 변경이 필요하면 구현을 중단하고 사람의 승인을 받은 뒤 해시와 이 기록을 함께 갱신한다.

## 사람이 확인할 항목

- [ ] 골든 케이스 7개가 AC9의 경계값을 의도대로 나타낸다.
- [ ] 테스트 러너가 7개 케이스를 각각 독립 테스트로 수집한다.
- [ ] `gap_status`, 정확한 `wardrobe_item_ids`, 금지 ID를 검사한다.
- [ ] 구현 파일이 없을 때만 케이스 테스트를 skip하며, 구현 오류는 숨기지 않는다.
- [ ] 결함 주입 결과가 기대한 케이스에서 실패했다.
- [ ] 위 테스트 코드와 골든 케이스를 기능 구현의 완료 기준으로 최종 수용한다.

## 결함 주입 증거

| 실행 | 결과 |
|---|---|
| 정답 임시 구현 | 8 passed, 0 skipped |
| 항상 `구매`를 반환하는 결함 | 5 failed, 3 passed |
| 모든 옷장 ID를 반환하는 결함 | 3 failed, 5 passed |
| 최종 구현 | 8 passed, 0 skipped |

두 번째 결함은 `gap_status` 계산을 유지하면서 `활용`·`비슷함` 결과의 `wardrobe_item_ids`에 입력 옷장의 ID를 필터 없이 모두 넣은 것이다. 테스트는 다음 두 층으로 이를 검출한다.

1. `result.gap_status`를 골든 케이스의 `expect_gap_status`와 비교한다.
2. 실제로 일치한 근거 ID만 반환했는지 `expect_wardrobe_item_ids`와 정확히 비교하고, `must_not_use_wardrobe_item_ids`에 든 ID가 없는지 추가로 확인한다.

현재 금지 ID인 `w-loafer-multi`는 대상 Item과 색은 `멀티`로 같지만 `kind`가 `로퍼`라서, `스니커즈` 판정의 근거로 사용하면 안 된다.

최종 수용은 자동 검사 결과가 아니라 위 체크리스트를 사람이 검토한 뒤 결정한다.
