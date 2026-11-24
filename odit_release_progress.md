# 오딧(FULL-JOIN) 출시 준비 및 전체 작업 현황

> 기준 시각: 2026-11-24 (Asia/Seoul)<br>
> Git 기준: `origin/main@8cb01a5bd376d00fa430a4cb68acea04d4e038ca`<br>
> 목적: 이 문서 하나로 완료 기능, 진행 중 작업, 대기열, 출시 차단 사항과 권장 개발 순서를 파악한다.<br>
> 주의: 운영·staging 상태는 저장소의 마지막 검증 기록을 기준으로 적었다. 이번 조사에서는 원격 DB나 배포 환경을 변경하거나 다시 배포하지 않았다.

## 1. 한눈에 보는 현재 상태

오딧의 기존 MVP 흐름인 **피드 탐색 → 사진 저장 → 내 옷장 비교 → 코디/구매 판단 → 쇼핑 링크 → 챗봇 상담**은 구현돼 있다. 옷 종류 확장, 코사인 A안, 챗봇 grounding과 일반 패션 상담, 사용자 행동 이벤트, LLMOps, 로컬 관리자 대시보드도 코드와 테스트 기준으로 상당 부분 완성됐다.

다만 현재 앱을 불특정 다수에게 정식 출시하기에는 다음 사항이 남아 있다.

1. 정식 로그인 방식, 계정 이전과 계정 삭제 정책이 확정되지 않았다.
2. main의 Auth/RLS 및 사진별 챗 기록 백엔드가 production에 배포되지 않았다.
3. 운영 API는 마지막 확인 기준으로 이전 공개 API이고 `verify_jwt=false`이므로 정식 출시 보안 수준이 아니다.
4. 사진 등록, 추천, 챗 기록, 비교 근거 등 일부 기능은 서버·모바일·운영 중 일부 계층만 연결돼 있다.
5. iOS/Android 스토어 빌드 식별자, `eas.json`, 개인정보 처리방침·이용약관 등 정식 배포 준비물이 저장소에서 확인되지 않는다.
6. 콘텐츠 이용 권리 확인과 실제 기기 종합 QA가 끝나지 않았다.

### 상태 표기

| 표기 | 의미 |
|---|---|
| 완료 | 현재 정의된 범위에서 구현·연동·필요한 배포와 검증까지 끝남 |
| 부분 완료 | 코드, 프론트, 테스트, main, staging, production 중 일부가 남음 |
| 작업 중 | 현재 로컬 변경 또는 열린 PR/활성 브랜치에서 진행 중 |
| 대기 | 선행 작업이나 팀 결정 뒤 진행 예정 |
| 미구현 | 설계 또는 아이디어만 있고 실제 제품 코드 없음 |
| 보류 | 이번 출시 범위에서 의도적으로 제외하거나 정책 확정 전 중단 |

### 출시 준비도 요약

| 영역 | 현재 판단 | 출시 전 핵심 잔여 작업 |
|---|---|---|
| 기존 MVP 핵심 흐름 | 완료 | 최종 회귀·실기기 QA |
| 비교 정확도/코사인 A안 | 부분 완료 | 한 줄 근거 UI는 구현됨; 서버 reason 연결·줄바꿈 개선의 PR/Expo 반영, 운영 표본·shadow 검증 |
| 챗봇 상담 | 부분 완료 | CHAT-02 production 배포, 모바일 기록 복원/삭제, 실제 기기 검증 |
| 옷장 등록 | 부분 완료 | 사진 서버 동기화 범위 결정, 실패 복구, 실제 기기 QA |
| 추천 탭 | 부분 완료 | 후속 계측 branch 정리, Auth 실데이터 E2E, 이유·콜드스타트 조정 |
| 홈 피드 검색·필터 | 작업 중 | 커밋·PR·CI·staging·실기기 QA |
| 인증/접근 제어 | 부분 완료이지만 출시 차단 | 로그인 UX, 운영 배포, gateway·RLS, 계정 삭제 |
| 분석/LLMOps | 부분 완료 | production 표본, 운영 알림, 최소 권한 운영 조회 |
| CI/CD | 부분 완료 | CI는 사용 중, CD는 수동 승인형; 환경 secret/reviewer 운영 확인 |
| 콘텐츠/법무/스토어 | 미완료 | 사진 권리, 개인정보·약관, 스토어 메타데이터와 native build 설정 |

## 2. 기능별 전체 진행 현황

### 2.1 기존 MVP 및 서버 기반

