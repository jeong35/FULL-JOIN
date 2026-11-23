# 오딧(FULL-JOIN) 개발 현황 종합 보고서

- 기준 시각: 2026-11-23 KST
- 조사 대상 저장소: `jeong35/FULL-JOIN`
- 조사 worktree: `/Users/choijeong-in/.codex/worktrees/kind-expansion-main/FULL-JOIN`
- 작성 목적: 다른 개발 세션과 팀원이 이전 대화 없이도 현재 구현·테스트·Git·배포·의사결정 상태를 이어받을 수 있게 한다.

## 문서 읽는 법과 조사 범위

이 보고서는 다음 자료와 실제 코드를 대조해 작성했다.

- 저장소 문서: `AGENTS.md`, `README.md`, `docs/SPEC.md`, `docs/ontology.yaml`, `docs/API_MVP.md`, `docs/ARCHITECTURE.md`, `docs/EVENTS.md`, `evals/EVAL_DESIGN.md`
- 외부 인수인계: `/Users/choijeong-in/Downloads/odit_codex_handoff.md`
- 동료평가 개발 지시서: `/Users/choijeong-in/Downloads/odit_mvp_feedback_development.md`
- 코드: `src/fulljoin/`, `supabase/`, `mobile/`, `tests/`, `evals/`
- Git의 현재 worktree, 다른 로컬 worktree, 원격 추적 브랜치, stash
- Supabase CLI의 읽기 전용 프로젝트·마이그레이션·함수 조회와 이미 수행된 운영 smoke test 기록

표기의 의미는 다음과 같다.

- **확인된 사실**: 코드, Git, 테스트 출력 또는 운영 조회로 직접 확인했다.
- **추정**: 여러 정황으로 가능성이 높지만 직접 증명할 식별자가 없다.
- **제안**: 향후 작업 순서 또는 팀 합의가 필요한 권고다.
- **완료**: 구현, 관련 테스트, 필요한 프론트 연동과 운영 반영까지 현재 범위에서 끝난 상태다.
- **부분 완료**: 일부 계층만 구현됐거나 로컬 작업본·테스트만 있고 main/운영/프론트 중 하나 이상이 남은 상태다.

## 최신 상태

- 최신 `origin/main`은 PR #27을 merge commit 방식으로 병합한 `22dc9dfcbb1fcbae4a443fe8584bfe1a4cfce0a3`다. 사진 옷장 등록 모바일 코드가 main에 포함됐지만 Expo·서버·DB 자동 배포는 발생하지 않았다.
- 운영 Edge Function과 Expo production은 `2d0369b` 기준이며 운영 DB는 `202611200003_llm_operation_metrics.sql`까지 적용됐다.
- 인증 전용 변경은 draft PR #25(`3cca4b6`)에서 서버와 local Supabase CI가 성공했으며 main·운영에는 미반영이다. Auth/사진 통합 draft PR #24도 미병합이다.
- CHAT-02는 원격 `codex/chat-history`와 stacked draft PR #28에 있다. 사진별 conversation·메시지 저장, pagination, 삭제와 RLS를 구현했고 최신 PR head의 전체 검사·로컬 및 remote staging A/B Auth 통합 테스트를 통과했다. staging 배포 SHA는 `bd70fe4`이며 모바일 복원 UI는 미연동이다.
- `full-join-staging`에는 migration 17개와 `bd70fe4` API를 적용했다. `/health` release SHA 일치, 401/403·RLS·채팅 저장/삭제를 확인했으며 운영/로컬 seed와 운영 사용자 데이터는 복제하지 않았다. production은 변경하지 않았다.

## 변경 이력

### 2026-11-23 — PR #27 사진 기반 옷장 등록 main 병합

- Git: `feat/photo-closet@26863d0`의 4개 커밋을 보존하는 merge commit `22dc9df`로 main에 병합했다. PR은 충돌 없고 draft가 아니었으며 GitHub `check`와 `local-supabase-integration`이 성공했다.
- 구현: 카메라/앨범, 한 사진의 여러 영역 자르기, 웹 브라우저 u2netp 누끼, 사진 색 기반 칩·아이콘 색, 그림↔사진 전환, 기기별 사진 보관을 모바일에 추가했다.
- 검증: 별도 worktree에서 `npm run check`(골든 47/47·코사인 19/19 포함)와 mobile typecheck/Expo lint를 재통과했다. npm audit은 기존 Expo 전이 의존성 moderate 5건, high/critical 0건이다.
- 범위: 사진은 웹 localStorage 또는 앱 문서 폴더에만 저장된다. 서버 Storage, 계정 간 동기화, 서버 누끼/AI 태깅, 원본 보존·삭제 정책은 미구현이다. 운영 Expo 배포도 수행하지 않았다.

### 2026-11-23 — PR #26 병합·무료 staging 생성·CHAT-02 백엔드

- Git: PR #26을 merge commit `3e54228`로 main에 병합했다. workflow는 수동 승인형이라 병합으로 운영 배포되지 않았다.
- staging: Free 플랜의 두 번째 활성 프로젝트 `full-join-staging`에 main 15개와 Auth/CHAT-02 2개, 총 17개 migration을 적용했다. 운영 데이터·local seed는 복제하지 않았고 DB 비밀번호는 macOS Keychain에 저장했다.
- CHAT-02: 한 인증 사용자·한 저장 사진당 conversation 하나, 원자적 user/assistant exchange, ordinal pagination, 명시적 삭제, 하트 삭제 cascade와 owner RLS를 구현했다. 원문은 LLMOps에 저장하지 않는다.
- 테스트: `npm run check` 성공(골든 47/47), 모바일 typecheck/lint 성공, Docker `db reset`으로 17개 migration 적용 성공, 실제 API에서 사진별 복원·이전 페이지·타 사용자 조회/삭제 격리·RLS·삭제 cascade 성공. 외부 LLM 유료 호출은 없었다.
- Git/배포: CHAT-02를 `f37e022`, 문서를 `895fc6b`, 최신 Auth/main 병합을 `bd70fe4`로 커밋해 원격 branch와 stacked draft PR #28에 올렸다. staging에만 함수 내부 JWT 검증 API를 `--no-verify-jwt` gateway 설정으로 배포했고 release SHA 검증 및 A/B 격리 통합 테스트를 통과했다. 운영·main은 변경하지 않았다.
- 미확정: 모바일 Auth 연동, 자동 보존 기간, 계정 전체 삭제, staging 익명 로그인 사용 여부는 후속 작업이다.

### 2026-11-21 — PR #20·#21·#22 main 병합

- 완료: #20 `88701fa`, #21 `5fd2ab5`, #22 `73c435a` 순서로 merge. 후속 PR은 각각 main으로 base를 바꾸고 최신 main merge commit으로 새 CI를 실행했다.
- 테스트: #21 Verify run 133 성공. #22 Verify run 136의 서버·모바일 `check`와 local Supabase integration 모두 성공. 최종 main 파일 트리에서 `npm run check`, `npm run check:mobile`, 15개 migration reset·seed와 `npm run test:integration:local` 재통과.
- 기술 결정: 승인된 AC9 버킷은 유지하고 cosine은 버킷 내부 정렬에만 사용한다. 관리 대시보드는 인증 전까지 localhost 전용이다. 실제 사용자 격리 결함은 이번 병합 범위에서 변경하지 않았다.
- Git/배포: 기능 병합점 `73c435a`. 운영 DB·Edge Function·대시보드 배포 없음. 자동 운영 배포 workflow 없음.

### 2026-11-20 — 로컬 통합·대시보드 구축

- Docker local Supabase에서 15개 migration, synthetic seed, DB/API 통합 흐름을 검증했다.
- Product Analytics/LLMOps local-only 대시보드와 별도 CI job을 추가했다.
- 유료 LLM 호출은 실행하지 않았고 configuration fallback/grounded 경로만 검증했다.

---

## 0. 핵심 요약

