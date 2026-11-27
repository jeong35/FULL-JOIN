# API 접근 제어 검토

> 현재 Private Beta 인증 결정은 `PRIVATE_BETA_POLICY.md`가 우선한다. client `user_id` 신뢰 금지와 JWT `sub` 일치는 유지한다.

## 결론

개발 브랜치는 사용자 경로마다 Supabase access token을 `auth.getUser`로 검증하고 JWT subject와 요청 `user_id`의 일치를 강제한다. 옷장·취향·하트에는 owner RLS도 추가했다. 로컬 A/B 사용자 실제 API 및 RLS 격리는 통과했지만 이 변경은 운영에 배포되지 않았고, 정식 로그인 UI·기존 데모 데이터 이전·계정 삭제 job은 미확정이다.

## 확인된 경계

- `supabase/config.toml`: `verify_jwt = false`
- 함수: `SUPABASE_SERVICE_ROLE_KEY`로 모든 사용자 DB 작업 수행
- CORS: `access-control-allow-origin: *`
- 사용자 API: 함수 내부 JWT 검증 후 JWT subject를 정본으로 사용; 전환용 query/body `user_id` 불일치는 403
- 관리 API: analyze, 상품 연결, review, publish는 `x-admin-token`을 별도로 확인
- 관리 토큰은 사용자 데이터 API의 소유권 검증을 대신하지 않는다.

영향 받는 사용자 경로:

- `/wardrobe`, `/wardrobe/{id}`
- `/style-preferences`
- `/feed?user_id=`, `/archive?user_id=`
- `/chat`, `/chat/history`, `/events`
- `/style-images/{id}/heart`
- `/style-images/{id}/items/{item_id}/decision`

## 출시 전 필수 보완

1. 현재 구현된 함수 내부 JWT 검증과 owner RLS를 staging에서 재검증한다.
2. 공개·관리 경로를 별도 함수로 분리한 뒤 사용자 함수의 gateway를 `verify_jwt=true`로 전환한다.
3. 정식 로그인 UI와 데모 계정 이전 정책을 확정하고 익명 개발 세션을 교체한다.
4. 가능하면 사용자 CRUD는 anon client + RLS로 수행하고 service role은 관리/서버 전용 작업으로 한정한다.
5. 관리 API는 사용자 API와 함수 또는 라우팅 경계를 분리하고, admin secret rotation·rate limit·감사 로그를 둔다.
6. CORS는 실제 앱 origin 정책과 네이티브 호출 방식을 검토해 최소화한다. CORS만으로 인증을 대체하지 않는다.
7. rate limit, 요청 크기 제한, 반복 실패 탐지를 추가한다.

팀은 출시 인증으로 Supabase Auth 우선 검토를 확정했다. 로컬 테스트는 별도 Auth 사용자의 access token으로 API를 검증하지만, 닉네임+PIN을 정식 인증으로 취급하거나 기존 데모 데이터를 자동 이전하지 않는다. 단계별 전환·격리 테스트·삭제 범위는 `docs/AUTH_MIGRATION_PLAN.md`에 정리했다.

## 필요한 보안 회귀

- 인증 없음 → 401
- A의 JWT + B의 body/query user_id → 403
- A가 B의 wardrobe ID 삭제 → 404 또는 403
- A가 B의 heart/archive/chat 조회 → 404 또는 403
- 만료·변조 JWT → 401
- 일반 사용자가 admin route 호출 → 401/403
- service-role key와 admin token이 앱 bundle, 응답, 로그에 없음
- 계정 삭제 후 연관 데이터 접근 불가

## 현재 배포 판단

운영은 아직 이전 공개 API 버전이므로 제한된 데모에만 허용 가능하다. 이 브랜치도 정식 로그인·계정 삭제·rate limit 전에는 외부 출시하지 않는다.

## 2026-11-23 로컬 실제 API 검증

`npm run test:integration:local`에서 서로 다른 synthetic 사용자 `test-owner-*`, `test-attacker-*`를 만들고 실제 로컬 Edge Function을 호출했다.

- 정책 모듈과 API 인증 테스트: 검증된 JWT subject를 서버 사용자 ID로 쓰고 다른 request user_id를 거부한다.
- 실제 API: 인증 없음 401, A JWT + B user_id 403.
- 실제 DB: authenticated A/B client가 각자 owner 행만 조회하며 B는 A의 옷장을 볼 수 없다.
- CHAT-02: B의 history 조회는 빈 결과이고 삭제도 A의 conversation에 영향이 없으며, DB RLS에서도 B는 A의 `chat_conversations`를 볼 수 없다.
- 테스트 데이터와 대상은 모두 local Docker stack이며 운영 프로젝트에는 요청하지 않았다.

로컬 격리 통과를 운영 배포 완료로 해석하면 안 된다. 정식 인증 UI, gateway JWT 검증, 계정/Storage 삭제, rate limit과 staging 회귀가 끝날 때까지 외부 공개하지 않는다.

로컬 관리자 대시보드는 이 공백을 우회하지 않는다. `127.0.0.1`에만 bind하고 local Supabase URL만 허용하며 service-role 키를 브라우저에 전달하지 않는다. 운영 공개 전에는 별도 관리자 인증과 최소 권한 집계 API가 필요하다.

## 모바일 의존성 audit

2026-11-20 `npm audit --omit=dev`는 high/critical 0건, moderate 5건을 보고했다. Expo의 전이 의존성 `@expo/cli`, `@expo/fingerprint`, `glob`, `minimatch` 경로이며 알려진 내용은 timeout 이후 파일시스템 순회 및 glob pattern DoS다. 자동 제안은 현재 Expo 58에서 Expo 52로의 major downgrade를 포함하므로 `npm audit fix --force`를 실행하지 않았다. Expo가 호환되는 패치를 제공하는지 확인한 후 SDK upgrade 절차와 실제 앱 회귀 테스트를 거쳐야 한다.
