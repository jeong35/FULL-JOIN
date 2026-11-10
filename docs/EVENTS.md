# 사용 기록(이벤트)과 측정 쿼리

사용자 이벤트는 단순 사용량 집계가 아니라 **문제 발견 → UX/기능 변경 → 같은 지표 재측정 → 개선 효과 검증**에 쓴다.

예: 첫 옷 등록 뒤 홈으로 이동하지 않고 오래 머물거나 종료하는 사용자가 많다면 `screen_view/screen_leave`와 `hint_*`를 함께 보고 병목을 확인한다. 다음 행동 말풍선을 개선한 뒤 동일 퍼널의 이탈률과 소요시간을 다시 측정한다.

- 저장 위치: Supabase `public.user_events`
- 전송: `POST /events`
- 개인 정보: 닉네임, 숫자 4자리, 채팅 원문은 보내지 않는다.
- 식별자: `user_id`(로그인 후 해시), `device_id`, `session_id`
- 시간: 클라이언트 `client_ts`와 서버 수신 `received_at`
- 모든 이벤트 `props`에는 `app_version`, `analytics_version`이 자동으로 붙는다.
- 현재 기본 `analytics_version`: `2026-11-11-v2`
- 이벤트 전송 실패가 앱 사용을 막아서는 안 된다.

## 핵심 플로우

```text
최초 튜토리얼
→ 로그인
→ 추구미 설정
→ 옷장 등록
→ 피드 탐색
→ 사진 저장 또는 상세 진입
→ 저장하고 내 옷장과 비교
→ 비교 결과 확인
→ 가진 걸로 입기 / 새로 찾기 / 쇼핑 링크
→ 재방문
```

튜토리얼은 서비스 개념을 설명하고, 실제 화면의 다음 행동 말풍선은 맥락 안에서 행동을 연결한다. 둘의 효과는 각각 이벤트로 측정한다.

## 공통 원시 이벤트

| 이름 | 발생 시점 | 주요 속성 |
|---|---|---|
| `app_open` | 앱/웹 진입 | `path`, `logged_in` |
| `screen_view` | 분석 화면 진입 | `screen`, `previous_screen` |
| `screen_leave` | 다른 화면 이동 | `screen`, `next_screen`, `duration_ms` |
| `app_background` | 탭 닫기·백그라운드 이동 | `screen`, `duration_ms` |
| `tab_click` | 하단 탭 클릭 | `from_tab`, `to_tab`, `reselect` |
| `back_click` | 공통 뒤로가기 클릭 | `screen` |
| `error_shown` | 사용자에게 오류가 표시됨 | `screen`, `error_code` |

## 온보딩·로그인·추구미

| 이름 | 발생 시점 | 주요 속성 |
|---|---|---|
| `intro_view` | 최초 튜토리얼 슬라이드 노출 | `step` |
| `intro_next` | 다음 | `step` |
| `intro_prev` | 이전 | `step` |
| `intro_skip` | 건너뛰기 가능한 경우 건너뜀 | `step` |
| `intro_done` | 마지막 시작하기 | |
| `login_view` | 로그인 화면 | |
| `login_nickname_start` | 닉네임 첫 입력 | |
| `login_pin_start` | PIN 첫 입력 | |
| `login_submit` | 시작하기 클릭 | `valid` |
| `login_validation_failed` | 입력 형식 오류 | `error_field`, `error_type` |
| `login_failed` | 계정 조회 실패 | `error_code`, `latency_ms` |
| `login_success` | 로그인 완료 | `returning` |
| `taste_view` | 최초 추구미 화면 | |
| `taste_select` | 추구미 선택 | `style`, `selected_count`, `replay` |
| `taste_deselect` | 추구미 선택 해제 | `style`, `selected_count`, `replay` |
| `taste_limit_reached` | 3개가 찬 상태에서 추가 선택 | `style`, `selected_count`, `replay` |
| `taste_done` | 추구미 저장 완료 | `count` |
| `taste_later` | 나중에 고르기 | |
| `taste_save_failed` | 추구미 저장 실패 | `error_code`, `count`, `replay` |
| `ready_view` / `ready_choice` | 준비 끝 / 다음 경로 선택 | `choice` |