| ID / 기능 | 상태 | 현재 구현 | 연결·배포 상태 | 남은 작업 |
|---|---|---|---|---|
| MVP-01 피드·저장·아카이브 | 완료 | 취향 우선 피드, 하트/취소, 아카이브, 결정적 정렬 | 모바일·서버·기존 production 연결 | 출시 전 회귀·실기기 QA |
| MVP-02 옷장 칩 등록·조회·삭제 | 완료 | 부위·종류·색·종류별 핏, 상세 속성 | production smoke 확인 | 구형 데이터의 유실 상세값은 복구 불가임을 UX에 고지 |
| P0 / MATCH-01 옷 종류 확장 | 완료 | 공통 enum, 종류별 핏, 모자 모양, 버뮤다, nullable fit, 소재·무늬·계절·details | 모바일·서버·DB·production 반영 | 프론트 종류 변경 시 schema/catalog/migration을 함께 변경 |
| MVP-03 사진 저장→비교→코디 | 완료 | 활용/비슷함/구매 버킷, 옷장 후보 ID, 코디 조합 | 기존 규칙 버전 production 사용 가능 | 아래 코사인 A안·근거의 최신 production 반영 |
| MVP-04 상품·쇼핑 링크 | 부분 완료 | 대표 상품/유사 검색 링크, 쇼핑 클릭 이벤트 | 기본 흐름 연결 | 검증된 상품 상세·사이즈표는 미구현, 근거 없는 상품 생성 금지 |
| MVP-05 행동 이벤트 | 완료 | 허용 목록, batch 저장, 실패 시 앱 비차단 | production 반영 | 신규 기능 이벤트 계약을 계속 동기화 |

### 2.2 코디 비교와 코사인 알고리즘

| ID / 기능 | 상태 | 현재 구현 | 테스트 | 남은 작업 |
|---|---|---|---|---|
| MATCH-02 코사인 A안 | 부분 완료 | AC9 규칙 후보 버킷을 유지하고 버킷 안에서만 코사인 정렬 | similarity 19/19, local/staging 후보 ID 통합 통과 | 운영 표본 확인, 실제 데이터 shadow 평가 |
| MATCH-03 후보 ID·한 줄 근거 | UI 구현·배포 완료 | 프론트 자체 문구 대신 검증된 `match_metadata.reason`을 우선 표시하고 여러 줄·자동 카드 높이를 지원 | PR #31 CI, 버킷 누수·후보 정합·설명 회귀, 짧은/긴 한국어·좁은 화면 정적 레이아웃 검사 통과 | 실제 작은 기기에서 최종 시각 QA |
| `대체` 규칙 | 부분 완료 | 승인된 수동 종류 쌍만 허용, 코사인은 tie-breaker로만 사용 | 미승인 데님팬츠↔슬랙스 제외 회귀 통과 | 새 대체 관계는 팀 승인·라벨·회귀 사례 후 추가 |
| 코사인 B안 | 보류 | 운영 판정에는 미적용 | 없음 | 라벨 데이터와 train/validation/test 분리 후 shadow 실험 |
| 비교 피드백 학습 | 보류 | 로컬 설계 흔적만 있으며 운영 endpoint로 사용하지 않음 | 없음 | 명시적 동의 문구·버전·철회·보존·삭제 정책 확정 |

현재 실험값인 종류·색·핏 등 가중치와 `0.90/0.70` 임계값은 제품 정책으로 확정된 값이 아니다. 유사도 숫자는 사용자 UI에 공개하지 않는다.

### 2.3 챗봇

| ID / 기능 | 상태 | 현재 구현 | 연동·배포 | 남은 작업 |
|---|---|---|---|---|
| CHAT-01 의도 분리·grounding | 부분 완료 | 보유 옷 상담과 유사 상품 탐색 구분, 실제 옷장 ID 검증, 비교 로직 재사용 | main 및 마지막 확인 production 기준에 포함 | 실제 기기 회귀와 운영 표본 확인 |
| CHAT-03 일반 패션·복합 상담 | 부분 완료 | 일반/보유 옷/저장 사진/상품 탐색/복합/범위 밖 자동 분류, grounded와 일반 조언 분리 | main 및 마지막 확인 production 기준에 포함, optional 필드를 모바일이 충분히 활용하지 않음 | eval v2 승인, UI 섹션 구분, live eval |
| CHAT-02 사진별 대화 저장 | 부분 완료 | conversation/message DB, pagination, 삭제, 사진 삭제 cascade, A/B 격리 | 백엔드 main·staging, production 미배포 | 모바일 복원·삭제 연동, 보존 정책, production 배포 |
| CHAT-02 모바일 연결 | 작업 중/결정 대기 | token provider, 사진별 복원·pagination·삭제 UI가 PR #30에 구현 | draft PR #30, CI 2개 모두 성공 | 인증 공급자·데모 이전 결정, staging 모바일 JWT E2E 후 병합 |
| 일반 상품·사이즈 상담 | 미구현 | 일반 패션 조언만 가능 | 없음 | 실제 상품명·가격·사이즈·링크의 검증 가능한 데이터 소스 필요 |

