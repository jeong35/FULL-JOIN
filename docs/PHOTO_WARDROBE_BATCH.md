# 사진 기반 옷장 일괄 등록

기준일: 2026-11-25

## 지원 상태

| 기능 | 상태 | 비고 |
|---|---|---|
| 카메라 촬영·앨범 선택 | production 기존 기능 재사용 | 카메라는 한 장씩 연속 추가 |
| 앨범 다중 선택 | 구현 | Expo ImagePicker `allowsMultipleSelection`; Web/iOS/Android |
| 사진별 여러 옷 영역 | 구현 | 사진당 최대 4개 |
| 일괄 처리 | 구현 | 사진별 상태·진행률, 이전 사진 작업 유지 |
| 배경 제거 | production 부분 지원 | Web은 로컬 u2netp, 서버 endpoint는 flag off, 실패 시 크롭 원본 fallback |
| 색 추정 | production 기존 기능 재사용 | 사용자가 최종 수정 가능 |
| AI 태깅 | 코드 연결·production 비활성 | 서버 endpoint/flag가 꺼져 있어 수동 입력 fallback |
| 부분 실패·재시도 | 구현 | 성공 항목은 잠그고 실패 항목만 재시도 |
| 응답 유실 중복 방지 | 구현 | 요청 전 ID snapshot과 서버 재조회로 새 일치 항목 복구 |
| 사진 영구 저장 | production 기존 기능 강화 | 계정별 Web localStorage / native document file, 실패를 성공 처리하지 않음 |
| 기존 옷 사진 첨부 | production 기존 기능 유지 | 다중 신규 등록과 분리된 단일 사진 흐름 |

## 상한과 입력 검증

- 한 번에 사진 최대 4장, 전체 옷 최대 12벌, 사진당 영역 최대 4개다.
- 사진 한 장은 15MB 이하, 최소 32×32이며 JPG, PNG, HEIC/HEIF, WebP를 허용한다.
- 4장·12벌 제한은 여러 640px 저장 이미지와 처리용 data URL이 동시에 메모리 및 브라우저 저장공간을 점유하는 점을 고려한 보수적 상한이다.
- 외부 AI나 유료 이미지 처리 서비스를 추가하지 않는다.

## 저장·실패 정책

1. 옷 API 저장 후 계정별 로컬 사진을 저장한다.
2. 로컬 사진 저장이 실패하면 새 옷을 서버에서 rollback하고 실패로 표시한다.
3. rollback까지 실패하면 서버 item ID를 작업 상태에 남긴다. 다음 재시도는 새 옷을 만들지 않고 같은 item에 사진 저장만 다시 시도한다.
4. API 응답만 유실된 경우 현재 서버 옷장을 다시 읽어 요청 전에는 없던 동일 입력 항목을 복구한다.
5. 성공 항목은 `saved`로 잠그고 이후 재시도 대상에서 제외한다.
6. 옷 삭제 시 해당 계정의 로컬 사진도 정리한다. 계정 key별 저장으로 다른 사용자의 사진을 표시하지 않는다.

서버에는 client idempotency key가 없으므로, 다른 기기에서 완전히 동일한 옷을 동시에 추가하는 극단적 경쟁 상태까지 보장하는 방식은 아니다. 현재 production API를 변경하지 않고 응답 유실 재시도의 중복을 가능한 범위에서 막는 호환 방식이다.

## 계측

새 서버 이벤트 이름은 만들지 않고 기존 허용 목록을 재사용한다.

- `wardrobe_add_start`: `via=photo`, `source`, `photo_count`, `batch`, `again`
- `wardrobe_add_submit`: `step=crop|batch_save|batch_done`, 사진·옷·누끼·태깅·성공·실패 수, 처리 시간, retry
- `wardrobe_add_done`: 개별 성공, `via=photo`, `batch`
- `wardrobe_add_failed`: 개별/부분 실패와 오류 코드

이미지, 파일 경로, Base64는 이벤트에 넣지 않는다. 관리자 Journey 상세의 allowlist property로 위 집계를 탐색한다.

## 검증 한계

- 순수 batch 저장 테스트는 성공 유지, 부분 실패, 실패 항목 재시도, 사진 저장 rollback, rollback 실패 후 ID 재사용을 검증한다.
- 모바일 typecheck/lint와 Expo Web export를 수행한다.
- 실제 카메라 권한, iOS/Android 다중 선택 UX, native 저장공간 부족, 앱 강제 종료 후 native 파일 복원은 실기기 확인이 필요하다.