## 옷장·옷 등록

| 이름 | 발생 시점 | 주요 속성 |
|---|---|---|
| `wardrobe_add_start` | 옷 추가 진입 | |
| `wardrobe_slot_select` | 부위 선택 | `slot` |
| `wardrobe_kind_select` | 종류 선택 | `slot`, `kind` |
| `wardrobe_color_select` | 색 선택 | `kind`, `color` |
| `wardrobe_fit_select` | 핏 선택 | `kind`, `fit` |
| `wardrobe_add_submit` | 옷장에 넣기 클릭 | `slot`, `kind`, `color`, `fit` |
| `wardrobe_add_done` | 저장 성공 | `slot`, `kind`, `wardrobe_size` |
| `wardrobe_add_failed` | 저장 실패 | `slot`, `kind`, `error_code` |
| `wardrobe_milestone` | 1/3/5/10벌 도달 | `count`, `slots_covered` |
| `wardrobe_edit_start` | 편집 시작 | `wardrobe_size` |
| `wardrobe_delete_select` | 삭제할 옷 선택/해제 | `item_id`, `selected` |
| `wardrobe_delete_done` | 삭제 성공 | `delete_count`, `remaining_count` |
| `wardrobe_delete_failed` | 일부 삭제 실패 | `failed_count` |

옷 등록 중 이탈은 별도 이벤트를 억지로 만들지 않고 `screen_view/screen_leave`와 마지막 선택 이벤트를 연결해 계산한다.

## 피드·저장·아카이브

| 이름 | 발생 시점 | 주요 속성 |
|---|---|---|
| `feed_view` | 홈 피드 진입 | |
| `feed_load_done` | 실제 피드 로딩 성공 | `latency_ms`, `item_count` |
| `feed_load_failed` | 피드 로딩 실패 | `error_code`, `latency_ms` |
| `feed_scroll` | 25/50/75/100% 스크롤 도달 | `depth_percent`, `cards_seen` |
| `feed_card_impression` | 피드 카드가 실제 viewport에 들어옴 | `style_image_id`, `position`, `recommendation` |
| `photo_open` | 피드 사진 상세 진입 | `style_image_id` |
| `photo_save` | 저장 시도 | `style_image_id`, `place` |
| `photo_save_done` | 저장 성공 | `style_image_id`, `place`, `saved_count`(가능한 경로) |
| `photo_save_failed` | 저장 실패 | `style_image_id`, `place` |
| `archive_view` | 모든 저장 진입 | `saved_count` |
| `archive_image_open` | 저장 사진 재조회 | `style_image_id` |
| `archive_filter_apply` | 연도·계절·스타일 필터 적용 | `filter_type`, `filter_value` |
| `archive_filter_clear` | 아카이브 필터 해제 | |
| `archive_zero_result` | 필터 결과 0건 | `year`, `season`, `style` |

`photo_save.place`:
- `feed`: 홈 카드 북마크
- `detail`: 상세 우측 북마크
- `compare`: 상세의 “저장하고 내 옷장과 비교”

피드에는 사용자가 직접 조작하는 스타일 필터 이벤트를 두지 않는다. 추구미 기반 자동 정렬 효과는 `feed_card_impression.recommendation = preferred | neighbor | other`로 본다.

## 상세·비교·결과

