# 동료평가 기간 사용자 행동 데이터 복원

기준일: 2026-11-25

분석 기간: `[2026-11-12 00:00, 2026-11-19 00:00)` Asia/Seoul

재실행 SQL: `scripts/peer-evaluation-recovery.sql`

## 1. 결론

동료평가 기간의 실제 화면 이동·클릭 이벤트는 복원할 수 없다. 운영 `user_events`에 이 기간으로 남아 있는 행은 `analytics-smoke` 버전의 `app_open` 1건뿐이며, 동료평가 행동이 아니라 합성 점검 데이터다. 당시 웹 앱의 이벤트 큐는 메모리에만 있었고 전송 전에 큐에서 제거한 뒤 실패를 무시했기 때문에, 앱을 다시 실행해도 누락 이벤트가 재전송되지 않는다.

11월 11일까지는 팀 내부 테스트 기간이므로 분석에서 제외했다. `wardrobe_items.created_at`과 `hearts.saved_at`에 남아 있는 행을 이용해 **현재도 존재하는 등록·저장 행동의 하한**을 복원한 결과, 기본 제외 규칙 적용 후 14개의 가명 식별자에서 옷 71행과 사진 저장 38행이 확인됐다. 그러나 운영 DB에는 동료평가 참여자 명단이나 계정 역할이 없어 팀원과 평가자를 완전히 구분할 수 없다. 따라서 14는 “확정 동료평가 사용자”가 아니라 **추가 코호트 검토가 필요한 운영 식별자 수**다.

주요 원인은 모바일·Edge Function·DB가 호환되는 하나의 release로 배포되지 않은 **배포 드리프트**다. 11월 11일 배포 모바일은 배치형 `/events`를 보냈지만, 운영에는 이후 별도 단건 이벤트 프로토타입 스키마가 기록돼 있었다. 이 프로토타입과 canonical 배치 스키마의 무삭제 정렬 및 Edge Function 재배포는 11월 20일에 수행됐다. 과거 Edge/API 로그가 남지 않아 날짜별로 404, validation 실패, DB schema 오류 중 어느 응답이 발생했는지는 확정할 수 없다.

복원 데이터를 원시 이벤트처럼 `user_events`에 INSERT하지 않았다. 이 문서와 SQL에도 닉네임, PIN, 채팅 원문, 사용자 사진, 원시 `user_id`를 포함하지 않는다.

## 2. 신뢰도와 해석 규칙

| 분류 | 의미 | 이번 분석의 예 |
|---|---|---|
| `observed_event` | 실제 수집된 이벤트 | 기간 내 `analytics-smoke`의 `app_open` 1건. 합성 데이터로 제외 |
| `persisted_action` | 행동 후 현재 DB에 남아 있는 행 | 기간 내 `wardrobe_items`, `hearts` |
| `log_inferred` | 운영 로그나 배포 기록으로 추정 | 11월 11일 Expo 배포 commit 후보, 기간 중 Edge 계약 상태 |
| `current_snapshot` | 현재 상태이며 당시 상태로 볼 수 없음 | `user_style_preferences`, 현재 남아 있는 스타일 카탈로그 |
| `unavailable` | 확인 불가능 | 실제 화면 이동, 삭제된 옷, 저장 취소, 비교 결과 확인, 당시 추구미 |

다음 해석 제한을 모든 수치에 적용한다.

- `wardrobe_items`와 `hearts`는 삭제된 옷과 저장 취소 이력을 포함하지 않는다. 따라서 전체 과거 행동 수가 아니라 **확인 가능한 잔존 기록**이다.
- 이벤트가 없는 사용자를 비활동 사용자로 간주하지 않는다.
- DB 행 생성은 화면 진입, 버튼 클릭 또는 등록에 걸린 시간과 같지 않다.
- 실제 코호트 분모가 없으므로 전환율은 N/A다.
- `user_style_preferences`에는 생성·변경 시각이 없으므로 당시 추구미로 단정하지 않는다.
- API 요청이 있더라도 화면 진입이나 실제 클릭으로 자동 치환하지 않는다.

## 3. 배포 및 변경 상태

### 3.1 2026-11-25 확인 결과

