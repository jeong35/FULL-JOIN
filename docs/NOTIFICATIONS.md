# 추천 코디 매일 알림

> Private Beta 계정 전환·사용자 격리는 `PRIVATE_BETA_POLICY.md`를 따른다. 기존 알림 소유권·취소 계약은 유지한다.

2026-11-25 회의 반영: 코디 선택 뒤 동의하면 다음 날 같은 현지 시각부터 매일 알림을 예약한다. 마이 탭의 코디 알림에서 토글로 해제하고 오전/오후·시·분을 지정한 뒤 시간 저장으로 변경한다. 서버는 예약 교체를 트랜잭션과 사용자별 잠금으로 처리하고, 발송 이후 같은 시간대의 다음 날짜로 예약을 넘긴다. 취소된 발송은 다음 날 예약으로 되살리지 않는다.

아래 초기 일회성 설계 설명은 이 반복 예약 규칙으로 대체한다.

> 2026-11-25 운영 배포 완료. migration `202611250001`, VAPID secrets, Edge Function `notifications` version 1, Expo deployment `18rrpxhfbp`를 production에 반영했다. GitHub CI, 로컬 DB/Edge 통합, 예약 adapter 테스트 9건, 모바일 typecheck/lint, 최신 main Expo export가 통과했다. 운영 cron에서 dispatch HTTP 200과 빈 큐 정상 처리를 확인했다. PR #38의 추천 확인 창과 마이 탭 설정 UI가 운영 adapter를 호출하도록 연결됐다. 실제 브라우저/기기의 권한 허용, 수신 및 클릭은 아직 실기기 검증하지 않았다.

## 지원 범위

운영 사용 경로는 `https://odit.expo.app`의 Expo Web이다. 따라서 현재 기능은 Service Worker, Push API, VAPID를 사용하는 Web Push로 제공한다.

- Chrome/Edge 등 Push API 지원 브라우저: HTTPS에서 지원
- iPhone/iPad: 지원 iOS에서 Safari로 홈 화면에 추가한 웹 앱만 지원
- 일반 iOS Safari 탭, Push API 미지원 브라우저, HTTP: 지원하지 않으며 성공으로 표시하지 않음
- Expo Go 및 설치형 iOS/Android 앱: 현재 production 배포 경로가 아니므로 이번 배포에는 `expo-notifications` 네이티브 의존성을 추가하지 않음

향후 설치형 앱을 운영하면 `expo-notifications`의 일회성 local notification adapter를 같은 UI 인터페이스 뒤에 추가하고 신규 네이티브 빌드 및 실기기 검증을 해야 한다.

## 흐름

1. 사용자가 코디를 선택하면 계정 ID와 날짜별로 선택을 브라우저 저장소에 보존한다.
2. 동의 버튼을 누른 뒤에만 브라우저 알림 권한을 요청한다.
3. Service Worker를 등록하고 Web Push subscription을 만든다.
4. 서버는 다음 날 같은 현지 시각(20~28시간 범위)에 첫 예약을 저장하고, 발송 성공 뒤 같은 현지 시각의 다음 날로 넘긴다.
5. `pg_cron`이 매분 전용 Edge Function의 dispatch를 호출한다.
6. 알림 클릭은 `/recommend?notification=1`로 이동하며 현재 날짜 추천을 다시 계산한다.

새 예약은 같은 사용자의 기존 pending 예약을 취소하고 대체한다. UI에서 예약을 취소할 수 있다. 계정 전환을 감지하면 브라우저 구독을 해제하고, 같은 endpoint를 새 계정이 구독할 때 서버에서도 이전 계정의 pending 예약을 취소한다. dispatch 시에도 예약 계정과 subscription 계정이 다르면 발송하지 않는다.

## 보안과 개인정보

- VAPID private key와 service-role key는 Edge Function secret에만 둔다.
- 브라우저는 공개 VAPID key만 `/config`로 받는다.
- subscription마다 추측하기 어려운 access token을 발급해 예약·조회·취소의 소유권을 확인한다.
- Push endpoint와 subscription key는 RLS가 켜진 서버 전용 테이블에 저장하며 브라우저 분석 이벤트에 기록하지 않는다.
- 알림 내용은 일반적인 추천 안내만 포함하고 닉네임·옷·사진 등 민감정보를 넣지 않는다.

`notification_schedules.status='sent'`와 `provider_accepted_at`은 Push provider가 요청을 받아들였다는 뜻이다. OS/브라우저 표시나 사용자 실제 수신을 증명하지 않는다.

## 운영 설정

Edge Function `notifications`에 `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`를 secret으로 설정한다. `VAPID_SUBJECT`는 운영 사이트 URL을 사용한다. migration은 `notification_subscriptions`, `notification_schedules`, dispatch token과 매분 cron을 만든다.

테스트에서는 production UI에 노출되지 않는 코드 수준의 현재 시각 주입으로 예약 시각 계산을 검증한다. 실제 권한·표시·클릭은 지원 브라우저 및 iOS 홈 화면 웹 앱에서 별도 실기기 검증한다.

`api` Edge Function과 2026-11-23의 Auth/RLS migration은 이번 배포에서 변경하거나 적용하지 않았다.