| 이름 | 발생 시점 | 주요 속성 |
|---|---|---|
| `style_detail_item_view` | 상세의 사진 속 아이템 렌더 | `item_id`, `kind`, `color` |
| `compare_open` | 상세에서 비교 버튼 클릭 | `style_image_id`, `was_saved` |
| `comparison_done` | 비교 준비 성공 | `style_image_id`, `latency_ms` |
| `comparison_failed` | 비교 실패 | `style_image_id`, `latency_ms`, `error_code` |
| `comparison_reopened` | 저장 사진 결과를 다시 열어 최신 옷장으로 재비교 | `style_image_id` |
| `comparison_empty_wardrobe` | 옷장 0벌 상태에서 결과 확인 | `style_image_id` |
| `result_view` | 비교 결과 표시 | `style_image_id`, `items`, `use`, `similar`, `substitute`, `need`, `wardrobe_size`, `outfits` |
| `result_scroll` | 결과 25/50/75/100% 도달 | `style_image_id`, `depth_percent` |
| `gap_item_impression` | 개별 판정 카드 렌더 | `style_image_id`, `item_id`, `gap_status` |
| `item_choice` | 비슷함/대체에서 활용·새로 찾기 선택 | `style_image_id`, `item_id`, `status`, `choice` |
| `outfit_section_view` | 코디 제안 섹션 표시 | `style_image_id`, `outfit_count` |
| `outfit_view` | 개별 코디 카드 표시 | `style_image_id`, `outfit_id` |
| `shop_link_click` | 상세·결과·코디·챗 쇼핑 링크 클릭 | `place`, `platform`, `match_type`, `kind`, `style_image_id` |
| `wardrobe_return_click` | 결과에서 옷장 보완 진입 | `reason`, `style_image_id` |

## 다음 행동 힌트

| 이벤트 | 의미 |
|---|---|
| `hint_view` | 말풍선 노출 |
| `hint_click` | 말풍선 CTA 클릭 |
| `hint_close` | × 닫기 |

현재 힌트:
- `closet_empty`: 0벌 → 옷 추가
- `home_after_closet`: 옷 등록 후 → 홈
- `save_compare`: 피드 저장 후 → 모든 저장
- `archive_open`: 모든 저장 → 비교 결과
- `result_chat`: 결과 → 챗봇

힌트 효과는 클릭률만 보지 않고 **힌트 노출 → 클릭 → 실제 목표 이벤트**까지 연결해 본다.

## 챗봇·마이

| 이름 | 발생 시점 | 주요 속성 |
|---|---|---|
| `chat_no_saved` | 저장 사진 없이 챗봇 진입 | |
| `chat_go_feed_click` | 빈 챗봇에서 피드 이동 | |
| `chat_picker_open` | 사진 바꾸기 열기 | `style_image_id` |
| `chat_image_select` | 대화할 사진 선택 | `style_image_id` |
| `chat_input_start` | 메시지 첫 입력 | `style_image_id` |
| `chat_send` | 질문 전송(원문 미저장) | `style_image_id`, `turn` |
| `chat_response_done` | 챗봇 응답 성공 | `latency_ms`, `product_count` |
| `chat_response_failed` | 챗봇 응답 실패 | `latency_ms`, `error_code` |
| `taste_edit_start` | 마이에서 추구미 다시 고르기 | `selected_count` |
| `tutorial_replay_start` | 튜토리얼 다시 보기 | |
| `logout_click` | 로그아웃 | |

# 파생지표

파생지표는 앱에서 중복 이벤트로 보내지 않고 위 원시 이벤트로 계산한다.

## 1. Activation

정의: **옷장 5벌 이상 + 사진 저장 성공 1회 이상 + 비교 결과 확인 1회 이상**

```sql
with users as (
  select distinct user_id
  from public.user_events
  where user_id is not null
),
closet as (
  select user_id, count(*) as wardrobe_count
  from public.wardrobe_items
  group by user_id
),
saved as (
  select distinct user_id
  from public.user_events
  where name = 'photo_save_done' and user_id is not null
),
compared as (
  select distinct user_id
  from public.user_events
  where name = 'result_view' and user_id is not null
)
select
  count(*) as users,
  count(*) filter (
    where coalesce(c.wardrobe_count, 0) >= 5
      and s.user_id is not null
      and r.user_id is not null
  ) as activated_users,
  round(100.0 * count(*) filter (
    where coalesce(c.wardrobe_count, 0) >= 5
      and s.user_id is not null
      and r.user_id is not null
  ) / nullif(count(*), 0), 1) as activation_pct
from users u
left join closet c using (user_id)
left join saved s using (user_id)
left join compared r using (user_id);
```

## 2. Core Value 도달

정의: 사용자의 **첫 `result_view`**. 가입/로그인 이후 첫 비교까지 걸린 시간도 함께 본다.

