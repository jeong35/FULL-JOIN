# Private Beta 개발·배포 정책

기준일: 2026-11-27. 이 문서는 현재 제품 개발 및 배포 정책의 정본이다. `docs/SPEC.md`는 제품 계약, `docs/ontology.yaml`은 도메인 계약의 정본이다.

## 현재 목표와 범위

오딧은 소수의 지인에게 초대해 검증하는 Private Beta를 목표로 한다. 홈 피드, 옷장·사진 일괄 등록, 비교 근거, 오늘의 룩, Action Chatbot, 반복 알림, 이벤트, 관리자 대시보드와 안정성 개선은 현재 범위다. 정식 소셜 로그인, 일반 회원가입, 계정 자동 이전·정식 삭제 UI, 사진별 영구 채팅 기록, 스토어 출시는 후속 출시 체크리스트다. 후속 항목이 미완료라는 이유만으로 독립적인 제품 기능을 막지 않는다.

## 최소 보안선

- 팀이 사전에 생성한 베타 계정만 로그인할 수 있다. 화면은 닉네임+4자리 PIN을 유지한다.
- PIN은 `beta_accounts`의 bcrypt hash로만 보관하고 5회 실패 시 15분 잠근다. PIN을 Supabase Auth 비밀번호로 사용하지 않는다.
- 서버는 성공한 PIN 검증 뒤 일회성 Auth link를 내부 교환해 Supabase access/refresh token을 발급한다.
- 사용자 API는 검증된 JWT `sub`를 유일한 사용자 ID로 사용한다. body/query의 `user_id`는 반드시 `sub`와 같아야 한다.
- URL `?user=`, demo user, 인증 없는 사용자 전환은 production에서 허용하지 않는다.
- service-role, 내부 Auth 비밀번호, PIN, refresh token은 로그·이벤트·클라이언트 빌드에 넣지 않는다. Expo에는 공개 anon key만 둘 수 있다.
- 기존 nickname+PIN hash ID 데이터는 삭제하지 않는다. 신규 Auth UUID와 안전한 소유권 연결 근거가 없으므로 자동 이전하지 않는다.
- 베타 참여자의 삭제 요청은 운영자가 Auth UUID로 사용자 행, Storage, 알림 구독을 식별해 수동 처리하고 기록한다. 자동 삭제 UI는 후속 범위다.

## 인증 구현 경계

`POST /beta-auth/login`만 비인증 공개 사용자 endpoint다. 팀 provisioning은 `scripts/provision-beta-account.mjs`를 service-role 환경에서 실행한다. 모바일은 발급 세션을 저장하고 모든 사용자 API에 Bearer token을 붙이며 만료 전에 refresh한다. Edge Function은 gateway의 `verify_jwt=false` 설정에 의존해 인증을 생략하지 않고, `auth.getUser(token)`으로 서명·유효성을 검증한 뒤 요청 ID를 대조한다. 이는 공개 health/analyze route와 사용자 route를 한 Function에 둔 현재 구조 때문이다.

Provisioning 예시(값은 shell history와 저장소에 남기지 않는다): `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/provision-beta-account.mjs <닉네임> <4자리PIN>`. 운영자는 전달 대상과 Auth UUID만 별도 접근 제한 기록에 남긴다.

사진별 채팅 기록은 `CHAT_HISTORY_ENABLED=true`이고 별도 migration이 승인된 환경에서만 사용할 수 있다. 기본 Private Beta에서는 `history_persisted=false`, `/chat/history`는 501을 반환하며 일반 상담·Action은 계속 동작한다. 실제 DDL은 `docs/deferred-migrations/`에 보관하고, staging의 과거 migration history와 충돌하지 않도록 active 경로의 같은 버전 파일은 no-op으로 유지한다.

## 배포 기준

1. 승인할 정확한 SHA를 고정하고 `npm run check`, 모바일 typecheck/lint, 격리된 Supabase 통합 검사를 통과한다.
2. staging에서 synthetic A/B 계정으로 로그인, 세션 복원, 401/403, 옷장·저장·비교·챗봇·추천·이벤트·알림을 확인한다.
3. migration 목록과 production 목록을 대조하고 dry-run 결과를 검토한다. DB 변경은 별도 승인이 있어야 적용한다.
4. API/DB backward compatibility를 확보한 후 변경 계층만 배포한다. 배포 후 health SHA와 핵심 smoke를 확인한다.
5. 이전 정상 API SHA와 Expo deployment ID를 롤백 기준으로 기록한다. 문서만 바뀌면 API·Expo를 재배포하지 않는다.

현재 production 기준은 API `2d0369bb629a5396c0534aad474d63ac1ea81070`, Expo deployment `n4th042gbm`, DB migration `202611250001`까지다. 실제 상태는 배포 직전 다시 조회하며 이 문장만 신뢰하지 않는다.

## 제한 조사 결과

2026-11-27 전체 검색에서 현재 정책 또는 과거 이력의 Auth/RLS/JWT/user_id/출시·배포 제한을 포함한 파일은 다음과 같다.

- 실행 경계: `mobile/src/data/session.ts`, `mobile/src/data/api.ts`, `mobile/src/app/onboarding/login.tsx`, `src/fulljoin/api_auth.ts`, `src/fulljoin/auth_policy.ts`, `supabase/functions/api/index.ts`, `supabase/config.toml`, `.github/workflows/release.yml`, `.github/workflows/verify.yml`
- 활성·보류 DB: `supabase/migrations/202611230001_auth_access_control.sql`, `supabase/migrations/202611270001_private_beta_accounts.sql`, `docs/deferred-migrations/202611230003_chat_conversations.sql`, `supabase/migrations/202611250001_web_push_notifications.sql`
- 현재 정책·계약: `AGENTS.md`, `CLAUDE.md`, `README.md`, `mobile/README.md`, `docs/APPROVED_RELEASE.md`, `docs/AUTH_MIGRATION_PLAN.md`, `docs/SECURITY_ACCESS_CONTROL.md`, `docs/ACTION_CHATBOT.md`, `docs/API_MVP.md`, `docs/NEXT_PRODUCT_SPECS.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/STAGING_ENVIRONMENT.md`, `docs/OPERATIONS_RELEASE.md`, `docs/LOCAL_DEVELOPMENT.md`, `docs/FRONTEND_MATCH_CHAT_HANDOFF.md`, `docs/COSINE_OUTFIT_MATCHING.md`, `docs/NOTIFICATIONS.md`, `docs/NOTIFICATION_FRONTEND_HANDOFF.md`
- 과거 사실·분석 기록: `odit_release_progress.md`, `odit_development_report.md`, `docs/PEER_EVALUATION_RECOVERY.md`, `docs/TEST_EVIDENCE_2026-11-20.md`, `docs/LLMOPS_OBSERVABILITY.md`, `docs/EVENTS.md`, 관리자 대시보드와 관련 테스트·스크립트. 이 파일의 과거 결과는 당시 사실로 유지하고 현재 정책으로 해석하지 않는다.

## 후속 출시 체크리스트

Kakao/Google 로그인, 공개 회원가입·복구, 계정 이전 자동화, 정식 삭제·보존 UI, abuse 대응 고도화, 스토어 심사·배포, 장기 개인정보 정책은 정식 출시 전 별도 승인한다.
