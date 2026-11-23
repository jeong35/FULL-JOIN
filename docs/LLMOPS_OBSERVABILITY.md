# LLMOps 계측 설계

## 구현 상태

main과 운영 Edge Function에 다음 계측이 적용돼 있다. 운영 DB에는 `202611200003_llm_operation_metrics.sql`까지 적용됐다.

- `src/fulljoin/llm_observability.ts`: Responses API usage 검증, 모델 가격표, 비용·지연·fallback·grounded 집계
- `supabase/migrations/202611200003_llm_operation_metrics.sql`: 행동 이벤트와 분리된 운영 지표 테이블
- `supabase/functions/api/index.ts`: 사진 태깅과 챗 호출/grounded/fallback 계측
- `tests/test_llm_observability.ts`: 토큰·비용·개인정보 최소화·평균/p95·grounded 비율 회귀
- `src/fulljoin/llmops_alerts.ts`: 최소 표본을 둔 실패율·fallback·p95·일 비용 경고 평가
- `admin-dashboard/`: localhost에서 로컬 또는 운영 Supabase를 읽는 집계 UI와 선택적 webhook 점검 command

## 범위

사진 태깅과 일반 챗 LLM 호출의 품질·비용·지연을 측정한다. 사용자 행동용 `user_events`와 분리한다. 비교 피드백 학습 데이터 수집은 이번 범위가 아니며 이 설계에도 포함하지 않는다.

## 호출 단위 기록

테이블 `llm_operation_metrics`의 최소 필드:

| 필드 | 의미 |
|---|---|
| `id` | 서버 생성 UUID |
| `feature` | `style_tagging`, `chat`; 이후 `wardrobe_photo_tagging`, `image_enhancement` 확장 가능 |
| `response_mode`, `llm_called` | `llm`, `grounded`, `fallback`과 실제 모델 호출 여부 |
| `release_git_sha` | 배포 metadata |
| `model` | 실제 snapshot 이름 |
| `prompt_version` | 프롬프트/계약 버전 |
| `started_at`, `latency_ms` | 시작 시각과 전체 지연 |
| `status` | `success`, `failure`, `fallback`, `grounded` |
| `http_status`, `error_type` | 원문 오류 대신 제한된 분류 |
| `input_tokens`, `cached_input_tokens`, `output_tokens` | API usage의 실제 값 |
| `estimated_cost_usd` | 해당 호출 시점의 버전 고정 단가로 계산, 없으면 null |
| `fallback_used`, `fallback_reason` | fallback 여부와 제한된 enum |

사진, 캡션, 프롬프트, 답변, 채팅 원문, 닉네임, PIN, URL query, 사용자 ID, 사진 ID는 저장하지 않는다. 오류 객체도 allowlist된 코드만 저장한다.

## 집계

- 호출 수: `feature/model/prompt_version/release_git_sha`별 count
- 성공률: `success / 전체`
- 실패율: 상태별 count와 비율
- fallback률: `fallback_used=true / 전체`
- grounded 챗 비율: `feature='chat' and response_mode='grounded' / 전체 chat operation`
- 토큰: input/cached/output 합계와 평균
- 비용: 실제 usage × 호출 당시 단가. 단가 버전을 함께 보존한다.
- 지연: 평균, p50, p95, p99. 표본이 매우 적으면 p95 대신 표본 수를 함께 표시한다.

## 코드 격리 구조

`buildLlmOperationMetric()`이 `performance.now()` 기반 지연과 Responses API usage를 정규화한다. Edge Function은 성공/예외/fallback/grounded operation을 한 번씩 기록한다. 계측 저장 실패는 제품 응답을 막지 않으며 서버 로그에는 제한된 오류 코드만 남긴다.

보유 옷·상품 탐색·저장 사진·범위 밖 질문은 LLM 호출이 0회지만 grounded 비율 산출을 위해 `llm_called=false` operation을 남긴다. 일반 패션 또는 복합 질문의 일반 조언 부분만 모델을 호출한다.

## 집계 SQL 예시

```sql
select
  feature,
  model,
  prompt_version,
  release_git_sha,
  count(*) as operations,
  count(*) filter (where llm_called) as llm_calls,
  avg(latency_ms) as average_latency_ms,
  percentile_cont(0.95) within group (order by latency_ms) as p95_latency_ms,
  sum(input_tokens) as input_tokens,
  sum(output_tokens) as output_tokens,
  sum(estimated_cost_usd) as estimated_cost_usd,
  count(*) filter (where fallback_used) as fallback_count
from public.llm_operation_metrics
group by feature, model, prompt_version, release_git_sha;
```

```sql
select
  count(*) filter (where response_mode = 'grounded')::numeric / nullif(count(*), 0)
    as grounded_chat_ratio
from public.llm_operation_metrics
where feature = 'chat';
```

가격은 호출 당시 코드에 고정된 `pricing_version`과 함께 저장한다. 현재 GPT-4.1 mini 단가는 [OpenAI 모델 문서](https://developers.openai.com/api/docs/models/gpt-4.1-mini)와 [공식 가격표](https://developers.openai.com/api/docs/pricing)를 기준으로 한다. 알 수 없는 모델은 비용을 추정하지 않고 `null`로 둔다.

## 출시 순서

1. 팀이 운영 지표 보존 기간을 합의한다.
2. migration과 service-role 전용 권한을 별도 리뷰한다.
3. 로컬/staging에서 원문과 사용자 식별자가 저장되지 않는지 테스트한다.
4. 현재 실험용 alert 기준으로 baseline을 관찰하고 팀 기준을 확정한다.
5. 전용 read-only credential/proxy와 관리자 인증을 확정한 뒤 외부 운영 화면 공개 여부를 결정한다.

## 운영 조회와 알림

운영 지표는 외부에 공개하지 않고 localhost에서만 조회한다. `DASHBOARD_DATA_SOURCE=production`, `DASHBOARD_ALLOW_REMOTE_READONLY=true`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, 32자 이상의 `DASHBOARD_ADMIN_TOKEN`을 서버 프로세스에 제공한 뒤 `npm run dashboard:production`을 실행한다. service-role 키는 브라우저에 전달되지 않고 서버 코드는 select만 수행하지만, 키 자체 권한은 read-only가 아니므로 전용 read-only proxy/credential이 생기기 전까지 원격 호스팅하지 않는다.

`npm run dashboard:alerts`는 최근 24시간을 기본으로 읽어 경고를 JSON으로 출력하며 경고가 있으면 exit code 2를 반환한다. `LLMOPS_ALERT_WEBHOOK_URL`을 명시한 경우에만 원문 없는 집계 경고를 전송한다. 실제 webhook 목적지와 secret은 저장소에 두지 않으며 팀 승인 전 설정하지 않는다.

현재 기본값은 최소 실제 호출 10건, 실패율 5%, fallback 10%, p95 15초, 하루 예상 비용 5달러다. 이는 제품 정책이 아니라 초기 운영용 실험값이며 baseline 후 조정한다.

운영 migration 적용과 dashboard/alert 생성은 별도 승인 전 수행하지 않는다.