챗봇은 현재 코드상 없는 옷을 사용자 소유라고 말하지 않도록 방어한다. 그러나 production과 모바일이 최신 계약을 모두 사용하지 않으므로 사용자에게 보이는 최종 경험은 아직 완성 상태가 아니다.

### 2.4 옷장 등록과 사진

| ID / 기능 | 상태 | 현재 구현 | 연동·배포 | 남은 작업 |
|---|---|---|---|---|
| WARD-01 칩 기반 등록 | 완료 | 사진 없이 4단계 이내 선택, nullable fit 지원 | production 반영 | 온보딩 전환율 관측 |
| WARD-01 사진 기반 단일 등록 | 부분 완료 | 촬영/앨범→영역 자르기→칩 수정→등록, 로컬 사진/그림 전환 | PR #27로 main 반영, Expo production 반영 기록 있음 | iOS/Android 실기기 E2E, 서버 저장 범위 확정 |
| 사진 서버 Storage·계정 동기화 | 대기 | 과거 PR #24에 시도가 있으나 해당 PR은 닫혔고 통째로 재사용하면 안 됨 | production 미반영 | Auth·원본 보존/삭제 정책 후 필요한 부분만 최신 main에 재구현 |
| 서버 누끼·AI 태깅 | 미구현/정책 대기 | 모바일 로컬 흐름 중심 | 없음 | 처리 방식, 비용, 실패 UX, LLMOps 연결 결정 |
| WARD-02 여러 사진 batch | 미구현 | 한 사진의 여러 영역은 각각 확인 가능 | 없음 | 여러 사진 큐, 부분 실패 재시도, 중복 방지 |
| 샘플 옷장 | 미구현 | 없음 | 없음 | 실제 사용자 통계와 분리되는 fixture 정책 필요 |
| AI 구김 제거·형태 보정 | 보류 | 없음 | 없음 | 원본 보존·삭제·고지·왜곡 평가 정책 확정 |

### 2.5 추천과 홈 탐색

| ID / 기능 | 상태 | 현재 구현 | 연동·배포 | 남은 작업 |
|---|---|---|---|---|
| 추천 탭 기본 기능 | 부분 완료 | 날씨·취향·저장 사진·옷장 기반 추천, 특정 옷 조합 화면 | PR #23가 main 및 마지막 확인 production 기준에 포함 | Auth 실사용자 데이터 E2E, 빈 상태·이유·콜드스타트 보정 |
| KMA 날씨 연동 | 부분 완료 | 기상청 단기·중기 키와 서버 연동 경로 구현 | production에 키 설정 및 추천 릴리스 수행 기록 | 장애·캐시·지역 권한 실기기 검증, 키 회전 절차 |
| 추천 계측·회귀 | 작업 중/대기열 | 추천 노출·선택 이벤트, 집계, 결정적 추천 core와 테스트 | `codex/recommendation-observability@8342667`, staging 검증, PR 없음 | 최신 main rebase/cherry-pick 검토 후 독립 PR |
| 특정 보유 아이템 기반 추천 | 부분 완료 | 조합 화면과 추천 기반은 존재 | 전체 사용자 흐름 검증 부족 | 실제 보유 ID 강제, 후보 이유, 페이지네이션 |
| FEED-01 홈 피드 검색·필터 | 작업 중 | 스타일·종류·색 검색, 조합 필터, 0건·초기화 UI, feed item 요약 | 현재 worktree 미커밋·미푸시·미배포 | 실기기 QA→커밋→PR→CI→staging |
| 선택한 추구미 설명 | 대기 | 없음 | 없음 | 검색·추천 결과에서 선택 이유를 어떻게 보여줄지 UX 합의 |

### 2.6 UX와 동료평가 후속

