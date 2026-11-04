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
| `POST` | `/style-images/{id}/heart` | 하트 저장과 갭 분석 |
| `DELETE` | `/style-images/{id}/heart` | 하트 취소 |

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

하트 요청은 `{ "user_id": "demo-user" }`를 받는다. 옷장이 비어 있으면 갭 분석을 실행하지 않고 각 `gap_status`를 `null`로 반환하며 `옷장을 등록하면 가진 옷과 맞춰 드려요`를 함께 준다. 하트 취소는 `hearts` 행을 삭제하므로 아카이브 대상에서도 빠진다.

## 아직 구현하지 않은 경로

- `/analyze`
- `/style-images/{style_image_id}/items/{item_id}/decision`
- `/archive`
- `/chat`

11월 11일 핵심 흐름 뒤에 순서대로 연결한다.
