# 승인형 staging/production 배포

## 현재 범위

`.github/workflows/release.yml`은 `workflow_dispatch`로만 실행된다. push·PR·main merge만으로 운영 배포하지 않는다. 대상 commit SHA를 40자리로 직접 입력하고, GitHub Environment 승인과 환경별 가드 secret을 모두 통과해야 한다.

production은 입력 SHA가 실행 시점 `origin/main`과 정확히 같아야 한다. 승인 대기 중 main이 바뀌어도 처음 검증한 SHA를 checkout한다. staging은 명시한 SHA를 그대로 사용한다.

## GitHub Environment 준비

Repository Settings → Environments에서 `staging`, `production`을 만든다.

- `production`: required reviewers와 deployment branch `main`을 반드시 설정한다.
- `staging`: 팀 정책에 맞는 reviewer를 설정한다.
- 두 환경 모두 `RELEASE_APPROVAL_GUARD`를 둔다.
  - staging 값: `staging-enabled`
  - production 값: `production-enabled`
- 환경별 secrets:
  - `SUPABASE_ACCESS_TOKEN`
  - `SUPABASE_PROJECT_REF`
  - `SUPABASE_DB_PASSWORD`
  - `EXPO_TOKEN`

값은 저장소 파일·workflow log·Expo 공개 환경변수에 넣지 않는다. production 환경의 Supabase/Expo 대상은 staging과 달라야 한다.

## 실행과 실패 조건

Actions → Approved release → Run workflow에서 다음을 고른다.

- environment: `staging` 또는 `production`
- expected_sha: 승인할 정확한 40자리 SHA
- apply_migrations: 기본 false. migration 리뷰를 마친 배포만 true
- deploy_backend / deploy_web: 필요한 artifact만 선택

workflow는 다음 순서를 지킨다.

1. SHA 고정과 production main 일치 확인
2. 서버 전체 check, 승인 골든, 모바일 typecheck/lint
3. GitHub Environment reviewer 승인과 가드 secret 확인
4. remote migration 목록과 `db push --dry-run`
5. 선택한 경우에만 migration 적용
6. release SHA/시각 설정 후 Edge Function 배포
7. `/health` SHA 일치 검증
8. Expo export와 staging alias 또는 production 배포

어느 단계든 실패하면 후속 단계가 실행되지 않는다. migration rollback은 함수 rollback에 자동으로 묶지 않는다. DB는 forward-compatible migration을 우선하고, repair/reset은 이 workflow에 포함하지 않는다.

## 아직 자동화하지 않은 항목

- Auth 전환은 gateway 구조와 로그인 UI가 확정되기 전까지 배포하지 않는다.
- 운영 smoke에서 실제 사용자 데이터를 생성·삭제하지 않는다.
- EAS deployment ID를 별도 release registry에 적재하지 않는다. 현재 Actions summary와 Expo deployment history가 근거다.
- 자동 rollback은 없다. 이전 승인 SHA를 같은 절차로 다시 배포한다.
