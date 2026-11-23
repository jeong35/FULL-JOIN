# 로컬 Supabase 개발 환경

이 문서는 운영 프로젝트와 분리된 로컬 Docker 환경에서 DB, Storage, Auth, Edge Function과 관리자 대시보드를 재현하는 절차다. 운영 사용자 데이터는 복제하지 않으며 `supabase/seed.sql`의 합성 데이터만 사용한다.

## 전제 조건

- Docker Desktop이 실행 중이어야 한다.
- 저장소 루트에서 Node.js 22.18 이상과 `npm ci`가 준비돼 있어야 한다.
- Supabase CLI는 프로젝트의 잠금된 dev dependency를 사용한다: `./node_modules/.bin/supabase`.

상태 확인:

```bash
docker version
./node_modules/.bin/supabase --version
./node_modules/.bin/supabase status
```

CLI 출력에 linked project 정보가 있더라도 아래 명령은 기본 local target(`127.0.0.1`)만 사용한다. 이 문서에서는 `--linked`, `db push`, `migration repair`를 사용하지 않는다.

## 처음 시작하기

```bash
npm ci
./node_modules/.bin/supabase start
```

`supabase start`는 로컬 Docker 컨테이너를 만들고 `supabase/migrations/`를 순서대로 적용한 뒤 `supabase/seed.sql`을 실행한다. 현재 인증 브랜치 기준은 기존 15개와 `202611230001_auth_access_control.sql`을 합친 16개다.

로컬 주소는 CLI가 출력한다. 기본값은 다음과 같다.

- API: `http://127.0.0.1:54321`
- DB: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Studio: `http://127.0.0.1:54323`
- Edge Function: `http://127.0.0.1:54321/functions/v1/api`

로컬 anon/service-role 키는 `supabase status -o env`로 확인한다. 키를 문서나 Git에 복사하지 않는다. `.env`와 `.env.*`는 ignore되어 있지만, 기본 개발 흐름은 CLI 상태를 직접 읽으므로 파일을 만들 필요가 없다.

`supabase/config.toml`은 모바일 transport 검증을 위해 local anonymous Auth를 허용한다. 이는 운영 로그인 정책이 아니며 production 프로젝트 설정을 자동으로 바꾸지 않는다.

## Edge Function 확인

로컬 스택의 Edge Runtime이 `supabase/functions/api`를 제공한다.

```bash
curl -i http://127.0.0.1:54321/functions/v1/api/health
```

함수 코드의 명시적 watch 로그가 필요하면 기존 스택을 유지한 채 아래를 별도 터미널에서 실행할 수 있다.

```bash
./node_modules/.bin/supabase functions serve api --no-verify-jwt
```

유료 OpenAI 호출 없이 일반 상담 fallback을 확인하려면 `OPENAI_API_KEY`를 설정하지 않는다. 실제 호출은 키와 예상 비용을 확인한 뒤 별도 실행한다. 운영 키를 로컬 파일에 복사하지 않는다.

## 빈 DB 재현 및 마이그레이션 검증

다음 명령은 로컬 컨테이너 DB만 삭제·재생성한다. 운영 DB에는 영향을 주지 않는다.

```bash
./node_modules/.bin/supabase db reset --local
./node_modules/.bin/supabase migration list --local
```

성공 조건:

- `202611040001`부터 `202611230001`까지 16개가 local target에 모두 표시된다.
- `supabase/seed.sql`이 오류 없이 적용된다.
- seed는 `demo-analytics-*`, `smoke-*` 합성 사용자만 포함하며 사용자 사진·대화 원문·운영 데이터는 포함하지 않는다.

## 통합 테스트

```bash
npm run test:integration:local
npm run test:auth-policy
```

첫 명령은 실제 local DB와 Edge Function으로 다음을 검증한다.

- 옷장 등록·조회·삭제
- 사진 저장→비교→판정 근거
- AC9 후보 버킷 내부 코사인 정렬과 `wardrobe_item_id` 정합성
- 보유 옷 상담, 일반 상담 fallback, 복합 상담 section 분리
- 이벤트 batch 저장과 LLMOps DB 기록
- 인증 없음/타 사용자 요청 차단, 실제 API와 RLS의 A/B 사용자 격리

`test:auth-policy`는 순수 정책을, 통합 테스트는 실제 JWT 검증과 RLS를 각각 검증한다. gateway는 공개·관리 경로와 같은 함수에 있어 아직 `verify_jwt=false`지만 사용자 경로는 함수 내부에서 토큰을 검증한다.

외부 OpenAI 호출은 기본 통합 테스트에서 실행하지 않는다. 따라서 비용은 0달러이고, configuration fallback과 grounded 경로를 검증한다.

## 로컬 관리자 대시보드

로컬 Supabase가 실행 중인 상태에서:

```bash
npm run dashboard:local
```

브라우저에서 `http://127.0.0.1:4173`을 연다. 서버는 `127.0.0.1`에만 bind하고, 연결 대상 URL도 `localhost`/`127.0.0.1`만 허용한다. service-role 키는 Node 프로세스 안에서만 사용하며 HTML/JavaScript/API 응답에 포함하지 않는다.

지표 정의는 `docs/ADMIN_DASHBOARD.md`에 있다.

## 종료와 재실행

```bash
./node_modules/.bin/supabase stop
```

다시 시작할 때는 `supabase start`를 실행한다. 스키마와 seed까지 완전히 다시 확인해야 할 때만 `db reset --local`을 사용한다.

## GitHub Actions

`.github/workflows/verify.yml`의 `local-supabase-integration` job은 GitHub-hosted runner의 Docker에 로컬 스택을 만들고 migration/seed/API 통합 테스트를 실행한다. 원격 Supabase ref나 secret을 사용하지 않으므로 운영 프로젝트에 접근하지 않는다. 이미지 최초 pull 시간 때문에 기존 단위 테스트 job과 분리하고 timeout을 20분으로 설정했다.

## 문제 해결

- `No such container: supabase_db_full-join`: 아직 시작하지 않은 상태다. `supabase start`를 실행한다.
- 포트 충돌: 다른 프로젝트의 Supabase stack을 중지하거나 `supabase/config.toml`의 로컬 포트를 팀과 합의해 변경한다.
- 함수가 500을 반환: `supabase status`와 Edge Runtime 로그를 확인한다. 운영 URL/키를 넣어 우회하지 않는다.
- Docker 이미지 pull이 느림: 최초 한 번은 정상이다. CI에서도 캐시가 없으면 수 분 걸릴 수 있다.
