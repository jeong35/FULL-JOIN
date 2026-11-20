# API 접근 제어 검토

## 결론

현재 MVP는 `verify_jwt=false`인 공개 Edge Function이 요청 본문의/query의 `user_id`를 신뢰하고 service-role client로 DB를 읽고 쓴다. 공격자가 다른 `user_id`를 알거나 추측하면 해당 사용자의 옷장·취향·아카이브를 읽거나 변경하고, 저장·삭제·챗 요청을 대신 수행할 수 있다. 이는 이론적 위험이 아니라 현재 구조상 가능한 수평 권한 상승(IDOR)이다. 공개 출시 전 차단이 필요하다.

## 확인된 경계

- `supabase/config.toml`: `verify_jwt = false`
- 함수: `SUPABASE_SERVICE_ROLE_KEY`로 모든 사용자 DB 작업 수행
- CORS: `access-control-allow-origin: *`
- 사용자 API: query/body의 임의 문자열 `user_id` 사용
- 관리 API: analyze, 상품 연결, review, publish는 `x-admin-token`을 별도로 확인
- 관리 토큰은 사용자 데이터 API의 소유권 검증을 대신하지 않는다.

영향 받는 사용자 경로:

- `/wardrobe`, `/wardrobe/{id}`
- `/style-preferences`
- `/feed?user_id=`, `/archive?user_id=`
- `/chat`, `/events`
- `/style-images/{id}/heart`
- `/style-images/{id}/items/{item_id}/decision`

## 출시 전 필수 보완

1. Supabase Auth로 검증된 JWT를 요구하고 `verify_jwt=true`로 전환한다.
2. 서버는 요청의 `user_id`를 신뢰하지 않고 JWT `sub`에서 사용자 ID를 얻는다. 전환 기간에 body 필드를 받더라도 `sub`와 다르면 403으로 거절한다.
3. 사용자 테이블에 RLS를 켜고 `auth.uid() = user_id` 정책을 적용한다.
4. 가능하면 사용자 CRUD는 anon client + RLS로 수행하고 service role은 관리/서버 전용 작업으로 한정한다.
5. 관리 API는 사용자 API와 함수 또는 라우팅 경계를 분리하고, admin secret rotation·rate limit·감사 로그를 둔다.
6. CORS는 실제 앱 origin 정책과 네이티브 호출 방식을 검토해 최소화한다. CORS만으로 인증을 대체하지 않는다.
7. rate limit, 요청 크기 제한, 반복 실패 탐지를 추가한다.

팀은 출시 인증으로 Supabase Auth 우선 검토를 확정했다. 정식 로그인 방식과 데모 계정 이전 정책은 아직 미확정이므로 이 브랜치에서 운영 인증 코드를 바꾸지 않는다. 단계별 전환·격리 테스트·삭제 범위는 `docs/AUTH_MIGRATION_PLAN.md`에 정리했다.

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

현재 설정은 제한된 데모에만 허용 가능하다. 식별자를 해시하거나 길게 만드는 것은 인증이 아니며 근본 해결이 아니다. 인증 전까지 실제 개인정보·민감한 사진·결제/주문 데이터를 이 API에 추가하면 안 된다.

## 2026-11-20 로컬 실제 API 검증

`npm run test:integration:local`에서 서로 다른 synthetic 사용자 `test-owner-*`, `test-attacker-*`를 만들고 실제 로컬 Edge Function을 호출했다.

- 정책 모듈 `npm run test:auth-policy`: 4/4 통과. 검증된 JWT subject를 서버 사용자 ID로 쓰고 다른 request user_id와 resource owner를 거부하는 목표 정책은 동작한다.
- 실제 API: 인증 header 없이 `GET /wardrobe?user_id={owner}`가 200과 owner의 옷장을 반환했다.
- 판정: **현재 실제 API 사용자 격리는 실패한다.** 이는 예상된 known gap이며 정책 모듈이 아직 라우터/DB client에 연결되지 않았기 때문이다.
- 테스트 데이터와 대상은 모두 local Docker stack이며 운영 프로젝트에는 요청하지 않았다.

따라서 정책 단위 테스트 통과를 보안 완료로 해석하면 안 된다. JWT 검증, server-side subject 결정, RLS와 A/B 격리 통합 테스트가 함께 통과하기 전에는 관리자 대시보드와 사용자 API를 외부에 공개하지 않는다.

로컬 관리자 대시보드는 이 공백을 우회하지 않는다. `127.0.0.1`에만 bind하고 local Supabase URL만 허용하며 service-role 키를 브라우저에 전달하지 않는다. 운영 공개 전에는 별도 관리자 인증과 최소 권한 집계 API가 필요하다.

## 모바일 의존성 audit

2026-11-20 `npm audit --omit=dev`는 high/critical 0건, moderate 5건을 보고했다. Expo의 전이 의존성 `@expo/cli`, `@expo/fingerprint`, `glob`, `minimatch` 경로이며 알려진 내용은 timeout 이후 파일시스템 순회 및 glob pattern DoS다. 자동 제안은 현재 Expo 58에서 Expo 52로의 major downgrade를 포함하므로 `npm audit fix --force`를 실행하지 않았다. Expo가 호환되는 패치를 제공하는지 확인한 후 SDK upgrade 절차와 실제 앱 회귀 테스트를 거쳐야 한다.
