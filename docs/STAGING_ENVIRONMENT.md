# Supabase staging 환경

> Private Beta 후보 기준은 `PRIVATE_BETA_POLICY.md`가 우선한다. CHAT-02 DDL은 deferred로 두고 active migration에는 history 정합용 no-op만 유지하며, synthetic A/B Auth 계정으로 일반 챗봇과 격리를 검증한다.

## 대상

- 프로젝트: `full-join-staging`
- project ref: `ylbrssggfzuzyhgdhehu`
- 리전: Singapore (`ap-southeast-1`)
- 플랜: Free의 두 번째 활성 프로젝트
- 운영 project ref `gctbcanltqgcymdlplyr`와 완전히 분리한다.

DB 비밀번호는 저장소나 `.env`에 쓰지 않고 macOS Keychain의 service
`full-join-staging-supabase-db`, account `FULL-JOIN`으로 저장했다. 운영 사용자·사진·대화 데이터는 복제하지 않는다.

## 2026-11-23 이력

- main 기준 migration 15개에 Auth `202611230001`과 CHAT-02 `202611230003`을 더한 17개를 dry-run 후 적용했다.

위 문장은 과거 staging 이력이다. 신규 Private Beta 후보는 migration 차이를 다시 dry-run하며, CHAT-02 테이블이 staging에 남아 있어도 기본 `CHAT_HISTORY_ENABLED=false`로 사용하지 않는다.
- `supabase/seed.sql`은 local 전용이므로 staging에 적용하지 않았다.
- API Edge Function은 `codex/chat-history@bd70fe4b79f13dd96eb80f4b58d42b01113186a4`로 배포했다. gateway는 공개 health와 사용자 API를 한 함수에서 제공하기 위해 `verify_jwt=false`를 유지하지만, 사용자 경로는 함수 내부 `auth.getUser` 검증을 통과해야 한다.
- release metadata의 `RELEASE_GIT_SHA`와 `/health` 응답 SHA가 일치함을 `scripts/verify-release.mjs`로 확인했다.
- synthetic 이메일 Auth 사용자 A/B로 옷장 CRUD, 비교 후보, 챗 저장·pagination·삭제, 이벤트, LLMOps, API 401/403와 RLS 격리를 통과했다. 테스트 사용자·사진·옷장·이벤트는 종료 시 정리하며 유료 OpenAI 호출은 하지 않는다.
- 익명 로그인은 staging에서 비활성 상태다. 모바일 인증 정책 확정 전 임의로 켜지 않는다.
- Free 프로젝트는 활동이 적으면 일시정지될 수 있다.

## GitHub Environment에 필요한 값

`staging` Environment를 만들고 다음 secret을 환경 범위로 둔다.