| 대상 | 확인 결과 | 신뢰도 |
|---|---|---|
| 최신 `origin/main` | `a7024c95e877ac824033f1d7d192220c149df9bb` | Git 원격 fetch로 확인 |
| 현재 production Edge Function | health release SHA `2d0369bb629a5396c0534aad474d63ac1ea81070`, Supabase `api` version 23 | 실제 production health 및 함수 목록 |
| 현재 Expo production | deployment `7m12h5ntly`, 보고된 release `8cb01a5` | Expo 운영 화면 및 기존 release 기록 |
| PR #30 | open, draft, mergeable false, head `50ccf760` | GitHub 현재 상태 |
| PR #34 | open, draft, mergeable true, head `67638ea` | GitHub 현재 상태 |
| PR #35 | open, non-draft, mergeable true, head `5c41900` | GitHub 현재 상태 |
| PR #36 | open, non-draft, mergeable true, head `8dac635` | GitHub 현재 상태 |

PR #30/#34/#35/#36은 병합하거나 종료하지 않았다. #34의 검색 이벤트와 #35의 추천 관측 이벤트는 아직 `main`의 평가 기간 데이터에 존재하지 않으며, 이번 복원 SQL에 과거 행동으로 합성하지 않았다. #30의 Auth/RLS·소셜 로그인 변경도 production이나 이번 결과에 반영하지 않았다.

### 3.2 동료평가 기간 배포

- Expo 운영 기록에는 2026-11-11 02:22 KST 배포 `2453rn19ek`가 있다.
- 배포 bundle은 `analytics_version=2026-11-11-v2`, production Supabase API, `/events`, `odit-device-v1`, `login_success`, `wardrobe_add_done`, `result_view`를 포함한다.
- Git 이력에서 bundle과 가장 가까운 모바일 tree는 02:20:58 KST의 merge `399c3b3e9307672ba272956690e4bbf8baea2920`이다. 배포 artifact가 Git SHA 자체를 노출하지 않으므로 이는 **고신뢰 추정**이지 SHA 직접 증명은 아니다.
- `adb6bb6`(v3)과 `fad5ce3`(30분 session 영속화)는 각각 03:12, 03:19 KST에 commit됐으므로 02:22 배포 bundle에는 없다.
- 동료평가 기간 Edge Function의 정확한 Git SHA는 Supabase metadata와 보존 로그에서 확인되지 않는다. GitHub 코드의 존재만으로 production 배포를 주장하지 않는다.

## 4. 이벤트 누락 원인

### 4.1 모바일의 실제 요청

11월 11일 배포 후보의 `mobile/src/data/events.ts`는 다음 계약으로 전송한다.

- 경로: `POST {EXPO_PUBLIC_API_URL}/events`
- content type: `text/plain;charset=UTF-8`
- body:

```json
{
  "device_id": "random-device-id",
  "session_id": "random-session-id",
  "platform": "web",
  "events": [
    {
      "name": "wardrobe_add_done",
      "ts": "ISO-8601",
      "user_id": "pseudonymous-id-or-null",
      "props": {
        "app_version": "...",
        "analytics_version": "2026-11-11-v2"
      }
    }
  ]
}
```

최대 20건 또는 2초마다 전송하며 `keepalive`를 사용한다.

### 4.2 확인된 계약 불일치

`main`의 canonical schema는 `id`, `client_ts`, `device_id`, `session_id`, `name`, `props`를 사용하고 하나의 요청에 여러 이벤트를 받는다. 반면 운영 migration history에 남은 프로토타입은 `event_id`, `occurred_at`, `event_name`, `screen_name`, `duration_ms`, `app_version`, `properties`를 사용하고 API도 단건을 upsert했다.

11월 20일 `202611200002_user_events_batch_alignment.sql`은 이 프로토타입 열을 canonical batch 열로 rename/변환했고, 같은 작업에서 Edge Function version 20을 배포한 뒤 smoke를 성공시켰다. 따라서 적어도 정렬 전에는 운영 DB/API 계약과 모바일 batch 계약이 일치하지 않았다.

원인별 판단은 다음과 같다.

| 후보 | 판단 | 근거 |
|---|---|---|
| API route 미배포 | 기간 일부에 대해 가능성이 높으나 확정 불가 | 당시 Edge SHA와 오래된 invocation/gateway log가 없음 |
| DB migration 누락·schema 불일치 | 확인됨 | production의 prototype history와 11/20 무삭제 batch alignment |
| 이벤트 허용 목록 불일치 | 1차 원인이라는 증거 없음 | 11/11 bundle과 canonical `EVENT_NAMES`는 build check 대상으로 정렬됨. 실제 옛 Edge artifact는 없음 |
| 전송 실패 후 손실 | 확인됨 | fetch 실패·HTTP 실패를 관측하거나 재큐잉하지 않음 |
| 일부 저장 | 실제 사용자 이벤트는 확인되지 않음 | 기간 내 행 1건은 `analytics-smoke` 합성 `app_open` |