1. **옷 종류 확장 P0는 main과 운영 서버에 반영됐다.** 현재 프론트와 서버는 확장된 `slot/kind/color/visual_fit`, `material`, `pattern`, `seasons`, `details` 계약을 사용하며 실제 운영 POST→GET→DELETE smoke test도 통과했다.
2. **코사인 A안은 main에 반영됐고 운영에는 미배포다.** AC9의 활용·비슷함·구매 버킷은 그대로 유지하고, 실제 버킷 내부 후보 순서에만 cosine을 사용한다.
3. **PR #20·#21·#22는 순차적으로 main에 병합됐다.** 후속 PR마다 base를 main으로 전환하고 새 CI와 충돌 여부를 확인했다.
4. **기존 `match_metadata` 버킷 이탈 결함을 수정했다.** 공개 metadata는 AC9 결과의 첫 후보만 참조하며 점수는 노출하지 않는다. 승인되지 않은 `데님팬츠↔슬랙스` 관계도 포함하지 않았고 회귀 테스트로 고정했다.
5. **사용자 행동 이벤트는 main/운영에 구현됐다.** 배치 `POST /events`, 30분 세션, 허용 이벤트, 비차단 전송이 동작한다. 코사인 학습용 비교 피드백은 별도 로컬 작업본만 있고 운영에는 없다.
6. **서버 전체 검증이 통과한다.** `npm run check`에서 승인 골든 47/47, 서버 3/3, 코사인·통합 19/19과 chat grounding/근거 검사가 모두 성공했다.
7. **모바일 검증도 통과한다.** `mobile/package-lock.json` 기준 `npm ci` 후 typecheck와 Expo lint가 성공했다. `verify.yml`에도 기존 서버 검증을 유지한 채 모바일 설치·검증 단계를 추가했다.
8. **CHAT-01/03은 main에 반영됐다.** 여섯 상담 유형을 자동 분류하고 보유 옷·저장 사진·상품 탐색은 grounded로, 일반 조언 부분만 LLM으로 처리한다. 사진별 영구 기록은 인증 정책 확정 뒤로 보류했다.
9. **기능 병합·검증 기준 main SHA는 `22dc9df`다.** 로컬 이름 `main`은 여전히 오래돼 있으므로 새 작업은 `origin/main`에서 분기한다.
10. **production DB migration은 15개다.** Auth/CHAT-02 두 migration은 staging에만 적용돼 있고 production에는 적용하지 않았다.

---

## 1. 현재까지의 개발 현황

### 1.1 프로젝트 목적과 현재 서비스 구조

오딧은 사용자가 원하는 스타일 사진과 실제 옷장을 비교해 다음 행동을 돕는 20대 여성 대상 모바일 앱이다.

- 사진 속 아이템을 구조화된 의류 속성으로 분석한다.
- 내 옷장의 실제 등록 아이템과 비교해 `활용`, `비슷함`, `구매`를 판정한다.
- 보유 옷으로 가능한 코디와 부족한 옷의 쇼핑 링크를 제공한다.
- 저장한 사진을 다시 보고, 옷장이 바뀌면 최신 상태로 재비교한다.
- 챗봇이 저장 사진의 기존 분석, 실제 옷장, 검증된 상품 링크를 근거로 답한다.

현재 구조는 다음과 같다.

| 계층 | 현재 구현 |
|---|---|
| 모바일 | Expo + React Native + Expo Router + TypeScript, `mobile/` |
| 서버 | Supabase Edge Function 단일 함수 `api`, `supabase/functions/api/index.ts` |
| DB/파일 | Supabase Postgres 및 private Storage |
| AI | OpenAI 비전 + Structured Outputs strict 기반 사전 태깅, 제한된 챗 호출과 결정론적 fallback |
| 도메인/검증 | 공통 JSON Schema와 `src/fulljoin/catalog.ts`, 실제 경계 검증 및 생성 계약 |
| 비교 | 현재 운영은 규칙 기반 gap analysis + 승인된 대체 쌍 |
| 분석 | 모바일 행동 이벤트를 `public.user_events`로 배치 전송 |
| 관리 | 분석·검토·게시·대표 상품 연결용 관리 API와 스크립트 |

Edge Function 한 개가 health, 옷장, 취향, 피드, 아카이브, 상세, 저장/취소, 비교/선택, 코디, 상품 링크, 챗, 이벤트, 분석·검토·게시를 라우팅한다. 배포 단위가 하나이므로 작은 서버 변경도 전체 API 재배포가 된다.

### 1.2 기존 MVP 구현 기능

| 기능 | 서버 | 프론트 연동 | 운영 배포 | 근거/주요 파일 |
|---|---|---|---|---|
| 추구미 선택·저장 | 완료 | 완료 | 완료 | `src/fulljoin/feed.ts`, `mobile/src/app/onboarding/taste.tsx`, API |
| 취향 우선 홈 피드 | 완료 | 완료 | 완료 | 선호→이웃→기타 round-robin, `src/fulljoin/feed.ts` |
| 스타일 사진 사전 분석 | 완료 | 관리 흐름 중심 | 완료 | `src/fulljoin/analysis.ts`, 프롬프트, schema, `/analyze` |
| 검토·게시 | 완료 | 관리 스크립트 | 완료 | `src/fulljoin/review.ts`, review/publish API·scripts |
| 사진 저장과 아카이브 | 완료 | 완료 | 완료 | heart/archive API, 연도·계절·스타일 필터 |
| Gap Analysis | 완료(규칙 기반) | 완료 | 완료 | `src/fulljoin/gap_analysis.ts`, heart/detail 응답 |
| 비슷함 사용자 결정 | 완료 | 완료 | 완료 | `src/fulljoin/decision.ts`, `item_choice` |
| 보유 옷 코디 | 완료 | 완료 | 완료 | `src/fulljoin/outfit.ts`, 최대 3개, 중복 ID 금지 |
| 정확/유사 상품 링크 | 완료 | 완료 | 완료 | 대표 상품 또는 검색 링크, `src/fulljoin/shopping.ts` |
| 칩 기반 옷장 등록/삭제 | 완료 | 완료 | 완료 | wardrobe API, add-item/closet 화면 |
| 저장 사진 기반 챗봇 beta | 완료(기본형) | 완료 | 완료 | `src/fulljoin/chat.ts`, chat API/UI |
| 사용자 행동 이벤트 | 완료 | 완료 | 완료 | `src/fulljoin/events.ts`, `mobile/src/data/events.ts`, `docs/EVENTS.md` |
| 관리형 상품 연결 | 완료 | 스크립트 | 완료 | set-item-product RPC/API/scripts |

### 1.3 MVP 이후 추가·수정된 기능

#### 옷 종류 및 옷장 속성 확장 — 완료·배포됨

- 프론트 종류 확장과 서버 canonical enum을 통합했다.
- `잡화` 슬롯과 모자·벨트 등 확장 종류를 지원한다.
- 색상에 살구 등 확장 값을 반영했다.
- 숏팬츠의 `버뮤다`를 포함한 핏 목록을 프론트와 맞췄다.
- 핏이 의미 없는 종류는 `visual_fit: null`을 허용한다.
- `material`, `pattern`, `seasons`, `details`를 옷장 저장/조회에 추가했다.
- 모자는 `details["모양"]`으로 캡·비니·베레모 등을 저장할 수 있다.
- 과거 레코드는 기본값으로 읽을 수 있지만, 과거 API가 버렸던 세부 속성을 소급 복구할 수는 없다.

주요 파일:

- `src/fulljoin/schemas/style_image.schema.json`
- `src/fulljoin/catalog.ts`
- `src/fulljoin/prompts/parse_query.md`
- `supabase/functions/api/index.ts`
- `supabase/migrations/202611160002_wardrobe_details.sql`
- `supabase/migrations/202611200001_wardrobe_fit_frontend_alignment.sql`
- `mobile/src/data/catalog.ts`
- `mobile/src/data/api.ts`
- `mobile/src/app/add-item/kind.tsx`
- `mobile/src/app/add-item/color-fit.tsx`
- `mobile/src/components/KindIcon.tsx`

#### 동료평가 기반 화면 개선 — 상당 부분 완료·배포됨

- 처음 사용자 힌트, 빈 상태와 다음 행동 안내를 보강했다.
- 추구미 3개 제한 도달을 설명하고 임의 교체를 막았다.
- 사진 저장 후 모든 저장 위치를 안내한다.
- 옷 삭제 확인, 로딩 상태, 한국어 not-found 화면을 추가했다.
- 챗 화면에 키보드 회피 레이아웃과 질문 예시가 있다.
- 옷장 계절 필터 및 확장된 일러스트 표시가 반영됐다.

단, 네이티브 iOS/Android 실제 기기에서 키보드·safe area·딥링크를 검증한 기록은 확인하지 못했다.

#### 이벤트 스키마 정렬 — 완료·배포됨

- 모바일은 최대 20개 이벤트를 2초 주기로 배치 전송한다.
- 서버는 허용 이벤트·속성을 검증하고 이벤트 실패가 제품 사용을 막지 않게 한다.
- `device_id`, `session_id`, `user_id`, `client_ts`, 공통 app/analytics version을 기록한다.
- 30분 inactivity 기준 세션을 사용한다.
- 과거 운영의 분석 프로토타입 테이블과 main의 canonical 배치 스키마를 데이터 삭제 없이 정렬했다.

### 1.4 기능별 완료 여부 요약