- `RELEASE_APPROVAL_GUARD=staging-enabled`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF=ylbrssggfzuzyhgdhehu`
- `SUPABASE_DB_PASSWORD`
- `EXPO_TOKEN`

secret 값은 문서·workflow log·모바일 bundle에 넣지 않는다. Private Beta 후보가 검증된 단일 commit SHA를 가진 뒤 `.github/workflows/release.yml`에서 exact SHA를 지정해 배포한다.

## 검증 순서

1. `supabase migration list --remote`로 실제 이력과 후보 active migration을 대조한다.
2. 알림 migration 적용 후 `notification_dispatch_config.endpoint_url`을 해당 환경의 `/notifications/dispatch` URL로 설정한다. 미설정 상태에서는 cron이 외부 호출을 하지 않는다.
3. `FULL_JOIN_STAGING_*` 환경변수를 런타임에만 주입하고 `npm run test:integration:staging`을 실행한다.
4. synthetic Auth 사용자 A/B로 401·403·RLS와 사진별 저장·pagination·삭제를 확인한다.
5. 테스트 사용자와 fixture만 제거하고 운영 승인을 별도로 받는다.
6. 모바일 access token 전달과 서버 인증 계약이 같은 exact SHA로 검증되기 전에는 운영에 적용하지 않는다.

staging에서도 `db reset`, `migration repair`, 운영 데이터 import는 사용하지 않는다.

## 2026-11-27 Private Beta 통합 검증

검증 대상은 `codex/private-beta-auth@ae83d6735f740cb0b839d3e3b1f98326c2254f8b`이다. 검증 중 발견한 환경별 알림 URL 안전 수정과 통합 테스트 보강은 아직 이 SHA에 포함되지 않은 작업 트리 변경이며, 운영 후보로 사용할 때는 별도 커밋 SHA를 확정해야 한다.

### Staging 적용 상태

- 기존 17개 migration 뒤에 `202611250001_web_push_notifications`, `202611270001_private_beta_accounts`, `20261127025818_fix_notification_dispatch_endpoint_constraint`를 순서대로 적용했다.
- 알림 URL 제약식의 첫 적용 오류는 `migration repair`나 reset 없이 `20261127025818` 전진 migration으로 수정했다.
- 최종 `db push --dry-run --include-all` 결과는 `upToDate=true`이며 pending migration은 없다.
- API Edge Function version 5와 notifications Function version 1을 staging에만 배포했다. `/api/health`의 release SHA는 `ae83d6735f740cb0b839d3e3b1f98326c2254f8b`이다.
- `CHAT_HISTORY_ENABLED=false`를 유지했다. 일반 챗봇 응답은 `history_persisted=false`이며 history API는 명시적으로 미지원 응답을 반환한다.
- staging 전용 VAPID key와 dispatch 설정만 사용했다. dispatch cron은 200을 반환했고 대기 작업이 없을 때 `processed=0`이었다. 잘못된 dispatch token은 401로 차단됐다.
- synthetic 계정과 fixture는 검증 종료 후 제거했다. 기존 staging 데이터는 삭제하거나 변경하지 않았고, 감사용 `llm_operation_metrics`만 테스트 실행 기록으로 남았다.

### 통과한 실제 흐름

- 닉네임+PIN 정상 로그인, 미등록 계정·오입력 차단, 5회 실패 잠금, 잠금 만료 후 로그인, 동시 실패 잠금 유지
- access token refresh, global logout 뒤 refresh token 무효화, 앱 reload 뒤 세션 복원
- 사용자 A/B의 API 및 RLS 격리, URL/body의 다른 `user_id` 차단, 무토큰·잘못된 토큰 차단
- 추구미 저장, 옷장 등록·조회·삭제, 피드·저장·저장 취소, 비교와 한 줄 근거, 이벤트 batch
- 사진 없는 피드 검색, 빈 옷장 등록 안내, 옷장 없는 유사 상품 탐색, 오늘의 룩 Action, 존재하지 않는 사진 차단, Action 이벤트 연결
- 알림 구독·예약·상태 조회·취소와 다른 사용자 변경 차단
- staging 환경변수로 Expo web export 후 브라우저 로그인, 플로팅 챗 진입, 사진 없는 질문, 필터 CTA 이동, reload 세션 복원

브라우저 Push 권한·실제 단말 전달, 카메라/앨범 선택, 네이티브 앱 백그라운드 동작은 실기기 검증이 필요하다. provider 접수나 schedule 생성은 실제 단말 전달 증거로 간주하지 않는다.

### Production 전환 전제

2026-11-27 조회 기준 production에는 `202611250001_web_push_notifications`까지 16개 migration만 적용되어 있다. 따라서 production 후보에는 다음 네 migration만 pending이어야 한다.

1. `202611230001_auth_access_control` — 기존 테이블 삭제 없이 authenticated RLS/권한 추가
2. `202611230003_chat_conversations` — Private Beta 라인에서는 의도적인 no-op
3. `202611270001_private_beta_accounts` — 신규 Auth 계정과 PIN hash 경계 추가
4. `20261127025818_fix_notification_dispatch_endpoint_constraint` — 알림 설정 컬럼/제약을 전진 적용

운영 적용 직전 다시 dry-run하고 위 목록 외 항목이 보이면 중단한다. migration은 additive지만 신규 API는 사용자 경로에 Bearer token을 요구하고 기존 Expo는 token을 보내지 않으므로 서버만 먼저 배포하면 기존 앱이 401이 된다. 반대로 Expo만 먼저 배포하면 기존 API에 `/beta-auth/login`이 없어 로그인할 수 없다. 따라서 다음 순서의 짧은 maintenance cutover가 필요하다.

1. 기존 행 수, migration, API health SHA, Expo deployment를 기록하고 신규 베타 계정을 사전 provisioning한다.
2. 승인된 migration 네 개를 적용한다. 기존 사용자 데이터를 Auth 계정에 자동 연결하지 않는다.
3. 검증된 API와 notifications Function을 배포하고 health SHA를 확인한다.
4. 동일 환경의 Supabase URL/anon key만 포함한 Expo production을 즉시 배포한다.
5. 신규 베타 로그인, A/B 격리, 옷장·저장·비교·챗봇·이벤트·알림 smoke를 실행한다.

기존 nickname+PIN 계정은 자동 이전되지 않으므로 신규 베타 계정을 발급받기 전에는 새 API에 로그인할 수 없다. 무중단 전환을 위해 인증을 약화하는 호환 모드는 두지 않는다.

복구 시 Expo와 API/notifications는 각각 직전 검증 버전을 정확한 deployment/SHA로 재배포한다. DB migration은 reset·repair·테이블 삭제로 되돌리지 않는다. additive schema는 남겨 두고 직전 API가 service-role 경계에서 계속 동작하는지 확인하며, RLS/grant 문제가 있으면 별도 승인된 전진 migration으로만 교정한다.
