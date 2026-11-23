# 프론트 연동: Auth와 옷장 사진

상태: `codex/auth-photo-integration` 로컬 구현·통합 테스트 완료, main/운영 미반영.

## 인증

- 사용자 API 요청에 `Authorization: Bearer <Supabase access token>`을 보낸다.
- 기존 `user_id` 필드는 하위 호환을 위해 당분간 유지하지만 access token의 사용자 UUID와 같아야 한다.
- 토큰 없음/만료는 `401 authentication_required`, 다른 사용자 ID는 `403 user_id_mismatch`다.
- 앱에는 publishable/anon key만 둔다. service-role key, `CUTOUT_SECRET`, OpenAI key는 절대 넣지 않는다.
- 현재 모바일 anonymous Auth는 개발 연결용이다. 닉네임+PIN은 정식 인증 수단이 아니며 데모 데이터 자동 이전도 하지 않는다.

## 옷장 조회

기존 필드는 그대로이며 다음 optional 필드가 추가된다.

```json
{
  "id": "wardrobe-uuid",
  "slot": "상의",
  "kind": "니트",
  "color": "아이보리",
  "visual_fit": "레귤러",
  "photo_url": "https://...signed...",
  "photo_color": "#F3E9D2",
  "photo_updated_at": "2026-11-23T12:34:56.000Z"
}
```

`photo_url`은 private Storage의 1시간짜리 서명 URL이다. 캐시가 만료되면 `GET /wardrobe?user_id=<auth UUID>`를 다시 호출한다. 내부 `photo_path`는 응답하지 않는다.

## 사진 흐름

1. 카메라/앨범에서 고른 원본은 화면 전환용 메모리에서만 다룬다.
2. `POST /wardrobe/cutout`에 JPG/PNG/WebP(최대 8MB)를 multipart `file`로 보낸다.
3. 응답의 `data:image/png;base64,...`와 `color`로 사용자가 종류·색·핏을 확인·수정한다.
4. 옷장 아이템을 만든 뒤 `PUT /wardrobe/{id}/photo`에 확인된 투명 PNG(최대 3MB)와 선택 `color`를 multipart로 보낸다.
5. 사진 제거는 `DELETE /wardrobe/{id}/photo`다. 옷 자체를 삭제해도 서버가 Storage object를 정리한다.

원본이나 배경이 남은 JPEG를 영구 저장하지 않는다. 누끼 실패 시 옷장 칩은 저장할 수 있지만 사진은 저장하지 않고 사용자가 다시 시도할 수 있게 안내한다.

## 사진 태깅

`POST /wardrobe/tag`:

```json
{
  "user_id": "auth-user-uuid",
  "image": "data:image/png;base64,..."
}
```

성공 시 `wardrobe_tag`의 `slot`, `kind`, `color`, `visual_fit`을 폼의 초깃값으로만 사용하며 사용자가 최종 확정한다. 실패/configuration fallback은 HTTP 200의 `{ "wardrobe_tag": null, "fallback": true }`이므로 수동 선택 흐름을 유지한다.

## 연동 전 확인할 흐름

- 토큰 없음/만료 시 재인증하고 요청을 무한 재시도하지 않는지
- A 계정에서 B의 옷장/사진 URL·삭제에 접근할 수 없는지
- 사진 업로드 후 앱 재시작 및 서명 URL 만료 후에도 다시 보이는지
- 누끼·태깅 실패 시 칩 등록은 유지되고 원본 사진은 서버에 남지 않는지
- 사진 변경·삭제·옷 삭제 후 이전 Storage object가 남지 않는지
- iOS/Android의 data URL/FormData 업로드와 3MB 제한이 실제 기기에서 동작하는지
