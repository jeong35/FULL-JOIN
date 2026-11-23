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

- main 기준 migration 15개(`202611040001`~`202611200003`)를 dry-run 후 적용했다.
- `supabase/seed.sql`은 local 전용이므로 staging에 적용하지 않았다.
- Auth migration `202611230001`과 CHAT-02 `202611230003`은 PR 검토 전이라 적용하지 않았다.
- Edge Function은 아직 배포하지 않았다. 현재 운영 호환 배포 방식인 `--no-verify-jwt`를 staging에서 반복하지 않고, PR #25의 함수 내부 JWT 검증과 모바일 Auth 흐름을 함께 검증한 뒤 배포한다.
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

1. `supabase migration list --remote`로 main 15개 이력을 확인한다.
2. PR #25 Auth migration과 모바일 access token 전달을 함께 적용한다.
3. synthetic Auth 사용자 A/B를 만들고 401·403·RLS 격리를 확인한다.
4. CHAT-02 migration/API를 적용하고 사진별 저장·pagination·삭제·A/B 격리를 확인한다.
5. 테스트 사용자와 데이터만 제거하고 운영 승인을 별도로 받는다.

staging에서도 `db reset`, `migration repair`, 운영 데이터 import는 사용하지 않는다.