가장 정확한 표현은 “모바일과 production Edge/DB가 호환 release로 배포되지 않았고, 클라이언트가 실패를 복구하지 못했다”이다. 로그 없이 특정 기간 전체를 “모두 404였다” 또는 “모두 DB 오류였다”고 좁힐 수는 없다.

### 4.3 기기 큐와 복원 가능성

- `device_id`만 localStorage `odit-device-v1`에 저장한다.
- 02:22 배포의 `session_id`와 이벤트 queue는 모듈 메모리에만 있다.
- `flushEvents()`는 fetch 완료 전에 최대 20건을 queue에서 제거한다.
- network rejection은 `.catch(() => undefined)`로 무시한다.
- HTTP 4xx/5xx도 `fetch` rejection이 아니며 response를 확인하지 않는다.
- retry, backoff, durable outbox, idempotency key가 없다.

따라서 같은 기기의 앱을 다시 실행해도 과거 queue는 사라져 있으며 누락 행동 복원은 불가능하다.

## 5. production 읽기 전용 분석 결과

### 5.1 코호트 상태

기본 필터는 `eval|test|smoke|synthetic|demo` 표식이 있는 식별자를 제외하고, 팀 내부 테스트가 포함된 11월 11일 전체를 기간에서 제외한다. 그러나 나머지 가명 `user_id` 14개가 동료평가 참여자인지, 팀원인지, 다른 운영 사용자인지를 DB만으로 판별할 수 없다. 아래 수치는 이 **미분류 운영 식별자 집합**의 잔존 기록이며, 평가자 명단의 가명 ID와 대조한 뒤 확정해야 한다.

| 지표 | 값 | 신뢰도 |
|---|---:|---|
| 미분류 가명 식별자 합집합 | 14 | `persisted_action` |
| 옷장 등록 잔존 행 / 사용자 | 71 / 12 | `persisted_action` |
| 사진 저장 잔존 행 / 사용자 | 38 / 12 | `persisted_action` |
| 둘 다 수행한 사용자 | 10 | `persisted_action` |
| 기간 내 실제 사용자 이벤트 | 0 | 실제 수집 행 기준. “행동 사용자 0”을 뜻하지 않음 |
| 기간 내 합성 이벤트 | `app_open` 1건, 1식별자 | `observed_event`, 분석 제외 |

`user_events` 전체의 최초 `received_at`은 2026-11-16 08:58:56 UTC이고 현재 총 2,514행이다. 기간 내 유일한 행은 `app_version=analytics-smoke`, platform `web`인 합성 `app_open`이다.

### 5.2 일별 잔존 행동

| KST 날짜 | 옷장 행 | 옷장 사용자 | 저장 행 | 저장 사용자 |
|---|---:|---:|---:|---:|
| 11-12 | 0 | 0 | 0 | 0 |
| 11-13 | 8 | 1 | 1 | 1 |
| 11-14 | 5 | 1 | 3 | 1 |
| 11-15 | 5 | 1 | 1 | 1 |
| 11-16 | 16 | 4 | 21 | 5 |
| 11-17 | 29 | 6 | 8 | 5 |
| 11-18 | 8 | 3 | 4 | 1 |

이는 DAU가 아니라 두 종류의 잔존 행동을 한 사용자 수다. 옷장 등록은 3명, 사진 저장은 2명, 두 행동 합집합은 3명만 서로 다른 KST 날짜에 행동이 남아 있다.

시간대별 분포는 재실행 SQL로 확인할 수 있다. 표본과 코호트가 작으므로 notification 시간 같은 운영 결론에 바로 사용하지 않는다.

### 5.3 옷장 등록

| 기간 내 잔존 등록 도달 | 사용자 |
|---|---:|
| 1벌 이상 | 12 |
| 3벌 이상 | 8 |
| 5벌 이상 | 7 |
| 10벌 이상 | 3 |

5번째 잔존 행이 있는 7명의 첫 행→다섯 번째 행 시간 중앙값은 424.44초(약 7분 4초)다. 범위는 38.35초부터 89,711.28초까지다. 이는 **한 벌 등록 소요 시간**이 아니며 삭제된 행도 반영하지 못한다. “카테고리 등록 2분, 사진 등록 20초”와 같은 주장을 이 데이터로 만들 수 없다. 평가 기간에는 사진 기반 옷 등록 UI도 production에 없었다.

옷장 잔존 행 분포:

