# Action-oriented Chatbot

> 2026-11-27 이후 배포 경계는 `PRIVATE_BETA_POLICY.md`를 따른다. 사진별 영구 기록은 기본 비활성이며 일반 챗봇·Action과 분리한다.

기준일: 2026-11-26

## 제품 결정

Problem → 저장 사진을 먼저 고르지 않으면 질문할 수 없었고, 답변이 실제 다음 행동으로 이어지지 않았다.

User Feedback → 옷장이 비어 있는 유사 상품 질문도 옷장 부족으로 막혔고, 원하는 기능을 찾는 데 챗봇을 활용하기 어려웠다.

Behavioral Evidence → 동료평가 잠정 코호트 8명 중 6명이 옷장 5벌 이전에 사진을 저장했고, 옷 등록↔사진 저장 전이가 짧은 시간 안에 반복됐다. 이 수치는 DB 잔존 기록 기반이며 과거 CTA 성과를 뜻하지 않는다.

Hypothesis → 사진을 선택 컨텍스트로 바꾸고 실제 피드·옷장·저장·추천 화면으로 연결되는 검증된 Action을 제공하면 목표 행동 도달을 높일 수 있다.

Implementation → 결정적 Intent/Tool routing, 실제 데이터 기반 최대 3개 결과, 허용 Action enum, 서버 생성 `action_id`, CTA 노출→클릭→이동→완료 이벤트, 기존 매일 코디 알림 재사용을 구현했다.

Measurement → 관리자 대시보드의 `챗봇 목표 행동` 시간순 퍼널과 User Actions 카드에서 응답 성공률, Action 제안률, 클릭률, 이동 성공률, 완료율을 본다. 분모가 없으면 N/A다.

Result → 사용자 실측 전이므로 미측정이다.

## 재사용한 기능

- CHAT-01/03의 사진 비교·Grounding·일반 조언 LLM fallback
- 기존 코사인/갭 분석 판정과 쇼핑몰 검색 링크 생성
- 홈 피드 검색 파라미터, 저장 탭, 비교 결과, 오늘의 룩 추천 탭
- 운영 중인 반복 Web Push 예약과 마이 탭 토글·시간 변경

## Intent와 Action

`today_outfit`, `wardrobe_outfit_search`, `find_style`, `find_similar_item`, `add_wardrobe_item`, `compare_saved_style`, `browse_saved_styles`, `notify_today_outfit`, `notify_new_style`, `general_question`, `out_of_scope`를 지원한다. 실제 DB 접근은 서버의 고정된 조회만 사용하며 LLM이 SQL, ID, route, URL을 생성하지 않는다.

허용 Action은 `OPEN_RECOMMENDATION`, `OPEN_FILTERED_FEED`, `OPEN_STYLE_DETAIL`, `OPEN_COMPARISON`, `OPEN_WARDROBE`, `OPEN_WARDROBE_ADD`, `OPEN_PHOTO_ADD`, `OPEN_ARCHIVE`, `OPEN_PRODUCT_SEARCH`, `OFFER_DAILY_REMINDER`다. 신규 코디 알림은 감지 인프라가 없어 노출하지 않는다. 상품 URL은 무신사·에이블리·지그재그 HTTPS 검색 주소만 허용한다.

`find_style`, `find_similar_item`, `browse_saved_styles`, `general_question`은 옷장이 비어 있어도 동작한다. 옷장 기반 검색은 등록 데이터가 부족할 때 사진 등록 또는 부위 등록 Action을 제공하며, 실제 옷이 없다고 단정하지 않는다.

매일 알림은 지원되는 Web Push 환경에서만 노출한다. 사용자가 CTA를 누른 뒤 권한과 서버 예약이 모두 성공해야 마이 탭 설정이 켜진다. iOS 브라우저는 홈 화면 웹 앱 조건을 그대로 따른다.

## 배포 경계

production API SHA `2d0369bb629a5396c0534aad474d63ac1ea81070`은 과거 nickname+PIN `user_id` 계약이다. 신규 후보는 Private Beta Auth migration과 함께 staging에서 검증하며, CHAT-02는 active migration에서 분리되어 기본적으로 `history_persisted=false`를 명시한다.

결정적 fixture는 `evals/action_chat_cases.yaml`과 `npm run test:action-chat`에 있다. 승인된 Golden Case와 `tests/`는 수정하지 않았다. 비교 후보가 없을 때는 종류명 뒤에 잘못된 조사를 붙이지 않고 `비교할 미니스커트 후보가 없어요`처럼 표시한다.

## 2026-11-27 배포 상태

- main `bfba9fca3717575184bf05fa9a8c0cc6d14bebba`, GitHub Actions Verify run `45834567326`의 `check`와 `local-supabase-integration`이 모두 성공했다.
- 신규 DB migration은 없다. production DB에는 기존 Web Push migration `202611250001`까지만 적용된 상태를 유지한다.
- 챗봇 알림 클릭 출처를 연결하는 `notifications` Edge Function v2를 production에 배포하고 공개 config 응답을 smoke test했다.
- Expo는 현재 production 사이트를 기준으로 챗봇 관련 모바일 파일만 선별한 호환 후보를 배포할 수 있다. 모바일 챗봇은 운영 nickname+PIN API 응답과 backward-compatible하게 동작하며, 미배포 Auth/RLS·CHAT-02 서버 파일이나 migration은 Expo 후보에 포함하지 않는다.