| 기능군 | 상태 | 현재 실제 사용자에게 제공되는 범위 |
|---|---|---|
| MVP 핵심 피드→저장→비교→코디→쇼핑 | 완료 | 프론트·서버·운영 연결 |
| 확장 옷 종류/상세 옷장 | 완료 | 프론트·서버·DB·운영 연결 |
| 규칙 기반 gap 판정 | 완료 | 운영 사용 중 |
| 코사인 기반 후보 정렬 | 부분 완료 | main 반영·검증 완료, 운영 미배포 |
| 판정 근거/후보 메타데이터 | 부분 완료 | main의 optional API 계약·테스트 완료, 프론트 표시·운영 배포 미완료 |
| 비교 피드백/학습 데이터 | 부분 완료 | 로컬 코드·migration만 존재, 동의 UI·운영 없음 |
| 챗봇 기본형 | 완료 | 운영 beta |
| 챗봇 의도 분리·강한 grounding | 부분 완료 | main 반영·검증 완료, 프론트의 optional 진단 필드 활용·운영 배포 미완료 |
| 취향 기반 홈 정렬 | 완료 | 운영 사용 중 |
| 별도 추천 탭/옷장 기반 추천 | 미구현 | 추천 탭은 Coming Soon |
| 사진 기반 옷장 등록 | 부분 완료 | main 모바일에 촬영/앨범·다중 자르기·기기 로컬 사진 저장 구현; Expo 운영 미배포, 서버 저장·AI 태깅 미구현 |
| 사진별 챗 기록 저장 | 미구현 | 클라이언트 메모리의 현재 대화만 유지 |
| 출시용 인증/탈퇴 | 미구현 | 닉네임+PIN 데모 세션 |
| LLMOps 토큰·비용·p95 | 부분 완료 | 로컬 계측 DB 통합·대시보드·테스트 완료, 운영 적용·실제 운영 표본·alert 없음 |

---

## 2. 기존 개발 백로그 진행 상황

### 2.1 `odit_codex_handoff.md` P0~P4

| ID / 기능 | 상태 | 테스트 | 프론트 연동 | 배포 | 남은 작업 | 관련 파일 |
|---|---|---|---|---|---|---|
| P0 옷 종류 확장 서버 통합 | **완료** | main `npm run check` 통과, wardrobe 확장 check 통과, 운영 POST/GET/DELETE smoke 통과 | 완료 | 완료 | 구형 레코드의 유실 세부값은 복구 불가임을 UX/문서에 명시 | schema, catalog, API, `202611160002`, `202611200001`, mobile catalog/add-item |
| P1 코사인 코디 비교 | **부분 완료** | cosine·통합 19/19, 전체 check와 local/remote staging API 통합 통과 | UI 미연동, 구버전은 optional 필드 무시 가능 | main 반영, staging 검증, 운영 미배포 | 프론트 이유 표시, 실제 데이터 shadow 평가 | `garment_similarity.ts`, gap/outfit/API, docs/tests |
| P2 취향·옷장 추천 고도화 | **미구현** | 없음 | 추천 탭 미연동 | 미배포 | 추천 정책·점수·콜드스타트 합의 후 구현 | `mobile/src/app/(tabs)/recommend.tsx`, feed/gap 모듈 예정 |
| P3 챗봇 보충 | **부분 완료** | CHAT-01/03 및 CHAT-02 단위·Docker·remote staging 실제 API/RLS 통합 통과 | 기록 API 문서화, 모바일 복원 UI·Auth 미연동 | CHAT-01/03 main, CHAT-02 PR #28·staging, 운영 미배포 | PR #25→#28 순차 병합, 모바일 Auth·복원/삭제 UI | `chat.ts`, API, `202611230003`, `FRONTEND_MATCH_CHAT_HANDOFF.md` |
| P4 LLMOps·품질 평가 | **부분 완료** | 계측 단위·local DB/API 통합·대시보드 집계 테스트, CI, 골든, 11/17 baseline 존재 | 사용자 행동과 분리 | 운영 migration/계측 미배포 | 실제 운영 표본, alert, live eval 12건 | `llm_observability.ts`, `admin_metrics.ts`, `202611200003`, dashboard/eval/docs |

RAG는 해당 문서에서 필수 구현이 아니며 현재도 설계 수준으로 유지된다.

### 2.2 `odit_mvp_feedback_development.md` 전체 백로그

#### MATCH — 비교 정확도와 설명

| ID / 기능 | 상태 | 테스트 | 프론트 연동 | 배포 | 남은 작업 | 관련 파일 |
|---|---|---|---|---|---|---|
| MATCH-01 스키마 동기화 | **완료** | schema/catalog 정합, wardrobe expansion, 골든 및 서버 계약 통과; 운영 smoke 통과 | 완료 | 완료 | 프론트가 종류를 다시 바꾸면 공통 enum·핏 그룹·DB를 함께 변경 | schema, catalog, prompt, API, migrations, mobile catalog |
| MATCH-02 코사인 유사도 | **부분 완료** | 19/19, AC9 eval 11/11 유지, local/remote staging API 통합 통과 | 응답 후보 순서만 호환 적용, UI 점수 없음 | main 반영, staging 검증, 운영 미배포 | 실제 데이터 shadow 검증 | `garment_similarity.ts`, gap/outfit, tests |
| MATCH-03 근거·후보 제공 | **부분 완료** | 버킷 누수·근거·local/staging 후보 ID 정합성 통과 | mobile 타입 반영, UI 미표시 | main 반영, staging 검증, 운영 미배포 | 프론트 한 줄 reason 표시 | gap/API/mobile types/API 문서 |

#### CHAT — 신뢰성과 문맥

| ID / 기능 | 상태 | 테스트 | 프론트 연동 | 배포 | 남은 작업 | 관련 파일 |
|---|---|---|---|---|---|---|
| CHAT-01 의도 분리·근거·일관성 | **부분 완료** | chat grounding·local/staging API 통합 통과 | 기존 UI 하위 호환, 신규 진단 필드 미사용 | main 반영, staging 검증, 운영은 구버전 | live eval 계약 합의 | `chat.ts`, API, scripts |
| CHAT-02 사진별 대화·문맥·복합 질문 | **부분 완료** | 저장·pagination·A/B API/RLS·삭제 cascade local/staging 통합 및 단위 2/2 통과 | API 계약 완료, 모바일은 아직 화면 메모리만 | PR #28·staging 반영, main·운영 미반영 | PR #25→#28 병합, 모바일 Auth·A→B→A 복원/삭제 UI, 보존·계정삭제 정책 | chat API, `202611230003`, 신규 테스트/문서 |
| CHAT-03 질문 범위·구매 도움 | **부분 완료** | 일반/빈 옷장/복합/범위 밖/소유권 회귀와 local/staging API 통합 통과 | optional `intents`·`answer_sections` 문서화, UI 미연동 | main 반영, staging 검증, 운영 미배포 | 평가 v2 승인, 검증된 사이즈 경로 | chat/API/mobile types/frontend handoff |

#### WARD — 옷장 등록

| ID / 기능 | 상태 | 테스트 | 프론트 연동 | 배포 | 남은 작업 | 관련 파일 |
|---|---|---|---|---|---|---|
| WARD-01 사진 기반 단일 등록 | **부분 완료** | GitHub CI 및 별도 mobile typecheck/lint 성공, 실제 기기 E2E 없음 | 촬영/앨범→영역 자르기→칩 수정→옷장 등록·그림/사진 전환 구현 | main 반영, Expo 운영 미배포 | 서버 Storage·계정 동기화·서버 누끼/AI 태깅·원본 삭제 정책 | PR #27 mobile photo flow, `wardrobePhotos.ts` |
| WARD-02 일괄 등록·샘플 옷장 | **부분 완료** | 정적 검증만 | 한 사진의 여러 영역을 각각 확인·등록 가능; 여러 사진 batch·샘플 옷장은 없음 | main 반영, Expo 운영 미배포 | 부분 실패 복구, 여러 사진 batch, 샘플 격리/삭제 | `photo-crop.tsx`, `photo-confirm.tsx` |

#### REC / FEED — 추천과 탐색

| ID / 기능 | 상태 | 테스트 | 프론트 연동 | 배포 | 남은 작업 | 관련 파일 |
|---|---|---|---|---|---|---|
| REC-01 사용자별 코디 추천 | **미구현**(취향 홈 정렬만 기존 완료) | 홈 피드 정렬 계약 통과 | 홈만, 추천 탭 없음 | 홈만 배포 | 취향+재현 가능성 결합, 특정 옷 기반 추천, 이유, 콜드스타트·페이지네이션 | feed/gap, recommend tab |
| FEED-01 검색·필터 | **부분 완료** | archive 필터 check 통과 | 저장 아카이브 필터와 취향 정렬 있음 | 해당 부분 배포 | 홈의 종류·색·스타일 키워드 검색, 필터 UI, 선택 추구미 설명 | feed/archive API, home UI |

#### UX — 모바일 사용성

| ID / 기능 | 상태 | 테스트 | 프론트 연동 | 배포 | 남은 작업 | 관련 파일 |
|---|---|---|---|---|---|---|
| UX-01 온보딩·빈 상태·선택/저장 안내 | **완료에 가까운 부분 완료** | 서버 계약 외 전용 UI 자동 테스트는 확인 못함 | 구현됨 | 배포됨 | 네이티브 기기 수용 테스트와 3개 제한/저장 안내 퍼널 확인 | hints, onboarding, home/closet/result UI |
| UX-02 키보드·로딩·삭제·오류 | **완료에 가까운 부분 완료** | mobile typecheck/lint 및 GitHub CI 통과 | 구현됨 | 기존 UI 배포됨 | iOS/Android 실제 기기 검증, 딥링크 회귀 | chat UI, loading states, closet, `+not-found.tsx` |

