# MVP 서버 API 계약

이 문서는 `docs/SPEC.md` 5절을 구현할 때 필요한 호출 예시와 현재 데모 제한을 기록한다. 제품 판정의 정본은 `docs/SPEC.md`다.

## 공통

- Supabase Edge Function 이름: `api`
- 배포 기본 URL: `https://<project-ref>.supabase.co/functions/v1/api`
- 오류: `{ "error": { "code": string, "message": string, "field"?: string } }`
- 현재 MVP는 합의 대기 항목에 따라 요청의 `user_id`를 데모 사용자 식별자로 사용한다.
- 실제 사용자 배포 전에는 Supabase Anonymous Auth의 사용자 ID와 RLS 정책으로 교체해야 한다.

## 구현된 경로

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/health` | 함수 실행 상태 확인 |
| `POST` | `/wardrobe` | 옷장 아이템 등록 |
| `GET` | `/wardrobe?user_id=` | 사용자의 옷장 조회 |
| `GET` | `/feed?user_id=` | AC15 홈 피드 순서 |
| `GET` | `/feed?style=` | 선택 스타일 최신순 필터 |
| `GET` | `/archive?user_id=&style=&season=` | 저장한 사진을 스타일·계절로 필터링하고 최근 저장순으로 조회 |
| `POST` | `/chat` | 저장된 사진 분석과 실제 옷장을 재사용해 질문에 답변 |
| `POST` | `/analyze` | Storage의 피드 사진을 운영자가 1회 AI 태깅하고 비공개 저장 |
| `PUT` | `/style-images/{id}/items/{item_id}/product` | 선택한 아이템에 정확한 상품 링크와 페이지 메타데이터 연결 |
| `GET/PUT` | `/style-images/{id}/review` | AI 원본은 보존하고 운영용 스타일·아이템을 조회·검수 |
| `PUT` | `/style-images/{id}/publish` | 검수된 사진만 피드에 공개하거나 공개 취소 |
| `POST` | `/style-images/{id}/heart` | 하트 저장과 갭 분석 |
| `DELETE` | `/style-images/{id}/heart` | 하트 취소 |
| `POST` | `/style-images/{id}/items/{item_id}/decision` | `비슷함` 아이템의 활용·구매 선택에 따른 코디·상품 응답 |

## 옷장 등록 예시

```json
{
  "user_id": "demo-user",
  "slot": "하의",
  "kind": "슬랙스",
  "color": "블랙",
  "visual_fit": "와이드"
}
```

`visual_fit`은 종류별 표를 따른다. 예를 들어 슬랙스의 `null`, 로퍼의 `슬림`, 목록에 없는 색 `검정`은 모두 `400 invalid_enum`이다.

## 하트와 빈 옷장

하트 요청은 `{ "user_id": "demo-user" }`를 받는다. 각 `items[]`에는 갭 판정뿐 아니라 결과 화면에 필요한 `slot`, `kind`, `color`, `visual_fit`, `visibility`, 근거가 있는 상품 식별 정보가 함께 온다. 옷장이 비어 있으면 갭 분석을 실행하지 않고 각 `gap_status`를 `null`로 반환하며 `옷장을 등록하면 가진 옷과 맞춰 드려요`를 함께 준다. 대표상품이 있으면 응답 최상위의 `shop`, `product_name`, `product_url`로 정확한 상품 페이지를 제공한다. 하트 취소는 `hearts` 행을 삭제하므로 아카이브 대상에서도 빠진다.

## 비슷한 아이템 선택

하트 응답에서 `gap_status`가 `비슷함`인 아이템만 활용 또는 구매를 선택할 수 있다. 선택은 저장하지 않으므로 사진을 다시 열면 다시 두 선택지가 보인다.

```json
{
  "user_id": "demo-user",
  "decision": "활용"
}
```

`활용`은 현재 옷장에 실제 등록된 매칭 아이템별 코디를 반환한다. `구매`는 해당 사진 아이템에 검증된 상품 링크가 있으면 그 정확한 상품만 반환하고, 링크가 없으면 근거 없는 상품을 만들지 않고 빈 목록을 반환한다. 하트하지 않은 사진은 `409 heart_required`, 현재 옷장 기준으로 더 이상 `비슷함`이 아닌 아이템은 `409 decision_not_available`이다.

## 저장 아카이브

`GET /archive?user_id=demo-user`는 현재 하트가 남아 있는 공개 사진만 최근 저장순으로 반환한다. `style=미니멀`과 `season=가을`은 함께 또는 따로 사용할 수 있다. 계절은 저장 시각의 월을 기준으로 봄 3~5월, 여름 6~8월, 가을 9~11월, 겨울 12~2월로 자동 계산한다.

## 저장 사진 챗봇

`POST /chat`은 `{ "user_id": "demo-user", "style_image_id": "IMG-001", "message": "이 옷이랑 뭐 입어?" }`를 받는다. 사진을 다시 분석하지 않고 저장된 아이템 분류와 현재 옷장만 사용한다. `claimed_owned_item_ids`에는 실제 등록된 옷장 ID만 들어가며, 쇼핑 질문은 브랜드나 상품을 지어내지 않고 아이템 분류로 만든 `match_type: similar` 검색 링크만 반환한다. 하트하지 않은 사진은 `409 heart_required`다.

## 사진 분석과 CSV 일괄 등록

`POST /analyze`는 `x-admin-token` 헤더와 아래 JSON을 받는다. `image_path`는 비공개 `feed-images` 버킷 안의 경로이며 파일명(확장자 제외)은 `image_id`와 같아야 한다.

```json
{
  "image_id": "IMG-001",
  "image_path": "feed/IMG-001.jpg",
  "source": "쇼핑몰",
  "source_url": "https://example.com/product/1",
  "permission": "미요청",
  "approved_style": ["미니멀"]
}
```

`approved_style`이 없으면 모델의 추천을 임시로 저장하고 응답의 `style_review_required`가 `true`가 된다. 모든 신규 사진은 `published=false`로 저장되므로 팀 검토 전 피드에 나오지 않는다. 옷이 없는 사진은 `422 no_clothing_items`로 거절하며 DB에 저장하지 않는다. 같은 `image_id`를 다시 요청하면 OpenAI를 다시 호출하지 않고 기존 결과를 반환한다(AC4). 여러 업로더가 동시에 같은 사진을 요청해도 DB의 사진별 claim을 먼저 획득한 하나만 OpenAI를 호출하며, 나머지는 완료를 기다렸다가 저장된 결과를 재사용한다.

공유 Google Sheets URL을 직접 넘기거나 CSV로 내려받아 먼저 검증한다. 시트에는 `image_id,file_name,page_url,permission,notes,source` 열이 필요하고 `style`은 선택이다. `notes`는 팀 메모라 모델이나 DB로 보내지 않는다.

```bash
npm run import:style-images -- --sheet-url 'https://docs.google.com/spreadsheets/d/문서_ID/edit?gid=0'
# 또는
npm run import:style-images -- --csv /절대/경로/images.csv --photos /절대/경로/jpg
```

검증 후 실제 Storage 업로드와 분석을 실행한다. 이미 Storage에 올린 경우 `--photos`를 생략해도 되며 기본 경로는 `feed/<file_name>`이다.

```bash
npm run import:style-images -- --sheet-url 'https://docs.google.com/spreadsheets/d/문서_ID/edit?gid=0' --apply
# 또는
npm run import:style-images -- --csv /절대/경로/images.csv --apply
```

처음에는 `--limit 3 --apply`로 세 장만 확인하는 것을 권장한다. 실행 보고서는 `.cache/style-image-import-*.json`에 남는다.

## 대표 상품 연결

사진 속 아이템을 확인한 후 대표 상품 아이템 하나를 명시해 연결한다. `product_url`을 생략하면 쇼핑몰 사진의 `source_url`을 사용한다. 서버는 JSON-LD와 Open Graph에서 `shop`, `brand`, `product_name`을 추출하며, 쇼핑몰이 접근을 막거나 정보가 없어도 정확한 `product_url` 저장은 계속 진행한다.

```bash
npm run link:item-product -- --image-id IMG-001 --item-id IMG-001-ITEM-01
```

코디 사진에 다른 상품 링크를 추가할 때는 주소를 명시하고 대표 상품이 아니라고 표시할 수 있다.

```bash
npm run link:item-product -- --image-id IMG-001 --item-id IMG-001-ITEM-02 \
  --product-url 'https://shop.example/product/2' --not-representative