| ID / 기능 | 상태 | 완료된 부분 | 남은 작업 |
|---|---|---|---|
| UX-01 온보딩·빈 상태·저장 안내 | 완료에 가까운 부분 완료 | 3개 추구미 교체 안내, 저장 위치, 빈 상태 | 실제 사용자 퍼널과 실기기 수용 테스트 |
| UX-02 로딩·삭제·오류·키보드 | 완료에 가까운 부분 완료 | 로딩 상태, 삭제 확인, 한국어 오류, 키보드 개선 | iOS/Android 키보드·딥링크·저속 네트워크 회귀 |
| 비교 한 줄 근거 UI | 구현·배포 완료 | `match_metadata.reason` 우선 사용·후보 ID 검증·자연스러운 줄바꿈·자동 높이를 production Expo에 반영 | 실제 작은 기기 시각 QA; 유사도 점수는 계속 숨김 |
| 챗 답변 출처 UI | 대기 | API에 `answer_sections`, `answer_source`, `intents` 존재 | `내 옷장 기준`과 `일반 패션 조언`을 시각적으로 구분 |
| 401/403/세션 만료 UX | 대기 | 백엔드 오류 계약과 token provider 준비 | 로그인 정책 확정 후 재로그인·복구 흐름 구현 |

### 2.7 운영, 분석과 품질

| ID / 기능 | 상태 | 현재 구현 | 남은 작업 |
|---|---|---|---|
| OPS-01 CI | 완료 | PR/main에서 서버 전체 check, 모바일 typecheck/lint, local Supabase 통합 실행; 중복 실행 방지 | 장시간 캐시·flaky 추적 정도만 운영 보완 |
| 승인형 CD | 부분 완료 | exact SHA, GitHub Environment 승인, migration dry-run, Supabase/Expo 선택 배포 workflow | 환경 reviewer/secret 운영 확인, 실제 release rehearsal, 자동 rollback 없음 |
| staging | 완료에 가까움 | production과 분리된 Free 프로젝트, 17 migrations, Auth/RLS·챗·추천 synthetic E2E | 일시정지 관리, 최신 기능별 재배포·회귀 |
| LLMOps 계측 | 부분 완료 | 호출·성공/실패·토큰·비용·평균/p95·fallback·grounded 비율 | production 최신 API/표본, 보존 기간, 실제 알림 운영 |
| 관리자 대시보드 | 부분 완료 | localhost 전용 Product Analytics/LLMOps, KST 기간 조회 | 원격 공개 금지 유지, 최소 권한 read-only proxy와 관리자 인증 |
| Evals | 부분 완료 | 11/17 baseline: tagging 84/93, format 12/12, gap 11/11 | live 12건, CHAT-03 v2 계약 승인, post-MVP 실제 데이터셋 |
| 장애/보안 모니터링 | 부분 완료 | LLMOps alert 코드와 선택적 webhook | crash reporting, API rate limit, 반복 실패 탐지, 운영 경보 수신자 |

## 3. 실제 작업 중인 브랜치·PR·로컬 작업

### 3.1 비교 판정 근거 개선 worktree

- 브랜치: `codex/match-reason-wrap`
- 기준: `origin/main@8cb01a5`
- 상태: PR #31로 main 병합 및 Expo production 배포 완료. deployment `7m12h5ntly`, `https://odit.expo.app` HTTP 200을 확인했다.
- 서버·DB 변경: 없음. 실제 작은 기기 시각 QA만 남았다.

### 3.2 보존 중인 홈 피드 worktree

- 브랜치: `codex/home-feed-search-filter`
- 기준: `origin/main@0cb9263`
- 상태: 홈 피드 검색·필터 관련 코드·테스트·문서가 **미커밋** 상태다.
- 검증: 전체 `npm run check`, 모바일 typecheck/lint, Expo web export, local Supabase 17 migration+API 통합을 통과했다.
- 테스트 fixture와 synthetic 사용자는 정리됐고 Docker/Supabase는 종료했다.
- 다음 행동: 실제 기기 UI QA 후 기능 파일만 커밋하고 PR을 만든다.
- 사용자 파일 `presentation/AI캡스톤디자인-중간평가.pdf`는 untracked이며 작업 커밋에서 제외해야 한다.

### 3.3 열린 PR

| PR | 상태 | 내용 | CI | 대기 사유 |
|---|---|---|---|---|
| #30 `codex/mobile-auth-chat-history` | Draft, mergeable | 모바일 token provider, 사진별 챗 복원·pagination·삭제 | `check`, `local-supabase-integration` 성공 | 인증 공급자와 데모 데이터 이전 정책 미확정, staging 모바일 JWT E2E 필요 |

### 3.4 PR 없이 남은 활성 기능 브랜치

| 브랜치 | 판단 | 처리 원칙 |
|---|---|---|
| `codex/recommendation-observability@8342667` | 추천 계측·회귀 후속 작업. staging 검증 기록은 있으나 main 미병합 | 최신 main 기준 diff 재검토 후 독립 PR |
| `codex/home-feed-search-filter` | 현재 작업 중 | 실기기 QA 후 독립 PR |