#### 출시·구매·콘텐츠

| ID / 기능 | 상태 | 테스트 | 프론트 연동 | 배포 | 남은 작업 | 관련 파일 |
|---|---|---|---|---|---|---|
| ACC-01 계정·데이터 관리 | **미구현 / 논의 필요** | 없음 | 데모 닉네임+PIN만 | 출시형 미배포 | Supabase Auth, 가입/로그인 분리, 계정·연관 데이터 삭제, 이전 정책, RLS | `mobile/src/data/session.ts`, users 관련 DB/API |
| BUY-01 구매 직전 사이즈 정보 | **미구현** | 없음 | 검색/대표 링크만 | 미배포 | 검증된 상품 상세·사이즈표 출처 연결; 추측 금지 | shopping/product metadata |
| CONTENT-01 콘텐츠 이용 권리 | **논의 필요** | 코드 테스트 대상 아님 | private seed 표시 일부 | 저장 구조 배포 | 팀이 이용 허락·공개 범위 확인, 출시 가능 콘텐츠 선별, 대체 데이터 계획 | storage/source/permission metadata, 출시 체크리스트 |
| FUTURE-01 주문 캡처·체형/사이즈·RAG | **의도적으로 미구현** | 없음 | 없음 | 없음 | 별도 스펙·개인정보·정확도 검토 전 자동 구현 금지 | 장기 백로그 |

#### OPS — 평가·운영 품질

| ID / 기능 | 상태 | 테스트 | 프론트 연동 | 배포 | 남은 작업 | 관련 파일 |
|---|---|---|---|---|---|---|
| OPS-01 Evals·LLMOps·행동 이벤트 | **부분 완료** | 골든/서버, LLMOps 단위+local 통합, dashboard 집계, 11/17 baseline; live 12건 미실행 | 행동 이벤트 연결 | 이벤트만 운영 배포 | 운영 migration, 실제 표본/alert, CHAT-03 eval v2 승인 | `evals/`, events, LLMOps/admin 코드·docs, workflow |

### 2.3 명시적 제외 항목 준수

다음은 지시서의 제외 범위이며 구현 완료 항목으로 계산하지 않는다.

- PC 전용 반응형·사진 잘림 대응
- 웹 초기 폰트 다운로드 용량 최적화
- 여성 대상 서비스라는 별도 온보딩 문구 추가
- 운영 중 일시적 Edge Function 배포 장애 자체를 신규 제품 기능 결함으로 재집계

---

## 3. 코디 비교 알고리즘

### 3.1 현재 운영 알고리즘 — 규칙 기반

**확인된 사실:** 운영 배포본은 코사인 계산 없이 규칙 기반이다. main에는 아래 규칙으로 만든 판정 버킷을 유지하면서 버킷 내부 후보만 코사인으로 정렬하는 A안이 병합됐다. `src/fulljoin/gap_analysis.ts`의 버킷 규칙은 다음과 같다.

1. 기본 후보는 `kind`와 `slot`이 모두 같은 옷장 아이템이다.
2. 카디건·후드집업·베스트·점프수트만 기존 교차 슬롯 호환을 허용한다.
3. 같은 종류 후보 중 색이 정확히 같으면 `활용`이며 해당 ID들을 반환한다.
4. 정확 색이 없고 같은 색 계열이면 `비슷함`이며 해당 ID들을 반환한다.
5. 사진 아이템 색이 null/`멀티`/`기타`인 경우 같은 종류 후보가 있으면 `비슷함`으로 둔다.
6. 그 외는 `구매`다.

현재 색 계열은 다음 수동 그룹이다.

- 화이트–아이보리
- 베이지–브라운–모카
- 블랙–차콜–그레이
- 네이비–블루–스카이블루
- 연청–중청
- 진청–흑청
- 그린–카키–민트
- 레드–와인–핑크–연핑크
- 퍼플–라벤더
- 옐로우–오렌지–살구
- 실버–골드

`visual_fit`, 소재, 무늬, 계절, 상세는 현재 `gap_status`를 바꾸지 않는다. 프론트에서는 서버의 `구매`를 문맥상 `필요`로 표시할 수 있다.

### 3.2 `대체`의 현재 의미

`대체`는 DB의 `gap_status`가 아니다. 원본이 `구매`인 경우 `src/fulljoin/outfit.ts`에서 사람이 승인한 `SUBSTITUTE_KIND_PAIRS`에 속하는 옷장 종류를 코디 후보로 찾을 때 쓰는 표현이다.

- 같은 색 후보를 먼저 본다.
- 없으면 같은 색 계열 후보를 본다.
- 동률은 결정적으로 정렬한다.
- 한 코디 안에서 동일한 `wardrobe_item_id`를 두 번 쓰지 않는다.
- 최대 3개 코디를 만든다.

따라서 `비슷함`과 `대체`는 동일한 상태가 아니다. 코사인도 임의로 새로운 대체 종류 관계를 만들면 안 된다는 것이 현재 A안 결정이다.

### 3.3 main의 코사인 A안 구현 상태

**확인된 사실:** 채택한 구현은 main에 병합됐고 최종 main 단위·local API 통합 테스트를 통과했다. 별도 오래된 cosine worktree의 미커밋 실험은 보존하되 운영 코드의 기준으로 사용하지 않는다.

채택된 방향은 **스키마/규칙으로 슬롯·종류·색 판정 버킷을 먼저 만든 뒤, 같은 버킷 내부 후보 순위에 코사인을 사용**하는 A안이다.

처리 순서:

1. 현재 사용자의 옷장만 불러온다.
2. 호환 슬롯과 현재 AC9 종류 규칙으로 후보를 제한한다.
3. `활용`이면 정확 색 후보 안에서만, `비슷함`이면 같은 색 계열 후보 안에서만 코사인으로 정렬한다.
4. `구매`의 대체는 승인된 대체 종류표와 색 버킷을 먼저 적용한 뒤 코사인으로 정렬한다.
5. 알 수 없는 값, 빈 벡터, 정보량 부족, 0 norm을 명시적으로 제외한다.
6. 동점은 `wardrobe_item_id` 오름차순, 한 코디에서 동일 ID 중복 금지다.

이 구조는 기존 AC9 판정 의미를 유지하고, 데이터가 적은 초기의 오판 위험을 낮춘다.

### 3.4 의류 특성 벡터와 계산 방식

범주형 단일 값은 one-hot, 복수 값은 multi-hot이다. 각 특성 블록을 L2 정규화한 뒤 `sqrt(weight)`를 곱해 결합하고, 공통으로 알려진 특성만 사용해 cosine을 계산한다.

`cosine(a,b) = dot(a,b) / (||a|| × ||b||)`

| 특성 | 초기 가중치 |
|---|---:|
| 종류 `kind` | 0.35 |
| 색 `color` | 0.25 |
| 시각적 핏 `visual_fit` | 0.15 |
| 소재 `material` | 0.10 |
| 무늬 `pattern` | 0.07 |
| 상세 `details` | 0.05 |
| 계절 `seasons` | 0.03 |

추가 규칙:

- 색 벡터 안에서 정확 색 0.7, 같은 색 계열 0.3의 성분을 둔다. 실제 벡터 성분에는 각각 제곱근을 사용한다.
- 공통으로 비교 가능한 특성이 최소 2개여야 한다.
- 공통 특성 가중치 합이 최소 0.50이어야 한다.
- null/미지 enum은 일치로 세지 않는다.
- `멀티`와 `기타`는 색 일치 근거에서 제외한다.
- 기본 설정은 같은 종류를 요구한다. 대체 단계처럼 호출자가 이미 승인된 종류 후보를 제한한 경우만 해제할 수 있다.

### 3.5 실험 임계값과 분류

- 실험용 `활용` 임계값: 0.90
- 실험용 `비슷함` 임계값: 0.70
- 0.70 미만: 독립 실험 함수에서는 `구매`

**중요:** 이 임계값은 현재 A안의 운영 AC9 판정을 변경하는 값이 아니다. 현재는 규칙 버킷 안의 순위와 향후 shadow 비교용 초기 가설이다. 유사도 0.8은 재현 확률 80%가 아니다.

### 3.6 판정 근거 문구

main 구현은 다음 코드와 구조화된 evidence를 만든다.

- `no_candidate`: 비교 후보 없음
- `exact`: 종류·색·핏 등 핵심 값이 일치
- `color_similar`: 같은 색 계열
- `fit_difference`: 핏 차이
- `kind_substitute`: 승인된 대체 종류
- `attribute_difference`: 기타 속성 차이

evidence는 종류·색·핏별로 `same/similar/different/unknown`, source 값, candidate 값을 담는다. 전용 check는 통과했지만 프론트 문구·접근성·사용자 이해도 검증은 아직 없다.

### 3.7 기존 규칙과 달라지는 점

