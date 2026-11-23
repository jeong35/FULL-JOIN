# Supabase staging 환경

## 대상

- 프로젝트: `full-join-staging`
- project ref: `ylbrssggfzuzyhgdhehu`
- 리전: Singapore (`ap-southeast-1`)
- 플랜: Free의 두 번째 활성 프로젝트
- 운영 project ref `gctbcanltqgcymdlplyr`와 완전히 분리한다.

DB 비밀번호는 저장소나 `.env`에 쓰지 않고 macOS Keychain의 service
`full-join-staging-supabase-db`, account `FULL-JOIN`으로 저장했다. 운영 사용자·사진·대화 데이터는 복제하지 않는다.

## 2026-11-23 기준 상태

- main 기준 migration 15개에 Auth `202611230001`과 CHAT-02 `202611230003`을 더한 17개를 dry-run 후 적용했다.
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

secret 값은 문서·workflow log·모바일 bundle에 넣지 않는다. PR #25와 CHAT-02가 각각 commit SHA를 가진 뒤 `.github/workflows/release.yml`에서 exact SHA를 지정해 배포한다.

## 검증 순서

1. `supabase migration list --remote`로 17개 이력을 확인한다.
2. `FULL_JOIN_STAGING_*` 환경변수를 런타임에만 주입하고 `npm run test:integration:staging`을 실행한다.
3. synthetic Auth 사용자 A/B로 401·403·RLS와 사진별 저장·pagination·삭제를 확인한다.
4. 테스트 사용자와 fixture만 제거하고 운영 승인을 별도로 받는다.
5. PR #25·#28 병합 및 모바일 access token 전달 전에는 운영에 적용하지 않는다.

staging에서도 `db reset`, `migration repair`, 운영 데이터 import는 사용하지 않는다.