### 3.5 그대로 병합하면 안 되는 오래된 작업

| 브랜치/worktree | 이유 | 처리 |
|---|---|---|
| `codex/cosine-outfit-matching@e480337` | 오래된 schema/API/migration과 미커밋 실험이 섞임; 필요한 코사인 A안은 이미 main에 선택 포팅됨 | 백업 유지, 새 기능 근거가 있을 때 파일 단위 검토만 수행 |
| `codex/auth-photo-integration@99b6f12` / 닫힌 PR #24 | Auth, 사진 서버화, 대규모 모바일 변경이 혼재; Auth는 #25, 사진 UI는 #27로 분리돼 대체됨 | 통째 merge 금지, 서버 사진 계약이 확정되면 필요한 부분만 재검토 |
| `codex/wardrobe-db-expansion@2c95179` | 오래된 enum/API/user_events와 별도 analytics가 현재 main과 충돌 | 현재 main 구현과 중복 확인 후 보관 또는 archive |
| `jeong35-patch-1` | PR #12에서 main과 내용 동일해 닫힘 | 재병합 불필요 |

로컬 `main` 포인터는 `fa2129a`로 `origin/main`보다 **85커밋 뒤**다. 새 작업은 로컬 `main`에서 시작하지 말고 최신 `origin/main`을 확인해 분기해야 한다. 기존 stash 3개와 다른 worktree의 미커밋 작업은 작성자 확인 없이 삭제하지 않는다.

## 4. 출시 전 필수 작업(P0)

아래는 기능 추가 여부와 관계없이 정식 외부 출시 전에 처리해야 하는 항목이다.

### P0-1. 인증·사용자 격리·계정 생명주기

- [ ] Supabase Auth 또는 외부 포털 연동 구조를 확정한다. 외부 포털을 쓰더라도 서버가 검증 가능한 identity를 Supabase JWT/RLS와 매핑해야 한다.
- [ ] 로그인 UI, 로그아웃, 세션 갱신, 만료·변조 토큰, 401/403 복구 UX를 구현한다.
- [ ] 요청 body/query의 `user_id`를 신뢰하지 않고 검증된 JWT subject를 정본으로 사용한다.
- [ ] 사용자 함수와 공개/관리 함수를 분리하고 사용자 경로의 gateway JWT 검증 전환을 검토한다.
- [ ] wardrobe, archive, events, chat, Storage의 A/B 격리를 staging과 production 배포 후보 SHA에서 재검증한다.
- [ ] 데모 닉네임+PIN 데이터를 이전할지, 새 계정을 빈 상태로 시작할지 결정한다.
- [ ] 계정 삭제 job을 구현한다. DB cascade만으로는 Storage 파일이 삭제되지 않는다.
- [ ] 이벤트·챗·사진·운영 지표의 보존/익명화 기간과 삭제 범위를 확정한다.
- [ ] rate limit, 요청 크기 제한, admin secret rotation과 감사 로그를 추가한다.

### P0-2. main과 production 정합화

- [ ] 병합할 홈 검색, 추천 계측, PR #30의 범위를 먼저 확정한다.
- [ ] production pending migration `202611230001_auth_access_control.sql`, `202611230003_chat_conversations.sql`을 리뷰한다.
- [ ] 승인된 정확한 main SHA로 migration dry-run을 수행한다.
- [ ] Edge Function, 필요한 migration, Expo를 승인형 workflow로 순서대로 배포한다.
- [ ] `/health.release.git_sha`와 배포 SHA 일치를 확인한다.
- [ ] production에서 실제 사용자 데이터 대신 승인된 smoke fixture로 health, 로그인, 옷장, 저장→비교, 챗, events를 검증한다.
- [ ] 실패 시 이전 승인 SHA 재배포와 DB forward-fix 절차를 준비한다. 자동 rollback은 현재 없다.

### P0-3. 개인정보·콘텐츠·정책

- [ ] 개인정보 처리방침과 이용약관의 실제 문서를 작성하고 앱에서 접근 가능하게 한다. 디자인 문구만 있고 정식 문서는 확인되지 않는다.
- [ ] 수집 데이터, 목적, 보존 기간, 제3자/AI 처리, 철회·삭제, 문의 창구를 명시한다.
- [ ] 출시 피드 사진은 이용 허락을 받은 사진 또는 직접 제작 콘텐츠만 선별한다.
- [ ] 출처 표기와 이용 허락을 혼동하지 않고 permission metadata와 검수 기록을 남긴다.
- [ ] 원본 사진, 잘라낸 사진, 누끼 결과의 저장·삭제 정책을 확정한다.
- [ ] 비교 피드백을 학습 데이터로 쓸 경우 별도의 명시적 동의와 철회 정책을 제공한다.