| 항목 | 현재 운영 배포 | main의 A안 |
|---|---|---|
| 판정 버킷 | 종류+색 규칙 | 동일하게 유지 |
| 후보가 여러 개일 때 | ID/기존 순서 | 공통 속성 코사인 내림차순 후 ID |
| 핏·소재·무늬·계절·상세 | 판정/순위에 거의 미사용 | 같은 버킷 후보 순위에 반영 |
| 사용자 설명 | 상태 중심 | 구조화된 이유와 evidence 추가 가능 |
| 학습 데이터 | 일반 행동 이벤트만 | 별도 동의 기반 비교 피드백 설계 |

### 3.8 현재 한계와 남은 결정

1. `match_metadata`의 버킷 이탈 결함은 실제 AC9 후보 ID 집합 안에서만 계산하도록 수정했고 main 회귀·local API 통합 테스트로 검증했다.
2. 승인되지 않은 `데님팬츠↔슬랙스` 대체 쌍은 main에 포함하지 않았다. 새로운 대체 관계는 팀 합의 전 추가하지 않는다.
3. 가중치와 임계값은 팀 라벨·실사용 데이터로 튜닝되지 않은 실험 설정이다.
4. 오래된 cosine worktree의 비교 피드백 코드는 main에 포팅하지 않았다. 동의 문구·철회·보존·삭제 정책과 충돌 없는 신규 migration이 먼저 필요하다.
5. 현재 종류 one-hot만으로는 서로 다른 종류의 기능적 대체 관계를 학습하지 못한다. B안은 종류 그룹·착용 역할·레이어·길이/실루엣과 승인된 대체 라벨이 필요하다.

### 3.9 향후 B안 검증 방향 — 제안

슬롯은 강한 필터로 유지하고, 종류 관계를 `동일/대체 가능/관련/비교 불가`로 별도 모델링한 후 속성 코사인과 결합한다. 운영 판정을 바로 바꾸지 말고 A안과 동시에 계산하는 shadow mode에서 팀 라벨과 동의한 사용자 선택으로 정확도·오탐을 비교한다. 온라인 즉시 학습보다 오프라인 배치, 버전 고정, 회귀 평가, 롤백을 권장한다.

---

## 4. Git 및 배포 현황

### 4.1 현재 브랜치와 커밋

