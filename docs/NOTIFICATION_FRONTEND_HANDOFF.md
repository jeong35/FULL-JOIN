# 코디 알림 프론트 연동

> 현재 사용자 인증·배포 기준은 `PRIVATE_BETA_POLICY.md`를 따른다.

상태: 백엔드·클라이언트 adapter, PR #38 프론트 UI 연동 및 운영 배포 완료. 실기기 수신 검증 필요.

## 회의 확정 동작

- 코디 선택은 알림 동의 여부와 독립적으로 저장한다.
- 사용자가 동의하면 다음 날 같은 현지 시각부터 매일 반복한다.
- 서버 예약 성공을 확인한 후에만 완료 안내를 표시한다.
- 마이 탭에서 토글로 끄거나 시간을 재설정한다.
- 권한 거절·미지원·네트워크 실패는 성공으로 표시하지 않는다.

## 담당 범위

팝업, 마이 탭 카드, 토글, 시간 선택 UI는 PR #38에서 프론트 담당자가 구현했고 아래 adapter를 호출한다. 이후 시각 조정은 해당 UI 컴포넌트를 기준으로 진행한다.

## 모듈

- `recommendChoices.ts`: `saveRecommendationChoice(userId, choice)`, `useRecommendationChoices(userId)`로 계정·날짜별 선택 저장/조회.
- `webNotifications.ts`: `scheduleRecommendationNotification(userId, lookId, time)` 호출. `time`은 오늘의 선택 시각을 담은 Date이며 다음 날 그 시각부터 반복한다. 결과 `ok=true`일 때만 완료 처리한다.
- `notificationSettings.ts`: `useNotificationSettings(userId)`로 enabled/hour/minute/reservation 조회. 예약 성공 시 자동 저장한다.
- 끄기: settings.reservation으로 `cancelRecommendationNotification`을 호출하고 true일 때 `saveNotificationSettings(userId, {...settings, enabled:false})`로 반영한다. 실패하면 켜진 상태를 유지하고 재시도를 안내한다.
- 시간 변경: 새 시각으로 schedule 함수를 호출한다. 서버 트랜잭션에서 이전 pending/sending 예약을 대체한다. 응답 유실 복구와 상태 재조회는 추가 검증 중이다.
- `protectNotificationAccount`는 루트의 계정 변경 시 실행한다. 구독 해제 실패 복구 검증이 남아 있다.

알림 권한 요청은 사용자 동의 버튼 안에서만 호출한다. 브라우저 구독 키·access token은 화면이나 분석 이벤트에 넣지 않는다. iOS 웹은 지원 버전의 홈 화면 웹 앱에서 검증해야 한다.

## 프론트 연동 후 남은 검증

반복 발송·시간대 변경·중복 요청·취소 경쟁·응답 유실·로그아웃 후 구독 해제 실패·실제 기기 수신 및 클릭은 지원 브라우저와 iOS 홈 화면 웹 앱에서 실기기 검증이 남아 있다.

운영 기반과 연결 UI는 migration `202611250001`, Edge Function `notifications` version 1, Expo deployment `18rrpxhfbp`에 반영됐다. 기존 `api` 함수와 보류 중인 Auth/RLS migration은 이번 배포에 포함하지 않았다.
