# 관리자 대시보드 지표 정의

## 범위와 보안

- 실행 위치: `admin-dashboard/`, 로컬 데이터는 `npm run dashboard:local`, 운영 읽기는 `npm run dashboard:production`
- 데이터: 선택한 Supabase의 `user_events`, `wardrobe_items`, `llm_operation_metrics`
- 시간대: 모든 일·주 구간과 날짜 표시는 `Asia/Seoul`
- 기간: 일별·주별 빠른 선택과 사용자 지정 시작/종료일, 최대 366일
- 보안: 두 모드 모두 `127.0.0.1`에만 bind한다. service-role 키는 서버 프로세스에만 있고 브라우저 bundle/API 응답에는 없다. 운영 모드는 별도 32자 이상 관리자 bearer token도 요구한다.
- 개인정보 최소화: 집계 결과만 브라우저로 보내며 user_id 목록, 사진, 채팅/프롬프트 원문은 표시하지 않는다.
- 테스트 구분: `eval-`, `test-`, `smoke-` user_id 또는 `props.is_test/smoke_test/environment` 표시 이벤트는 Product Analytics에서 제외하고 제외 건수만 표시한다.

관리자 인증과 전용 read-only credential/proxy가 완성되기 전에는 외부 호스트에 bind하거나 배포하지 않는다. 운영 모드의 현재 코드는 select만 수행하지만 service-role credential 자체는 쓰기 권한이 있으므로 localhost 운영 도구로만 사용한다.

운영 실행 예시의 실제 값은 shell history나 저장소에 남기지 않는다.

```bash
DASHBOARD_DATA_SOURCE=production \
DASHBOARD_ALLOW_REMOTE_READONLY=true \
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<server-only-key> \
DASHBOARD_ADMIN_TOKEN=<32자-이상-임시-관리자-토큰> \
npm run dashboard:production
```

브라우저 입력칸의 관리자 토큰은 메모리에서 요청 헤더에만 사용하며 localStorage/sessionStorage에 저장하지 않는다.

## 공통 기준

- 이벤트 시각: `client_ts`가 있으면 우선하고, 없으면 `received_at`을 사용한다.
- 사용자 중복 제거: 사용자 비율과 DAU/WAU는 `user_id` distinct다. 익명 이벤트는 이벤트 횟수에는 포함될 수 있지만 사용자 분모에는 포함하지 않는다.
- 세션: 원시 데이터의 `session_id`를 사용한다. 앱은 마지막 이벤트 후 30분 inactivity까지 같은 세션을 유지한다. 현재 1차 대시보드는 세션 수보다 사용자 퍼널을 우선 표시한다.
- 기간 종료는 exclusive다: `[from, to)`.
- 분모가 0이거나 필요한 이벤트가 없으면 0%를 만들지 않고 `확인 불가`로 표시한다.

## Product Analytics

| 지표 | 분자 | 분모/중복 제거 | 기간 |
|---|---|---|---|
| DAU | 해당 KST 날짜 이벤트가 있는 distinct user_id | 날짜별 distinct user_id | 일별 |
| WAU | 해당 KST 월요일 시작 주의 distinct user_id | 주별 distinct user_id | 주별 |
| 신규 사용자 | 저장소 전체 이력에서 첫 `login_success`가 기간 안인 user_id | distinct user_id | 선택 기간 |
| 사용자당 옷장 등록 수 | 현재 `wardrobe_items` 개수 합 | 기간 내 활성 distinct user_id | 조회 시점 snapshot |
| 신규 사용자 5벌 이상 비율 | 신규 사용자 중 현재 옷장 5개 이상 | 신규 사용자 | 선택 기간, 목표 60% |
| 튜토리얼 완료율 | `intro_view` 사용자 중 `intro_done` 사용자 | `intro_view` distinct user_id | 선택 기간 |
| 핵심 퍼널 | 각 이전 단계까지 도달하고 다음 이벤트도 가진 사용자 | 이전 단계 distinct user_id | 선택 기간 |
| 사진 저장 | `photo_save_done` 횟수 | 이벤트 횟수 | 선택 기간 |
| 코디 비교 | `result_view` 횟수 | 이벤트 횟수 | 선택 기간 |
| 쇼핑 클릭 사용자 CTR | `result_view` 사용자 중 `shop_link_click` 사용자 | `result_view` distinct user_id | 선택 기간 |
| 챗봇 이용률 | `chat_send` distinct user_id | 활성 distinct user_id | 선택 기간 |
| 화면 체류 | `screen_leave.props.duration_ms` 평균/p95 | 화면별 유효 표본 | 선택 기간 |
| 신규 기능 이용 | 각 기능 이벤트 distinct user_id | 활성 distinct user_id | 선택 기간 |

