# CHAT-03 평가 계약 변경 제안

## 변경이 필요한 이유

현재 `evals`의 live chat 7건은 모든 성공 응답에 `answer_source=openai`를 요구한다. CHAT-01/03은 보유 옷·저장 사진·상품 탐색·범위 밖 질문을 구조화 데이터로 더 안전하고 저렴하게 답하므로, 이 질문에 LLM 호출을 강제하는 기존 조건은 새 제품 방향과 충돌한다.

이번 브랜치는 승인된 eval case와 판정 코드를 수정하지 않는다. 아래 v2 계약을 팀 승인 후 별도 변경한다.

## 제안하는 v2 기준

| 질문 유형 | 허용 `answer_source` | 필수 검증 |
|---|---|---|
| 보유 옷 상담 | `grounded` | `claimed_owned_item_ids`가 fixture 옷장 부분집합, 비교 화면 ID 일치 |
| 저장 사진 상담 | `grounded` | `analysis_id_used` 일치, 재분석 0회, 사진 아이템과 비교 결과 일치 |
| 유사 상품 탐색 | `grounded` | 빈 옷장 허용, `match_type=similar`, 근거 없는 상품명·브랜드 0건 |
| 일반 패션 상담 | `openai` 또는 모델 실패 시 `fallback` | 일반론임을 표시, 소유권·상품·가격·사이즈·URL 허구 0건 |
| 복합 상담 | `openai` 또는 `fallback` | `answer_sections`에서 옷장 근거와 일반 조언 분리 |
| 범위 밖 | `grounded` | 범위 안내, LLM 호출 0회 |

공통 기준:

- 없는 옷 보유 주장 0건
- 비교 후보 ID 불일치 0건
- 승인되지 않은 대체 관계 0건
- 근거 없는 브랜드·제품명·가격·사이즈·링크 0건
- `image_reanalysis_count=0`
- 원문 프롬프트·대화가 LLMOps 테이블에 저장되지 않음

## 데이터셋 분리

- 기존 11월 17일 baseline은 수정하지 않고 v1로 보존한다.
- CHAT-03 회귀 입력은 새 버전으로 추가한다.
- intent 분류의 결정론적 평가는 모델 judge 없이 수행한다.
- 자연어 일반 조언 품질만 사람 채점 또는 승인된 judge를 사용한다.

팀 승인 전에는 live chat 7건을 새 계약으로 통과했다고 보고하지 않는다.
