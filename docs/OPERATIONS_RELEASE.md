# Edge Function release metadata 및 배포 절차

## 목적

운영 `api` 함수가 어느 Git commit에서 배포됐는지 health 응답과 배포 기록으로 추적한다. 이 문서는 절차 설계이며 현재 작업에서는 secrets 설정이나 배포를 실행하지 않는다.

## metadata 계약

`GET /health`:

```json
{
  "ok": true,
  "release": {
    "git_sha": "40자리 Git SHA 또는 null",
    "released_at": "ISO-8601 UTC 시각 또는 null"
  }
}
```

Edge Function은 `RELEASE_GIT_SHA`, `RELEASED_AT` 환경변수를 읽는다. 비밀 값이 아니며 앱의 오류 보고와 운영 대조를 위해 공개 가능하다. 값이 없으면 거짓 버전을 만들지 않고 `null`을 반환한다.

## 수동 배포 전 체크리스트

1. 배포 대상 branch가 clean인지 확인한다. 사용자의 기존 untracked 파일은 배포 commit에 포함하지 않는다.
2. `git fetch origin` 후 대상 SHA와 `origin/main`의 관계를 기록한다.
3. `npm ci`, `npm run check`, `npm ci --prefix mobile`, `npm run check:mobile`을 통과시킨다.
4. `supabase migration list --remote`로 local/remote 이력을 읽기 전용 확인한다. 불일치는 별도 승인 없이 repair하지 않는다.
5. 배포 SHA와 UTC 시각을 확정한다.
6. 승인된 배포 창에서만 release metadata 환경변수를 설정하고 함수를 배포한다.
7. health 응답의 SHA가 대상 SHA와 같은지 확인한다.
8. 옷장 조회, 저장→비교, 챗 grounded 응답, 이벤트 수락을 smoke test한다.
9. 배포 기록에 project ref, function version, Git SHA, migration 목록, smoke 결과, 실행자를 남긴다.

명령 예시는 실행 전 사람이 값과 권한을 확인한다.

```bash
git rev-parse HEAD
./node_modules/.bin/supabase migration list --remote
./node_modules/.bin/supabase secrets set RELEASE_GIT_SHA=<40자리_SHA> RELEASED_AT=<ISO_UTC>
./node_modules/.bin/supabase functions deploy api --no-verify-jwt
curl https://<project-ref>.supabase.co/functions/v1/api/health
```

`--no-verify-jwt`는 현재 MVP 설정을 재현할 뿐 안전한 최종 설정이라는 뜻이 아니다. 출시 전 전환 조건은 `docs/SECURITY_ACCESS_CONTROL.md`를 따른다.

## 롤백

- 이전 정상 Git SHA와 함수 version을 배포 기록에서 찾는다.
- DB rollback을 함수 rollback과 자동으로 묶지 않는다. forward-compatible migration을 우선한다.
- 이전 코드 재배포 시 metadata도 그 SHA와 새 배포 시각으로 다시 설정한다.
- health SHA와 smoke 결과가 맞지 않으면 배포 완료로 표시하지 않는다.

## 승인형 자동화

`.github/workflows/release.yml`은 수동 `workflow_dispatch`와 GitHub Environment 승인을 전제로 위 절차를 구현한다. push·PR·merge에는 연결하지 않았다. production은 입력 SHA가 최신 `origin/main`과 같아야 하고, migration은 기본 false인 별도 입력을 승인한 경우에만 적용한다. 설정해야 할 환경·reviewer·secret과 실패 조건은 `docs/APPROVED_RELEASE.md`를 따른다. 기존 `verify.yml`은 계속 검증 전용이며 운영 배포 권한을 갖지 않는다.