```sql
with login as (
  select user_id, min(client_ts) as login_at
  from public.user_events
  where name = 'login_success' and user_id is not null
  group by user_id
),
core as (
  select user_id, min(client_ts) as core_at
  from public.user_events
  where name = 'result_view' and user_id is not null
  group by user_id
)
select
  count(*) as reached_users,
  percentile_cont(0.5) within group (order by extract(epoch from (c.core_at - l.login_at))) as median_seconds_to_core
from core c
join login l using (user_id);
```

## 3. Decision 도달

정의: 비교 후 `item_choice` 또는 `shop_link_click`이 한 번 이상 발생.

```sql
with compared as (
  select distinct user_id from public.user_events
  where name = 'result_view' and user_id is not null
),
decided as (
  select distinct user_id from public.user_events
  where name in ('item_choice', 'shop_link_click') and user_id is not null
)
select
  count(*) as compared_users,
  count(d.user_id) as decision_users,
  round(100.0 * count(d.user_id) / nullif(count(*), 0), 1) as decision_pct
from compared c
left join decided d using (user_id);
```

## 4. 핵심 퍼널과 이탈률

```sql
with u as (
  select distinct user_id from public.user_events where user_id is not null
),
steps as (
  select user_id,
    bool_or(name = 'login_success') as login,
    bool_or(name in ('taste_done','taste_later')) as taste,
    bool_or(name = 'wardrobe_add_done') as wardrobe,
    bool_or(name = 'photo_save_done') as saved,
    bool_or(name = 'result_view') as compared,
    bool_or(name in ('item_choice','shop_link_click')) as decided
  from public.user_events
  where user_id is not null
  group by user_id
)
select
  count(*) filter (where login) as login_users,
  count(*) filter (where login and taste) as taste_users,
  count(*) filter (where login and taste and wardrobe) as wardrobe_users,
  count(*) filter (where login and taste and wardrobe and saved) as saved_users,
  count(*) filter (where login and taste and wardrobe and saved and compared) as compared_users,
  count(*) filter (where login and taste and wardrobe and saved and compared and decided) as decision_users
from steps;
```

각 단계의 이탈률은 `1 - 다음 단계 사용자 수 / 이전 단계 사용자 수`로 계산한다.

## 5. 화면 체류시간

```sql
select
  props->>'screen' as screen,
  count(*) as leaves,
  round(avg((props->>'duration_ms')::numeric) / 1000, 1) as avg_seconds,
  round(percentile_cont(0.5) within group (order by (props->>'duration_ms')::numeric) / 1000, 1) as median_seconds,
  round(percentile_cont(0.95) within group (order by (props->>'duration_ms')::numeric) / 1000, 1) as p95_seconds
from public.user_events
where name = 'screen_leave'
group by 1
order by median_seconds desc;
```

`app_background`도 함께 보면 아무 행동 없이 앱을 떠난 화면을 확인할 수 있다.

## 6. 옷장 1 → 3 → 5 → 10벌 도달

```sql
select
  (props->>'count')::int as count,
  count(distinct user_id) as users
from public.user_events
where name = 'wardrobe_milestone' and user_id is not null
group by 1
order by 1;
```

## 7. 추구미 선택 vs 나중에 고르기

```sql
with cohort as (
  select user_id,
    case
      when bool_or(name = 'taste_done') then 'selected'
      when bool_or(name = 'taste_later') then 'skipped'
    end as taste_group,
    bool_or(name = 'result_view') as reached_compare
  from public.user_events
  where user_id is not null
  group by user_id
)
select taste_group,
  count(*) as users,
  round(100.0 * count(*) filter (where reached_compare) / nullif(count(*),0), 1) as compare_pct
from cohort
where taste_group is not null
group by taste_group;
```

## 8. 저장 경로별 비교 도달률

