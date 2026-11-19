# Analytics — Event Taxonomy와 대시보드

## 목적

동료 사용 기간의 목표 지표와 사용자 여정을 같은 원본 이벤트에서 계산한다.

- 활성화: 기간 내 사용자 중 옷장 5벌 이상 등록한 비율
- 비교 도달: 기간 내 사용자 중 사진을 저장하고 비교 결과까지 본 비율
- 재방문: 기간 내 서로 다른 날짜에 2일 이상 앱을 사용한 비율
- 응답 시간: 비교 시작부터 결과 수신까지 평균과 p95
- 사용자 여정: 화면별 체류시간, 핵심 행동, 마지막 도달 단계

분석 코호트는 동료 사용 주간에 새로 들어온 사용자다. `wardrobe_items.created_at < 2026-11-12 00:00:00+09:00`, 즉 11월 11일까지 옷을 한 번이라도 등록한 user_id는 팀·시연 계정으로 보고 모든 집계에서 자동 제외한다.

`user_events`는 제품 사용 분석용이다. AI 판정 일치율은 별도의 승인된 케이스로 측정하며 이 테이블에서 계산하지 않는다.

## 공통 Event Envelope

모바일은 `mobile/src/data/analytics.ts`의 `track()`만 사용한다. 화면이나 기능이 Supabase에 직접 insert하지 않는다.

| 필드 | 형식 | 설명 |
|---|---|---|
| `event_id` | UUID | 재전송 중복을 막는 이벤트 ID |
| `user_id` | string | 현재 데모 사용자 ID. Auth 도입 후 `auth.uid()`로 교체 |
| `session_id` | string | 앱 실행 세션 ID |
| `event_name` | enum | 아래 Taxonomy의 이름 |
| `screen_name` | enum | 파라미터를 제거한 표준 화면 이름 |
| `occurred_at` | ISO 8601 | 클라이언트에서 행동이 발생한 시각 |
| `duration_ms` | integer/null | `screen_leave`, `comparison_done`, `chat_response_done`에만 사용 |
| `platform` | enum | `ios`, `android`, `web`, `unknown` |
| `app_version` | string | 앱 버전 |
| `properties` | object | 120자 이하의 문자열·숫자·불리언·null만 허용 |

## Event Taxonomy

PDF 명세의 원시 이벤트 78종을 정본으로 삼는다. `screen_view`는 화면별 `*_view`를 중복 생성하지 않고 `screen_name`으로 구분한다. 현재 앱에 없는 UI의 이벤트도 계약에는 포함하지만 해당 기능이 추가되기 전에는 발생하지 않는다.

| 영역 | 이벤트 |
|---|---|
| 앱 공통 | `app_open`, `screen_view`, `screen_leave`, `app_background`, `tab_click`, `back_click`, `error_shown` |
| 튜토리얼 | `intro_view`, `intro_next`, `intro_prev`, `intro_skip`, `intro_done` |
| 로그인 | `login_nickname_start`, `login_pin_start`, `login_submit`, `login_validation_failed`, `login_failed`, `login_success` |
| 추구미·준비 | `taste_select`, `taste_deselect`, `taste_limit_reached`, `taste_done`, `taste_later`, `taste_save_failed`, `ready_choice` |
| 옷 등록 | `wardrobe_add_start`, `wardrobe_slot_select`, `wardrobe_kind_select`, `wardrobe_color_select`, `wardrobe_fit_select`, `wardrobe_add_submit`, `wardrobe_add_done`, `wardrobe_add_failed`, `wardrobe_milestone` |
| 옷장 관리 | `wardrobe_edit_start`, `wardrobe_delete_select`, `wardrobe_delete_done`, `wardrobe_delete_failed` |
| 피드·저장 | `feed_load_done`, `feed_load_failed`, `feed_scroll`, `feed_card_impression`, `photo_open`, `photo_save`, `photo_save_done`, `photo_save_failed` |
| 아카이브·상세 | `archive_image_open`, `archive_filter_apply`, `archive_filter_clear`, `archive_zero_result`, `style_detail_item_view` |
| 비교 요청 | `compare_open`, `comparison_done`, `comparison_failed`, `comparison_reopened`, `comparison_empty_wardrobe` |
| 결과 소비 | `result_view`, `result_scroll`, `gap_item_impression`, `item_choice`, `outfit_section_view`, `outfit_view`, `shop_link_click`, `wardrobe_return_click` |
| 다음 행동 힌트 | `hint_view`, `hint_click`, `hint_close` |
| 챗봇 | `chat_no_saved`, `chat_go_feed_click`, `chat_picker_open`, `chat_image_select`, `chat_input_start`, `chat_send`, `chat_response_done`, `chat_response_failed` |
| 마이·재설정 | `taste_edit_start`, `tutorial_replay_start`, `logout_click` |

`duration_ms`는 `screen_leave`, `comparison_done`, `chat_response_done`에만 기록한다. 채팅 원문, 닉네임, PIN, URL은 속성에 넣지 않는다.

## 화면 이름

`onboarding_intro`, `onboarding_login`, `onboarding_taste`, `onboarding_ready`, `home`, `closet`, `recommend`, `chat`, `my`, `add_item_kind`, `add_item_color_fit`, `style_detail`, `comparison_result`, `unknown`.

동적 URL의 실제 ID는 화면 이름에 넣지 않는다. 필요할 때만 `properties.style_image_id`처럼 별도 속성으로 기록한다.

## 개인정보와 데이터 품질

- 채팅 원문, 닉네임, PIN, 상품 URL, 이미지 URL은 기록하지 않는다.
- 모바일은 `/events`만 호출하며 `service_role` 또는 관리자 토큰을 포함하지 않는다.
- 관리자 집계와 사용자별 여정 API는 `x-admin-token`이 있어야 한다.
- 클라이언트 `occurred_at`과 서버 `received_at`을 함께 보관한다.
- 현재 `user_id`는 인증된 ID가 아니므로 동료 테스트용 가명으로만 사용한다. 실제 출시 전 Supabase Auth와 RLS로 교체한다.

## 대시보드 실행

1. Supabase migration과 Edge Function을 배포한다.
2. `ANALYZE_ADMIN_TOKEN`과 같은 관리자 토큰을 Supabase Secret에 둔다.
3. 저장소 루트에서 `python3 -m http.server 4173 -d analytics-dashboard`를 실행한다.
4. 브라우저에서 `http://localhost:4173`을 열고 기간, 제외 사용자 ID, 관리자 토큰을 입력한다.

대시보드의 API 주소는 현재 Supabase 프로젝트로 고정돼 있다. 기간과 관리자 토큰만 입력하면 된다. 11월 11일까지 옷을 등록한 계정은 서버가 자동 제외한다. 이후에도 추가로 뺄 계정은 `추가 제외 사용자 ID`에 쉼표로 구분해 입력한다.

관리자 토큰은 브라우저 `sessionStorage`에만 보관하며 대시보드 코드나 저장소에 넣지 않는다.