### P0-4. 네이티브 앱 배포 준비

현재 `mobile/app.json`에는 EAS project ID는 있지만 앱 이름/slug가 `mobile`이고 iOS `bundleIdentifier`, Android `package`와 `mobile/eas.json`이 확인되지 않는다. iOS/Android 스토어 출시가 목표라면 다음이 필요하다.

- [ ] 서비스명·slug·버전·build number/versionCode 정책을 확정한다.
- [ ] iOS bundle ID, Android application ID와 서명 자격 증명을 설정한다.
- [ ] development/preview/production build profile을 `eas.json`에 분리한다.
- [ ] 앱 아이콘·스플래시·카메라/사진 권한 문구를 실제 기기에서 검수한다.
- [ ] App Store Connect/Play Console 앱, 심사 정보, 스크린샷, 설명, 지원 URL, 개인정보 URL을 준비한다.
- [ ] 내부 테스트 배포 후 iOS/Android 설치·업데이트·딥링크·권한 거부·오프라인/저속망을 검증한다.
- [ ] production API URL과 secret이 빌드 산출물에 안전하게 주입되는지 확인한다. service-role/admin token은 앱에 포함하면 안 된다.

### P0-5. 최종 QA와 출시 판정

- [ ] 실제 기기에서 신규 가입→옷 5벌 등록→사진 저장→비교→추천→챗→삭제까지 종단 E2E를 수행한다.
- [ ] 사진 A→B→A 전환 시 챗 기록 복원과 늦은 응답 격리를 검증한다.
- [ ] 타 사용자 wardrobe/archive/chat/Storage 접근이 모두 거부되는지 확인한다.
- [ ] 카메라·앨범·크롭·사진 삭제와 앱 재설치 후 상태를 확인한다.
- [ ] KMA 장애, OpenAI timeout, DB/API 오류에서 fallback과 사용자 안내를 확인한다.
- [ ] 승인 골든 47/47, 전체 서버 check, 모바일 typecheck/lint, local 통합, staging 통합을 최종 SHA에서 다시 실행한다.
- [ ] crash/error 관측과 LLMOps alert 수신자를 정하고 출시 당일 모니터링·롤백 담당자를 배정한다.

## 5. 출시 범위에 따라 결정할 작업(P1)

다음 기능은 기본 MVP를 막지는 않지만 현재 앱에서 이미 노출되거나 약속한 경험이라면 출시 전에 완성하는 편이 안전하다.

| 우선순위 | 작업 | 선행 조건 | 완료 기준 |
|---|---|---|---|
| P1-1 | 홈 피드 검색·필터 마무리 | 현재 로컬 구현 | 실기기 QA, PR CI, staging, 이벤트 확인 |
| P1-2 | 추천 계측 branch 병합 | 최신 main diff 검토 | 독립 PR, 추천 회귀, staging 이벤트·대시보드 확인 |
| P1-3 | 비교 한 줄 근거 UI 개선 반영 | **완료**: PR #31·Expo production 반영 | 작은 기기 시각 QA; 유사도 숫자 미노출 유지 |
| P1-4 | 챗 출처/복합 답변 UI | CHAT-03 계약 | 보유 옷과 일반 조언을 명확히 분리 |
| P1-5 | PR #30 모바일 챗 기록 | Auth 정책 | A→B→A 복원, pagination, 삭제, 401/403 UX |
| P1-6 | 사진 등록 안정화 | 원본/삭제 범위 | iOS/Android E2E, 실패 복구, 중복 등록 방지 |
| P1-7 | 추천 품질 조정 | Auth 실데이터 | 이유·빈 상태·콜드스타트·특정 아이템 후보 검증 |
| P1-8 | 운영 LLMOps | 최신 production 배포 | 실제 표본, 비용·실패·p95·fallback 알림 확인 |

## 6. 팀 결정 후 진행할 작업(P2)

