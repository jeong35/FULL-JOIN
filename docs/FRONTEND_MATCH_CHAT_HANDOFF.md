# 프론트엔드 연동 안내 — MATCH-03 / CHAT-03

이 문서는 `codex/llmops-chat03` 기준의 하위 호환 API 변경만 설명한다. 사진 기반 옷장 등록 화면은 프론트 담당자가 개발 중이므로 이 브랜치에서 수정하지 않는다.

## 비교 결과 한 줄 근거

기존 하트 응답의 `gap_status`, `wardrobe_item_ids`, `decision_options` 의미는 바뀌지 않는다. 서버는 선택적으로 `match_metadata`를 추가한다.

```json
{
  "item_id": "IMG-001-ITEM-01",
  "gap_status": "활용",
  "wardrobe_item_ids": ["WARDROBE-KNIT-01", "WARDROBE-KNIT-02"],
  "decision_options": [],
  "match_metadata": {
    "wardrobe_item_id": "WARDROBE-KNIT-01",
    "reason_code": "exact",
    "reason": "내 옷장의 아이보리 레귤러 니트를 활용할 수 있어요."
  }
}
```

- UI에는 `match_metadata.reason`만 한 줄로 표시한다.
- 유사도 숫자는 응답에 없으며 UI에도 계산하거나 표시하지 않는다.
- `match_metadata.wardrobe_item_id`는 같은 아이템의 `wardrobe_item_ids[0]`과 같아야 한다.
- ID는 옷장 카드 강조·스크롤·상세 이동에 사용할 수 있다. ID로 판정 상태를 다시 계산하지 않는다.
- `gap_status: "구매"`처럼 후보가 없으면 `wardrobe_item_id`는 `null`, `reason_code`는 `no_candidate`다.
- 구버전 앱은 optional 필드를 무시해도 기존 기능이 유지된다.

## 챗 요청

```json
{
  "user_id": "demo-user",
  "style_image_id": "IMG-001",
  "message": "내 옷장 니트로 이 코디를 출근용으로 바꾸려면 어떻게 입어?",
  "history": [
    { "role": "user", "content": "이 사진의 니트가 마음에 들어" },
    { "role": "assistant", "content": "저장 사진의 니트를 기준으로 볼게요." }
  ]
}
```

`history`는 현재 요청 문맥 전달용이며 영구 저장 계약이 아니다. 사진별 대화 저장은 인증·삭제 정책 확정 후 별도 API로 추가한다.

## 챗 응답

```json
{
  "answer": "내 옷장 기준: 옷장에 실제 등록된 니트 · 아이보리 · 레귤러를 활용할 수 있어요. 일반 패션 조언: 출근용으로는 단정한 색 조합과 간결한 실루엣이 무난해요.",
  "answer_source": "openai",
  "intents": ["wardrobe_outfit", "saved_photo_outfit", "general_advice", "mixed"],
  "answer_sections": [
    {
      "source": "wardrobe",
      "label": "내 옷장 기준",
      "text": "옷장에 실제 등록된 니트 · 아이보리 · 레귤러를 활용할 수 있어요."
    },
    {
      "source": "saved_photo",
      "label": "저장 사진 기준",
      "text": "저장된 사진 분석에서 확인한 아이템은 아이보리 레귤러 니트예요."
    },
    {
      "source": "general_advice",
      "label": "일반 패션 조언",
      "text": "출근용으로는 단정한 색 조합과 간결한 실루엣이 무난해요."
    }
  ],
  "analysis_id_used": "IMG-001",
  "claimed_owned_item_ids": ["WARDROBE-KNIT-01"],
  "comparison": [
    {
      "item_id": "IMG-001-ITEM-01",
      "gap_status": "활용",
      "wardrobe_item_ids": ["WARDROBE-KNIT-01"],
      "substitute_wardrobe_item_ids": [],
      "match_metadata": {
        "wardrobe_item_id": "WARDROBE-KNIT-01",
        "reason_code": "exact",
        "reason": "내 옷장의 아이보리 레귤러 니트를 활용할 수 있어요."
      }
    }
  ],
  "products": [],
  "image_reanalysis_count": 0,
  "external_instruction_applied": false
}
```

### `intents`

- `wardrobe_outfit`: 실제 보유 옷 상담
- `saved_photo_outfit`: 저장 사진 분석·코디 상담
- `product_search`: 유사 상품 탐색
- `general_advice`: 일반 패션 지식이 필요한 상담
- `mixed`: 둘 이상의 상담 유형이 함께 있음
- `out_of_scope`: 서비스 범위 밖 질문

앱에서 상담 유형을 먼저 선택하게 하지 않는다. 서버가 자동 분류한 결과는 디버깅·표현 분기에만 사용한다.

### `answer_source`

- `grounded`: LLM을 호출하지 않고 저장 분석·옷장·검증된 검색 링크로 답변
- `openai`: 일반 패션 조언 부분에만 LLM을 사용
- `fallback`: 일반 조언 호출에 실패해 안전한 안내로 대체

`claimed_owned_item_ids` 외의 옷을 보유 옷으로 표시하지 않는다. `answer_sections`를 사용하면 복합 답변에서 “내 옷장 기준”과 “일반 패션 조언”을 시각적으로 분리할 수 있다.

## 연동 후 사용자 흐름 테스트

1. 같은 종류·색의 옷이 여러 벌일 때 `wardrobe_item_ids[0]` 카드와 한 줄 근거가 일치한다.
2. `비슷함`은 기존처럼 활용/구매 선택을 모두 보여 주며 한 줄 근거가 선택을 대신하지 않는다.
3. `구매` 후보 없음은 옷장 카드를 강조하지 않는다.
4. 빈 옷장 + 유사 상품 질문은 등록 강제 없이 검색 링크를 보여 준다.
5. 빈 옷장 + 보유 옷 상담은 등록 안내를 보여 주고 허구의 보유 옷을 표시하지 않는다.
6. 저장 사진 상담은 현재 옷장 변경 후 최신 `comparison` ID로 갱신된다.
7. 복합 질문은 `answer_sections`의 옷장 근거와 일반 조언을 구분해 표시한다.
8. 범위 밖 질문은 패션 상담 범위를 안내하고 상품·보유 옷을 생성하지 않는다.
9. `fallback`에서도 기존 비교 후보와 상품 링크는 유지된다.
10. 구버전 응답 필드만 사용하는 화면이 optional 필드 추가 후에도 정상 동작한다.