핵심 퍼널 순서:

1. `login_success`
2. `taste_done` 또는 `taste_later`
3. `wardrobe_add_done`
4. `photo_save_done`
5. `result_view`
6. `item_choice` 또는 `shop_link_click`

전환율은 `다음 단계 사용자 / 이전 단계 사용자`, 이탈률은 `1 - 전환율`이다. 현재 구현은 `docs/EVENTS.md`의 승인된 사용자 단위 boolean 퍼널을 재사용한다.

현재 이벤트로 계산할 수 없는 항목:

- 추천 탭/특정 아이템 기반 추천 이용률: `recommendation_view`, `recommendation_item_impression`, `recommendation_item_click`이 필요하다.
- 사진 기반 옷 등록 전환: `wardrobe_photo_start`, `wardrobe_photo_analysis_done`, `wardrobe_photo_add_done`이 필요하다.

이 이벤트는 제품 흐름이 확정되기 전에 임의 추가하지 않는다.

## LLMOps

| 지표 | 계산 기준 |
|---|---|
| 기능별 AI 호출 수 | `feature`별 `llm_called=true` count |
| 성공/실패율 | 실제 LLM 호출 중 `status=success` / 나머지 |
| 토큰 | 모델별 input/output 합; cached input은 DB에 별도 보존 |
| 일별/누적 비용 | `estimated_cost_usd` 합, KST 일자별 및 전체 |
| 평균/p95 지연 | operation 전체 `latency_ms` 평균과 nearest-rank p95 |
| 오류 유형 | allowlist된 `error_type` count |
| fallback 비율 | `fallback_used=true / 전체 operation` |
| grounded 응답 비율 | chat operation 중 `response_mode=grounded` 비율 |
| 버전 비교 | `model`, `prompt_version`, `release_git_sha`별 집계 |
| 사진 등록/보정 건당 비용 | 해당 feature의 비용 표본 평균, 표본이 없으면 확인 불가 |

`grounded`는 AI를 호출하지 않은 검증된 구조화 응답이다. configuration fallback은 OpenAI 호출 전에 실패할 수 있으므로 `llm_called=false`인 것이 정상이다. 성공률의 분모는 실제 LLM 호출만 사용하고, fallback 비율의 분모는 전체 operation을 사용한다.

가격은 계측 시점 코드의 `pricing_version`으로 고정한다. 모르는 모델은 비용을 추정하지 않는다. 대시보드는 비용이 null인 항목을 0달러로 단정하지 않고 건당 비용 표본에서는 제외한다.

## 구현과 테스트

- 순수 집계: `src/fulljoin/admin_metrics.ts`
- 집계 회귀: `tests/test_admin_metrics.ts`
- 로컬 서버: `admin-dashboard/server.mjs`
- UI: `admin-dashboard/public/`
- synthetic seed: `supabase/seed.sql`

`npm run test:admin-metrics`는 KST 날짜, distinct user, sequential funnel, 테스트 제외, 분모 없음, LLM 성공/fallback/grounded/비용/p95를 검증한다. `npm run test:integration:local`은 실제 로컬 DB에 LLMOps와 사용자 이벤트가 저장되는 것을 검증한다.