| 작업 | 현재 상태 | 필요한 결정 |
|---|---|---|
| 코사인 B안 shadow 실험 | 보류 | 후보 확장 범위, 평가 데이터와 성공 기준 |
| 새 대체 의류 관계 | 보류 | 승인 종류 쌍과 회귀 사례; 데님팬츠↔슬랙스는 현재 미승인 |
| 가중치·임계값 확정 | 실험값 | 사용자 라벨·offline 평가·shadow 결과 |
| 비교 피드백 수집 | 보류 | 동의 문구·버전·철회·보존·삭제 |
| 사진 서버 저장·AI 태깅 | 대기 | 원본/결과 저장 범위, 비용, 실패 UX |
| AI 구김 제거·형태 보정 | 미구현 | 원본 보존, 고지, 왜곡 허용 기준 |
| 여러 사진 일괄 등록 | 미구현 | 부분 실패·재시도·중복 정책 |
| 검증된 상품 사이즈 | 미구현 | 공식 데이터 출처, 최신성, 책임 범위 |
| 홈 피드 검색 고도화 | 1차 작업 중 | 동의어·오타·서버 검색/페이지네이션 필요성 |
| 사진별 챗 자동 보존 기간 | 미확정 | 기본 기간, 사용자 삭제, 계정 삭제 연계 |

## 7. 장기 백로그(P3, 이번 출시 후)

- 상품 RAG/벡터 검색과 검증된 상품 카탈로그
- 체형·사이즈 개인화 및 주문 캡처 연동
- 추천 모델 학습과 온라인 실험 플랫폼
- 원격 관리자 대시보드 공개: 최소 권한 집계 API와 관리자 SSO가 선행돼야 함
- 이미지 보정 API의 품질·비용 자동 평가
- 추천·비교 피드백의 편향/악의적 입력 방어
- 앱 내 고급 검색, 서버 페이지네이션, 저장 컬렉션 관리

장기 항목은 별도 SPEC, 개인정보 검토와 승인 테스트 없이 운영 코드에 바로 추가하지 않는다.

## 8. 확정된 제품 방향과 미확정 정책

### 확정

- 코사인 A안을 먼저 안정화하고 B안은 별도 실험한다.
- 유사도 점수는 사용자에게 공개하지 않고 한 줄 판정 근거만 보여 준다.
- 사용자 비교 피드백은 명시적 동의 기반으로 수집한다.
- 홈은 취향 탐색, 추천 탭은 사용자 옷장 활용 중심으로 구성한다.
- 특정 보유 의류 기반 추천을 제공한다.
- 챗봇은 유형 선택 없이 의도를 자동 분류하고 일반 패션 상담을 허용한다.
- 실제 보유 의류와 일반 조언을 답변에서 구분한다.
- 사진별 챗 기록의 저장·삭제를 지원한다.
- 출시 인증은 Supabase Auth를 우선 검토하되 외부 포털 identity 연동 가능성을 열어 둔다.
- 콘텐츠는 허락받은 사진 또는 직접 제작한 콘텐츠만 사용한다.

### 미확정

- 외부 포털과 Supabase Auth를 연결하는 최종 로그인 방식
- 데모 계정 데이터 이전 여부와 종료일
- 계정 삭제 유예·복구와 이벤트/챗/사진 보존 기간
- 비교 피드백의 동의 문구·철회·보존 정책
- 새 대체 종류 관계
- 사진 원본 보존·삭제와 AI 보정 방식
- 검증된 상품 상세·사이즈 데이터 출처
- 코사인 가중치·임계값과 B안 성공 기준

## 9. 의존성 및 권장 실행 순서

```text
홈 검색 현재 작업
  → 실기기 QA → 커밋/PR → CI → staging

인증 방식·데모 이전 결정
  → PR #30 마무리
  → 모바일 로그인/세션 UX
  → Auth/RLS/CHAT-02 production 배포
  → 계정·Storage·챗 삭제

코사인 A안 운영 표본·shadow 검증
  → 한 줄 근거 UI
  → 동의 기반 비교 피드백
  → B안 shadow 실험

사진 등록 UI
  → 원본/삭제 정책
  → 서버 Storage·계정 동기화
  → AI 태깅/누끼
  → 여러 사진 batch

추천 기본 기능
  → 추천 계측 PR
  → Auth 실데이터 E2E
  → 특정 아이템 이유·콜드스타트 조정

정책·콘텐츠·스토어 준비
  + 최종 main/staging 회귀
  → 승인형 production release
  → 내부/제한 공개 → 모니터링 → 정식 출시
```

### 바로 다음 권장 대기열

1. 현재 홈 피드 검색·필터를 실제 기기에서 확인하고 독립 PR로 만든다.
2. `codex/recommendation-observability`를 최신 main 기준으로 재검토해 별도 PR로 만든다.
3. 팀이 로그인 공급자, 데모 이전, 계정 삭제·보존 정책을 결정한다.
4. 결정 후 PR #30을 staging 모바일 JWT E2E까지 마치고 병합한다.
5. 비교 한 줄 근거와 챗 답변 출처 UI를 프론트 담당자와 연결한다.
6. 출시 후보 SHA에서 production migration/API/Expo 배포 rehearsal을 staging에서 수행한다.
7. 개인정보·약관·콘텐츠 권리·스토어 메타데이터와 native build 설정을 완료한다.
8. 실제 기기 종단 QA 후 승인형 production release를 실행한다.