```

링크를 이미지 전체에 자동 연결하지 않고 아이템을 명시하는 이유는, 코디 사진에 여러 아이템이 있어 잘못된 옷에 정확한 상품 정보를 붙이면 AC2를 위반하기 때문이다.

## 사진 검수와 공개

AI의 최초 결과는 `style_images.tagging`에 그대로 남는다. 검수 API는 서비스에서 사용하는 `style_images.style`과 `style_image_items`의 분류값만 고치고 `reviewed_at`을 기록하며, 수정 또는 재검수한 사진은 항상 `published=false`로 둔다.

현재 값을 먼저 확인한다.

```bash
npm run review:style-image -- --image-id IMG-001 --show
```

수정할 것이 없으면 현재 값을 승인한다.

```bash
npm run review:style-image -- --image-id IMG-001
```

수정이 필요하면 JSON 파일을 만든다. `style`과 `items` 중 바꿀 값만 넣을 수 있고, 아이템은 기존 `item_id`를 명시한다.

```json
{
  "style": ["캐주얼", "스트릿"],
  "items": [
    {
      "item_id": "IMG-001-ITEM-01",
      "slot": "아우터",
      "kind": "점퍼",
      "color": "브라운",
      "visual_fit": "오버사이즈",
      "visibility": "전체"
    }
  ]
}
```

```bash
npm run review:style-image -- --image-id IMG-001 --input /절대/경로/IMG-001-review.json
```

검수가 끝난 사진만 공개한다. 검수하지 않은 사진은 서버가 `409 review_required`로 거절한다.

```bash
npm run publish:style-image -- --image-id IMG-001
```

다시 숨기려면 다음 명령을 사용한다.

```bash
npm run publish:style-image -- --image-id IMG-001 --unpublish
```

## 아직 구현하지 않은 경로

현재 MVP 서버 계약의 경로는 모두 구현됐다.

정확한 쇼핑몰 링크는 사진 전체가 아니라 분석된 `item_id`에 연결한다. MVP에서는 사진마다 대표 상품을 0~1개 두며, 링크가 없으면 모든 아이템의 `is_representative_product`가 `false`다. DB는 같은 사진에 대표 상품이 둘 생기는 것을 거부한다. 이후에는 다른 아이템에도 `false`로 각자의 정확한 상품 링크를 추가할 수 있다. `shop`·`brand`·`product_name`은 링크에서 추출을 시도하는 선택 정보이며, 추출 실패가 링크 저장을 막지 않는다.