| 항목 | 확인 값 |
|---|---|
| 현재 worktree 브랜치 | `codex/chat-history` |
| 현재 브랜치 HEAD | 원격 `codex/chat-history`의 PR #28 최신 head(문서 갱신 포함) |
| 기능 병합·검증 기준 `origin/main` | `22dc9dfcbb1fcbae4a443fe8584bfe1a4cfce0a3` (PR #27 merge commit) |
| 로컬 이름 `main` | `fa2129a35f5de6c195951c464b55a368346759bf`, origin/main보다 37커밋 뒤 |
| PR 상태 | #25 draft·CI 성공, #28 stacked draft·서버 및 local Supabase CI 성공; #20, #21, #22, #26, #27 main 병합 완료 |

세 PR의 기능 변경은 main에 반영됐다. 로컬 `main` 포인터는 의도적으로 건드리지 않았으므로 새 작업은 계속 `origin/main` SHA를 직접 확인해 분기해야 한다.

### 4.2 로컬 미커밋·미푸시 상태

보고서 갱신 직전 추적 파일의 미커밋 변경은 staging 재실행 모드와 이번 문서 갱신이다. 기존 사용자 파일 `presentation/AI캡스톤디자인-중간평가.pdf`는 untracked 상태로 보존했고 수정·커밋하지 않았다. CHAT-02 구현은 원격 PR #28에 있고 main·운영에는 미반영이다.

별도 cosine worktree에는 다음 미커밋 작업이 있다.

- 수정: API 명세, package scripts, analysis/catalog/chat/gap/outfit, prompt/schema, generated contract, Edge API, wardrobe migration
- 신규: 코사인 모듈/테스트, 비교 피드백 모듈/migration/docs, 근거/챗/피드백 check scripts, 알고리즘 결정 문서
- 위치: `/Users/choijeong-in/.codex/worktrees/cosine-outfit-matching/FULL-JOIN`
- HEAD: `e480337ce7f7b1108e6b2ffaa76293327491bd4d`
- 상태: **미커밋·미푸시·미병합·미배포**

다른 기본 worktree:

- 브랜치 `codex/wardrobe-db-expansion`
- HEAD `2c9517938b97576d13c4699e423284c7667a46d7`
- 원격 `origin/codex/wardrobe-db-expansion` 추적
- 해당 브랜치는 오래된 main 기반의 별도 analytics 실험이 포함돼 있어 현재 main에 통째로 merge하지 않는다.

stash는 3개이며 발표 PDF 보존 2개와 과거 review-publish 작업 보존 1개다. 임의 삭제하지 않는다.

안전한 정리 방법:

1. 다른 worktree, stash, 로컬 `main`을 삭제·reset하지 않는다.
2. 로컬 `main` 정리가 필요하면 독자 커밋과 사용 중인 worktree가 없는지 다시 확인한 뒤 별도 승인 하에 포인터만 맞춘다. 이번 작업에서는 실행하지 않았다.
3. 오래된 cosine worktree는 미커밋 파일을 별도 리뷰/백업한 뒤 필요 구현이 모두 main에 포함됐다는 사람 확인 후 보관 또는 archive한다.
4. stash 3개는 작성자 확인 전 drop하지 않는다.

### 4.3 원격 미병합 브랜치와 충돌 가능성

`origin/main` 외 여러 병합 완료·과거 기능 브랜치가 남아 있다. #28은 #25를 base로 하는 stacked PR이므로 #25 병합 전 브랜치를 삭제하거나 #28 base를 main으로 바꾸지 않는다. 오래된 브랜치를 통째로 다시 merge하지 않는다.

충돌 위험:

- cosine worktree는 schema/catalog/API/migration을 오래된 상태에서 함께 수정하므로 최신 옷 종류 확장과 직접 충돌한다.
- `codex/wardrobe-db-expansion`의 과거 `user_events` 구조는 main의 canonical batch 구조와 다르다.
- 프론트 담당자가 catalog, API types, add-item 화면을 다시 바꾸면 서버 공통 enum과 핏 제약이 어긋날 수 있다.
- 단일 Edge Function이라 챗/코사인만 배포해도 다른 모든 API 코드가 함께 교체된다.

### 4.4 Supabase 마이그레이션

production에는 아래 15개 버전(`202611040001`~`202611200003`)이 적용돼 있다. 별도 staging에는 여기에 Auth `202611230001`과 CHAT-02 `202611230003`을 더한 17개가 적용됐다. production에는 신규 두 개를 적용하지 않았다.

| 버전 | 파일 / 역할 |
|---|---|
| 202611040001 | `mvp_schema.sql` — 핵심 MVP 테이블 |
| 202611040002 | `service_role_grants.sql` |
| 202611050001 | `item_product_links.sql` |
| 202611070001 | `optional_product_metadata.sql` |
| 202611070002 | `save_analysis_rpc.sql` |
| 202611070003 | `analysis_claims.sql` |
| 202611070004 | `set_item_product.sql` |
| 202611090001 | `review_publish.sql` |
| 202611100001 | `user_events.sql` |
| 202611160001 | `remote_user_events_history.sql` — 원격 과거 이력 정렬용 no-op 기록 |
| 202611160002 | `wardrobe_details.sql` — 옷장 확장 속성 |
| 202611160003 | `remote_user_events_grants_history.sql` — 원격 과거 이력 정렬용 no-op 기록 |
| 202611200001 | `wardrobe_fit_frontend_alignment.sql` |
| 202611200002 | `user_events_batch_alignment.sql` — 운영 분석 프로토타입을 canonical batch schema로 무삭제 변환 |
| 202611200003 | `llm_operation_metrics.sql` — main·production·staging 적용, 원문 없는 LLM/grounded 운영 지표 |
| 202611230001 | `auth_access_control.sql` — PR #25, local·staging 적용, production pending |
| 202611230003 | `chat_conversations.sql` — PR #28, local·staging 적용, production pending |

과거 운영 이력 불일치는 해결됐다. 현재 production과 PR stack의 차이는 의도적인 Auth/CHAT-02 두 migration이다. staging에는 정상 push했으며 remote repair·reset과 production 변경은 수행하지 않았다.

### 4.5 최근 DB와 Edge Function 배포

확인된 최근 운영 반영:

- 옷장 상세 migration `202611160002`
- 프론트 핏 정렬 migration `202611200001`
- 이벤트 batch 정렬 migration `202611200002`
- Edge Function `api` 재배포

별도 staging 반영:

- migration `202611230001`, `202611230003`
- Edge Function `api`: Git SHA `bd70fe4b79f13dd96eb80f4b58d42b01113186a4`
- `/health` release SHA 일치 확인
- synthetic A/B API·RLS 통합 테스트 통과; 운영 데이터 복제 없음

운영 프로젝트:

- 이름: `full-join-mvp`
- ref: `gctbcanltqgcymdlplyr`
- 함수 `api`: `ACTIVE`, version `20`
- `verify_jwt`: `false`
- health GET: `{"ok":true}`

이미 수행된 운영 smoke 결과:

- health 성공
- 빈 옷장 GET 성공
- 이벤트 POST 1건 수락 성공
- 모자/살구/비니 상세 POST→GET→DELETE 성공
- 핏 nullable 종류 POST→DELETE 성공
- 숏팬츠 `버뮤다` POST→DELETE 성공
- 니트/살구/레귤러 + 소재/무늬/계절/V넥 상세 POST→GET→DELETE 성공

이 smoke 중 이벤트 1건은 `smoke_test` 표시와 배포 식별 속성으로 분석 DB에 남아 있다. 옷장 smoke 레코드는 삭제했다.

### 4.6 실제 배포 버전과 GitHub 코드 일치

**확인된 사실:** 배포 직전 기준 Git commit은 `b53b6d6`이었고, 같은 worktree에서 function version 20을 배포한 뒤 위 smoke를 수행했다. GitHub main은 이후 PR #20~#22·#26·#27 병합으로 `22dc9df`까지 진행했지만 운영 함수와 DB는 해당 main으로 재배포하지 않았다.

**한계:** Supabase 함수 메타데이터는 Git commit SHA를 노출하지 않는다. 따라서 원격 함수 artifact와 Git tree를 SHA로 직접 대조할 수는 없다.

**판단:** 배포 절차와 즉시 실행한 확장 필드·이벤트 smoke 결과상 운영 함수가 `b53b6d6` 코드와 일치한다고 강하게 추정한다. 단, 보고상 절대 검증 완료가 아니라 “높은 신뢰의 운영 증거”로 기록한다.

### 4.7 프론트–백엔드 호환성

현재 운영 프론트/백엔드는 기존 확장 옷장 계약에 호환된다. main의 신규 optional 계약은 구버전 프론트가 무시할 수 있게 유지됐다.

- 프론트의 `SERVER_HAS_WARDROBE_DETAILS`가 활성화돼 새 필드를 보낸다.
- 서버는 `material`, `pattern`, `seasons`, `details`를 저장·반환한다.
- 핏 필수/nullable 규칙과 `버뮤다`, 모자 모양이 실제 smoke로 확인됐다.
- 기존 최소 필드 요청도 서버 기본값으로 호환된다.
- main의 mobile 타입은 optional `match_metadata`, chat `grounded/intents/comparison`을 수용하지만 UI에는 유사도 숫자나 새 근거를 표시하지 않는다.

main의 하위 호환 optional 계약:

- `items[].match_metadata`: 실제 후보 ID, reason code, 한 줄 reason. similarity 숫자는 없음
- 챗 `intents`, `comparison`, `answer_source=grounded`; 기존 필드는 유지

아직 프론트가 사용하지 않는 구현 계약:

- 비교 학습 피드백 제출 API와 동의 UI
- 사진별 대화 `GET/DELETE /chat/history`와 `POST /chat`의 `conversation_id`

### 4.8 CI/CD 상태

main의 `.github/workflows/verify.yml`은 push와 pull request에서 Node 22.18, root `npm ci`와 `npm run check`를 실행한 뒤 `npm ci --prefix mobile`, mobile typecheck/lint를 실행한다. 기존 서버 검증을 제거하지 않았다. 별도 `local-supabase-integration` job은 GitHub runner Docker에서 local stack을 기동하고 15개 migration+seed와 실제 API 통합 테스트를 수행한 뒤 정리한다. 원격 Supabase ref/secret은 쓰지 않는다. `.github/CODEOWNERS`는 승인된 테스트/골든 영역을 보호한다.

확인된 한계:

- local Supabase reset/migration/API 통합과 remote staging API/RLS 통합을 모두 확인했다.
- live LLM eval은 CI에서 실행하지 않는다.
- 운영 배포 자동화가 없어 수동 CLI 배포에 의존한다.
- release metadata 코드는 추가됐지만 운영 환경변수·배포가 없어 현재 production health에는 아직 SHA가 없다.

실제 GitHub 결과:

- PR #20 `Verify` run 122: **success**
- PR #21 base 전환 후 `Verify` run 133: **success**
- PR #22 base 전환 후 `Verify` run 136: 서버·모바일 `check`, `local-supabase-integration` 모두 **success**
- PR #25 `3cca4b6`: 서버 `check`와 `local-supabase-integration` **success**
- PR #28 최신 head: 서버 `check`와 `local-supabase-integration` 모두 **success**, 별도 remote staging 검증도 성공
- #20~#22·#26은 main에 병합됐다. workflow의 release는 사람 승인과 exact SHA 입력이 필요하며 자동 운영 배포는 없다.

---

## 5. 테스트 및 품질 검증

### 5.1 2026-11-21 최종 main 기준 실제 실행한 테스트

| 명령 | 위치 | 결과 | 해석 |
|---|---|---|---|
| `npm run check` | 최종 main과 동일한 파일 트리 | **성공** | 기존 전체 검증 + chat grounding/근거 + similarity 통합 포함 |
| `npm run test:golden` (check 내부) | 현재 worktree | **47/47 성공** | SPEC 계약 40개 성격의 사례와 gap 7개 포함, skip 없음 |
| `npm run test:server` (check 내부) | 현재 worktree | **3/3 성공** | catalog-schema, kind별 fit/slot, 홈 피드 정렬 |
| `npm run test:similarity` | 최종 main과 동일한 파일 트리 | **19/19 성공** | 기존 14개 + 실제 버킷/metadata/대체 관계 통합 5개 |
| `npm run check:chat-grounding` | 최종 main과 동일한 파일 트리 | **성공** | 의도 분리, 빈 옷장 검색, 실제 등록/미등록 구분, 승인 대체만 사용 |
| `npm run check:match-explanations` | 최종 main과 동일한 파일 트리 | **성공** | exact/color/fit/substitute/no-candidate 문구 |
| `npm run typecheck` | `mobile/` | **성공** | lockfile 설치 후 strict typecheck |
| `npm run lint` | `mobile/` | **성공** | Expo lint 무경고 |
| `supabase db reset --local` | local Docker | **성공** | 15개 migration과 synthetic seed 적용 |
| `npm run test:integration:local` | local Edge Function/DB | **성공** | 옷장 CRUD, 비교·근거·후보 ID, 챗, events, LLMOps persistence; 실제 user_id 격리 실패도 재현 |
| `npm run test:admin-metrics` | 현재 worktree | **3/3 성공** | KST, distinct 사용자, funnel, 테스트 제외, LLMOps 비용·p95·fallback |
| `npm run test:chat-history` | `codex/chat-history` | **2/2 성공** | pagination 경계와 저장 메시지 외부 경계 zod 검증 |
| `supabase db reset --local` | CHAT-02 local Docker | **성공** | 17개 migration과 synthetic seed 적용 |
| `npm run test:integration:local` | CHAT-02 local Edge Function/DB/Auth | **성공** | 사진별 저장·복원·pagination, 타 사용자 API/RLS 격리, 삭제 cascade |
| `npm run test:integration:staging` | `full-join-staging` Edge Function/DB/Auth | **성공** | 옷장 CRUD, 코사인 후보 ID, CHAT-01/02/03, events, LLMOps, 401/403, A/B RLS; 유료 LLM 호출 없음 |
| `scripts/verify-release.mjs` | staging `/health` | **성공** | 배포 release SHA가 `bd70fe4b…`와 일치 |

### 5.2 골든 케이스 해석

현재 47/47 통과는 다음 핵심 불변 조건을 포함한다.

- 공통 닫힌 enum과 종류별 핏 그룹
- 근거 없는 브랜드/상품 식별 금지
- 삽입 지시 실행 금지와 인물명 근거
- 비슷함의 사용자 결정
- 빈 옷장 구매 강요 금지
- 실제 등록 옷만 코디에 사용
- 정확 색 활용, 같은 색 계열 비슷함, 다른 종류 구매
- 교차 슬롯 예외와 일반 종류의 슬롯 제한
- 챗이 기존 분석과 실제 옷장을 사용
- 취향 기반 피드 순서

각 항목은 정상 예시와 결함 주입 예시를 함께 판정한다. 다만 이는 실제 모바일 E2E 또는 모든 운영 데이터 품질을 증명하지 않는다.

### 5.3 Evals 베이스라인과 최신 상태

저장소의 가장 최근 결과 파일은 2026-11-17 실행이다.

- 전체 평가 케이스: 28
- 실제 실행: 16
- 통과: 9
- 미실행: 12
- 태깅 정확도: 84/93 = 90.3%
- 형식 준수: 12/12 = 100%
- gap 판정 일치: 11/11 = 100%
- 미실행: live 신규 사진 태깅 5, live 챗 7
- judge label이 없는 항목이 있어 전체 16개를 모두 pass로 계산하지 않는다.

코사인·챗 변경 후 승인 데이터를 수정하지 않고 비-live eval을 `/private/tmp`에 재실행했다. 결과는 실행 16, 통과 9, 미실행 12, 태깅 84/93, 형식 12/12, gap 11/11로 11월 17일과 동일하다. live 12건은 운영 DB 변경 금지, live tagging runner 미구현, 새 grounded 답변과 기존 `answer_source=openai` 평가 계약 충돌 때문에 실행하지 않았다. 상세는 `docs/EVAL_EXECUTION_2026-11-20.md`다.

### 5.4 실제 API·배포 환경 검증

운영에서는 health, 옷장 확장 속성, nullable fit, 버뮤다, 상세 필드 round-trip, 이벤트 수락이 확인됐다. 별도 staging에서는 Auth 사용자 A/B로 사진 저장→비교→챗 기록/복원/삭제, events, LLMOps와 API/RLS 격리를 확인했다. 실제 모바일 앱의 로그인·사진 A→B→A 복원 E2E와 production 침투 테스트는 아직 없다.

### 5.5 동료평가 문제 해결 여부

해결 또는 상당 부분 완화:

- 확장 종류는 저장되지만 상세 칸이 응답에서 사라지던 서버 문제
- 숏팬츠 핏과 프론트/서버 불일치
- 핏이 없는 종류를 서버가 거절하던 문제
- 3개 추구미 제한의 설명 없는 교체
- 저장 위치 안내, 삭제 확인, 로딩, 한국어 오류 화면
- 행동 이벤트 스키마 충돌

부분 해결:

- 비교 근거: main API 구현·검증 완료, 프론트 표시와 운영 배포 미완료
- 챗 보유 옷 grounding/복합 상담: main 구현·검증 완료, 프론트 optional 필드 활용과 운영 배포 미완료
- 모바일 키보드: 코드 반영됐으나 실제 기기 검증 근거 부족
- 피드 탐색: 아카이브 필터/취향 정렬만, 홈 검색은 없음

미해결:

- 사진 옷장 등록의 서버 저장·계정 동기화·AI 태깅과 여러 사진 batch
- 사진별 대화 보존 모바일 UI와 정책(백엔드·staging은 구현/검증 완료)
- 옷장/특정 아이템 기반 추천
- 출시 인증·계정 삭제
- 검증된 사이즈 정보
- 콘텐츠 이용 권리 확인

### 5.6 LLMOps와 사용자 행동 이벤트

사용자 행동 이벤트는 구현·배포됐다. 화면 진입/이탈, 옷장 등록, 피드, 저장, 비교 결과, 선택, 쇼핑 클릭, 챗 요청/응답, 힌트 등을 허용 목록으로 관리한다. 실패는 앱 사용을 막지 않는다.

로컬 구현된 LLMOps:

- 사진 태깅/챗과 향후 옷장 사진 태깅·이미지 보정까지 확장 가능한 `feature`
- 모델·프롬프트·release SHA, 성공/실패와 제한된 오류 유형
- input/cached/output token과 버전 고정 모델 가격 기반 예상 비용
- 평균·p95 계산, fallback 횟수·사유
- LLM을 부르지 않은 grounded chat operation과 grounded 비율
- 사용자 행동 이벤트와 별도 `llm_operation_metrics` 테이블
- 사진·프롬프트·대화·URL·사용자/사진 ID를 저장하지 않는 필드 allowlist

운영 migration·실제 운영 표본·보존 기간 확정은 아직 없다. LLMOps alert 코드는 PR #26으로 main에 포함됐고 dashboard는 localhost 전용이다. staging에는 migration과 API를 적용해 grounded/fallback 지표 3건을 확인했지만 이는 synthetic 테스트 표본이며 production 통계로 보지 않는다.

사진 기반 옷장 등록은 PR #27로 main에 반영됐다. 현재 사진은 기기 로컬에만 남고 서버 API·Storage 계약은 없으므로, 백엔드는 프론트의 후속 계약 없이 업로드/누끼/AI 태깅을 추측해 구현하지 않는다.

코사인 학습용 비교 피드백은 일반 `user_events`와 별개로 설계됐으나 로컬 작업본뿐이다. 현재 운영 데이터를 코사인 학습 라벨로 간주하면 안 된다.

---

## 6. 팀원과 논의해야 할 사항

### 6.1 현재 임시 설정과 알고리즘 기준

1. 코사인 가중치 `0.35/0.25/0.15/0.10/0.07/0.05/0.03`과 임계값 `0.90/0.70`은 가설이다.
2. 최소 공통 특성 2개, 최소 가중치 0.50도 실험값이다.
3. 색 계열은 수동 정책이다. 특히 데님 계열과 핑크/레드 계열이 사용자 인식과 맞는지 라벨 검증이 필요하다.
4. `대체`는 현재 수동 종류 쌍만 허용한다. `데님팬츠↔슬랙스` 추가 여부를 제품팀이 결정해야 한다.
5. 유사도 점수는 사용자 API/UI에 노출하지 않는다. 운영 검증 시에도 내부 shadow 평가와 관측 지표로만 다루고, 공개 계약은 후보 ID와 한 줄 근거로 제한한다.

### 6.2 확정된 제품 정책

- 코사인 A안을 안정화한 뒤 B안을 별도 shadow 실험한다.
- 유사도 점수는 공개하지 않고 한 줄 근거만 표시한다.
- 비교 피드백은 명시적 동의 기반으로 수집한다.
- 홈은 취향 탐색, 추천 탭은 옷장 활용 중심이며 특정 보유 의류 기반 추천을 제공한다.
- 챗은 유형 선택 UI 없이 자동 분류하고 일반 패션 상담을 허용한다.
- 실제 보유 근거와 일반 패션 조언을 명확히 구분한다.
- 사진별 대화의 저장/삭제를 지원하되 Auth·삭제 정책 이후 구현한다.
- 출시 인증은 Supabase Auth를 우선 검토한다.
- 콘텐츠는 이용 허락을 받았거나 직접 제작한 것만 사용한다.

미확정:

- 새로운 대체 종류 관계
- 사진 AI 구김 제거·형태 보정 방식
- 사진 원본 보존·삭제 정책
- 비교 피드백 동의 문구·보존 기간·철회 정책
- 로그인 세부 방식과 데모 계정 이전 정책

### 6.3 프론트엔드 담당자에게 전달할 API 사항

현재 운영 확정:

- 옷장 등록/조회는 `material[]`, `pattern`, `seasons[]`, `details`를 지원한다.
- 종류별 `visual_fit`은 필수 또는 null 가능 여부가 다르다.
- 모자 `details["모양"]`과 확장 enum을 서버가 반환한다.
- `POST /events`는 배치 이벤트 배열을 받으며 제품 흐름을 막으면 안 된다.

후속 브랜치에서 전달 준비됨:

- optional `match_metadata` 한 줄 근거. similarity 숫자는 프론트에 전달·표시하지 않음
- `wardrobe_item_id`는 같은 응답 후보 첫 ID이며 옷장 카드 연결에만 사용
- 챗 `intents`, `answer_sections`, `comparison`, `answer_source`
- 복합 답변의 `내 옷장 기준`/`일반 패션 조언` 분리
- 요청·응답 예시와 연동 흐름은 `docs/FRONTEND_MATCH_CHAT_HANDOFF.md`

정책 확정 뒤 전달:

- 사용자 피드백 endpoint, consent/version, accepted/rejected/unsure/no-candidate 라벨
- 사진별 conversation ID 및 history pagination/delete

새 계약은 optional 필드로 시작해 구버전 앱과 하위 호환을 유지하는 것이 안전하다.

### 6.4 기술 검토가 필요한 사항

1. 운영 함수의 `verify_jwt=false`와 사용자 요청의 `user_id` 신뢰는 수평 권한 침해 위험이 있다. 출시 전 Supabase Auth와 RLS 또는 검증된 JWT 기반 user identity가 필요하다.
2. 서비스 역할 키는 서버 내부에 있지만 공개 함수가 잘못된 user_id를 받아 다른 사용자 데이터를 접근하지 못하도록 별도 권한 경계가 필요하다.
3. 단일 Edge Function을 계속 유지할지, 관리/분석/사용자 API를 분리할지 검토한다.
4. migration 이력 복구용 no-op 파일의 의미를 문서화하고 신규 개발자가 삭제하지 않게 해야 한다.
5. 모바일 CI를 만들 때 Expo 버전과 Node 버전을 고정해야 한다.
6. 코사인 shadow 결과와 사용자 선택을 학습/평가/검증 세트로 분리해 누수를 막아야 한다.

---

## 7. 앞으로 남은 개발 작업

### 7.1 main에 병합 완료한 기반 작업

#### 코사인 A안 정리

1. `origin/main@b53b6d6`에서 시작한 안정화 변경을 PR #20으로 병합했다.
2. 오래된 worktree를 merge하지 않고 코사인 모듈·전용 테스트·결정 문서만 선택 포팅했다.
3. AC9의 실제 후보 ID 집합 안에서만 similarity와 explanation을 계산한다.
4. 미승인 데님팬츠↔슬랙스 관계를 제외하고 회귀 테스트로 고정했다.
5. 점수 없는 optional `match_metadata`로 API를 정리했다.
6. 전체 check와 similarity 19/19를 통과했다.
7. 비-live eval에서 AC9 11/11과 기존 baseline 유지가 확인됐다.

#### 챗봇 grounding 선택 포팅

1. intent separation과 empty-wardrobe shopping fallback을 최신 main에 옮겼다.
2. 비교 화면과 같은 `classifyGap`과 승인 대체 종류표를 재사용한다.
3. 보유 옷·상품·사진 질문은 LLM 대신 grounded 답변을 사용한다.
4. 없는 청바지, 등록됐지만 비교 후보가 아닌 슬랙스, 빈 옷장, 미승인 대체 회귀를 추가했다.
5. 안정화 변경은 PR #20에 포함됐다.

#### CHAT-03 일반 패션 상담

1. 보유 옷, 저장 사진, 상품 탐색, 일반 패션, 복합, 범위 밖 질문을 자동 분류한다.
2. 구조화 데이터로 답할 수 있는 유형은 LLM을 호출하지 않는다.
3. 일반 상담이 포함된 부분만 LLM을 사용하고 실제 옷장 근거와 별도 `answer_sections`로 구분한다.
4. 모델 답변의 URL·가격·보유 옷 주장을 거절하고 안전한 fallback을 사용한다.
5. 사진별 영구 기록은 Auth·보존·삭제 정책 이후로 보류한다.

#### 품질/CI·운영 설계

- 모바일 의존성을 lockfile로 설치해 typecheck/lint를 통과시키고 CI 단계로 추가했다.
- 비-live eval을 재실행해 11/17 baseline과 동일함을 확인했다.
- health의 optional Git SHA/released_at 계약과 수동 배포 검증 절차를 설계했다.
- LLMOps 계측 코드·pending migration·단위 테스트를 구현했다.
- Supabase Auth 전환/격리/삭제 계획과 순수 정책 회귀를 추가했지만 운영 인증에는 연결하지 않았다.
- 프론트 API 인수인계와 후속 제품 명세를 별도 문서로 작성했다.

Auth/CHAT-02의 local·staging 통합과 PR #25 CI까지 완료했다. 남은 즉시 작업은 #28 CI 확인 후 #25→#28 순차 리뷰/병합, 모바일 access token 전달과 복원/삭제 UI 연동이다. 운영 배포와 DB 변경은 별도 승인 전 진행하지 않는다.

### 7.2 팀 논의 후 개발할 작업

- 코사인 가중치·임계값 확정과 B안 shadow 조건
- 새로운 대체 종류 관계
- 사용자 비교 피드백의 구체적 동의 문구/보존/철회 정책
- 추천 점수: 취향 대 재현 가능성 비율
- 사진 원본 저장과 삭제 정책
- 인증 및 기존 데모 데이터 이전
- 사진 AI 보정·원본 보존 정책
- 데모 계정 이전과 계정 삭제 보존 범위
- 검증된 사이즈 정보 출처

### 7.3 프론트 연동이 필요한 작업

- `match_metadata.reason` 한 줄 표시와 후보 ID 기반 옷장 카드 연결(유사도 숫자 비표시)
- 챗 `answer_sections`를 이용한 옷장 근거/일반 조언 분리
- 비교 결과 피드백과 명시적 학습 동의
- 홈 검색·필터·선택 취향 설명
- 추천 탭과 특정 옷 기반 추천
- 사진 등록의 서버 업로드·계정 동기화·실패 복구(사용자 수정/확정 UI는 main 반영)
- 사진별 챗 기록과 삭제
- Supabase Auth 가입/로그인/탈퇴

### 7.4 기능 간 의존성

```text
공통 enum·옷장 확장(완료)
  └─> 코사인 A안 정리
       ├─> 판정 근거/후보 UI
       ├─> 챗 비교 일관성
       ├─> 비교 피드백 수집
       └─> 옷장 기반 추천

인증·사용자 접근 제어
  ├─> 사진별 챗 기록
  ├─> 계정/데이터 삭제
  └─> 사용자 피드백·사진 안전 저장

단일 사진 옷장 등록 UI·기기 저장(완료)
  ├─> 서버 Storage·계정 동기화
  └─> 여러 사진 batch·부분 실패 복구

LLMOps·최신 eval
  └─> 모델/프롬프트/알고리즘 변경의 출시 판단
```

### 7.5 추천 개발 순서

1. **리뷰:** PR #25 CI/보안 검토 후 병합, 이어서 #28 base를 main으로 바꿔 재검증·병합
2. **프론트 Auth:** access token 전달, 사용자 UUID 기준 요청, 401/403 UX
3. **챗 UI:** 사진 A→B→A 기록 복원, pagination과 삭제, optional 한 줄 근거 표시
4. **측정:** 동의 기반 비교 피드백, 알고리즘 버전, shadow 결과
5. **추천:** 안정된 공통 매칭 모듈로 옷장 기반 추천과 특정 아이템 검색
6. **등록 서버화:** main의 사진 등록 UI를 Storage·계정 동기화에 연결하고, 이후 여러 사진 batch
7. **대화 정책:** 자동 보존 기간·계정 삭제·동의 문구 확정
8. **출시 준비:** Auth/탈퇴, 권리, 사이즈 출처, 실제 기기·E2E·운영 관측

### 7.6 현재 기술 부채와 잠재 위험

- 로컬 `main` 포인터가 37커밋 뒤라 잘못된 분기 위험
- 여러 worktree에 중복·상충하는 schema/API/migration 작업
- 코사인 작업본이 오래된 분기점과 미커밋 상태
- production은 여전히 공개 Edge Function + 요청 `user_id` 신뢰 구조이며, PR #25가 병합·배포되기 전까지 접근 제어 위험이 남는다.
- 단일 함수 배포의 큰 blast radius
- staging API/RLS E2E는 통과했지만 모바일 기기 E2E는 없음
- release metadata는 staging에서 검증했지만 운영에는 미배포이고 release workflow는 수동 승인형임
- live eval과 최신 post-MVP eval 부재
- 수동 색 계열·대체 관계·임계값의 데이터 근거 부족
- 과거 옷장 레코드의 상세 속성 유실은 소급 복원 불가
- 사용자 비교 피드백을 출시하기 전 개인정보·동의·편향·악의적 입력 검토 필요
- 콘텐츠 권리와 계정 삭제가 출시 전 필수지만 코드 작업과 별개로 팀 결정 필요
- 모바일 production 의존성 audit moderate 5건(Expo 전이 glob/minimatch); high/critical 0건. 강제 fix는 Expo major downgrade라 보류

---

## 8. 다음 세션 인수인계 체크리스트

다음 개발 세션은 최소한 아래 순서를 지킨다.

1. `AGENTS.md`와 관련 SPEC AC를 읽는다.
2. `git fetch origin` 후 로컬 이름 `main`이 아니라 `origin/main` SHA를 확인한다.
3. 세 worktree와 stash를 확인하고 기존 미커밋 코사인 작업을 보존한다.
4. 구현 전 `npm run check:harness`를 실행한다.
5. `tests/`와 `tests/harness/`의 승인된 판정 기준은 사람 승인 없이 변경하지 않는다.
6. 코사인 작업은 이미 main에 선택 포팅됐으므로 오래된 브랜치를 통째로 merge하지 않는다.
7. API metadata가 실제 AC9 버킷 안인지 `tests/test_matching_integration.ts` 회귀를 유지한다.
8. 사용자 피드백 migration은 새 번호로 다시 만들고, 동의 정책·프론트 UI 합의 전 운영 적용하지 않는다.
9. 완료 전 서버 `npm run check`, 설치된 Expo 환경의 모바일 typecheck/lint, 관련 API 통합 테스트를 실행한다.
10. 테스트 작성, 실행, 통과, 프론트 연동, main 병합, 운영 배포를 각각 별도로 보고한다.

## 9. 최종 상태 판정

현재 GitHub main에는 **코사인 A안·MATCH-03·CHAT-01/03·LLMOps·local 통합 테스트·local 관리자 대시보드·승인형 release/alert**가 병합돼 있다. Auth는 PR #25, 사진별 영구 대화는 stacked PR #28에 있으며 둘 다 staging에서 실제 API/RLS 검증을 통과했지만 main·production에는 미반영이다. 비교 학습 데이터와 추천 고도화는 아직 구현하지 않았다.

다음 단계는 PR #25→#28 순차 리뷰/병합과 모바일 Auth·대화 복원 UI다. production migration과 Edge Function 배포는 별도 승인을 받아 release exact SHA로 수행한다. CHAT-03 live eval은 `docs/EVAL_CHAT03_PROPOSAL.md`의 v2 계약 승인 뒤 갱신한다. 동의·보존·철회 정책 전에는 비교 피드백을 운영에 통합하지 않으며, B안·새 대체 관계·임계값 변경도 계속 보류한다.