- 종류: 상의 30, 하의 21, 신발 8, 아우터 6, 가방 5, 원피스 1
- 색상 상위: 화이트 18, 블랙 17, 그레이 7, 아이보리 5, 네이비·와인 각 4, 블루·차콜·핑크 각 3
- 핏: 레귤러 22, null 15, 오버사이즈 8, 슬림 7, H라인·와이드·일자 각 4, A라인·플레어 각 3, 부츠컷 1

### 5.4 사진 저장과 스타일

사진 저장 잔존 행은 38개다. 저장이 가장 많이 남은 카탈로그 이미지는 `IMG-093`, `IMG-097` 각 3건이며, `IMG-018`, `042`, `049`, `065`, `091`은 각 2건이다.

하나의 이미지가 최대 두 스타일을 가질 수 있어 다음 합계는 38보다 클 수 있다.

| 스타일 | 잔존 저장 연결 수 |
|---|---:|
| 캐주얼 | 16 |
| 미니멀 | 11 |
| 글램 | 9 |
| 스트릿 | 9 |
| 레트로 | 6 |
| 청순 | 5 |
| 스포티 | 4 |
| 러블리·시크 | 각 3 |
| 프레피 | 2 |
| 엘레강스 | 1 |

현재 preference snapshot은 캐주얼 9, 미니멀·스트릿 각 6, 러블리·레트로·청순 각 3, 시크 2, 엘레강스 1로 총 33행이다. 저장 38행 중 34행은 이미지 스타일이 **현재** preference 중 하나와 겹친다. preference 변경 시각이 없으므로 이를 평가 당시 취향 일치율로 해석하지 않는다.

### 5.5 행동 순서와 부분 Activation

둘 다 남아 있는 10명 중 첫 옷 등록이 먼저인 사용자는 6명, 첫 사진 저장이 먼저인 사용자는 4명이며 동일 시각은 없다.

기존 Activation인 “옷장 5벌 이상 + 사진 저장 + 비교 결과 확인” 중 앞의 두 조건은 SQL로 계산할 수 있지만 `result_view` 실제 사용자 이벤트가 없어 마지막 조건을 검증할 수 없다. 따라서 완전 Activation과 전환율은 N/A이며, SQL 결과의 `wardrobe_5_and_saved_photo_users`는 **부분 Activation proxy**로만 사용한다.

## 6. 데이터 소스별 확인 결과

| 소스 | 기간 데이터 | 분류 | 제한 |
|---|---|---|---|
| `user_events` | 합성 smoke 1행, 실제 사용자 0행 | `observed_event` | 행동 부재 증거가 아니라 수집 실패 증거 |
| `wardrobe_items` | 잔존 71행 | `persisted_action` | 삭제 이력 없음 |
| `hearts` | 잔존 38행 | `persisted_action` | 저장 취소 이력 없음 |
| `user_style_preferences` | 변경 시각 없음 | `current_snapshot` | 당시 추구미 복원 불가 |
| `style_images` | 현재 100행, 기간 업로드 0행 | `current_snapshot` | 카탈로그이지 사용자 행동이 아님 |
| `chat_conversations`, `chat_messages` | production table 없음 | `unavailable` | 11/23 migration은 production pending |
| `llm_operation_metrics` | 기간 0행, 현재 전체 6행 | `unavailable`(기간) | 11/20 도입, 사용자 연결 정보 없음 |
| 로그인/식별 | 가명 `user_id`만 관련 테이블에 존재 | `persisted_action` | 계정 roster/역할/로그인 시각 없음 |
| Edge invocation/API gateway log | 기간 로그 없음 | `unavailable` | 현재 UI 보존 범위 밖 |
| Postgres/Storage log | 기간 로그 없음 | `unavailable` | 과거 export/backup 미확인 |
| LLM 제공자 사용량 | 사용자·기능과 연결된 기간 기록 없음 | `unavailable` | provider 비용 기록을 행동으로 볼 수 없음 |
| DB backup/log export | 저장소에서 발견하지 못함 | `unavailable` | 별도 보관본이 있으면 추가 확인 필요 |
| 모바일 queue/localStorage | queue는 메모리, device ID만 영속 | `unavailable` | 재실행 복원 불가 |
| Expo/GitHub 배포 기록 | 모바일 배포와 commit 후보 확인 | `log_inferred` | Expo artifact에 Git SHA 없음 |
| `presentation/odit_event_metrics.pdf` | 이벤트·지표 설계 문서 | `current_snapshot`/설계 | 실제 집계값이 아님 |

