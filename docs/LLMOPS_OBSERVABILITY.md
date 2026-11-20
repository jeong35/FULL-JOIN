# LLMOps 계측 설계

## 범위

사진 태깅과 일반 챗 LLM 호출의 품질·비용·지연을 측정한다. 사용자 행동용 `user_events`와 분리한다. 비교 피드백 학습 데이터 수집은 이번 범위가 아니며 이 설계에도 포함하지 않는다.

## 호출 단위 기록

권장 테이블 `llm_calls`의 최소 필드:

| 필드 | 의미 |
|---|---|
| `call_id` | 서버 생성 UUID, 중복 제거 키 |
| `feature` | `style_tagging` 또는 `chat_general` |
| `release_git_sha` | 배포 metadata |
| `model` | 실제 snapshot 이름 |
| `prompt_version` | 프롬프트/계약 버전 |
| `started_at`, `latency_ms` | 시작 시각과 전체 지연 |
| `status` | `success`, `http_error`, `timeout`, `invalid_output`, `fallback` |
| `http_status`, `error_code` | 원문 오류 대신 제한된 분류 |
| `input_tokens`, `cached_input_tokens`, `output_tokens` | API usage의 실제 값 |
| `estimated_cost_usd` | 해당 호출 시점의 버전 고정 단가로 계산, 없으면 null |
| `fallback_used`, `fallback_reason` | fallback 여부와 제한된 enum |
| `style_image_id_hash`, `user_id_hash` | 필요한 경우에만 서버 salt 해시; 원문 식별자 저장 금지 |

사진, 캡션, 프롬프트, 답변, 채팅 원문, 닉네임, PIN, URL query는 기본 로그에 저장하지 않는다. 오류 객체도 allowlist된 코드만 저장한다.

## 집계

- 호출 수: `feature/model/prompt_version/release_git_sha`별 count
- 성공률: `success / 전체`
- 실패율: 상태별 count와 비율
- fallback률: `fallback_used=true / 전체`
- 토큰: input/cached/output 합계와 평균
- 비용: 실제 usage × 호출 당시 단가. 단가 버전을 함께 보존한다.
- 지연: 평균, p50, p95, p99. 표본이 매우 적으면 p95 대신 표본 수를 함께 표시한다.

## 코드 격리 구조

외부 호출을 `measureLlmCall(feature, metadata, operation)` 래퍼로 감싼다. 래퍼는 `performance.now()`로 시간을 재고 Responses API의 usage를 파싱하며, 성공/예외/fallback을 한 번만 기록한다. 계측 저장 실패는 제품 응답을 막지 않되 서버 로그에 제한된 오류 코드를 남긴다.

현재 CHAT-01 이후 보유 옷·상품 탐색·사진 아이템 질문은 LLM 호출이 0회이므로 `llm_calls`를 만들지 않는다. 일반 질문이 실제 LLM을 호출했을 때만 `chat_general`을 기록한다.

## 출시 순서

1. 팀이 보존 기간, 접근 권한, 비용 단가 버전 정책을 합의한다.
2. migration과 RLS를 별도 리뷰한다.
3. 로컬/staging에서 원문이 저장되지 않는지 테스트한다.
4. dashboard 쿼리와 alert 기준을 만든다.
5. 운영 적용 후 release SHA별 baseline을 만든다.

이번 브랜치에서는 설계만 추가하며 DB table이나 운영 계측은 생성하지 않는다.
