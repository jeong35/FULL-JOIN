# 사용 기록(이벤트)과 측정 쿼리

사람들이 어느 화면에서 멈추는지(이탈 지점)를 찾고, README 최종 목표(활성화·비교까지 도달·재방문)를 서버 기록으로 재려고 앱이 `POST /events`로 보낸다(계약은 `docs/API_MVP.md` 사용 기록 절).

- 저장 위치: Supabase `public.user_events` (`supabase/migrations/202611100001_user_events.sql`)
- 보내지 않는 것: 닉네임, 숫자 4자리, 채팅 질문 내용
- `user_id`: 닉네임·숫자로 만든 해시(로그인 전에는 비어 있음). `device_id`: 브라우저가 처음 열 때 만든 무작위 값. `session_id`: 앱을 열 때마다 새로 만든다.
- 이름 목록은 `src/fulljoin/events.ts`와 `mobile/src/data/events.ts`가 같아야 한다(`npm run check:events`가 확인).
- 보내기에 실패해도 앱은 막히지 않는다. 서버 배포 전에는 기록이 쌓이지 않고 조용히 버려진다.

## 이벤트 목록

| 이름 | 언제 | 속성 |
|---|---|---|
| `app_open` | 앱(웹 페이지)을 열 때 | `path`, `logged_in` |
| `intro_view` | 소개 화면 한 장을 볼 때(다시 보기 제외) | `step` 1~3 |
| `intro_next` | 소개에서 '다음' | `step` |
| `intro_skip` | 소개에서 '건너뛰기'(로그인한 적 있는 브라우저만 보임) | `step` |
| `intro_done` | 소개 마지막 '시작하기' | |
| `login_view` / `login_success` | 로그인 화면 / 로그인 완료 | `returning`(이미 쓰던 계정) |
| `taste_view` / `taste_done` / `taste_later` | 추구미 고르기 화면 / 고르고 다음 / 나중에 | `count` |
| `ready_view` / `ready_choice` | 준비 끝 화면 / 고른 버튼 | `choice`: `closet`·`feed` |
| `feed_view` | 홈 탭에 올 때 | |
| `photo_open` | 피드 사진을 눌러 제품 정보를 열 때 | `style_image_id` |
| `photo_save` | 사진 저장 | `style_image_id`, `place`: `feed`·`detail` |
| `compare_open` | 제품 정보에서 '내 옷장과 비교' | `style_image_id`, `was_saved` |
| `result_view` | 비교 결과를 볼 때(사진마다 한 번) | `style_image_id`, `items`, `use`, `similar`, `substitute`, `need`, `wardrobe_empty`, `wardrobe_size`, `outfits` |
| `item_choice` | 비슷함·대체 아이템에서 고를 때 | `style_image_id`, `item_id`, `kind`, `status`: `similar`·`substitute`, `choice`: `use`·`find` |
| `shop_link_click` | 쇼핑 링크를 누를 때 | `place`: `detail`·`list`·`outfit`·`chat`, `platform`, `match_type`, `kind`, `style_image_id` |
| `chat_send` | 챗봇 질문 보내기(내용은 안 보냄) | `style_image_id`, `turn` |
| `wardrobe_add_start` / `wardrobe_add_done` | 옷 추가 시작 / 저장 완료 | `slot`, `kind`, `wardrobe_size` |
| `hint_view` / `hint_click` / `hint_close` | 다음 할 일 말풍선이 뜰 때 / 누를 때 / ×로 닫을 때 | `hint` |

## 다음 할 일 말풍선(힌트)

한 화면에서 할 일을 마치면 다음 할 일을 말풍선으로 알려 준다. 다음 할 일을 한 번 하거나 ×로 닫으면 다시 띄우지 않는다(계정마다, 이 브라우저에만 기억 — `mobile/src/data/hints.ts`).

