# 전체 AC 골든 케이스 사람 리뷰

> 상태: **리뷰 후보 — 최종 사람 수용 전**  
> 작성일: 2026-10-13  
> 범위: `docs/SPEC.md`의 AC1~AC15(AC8은 사용하지 않음)

## 목적

강의 5의 “AC는 골든 케이스와 연결하며, 연결 없는 AC는 검증되지 않는다”는 조건을 저장소에서 자동 확인한다.

- AC9의 구현 판정은 기존 승인 파일 `tests/harness/golden_cases.yaml`과 `tests/test_gap_analysis_golden.ts`가 담당한다.
- 나머지 AC의 입력·정상 출력·결함 출력·판정 키는 `tests/harness/product_golden_cases.yaml`에 둔다.
- `tests/test_acceptance_contracts_golden.ts`는 SPEC의 모든 AC가 최소 한 케이스와 연결되는지, 정상 예시는 통과하고 결함 예시는 거부되는지 검사한다.

## 중요한 경계

계약 케이스의 정상·결함 예시가 통과하는 것은 **판정 규칙이 기계적으로 실행 가능하다**는 뜻이다. 아직 구현하지 않은 앱 기능이 동작한다는 뜻은 아니다. 각 기능을 구현할 때 동일한 판정 함수에 실제 앱 출력을 넣는 테스트를 추가해야 해당 AC의 구현이 완료된다.

## AC별 케이스

| AC | 골든 케이스 | 핵심 판정 키 |
|---|---|---|
| AC1 | `tagging_and_wardrobe_share_closed_enums` | 태깅·옷장 공통 필드의 enum 밖 값 0개 |
| AC2 | `ungrounded_product_identity_is_forbidden` | 근거 없으면 브랜드·제품명 null, `similar` |
| AC3 | `heart_gap_analysis_latency_budget` | 평균 ≤ 5초, p95 ≤ 10초 |
| AC4 | `tagging_runs_once_per_style_image` | 태깅 호출 ≤ 1회 |
| AC5 | `archive_filters_style_and_sorts_recent_first` | 선택 스타일만, `saved_at` 내림차순 |
| AC6 | `embedded_instruction_is_not_executed` | 분석 결과가 사람 정답에서 변하지 않음 |
| AC7 | `person_name_requires_textual_evidence` | 텍스트 근거 없으면 이름 `null` |
| AC9 | 기존 상세 케이스 7개 + `similar_match_waits_for_user_decision` | `gap_status`, 정확한 옷장 ID, 금지 ID, 비슷함의 사용자 선택 대기 |
| AC10 | `no_clothing_means_empty_items_and_no_feed_publish` | 빈 items, 게시 안 함, 링크 없음 |
| AC11 | `outfit_uses_at_least_one_registered_wardrobe_item` | 각 Outfit에 등록 ID ≥ 1, 미등록 ID 0 |
| AC12 | `empty_wardrobe_does_not_force_purchase` | 갭 분석 안 함, 구매 단정 안 함 |
| AC13 | `wardrobe_registration_allows_four_selections_max`, `wardrobe_registration_does_not_require_photo` | 사진 필수 아님, 사용자 선택 ≤ 4회 |
| AC14 | `chat_reuses_analysis_and_only_claims_registered_clothes` | 저장 분석 재사용, 등록 옷만, AC2·AC6 준수 |
| AC15 | `home_feed_uses_70_20_10_and_style_filter_is_strict` | 홈 14·4·2, 필터 결과 전부 선택 스타일 |

## 사람 확인 체크리스트

- [ ] 각 케이스가 SPEC의 해당 AC 문장과 같은 의미인지 확인했다.
- [ ] 정상 출력이 실제로 허용할 결과인지 확인했다.
- [ ] 결함 출력이 반드시 거부해야 할 결과인지 확인했다.
- [ ] 판정 키가 조건을 일부만 확인하거나 우회 가능하게 만들지 않는지 확인했다.
- [ ] 검토 후 골든 파일과 테스트 파일의 해시를 `scripts/check-agent-harness.mjs`에 고정한다.