## 10. Git·배포·테스트 기준 상태

### Git

- 최신 원격 main: `8cb01a5bd376d00fa430a4cb68acea04d4e038ca`
- 열린 PR: #30 한 건, draft이며 CI 성공; #31은 CI 성공 후 main 병합 완료
- 현재 로컬 기능: 홈 피드 검색·필터 미커밋 worktree
- 원격 후속 기능: 추천 계측 branch 미병합
- 로컬 `main`: 원격보다 85커밋 뒤, 신규 분기 기준으로 사용 금지
- stash: 3개, 임의 삭제 금지

### 마지막 문서화된 배포

| 환경 | 코드 | DB | 판단 |
|---|---|---|---|
| production | Edge Function `2d0369b`; Expo web `8cb01a5`, deployment `7m12h5ntly` | `202611200003`까지 15개 | MATCH-03 줄바꿈·서버 reason과 사진 등록 UI는 Expo 반영; Auth·CHAT-02 backend는 production 미반영 |
| staging | 추천 계측 `67b922b` API 배포 기록 | Auth·CHAT-02 포함 17개 | synthetic A/B, 401/403·RLS·챗·추천 이벤트 검증 |
| local | 현재 worktree 코드 | 17개 migration+synthetic seed | 홈 검색 포함 전체 통합 통과 후 종료 |

배포 상태는 “GitHub main에 병합됨”과 동일하지 않다. release workflow는 수동 `workflow_dispatch`이고, exact SHA 입력과 GitHub Environment 승인이 있어야 한다. main merge만으로 production 배포는 발생하지 않는다.

### 최근 검증 증거

- 승인 골든: 47/47 통과, 수정하지 않음
- 서버 계약: 3/3 통과
- 코사인/통합: 19/19 통과
- CHAT-03: 5/5 통과
- LLMOps: 6/6, alert 3/3 통과
- Auth policy 4/4, API Auth 4/4 통과
- CHAT-02 기록 2/2 통과
- 홈 검색·필터 3/3 통과
- 모바일 TypeScript와 Expo lint 통과
- local Supabase 17 migrations, feed/옷장/비교/챗/events/LLMOps/Auth-RLS 통합 통과
- staging synthetic A/B 격리와 채팅 저장·삭제 통과
- 유료 live LLM eval 12건은 미실행

## 11. 출시 완료의 정의

다음 조건을 모두 만족할 때 정식 출시 준비 완료로 판단한다.

- 출시 후보가 최신 main의 단일 exact SHA로 식별된다.
- CI, local 통합, staging 통합, iOS/Android 실제 기기 E2E가 같은 후보 코드에서 통과한다.
- 정식 인증, A/B 사용자 격리, 계정·Storage·챗 삭제가 검증된다.
- production DB/API/Expo가 같은 승인 SHA와 호환되고 health metadata로 추적된다.
- 개인정보 처리방침·이용약관·콘텐츠 이용 권리·문의/삭제 절차가 준비된다.
- 앱 스토어 식별자·서명·빌드 profile·심사 메타데이터가 완성된다.
- 출시 기능의 빈 상태·오류·오프라인·외부 API 장애 fallback을 실제 기기에서 확인한다.
- 운영 담당자, alert, 비용 한도, 장애 대응과 rollback 절차가 정해져 있다.
- 미확정 실험값과 보류 기능은 사용자에게 확정 기능처럼 노출되지 않는다.

---

## 참고 문서

- `AGENTS.md` — 작업 불변 규칙과 완료 조건
- `docs/SPEC.md` — 제품·AC 정본
- `docs/ontology.yaml` — 도메인 구조
- `docs/API_MVP.md` — API 계약
- `docs/SECURITY_ACCESS_CONTROL.md` — 출시 전 접근 제어 필수 보완
- `docs/AUTH_MIGRATION_PLAN.md` — Auth 전환·데이터 이전·삭제 계획
- `docs/APPROVED_RELEASE.md` — 승인형 배포
- `docs/STAGING_ENVIRONMENT.md` — 격리 staging 상태
- `docs/LLMOPS_OBSERVABILITY.md` — 운영 계측
- `docs/NEXT_PRODUCT_SPECS.md` — 후속 기능의 경계
- `odit_development_report.md` — 상세 개발·테스트·배포 변경 이력