Storage에는 사용자 행동 시각을 나타내는 별도 기록이 없으며 사용자 사진을 열람하거나 export하지 않았다. 저장소의 eval 결과도 동료평가 사용 기록이 아니므로 합산하지 않았다.

## 7. 복원 가능/불가능 지표

### 복원 가능

- 미분류 가명 식별자 기준 잔존 행동 사용자 하한
- 날짜·시간대별 옷장 등록 및 사진 저장 잔존 행/사용자
- 사용자별 잔존 등록·저장 수와 1/3/5/10벌 도달
- 첫 잔존 등록부터 다섯 번째 잔존 등록까지 경과 시간
- 옷 종류·색상·핏 분포
- 인기 잔존 저장 이미지와 카탈로그 스타일
- 두 행동의 교집합, 첫 행동 순서, 여러 날짜의 잔존 행동
- 현재 preference snapshot과 저장 이미지 스타일의 현재 기준 겹침

### 복원 불가능

- 확정 동료평가 사용자 수와 전체 참여자 분모
- 피드·옷장·아카이브·비교·챗봇의 화면 진입, 클릭, API 호출 및 오류 횟수
- 삭제된 옷과 저장 취소를 포함한 전체 과거 행동
- 등록 UI 단계별 이탈과 한 벌 등록 소요 시간
- 평가 당시 추구미와 그 변경 이력
- 실제 비교·의사결정 도달, 완전 Activation, 전환율
- 앱 재실행을 통한 과거 이벤트 복원

## 8. 데이터에 근거한 UX 가설

아래는 구현 결론이 아니라 다음 계측으로 검증할 가설이다.

1. **초기 옷장 대량 등록 지원**: 12명 중 7명의 잔존 등록이 5벌 이상이고, 첫→다섯 번째 잔존 행 중앙값은 약 7분 4초다. 한 세션 내 여러 벌을 넣는 수요가 있을 수 있으므로 사진 일괄 등록·최근 값 재사용·진행 상태 저장을 실험한다. 등록 방식별 실제 duration 이벤트가 없으므로 시간 절감 수치는 새 계측으로 검증한다.
2. **저장→옷장 연결 강화**: 두 행동이 모두 남은 10명 중 4명은 사진 저장이 먼저다. 저장 사진 상세에서 “이 룩과 비교할 내 옷 추가” 같은 연결을 실험한다.
3. **옷장→추천 다음 행동 제시**: 6명은 옷 등록이 먼저다. 5벌 도달 뒤 저장·비교로 이동시키는 CTA를 계측한다.
4. **다음날 복귀 장치**: 서로 다른 날짜에 두 잔존 행동 중 하나라도 남은 식별자는 3명뿐이다. 표본·분모 한계가 크지만 저장 룩 재방문, 미완성 옷장 이어하기를 새 session 기반 이벤트로 측정할 가치가 있다.
5. **대량 등록의 기본값 최적화**: 잔존 옷의 상의·하의와 블랙·화이트 비중이 높다. 최근 선택값/빠른 칩을 검토하되, 이 분포를 전체 시장 선호로 일반화하지 않는다.

새 UX의 효과는 `wardrobe_add_start`→`wardrobe_add_done` duration, 입력 방식(`manual`, `photo_single`, `photo_batch`), batch 개수, 실패·재시도, 다음날 복귀를 성공 응답 확인 후 durable queue로 수집해야 한다.

## 9. 재실행과 추가 확인 방법

1. 평가자·팀원 roster를 원시 닉네임이 아니라 앱과 동일한 방식으로 가명화한다.
2. `scripts/peer-evaluation-recovery.sql`의 `excluded_exact`에 팀·demo·smoke 식별자만 추가한다. 결과를 Git에 올릴 때 원시 식별자를 제거한다.
3. Supabase production SQL Editor에서 읽기 권한으로 실행한다. 스크립트는 `BEGIN TRANSACTION READ ONLY`와 `SELECT`만 사용하고 마지막에 rollback한다.
4. 별도 보관된 11월 12~18일 Edge/API/Postgres log export 또는 DB backup이 있다면 보존 위치와 checksum을 먼저 기록하고, `/events` status code와 error message만 집계한다. request body, PIN, 채팅, 사진은 export하지 않는다.
5. Expo deployment artifact와 Supabase function artifact의 별도 manifest가 있으면 SHA를 대조한다. 현재 공개 metadata만으로 당시 Edge Git SHA를 만들지 않는다.

실제 평가자 roster나 과거 로그 export가 제공되기 전에는 이 문서의 14명을 확정 코호트로 표현하거나 전환율을 계산하지 않는다.
