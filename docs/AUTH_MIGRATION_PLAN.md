# Supabase Auth 전환 및 사용자 격리 계획

> 2026-11-24 팀 결정: 출시 인증은 Supabase Auth 단독으로 하고 Kakao·Google 로그인을 지원한다. 외부 포털 인증은 제외한다. 이메일 로그인 포함 여부, 데모 계정 이전, 계정 삭제 유예·보존 기간은 별도 확정이 필요하다.

## 현재 상태와 위험

운영 API는 아직 이전 공개 버전이다. 개발 브랜치에서는 함수 내부 JWT 검증, subject 기반 요청 검증과 owner RLS를 구현해 로컬 A/B 격리를 통과했다. 정식 로그인 UI와 운영 배포는 별도 승인 대상이다.

## 목표 식별 흐름

1. 모바일이 Supabase Auth로 로그인하고 access token을 `Authorization: Bearer <JWT>`로 보낸다.
2. 현재 전환 단계에서는 함수가 `supabase.auth.getUser(token)`으로 검증한다. 공개/관리 함수를 분리한 뒤 사용자 함수 gateway도 `verify_jwt=true`로 전환한다.
3. 서버는 검증된 사용자 ID를 정본으로 사용한다.
4. body/query의 `user_id`는 제거한다. 전환 기간에 남겨 둘 경우 JWT 사용자와 다르면 `403 user_id_mismatch`로 거절한다.
5. 사용자 데이터는 `auth.uid() = user_id` RLS를 적용한다. service role은 관리 작업과 서버 전용 원자적 RPC로 제한한다.

`verify_jwt=true` 전환과 기존 데모 사용자 이전은 동시에 운영 영향이 있으므로 별도 승인·staging 검증 후 실행한다.

현재 draft PR #30에는 access token provider, Bearer 전달, 세션 만료 처리, 사진별 챗 복원·pagination·삭제와 함께 팀원이 추가한 이메일·Kakao·Google 로그인 UI/PKCE callback 구현이 있다. 이 코드는 production 설정이 아니며, 최신 main과의 문서 충돌 해결, OAuth provider/redirect 설정, staging 실기기 JWT E2E를 마친 뒤 병합한다.

## 리소스별 권한

| 리소스 | 읽기/쓰기 원칙 | 삭제 |
|---|---|---|
| `wardrobe_items` | 본인 `user_id`만 CRUD | 본인 행만 삭제 |
| `style_preferences` | 본인 행만 조회·교체 | 계정 삭제 시 제거 |
| `hearts`/아카이브 | 본인 저장 관계만 CRUD, 공개된 사진 metadata만 조인 | 하트 취소 또는 계정 삭제 |
| `user_events` | 서버가 JWT 사용자 ID를 주입, 익명 이벤트 정책은 별도 결정 | 보존 정책에 따라 익명화/삭제 |
| 향후 챗 기록 | 본인 + 해당 사진 conversation만 CRUD | conversation 단위 및 계정 전체 삭제 |
| 향후 옷장 사진 | 사용자별 prefix 또는 bucket 정책 | DB 삭제와 Storage object 삭제를 함께 수행 |
| 관리용 분석·게시 | 일반 사용자 접근 금지, 별도 admin 경계 | 운영자 승인 절차 |
| `llm_operation_metrics` | 원문 사용자 ID 없이 service role만 insert/select | 운영 보존 기간에 따라 일괄 삭제 |

## 격리 테스트 계획

현재 데모 구조에서는 아래 테스트가 통과한다고 주장할 수 없다. Auth staging에서 다음을 자동화해야 한다.

1. 인증 없음 → `401`
2. 만료·변조 JWT → `401`
3. A JWT + B `user_id` → `403`
4. A JWT로 B의 wardrobe ID 조회/삭제 → `404` 또는 `403`
5. A JWT로 B의 heart/archive/chat history 접근 → `404` 또는 `403`
6. anon/authenticated role로 `llm_operation_metrics` 직접 조회/삽입 → 거절
7. 일반 사용자의 analyze/review/publish 호출 → `401` 또는 `403`
8. service-role key와 admin token이 앱 bundle·응답·로그에 없음
9. 계정 삭제 후 DB 행과 Storage object에 접근할 수 없음

테스트 fixture는 A/B 각각 별도 Auth 사용자를 만들고, 종료 시 해당 staging 사용자와 데이터만 정리한다. 운영 DB를 테스트 대상으로 사용하지 않는다.

## 데모 계정 이전 선택지 — 미확정

### A. 사용자 확인 후 연결

- 신규 Auth 계정 로그인 후 기존 데모 닉네임/PIN을 한 번 확인한다.
- 서버가 소유권 확인이 성공한 데모 user ID의 데이터를 Auth UUID로 원자적으로 이전한다.
- 이전 토큰은 한 번만 사용하고 감사 기록을 남긴다.

### B. 데모 데이터 미이전

- 정식 계정은 빈 상태로 시작한다.
- 기존 데이터는 고지된 기간 후 삭제한다.

닉네임/PIN만으로 강한 소유권을 증명하기 어려우므로 어느 방식을 선택할지 팀 합의가 필요하다. 자동 이전이나 임의 삭제는 하지 않는다.

## 계정 삭제 순서

1. 재인증 또는 최근 인증 여부 확인
2. 삭제 대상 DB 행과 Storage key 목록을 서버에서 확정
3. 옷장, 취향, 하트, 이벤트/챗 정책 대상 행 삭제
4. 사용자 Storage object 삭제
5. Auth user 삭제
6. 실패 단계와 재시도 가능한 deletion job ID만 기록하고 원문 데이터는 로그에 남기지 않음

FK `on delete cascade`만으로 Storage 파일은 지워지지 않으므로 privileged deletion job이 필요하다. 이벤트·운영 지표의 보존/익명화 기간과 법적 요구는 제품 정책으로 확정해야 한다.

## 아직 결정할 사항

- 이메일 로그인을 Private Beta에 함께 제공할지 여부와 메일 확인/SMTP 정책
- Kakao·Google provider key, redirect URI, 앱 scheme과 취소·복귀 UX의 실제 기기 검증
- 데모 데이터 이전 방식과 이전 종료일
- 익명 행동 이벤트의 허용 범위
- 계정 삭제 유예·복구 기간
- 사진 원본과 챗 기록의 보존 기간
- 세션 만료와 재인증 기준