| `hint` | 어디서, 언제 | 문구 | 누르면 |
|---|---|---|---|
| `closet_empty` | 옷장 탭, 0벌 | 옷장이 아직 비어 있어요! 가진 옷을 넣으면 사진과 바로 비교해 볼 수 있어요 | 옷 추가(눌러도 옷을 넣을 때까지 계속 뜨고, ×로만 닫힘) |
| `home_after_closet` | 옷장 탭 아래(꼬리는 홈 탭), 옷이 1벌 이상이고 저장한 사진이 없을 때 | 옷을 등록했어요! 이제 사진을 보며 원하는 코디를 골라볼까요? 옷을 더 등록하면 정확한 코디를 추천받을 수 있어요! | 홈 |
| `save_compare` | 홈 피드에서 사진을 저장한 뒤 | 저장했어요! '모든 저장'에서 사진을 누르면 내 옷장과 비교해 드려요 | 모든 저장 |
| `archive_open` | '모든 저장'에 사진이 있고 아직 비교 결과를 안 봤을 때 | 사진을 누르면 내 옷장과 비교해 드려요! 있는 옷, 비슷한 옷, 필요한 옷을 한눈에 볼 수 있어요 | 첫 사진 비교 결과 |
| `result_chat` | 비교 결과 맨 아래 | 더 궁금한 건 챗봇에게 이 사진으로 물어볼 수 있어요 | 그 사진을 고른 챗봇 |

## 측정 쿼리

Supabase 대시보드 → SQL Editor에서 실행한다. 기간은 동료 사용 주간(11/11~18, 한국 시간)이다.

### 소개 단계별 이탈

```sql
select (props->>'step')::int as step,
  count(distinct device_id) filter (where name = 'intro_view') as viewed,
  count(distinct device_id) filter (where name = 'intro_next') as next_clicked,
  count(distinct device_id) filter (where name = 'intro_skip') as skipped
from public.user_events
where name in ('intro_view', 'intro_next', 'intro_skip')
group by 1
order by 1;
```

### 처음 쓰는 흐름(기기 수)

```sql
select name, count(distinct device_id) as devices
from public.user_events
where name in ('intro_view', 'intro_done', 'login_view', 'login_success', 'taste_view', 'taste_done',
  'taste_later', 'ready_view', 'ready_choice', 'wardrobe_add_done', 'photo_save', 'result_view')
group by name
order by devices desc;
```

### 최종 목표: 활성화 · 비교까지 도달 · 재방문

```sql
with period as (
  select * from public.user_events
  where user_id is not null
    and received_at >= timestamptz '2026-11-11 00:00+09'
    and received_at <  timestamptz '2026-11-19 00:00+09'
),
users as (select distinct user_id from period),
closet as (select user_id, count(*) as n from public.wardrobe_items group by user_id),
reached as (select distinct user_id from period where name = 'result_view'),
days as (
  select user_id, count(distinct (received_at at time zone 'Asia/Seoul')::date) as n
  from period group by user_id
)
select
  count(*) as users,
  round(100.0 * count(*) filter (where coalesce(c.n, 0) >= 5) / nullif(count(*), 0), 1) as activation_pct,
  round(100.0 * count(r.user_id) / nullif(count(*), 0), 1) as reached_compare_pct,
  round(100.0 * count(*) filter (where d.n >= 2) / nullif(count(*), 0), 1) as revisit_pct
from users u
left join closet c using (user_id)
left join reached r using (user_id)
left join days d using (user_id);
```

### 말풍선 반응

```sql
select props->>'hint' as hint,
  count(distinct device_id) filter (where name = 'hint_view') as viewed,
  count(distinct device_id) filter (where name = 'hint_click') as clicked,
  count(distinct device_id) filter (where name = 'hint_close') as closed
from public.user_events
where name in ('hint_view', 'hint_click', 'hint_close')
group by 1
order by 1;
```

### 쇼핑 링크 누른 비율(비교 결과를 본 사람 중)

```sql
select
  count(distinct user_id) filter (where name = 'result_view') as reached,
  count(distinct user_id) filter (where name = 'shop_link_click') as clicked,
  count(*) filter (where name = 'shop_link_click' and props->>'place' = 'outfit') as outfit_clicks
from public.user_events
where user_id is not null;
```

## 바꾸기 전후 비교

화면을 바꿨다면(예: 소개 건너뛰기 버튼을 모두에게 보이기) 바꾼 날짜를 기록해 두고, 위 쿼리의 기간을 바꾸기 전과 후로 나눠 같은 값을 비교한다. 예: "소개 1장에서 다음을 누른 비율이 ○%에서 ○%로 바뀌었다."