```sql
with saves as (
  select distinct user_id, session_id, props->>'style_image_id' as image_id, props->>'place' as place
  from public.user_events
  where name = 'photo_save_done'
),
results as (
  select distinct user_id, props->>'style_image_id' as image_id
  from public.user_events
  where name = 'result_view'
)
select s.place,
  count(*) as saves,
  count(*) filter (where r.user_id is not null) as reached_compare,
  round(100.0 * count(*) filter (where r.user_id is not null) / nullif(count(*),0), 1) as compare_pct
from saves s
left join results r on r.user_id = s.user_id and r.image_id = s.image_id
group by s.place;
```

## 9. 힌트 효과

```sql
select props->>'hint' as hint,
  count(*) filter (where name='hint_view') as views,
  count(*) filter (where name='hint_click') as clicks,
  count(*) filter (where name='hint_close') as closes,
  round(100.0 * count(*) filter (where name='hint_click') /
    nullif(count(*) filter (where name='hint_view'),0), 1) as click_pct
from public.user_events
where name in ('hint_view','hint_click','hint_close')
group by 1;
```

힌트의 실제 성공은 같은 세션에서 다음 목표 이벤트까지 연결해 본다.
- `closet_empty` → `wardrobe_add_start`
- `home_after_closet` → `feed_view`
- `save_compare` → `archive_view`
- `archive_open` → `result_view`
- `result_chat` → `chat_send`

## 10. 피드 추천 노출 → 상세 → 저장

```sql
with imp as (
  select session_id, user_id, props->>'style_image_id' as image_id,
         props->>'recommendation' as recommendation
  from public.user_events
  where name='feed_card_impression'
),
opened as (
  select distinct session_id, props->>'style_image_id' as image_id
  from public.user_events where name='photo_open'
),
saved as (
  select distinct session_id, props->>'style_image_id' as image_id
  from public.user_events where name='photo_save_done'
)
select recommendation,
  count(*) as impressions,
  count(*) filter (where o.image_id is not null) as opens,
  count(*) filter (where s.image_id is not null) as saves,
  round(100.0 * count(*) filter (where o.image_id is not null) / nullif(count(*),0),1) as open_pct,
  round(100.0 * count(*) filter (where s.image_id is not null) / nullif(count(*),0),1) as save_pct
from imp i
left join opened o using (session_id, image_id)
left join saved s using (session_id, image_id)
group by recommendation;
```

사진 수가 적은 기간에는 이 지표를 의사결정 근거로 강하게 사용하지 않고, 데이터가 쌓인 뒤 활용한다.

## 11. 비교·챗봇 응답시간

```sql
select name,
  round(avg((props->>'latency_ms')::numeric), 0) as avg_ms,
  round(percentile_cont(0.95) within group (order by (props->>'latency_ms')::numeric), 0) as p95_ms
from public.user_events
where name in ('comparison_done','chat_response_done')
group by name;
```

## 12. 재방문

```sql
with days as (
  select user_id,
    count(distinct (received_at at time zone 'Asia/Seoul')::date) as active_days
  from public.user_events
  where user_id is not null
  group by user_id
)
select
  count(*) as users,
  count(*) filter (where active_days >= 2) as revisit_users,
  round(100.0 * count(*) filter (where active_days >= 2) / nullif(count(*),0),1) as revisit_pct
from days;
```

## 13. 개선 전후 비교

화면을 바꿀 때마다 `analytics_version`을 바꾸거나 배포 환경에서 `EXPO_PUBLIC_ANALYTICS_VERSION`을 지정한다.

```sql
select
  props->>'analytics_version' as version,
  count(distinct session_id) as sessions,
  count(distinct session_id) filter (where name='result_view') as reached_result
from public.user_events
where props ? 'analytics_version'
group by 1
order by 1;
```

발표에서는 단순히 “기능을 추가했다”가 아니라 아래 형식으로 남긴다.

> 문제: 옷 1벌 등록 후 홈 이동 전 이탈률이 높았다.  
> 근거: `wardrobe_add_done → feed_view` 전환율과 `screen_leave/app_background`에서 확인했다.  
> 변경: 홈 탭을 가리키는 다음 행동 힌트를 개선했다.  
> 결과: 다음 버전에서 이탈률 X% → Y%, 홈 진입까지 중앙시간 A초 → B초로 개선됐다.
