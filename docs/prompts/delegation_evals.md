# evals 러너 위임 프롬프트와 확인 기록 (초안, 11/17)

> 다 채우면 `docs/prompts/delegation_evals.md`로 옮긴다.
> 선행 조건: `evals/EVAL_DESIGN.md`, `evals/evalset.jsonl`, `evals/judge_prompt.md`를 사람이 확정해 둘 것.

## 0. 위임 전에 친구분과 정할 것 (서버 쪽)

- [ ] **챗봇 문제(live_chat)를 어디에 물어볼지** — 추천: 배포된 API를 그대로 쓴다. 러너가 `eval-`로 시작하는 user_id로 옷장 등록 → 사진 저장(heart) → `/chat` 호출.
  - 주의: 이 사용자가 서버 기록에 남는다. README 정량 목표(활성화·비교 도달·재방문)를 셀 때 `eval-` 사용자를 빼야 한다.
- [ ] **태깅 함정 문제(live_tagging 5개)를 어떻게 돌릴지** — 추천: `/analyze`(관리자 토큰)로 평가용 사진을 태깅하고 공개하지 않는다. 안 되면 첫 실행에서는 이 5개를 "오류(미실행)"로 남기고 설계서에 이유를 적는다(집계에서 빼지 않는다).
- [ ] 평가용 사진 2장(음식, 풍경)은 팀이 직접 찍어서 준비. 저장소에는 올리지 않는다.

## 1. 러너 본체 위임 프롬프트

```text
evals/run_evals.ts 를 만들어줘. 평가 데이터셋을 읽어 채점하고 결과를 기록하는 러너다.
(자리만 잡아 둔 evals/run_evals.py는 지운다.)

읽을 파일(수정 금지): AGENTS.md, evals/EVAL_DESIGN.md 1절(지표 정의와 목표), evals/evalset.jsonl, evals/judge_prompt.md

먼저 evals/fixtures/tagging.jsonl 을 만드는 스크립트 evals/export_fixtures.ts 를 만든다.
- 입력: feed_photos/_review/reviews.json (저장소 밖 파일, 경로는 인자로 받는다)
- 한 줄에 사진 1장: photo_id, model_items(body.style_image.tagging.items), label_items(body.items)
- 각 item은 slot, kind, color, visual_fit, visibility 만 남긴다. 상품명·링크·이미지 경로는 넣지 않는다.

케이스마다 mode에 따라 실행한다.
- stored: fixtures에서 photo_id의 model_items를 출력으로 쓴다.
- code: 저장된 label_items와 query.wardrobe로 src/fulljoin/gap_analysis.ts의 classifyGap을 아이템마다 실행한다.
- live_chat: EVAL_API_BASE의 배포 API를 쓴다. user_id는 "eval-<케이스id>-<run_id>". query.wardrobe를 POST /wardrobe로 등록 → POST /style-images/{id}/heart → POST /chat. 응답 전체를 저장한다. answer_source가 openai가 아니면 그 케이스는 오류로 표시한다.
- live_tagging: (0절에서 정한 방법). 방법이 없으면 오류(미실행)로 표시한다.

채점
- 공통 검사: 태깅 출력은 src/fulljoin/schemas/style_image.schema.json 검증, 챗봇 응답은 chatModelOutputSchema 형식.
- graders에 code가 있으면 expect의 키마다 검사한다.
  - match_label: model_items와 label_items를 칸(slot, kind, color)별로 비교해 맞은 칸 수/전체 칸 수를 기록. 아이템 수가 다르면 없는 쪽은 틀린 칸으로 센다.
  - gap_status / wardrobe_item_ids: 아이템 kind별로 classifyGap 결과와 일치.
  - owned_ids_subset_of_wardrobe: claimed_owned_item_ids가 모두 등록한 옷장 id.
  - image_reanalysis_count: 응답 값과 일치. no_url_in_answer: answer에 http 문자열 없음. products_match_type: products가 모두 그 값.
  - (함정 문제의 expect 키는 EVAL_DESIGN.md 2절에 사람이 정한 대로 추가한다.)
- graders에 judge가 있으면 judge_prompt.md의 <<<JUDGE ~ JUDGE>>> 사이를 system 지시로 써서 케이스마다 따로 judge를 호출하고 기준별 {reason, pass}를 저장한다. judge 모델은 EVAL_JUDGE_MODEL 환경변수.
- 케이스 통과: 공통 검사와 적용된 채점기가 모두 통과. 처리할 수 없는 expect 키, judge 응답 파싱 실패, 미실행은 오류로 표시하고 집계에서 빼지 않는다.

기록
- EVAL_DESIGN.md 1절의 정의대로 지표를 집계한다(분자와 분모 포함).
- evals/results/<YYYY-MM-DDTHHMM>.json 을 새로 저장한다: run_id, commit, --change로 받은 변경 설명, evalset_version(케이스 수와 파일 해시), judge_version, --golden으로 받은 골든 테스트 결과, 모델 이름, metrics, cases(출력과 판정 전부).
- evals/results/history.csv 에 한 줄 추가한다.
- 끝나면 지표 표와 케이스별 통과/실패 표를 출력한다.

하지 말 것: 읽을 파일 수정, 케이스 id로 분기, 판정 기준 변경, src/·tests/ 수정, 키를 코드에 넣기(환경변수만), 커밋에 에이전트를 공동 작성자로 넣기.
끝나면 npm run check 가 그대로 통과하는지 보여 주고, 케이스별로 적용한 검사를 한 줄씩 보여 줘.
```

## 2. 사람의 확인 (오답 주입)

러너가 실패를 실패로 잡는지 본다. 확인한 뒤 러너는 에이전트 수정 금지.

| 넣은 오답 | 기대 판정 | 실제 결과 |
|---|---|---|
| t1의 model_items에서 색 하나를 다른 색으로 바꿈 | t1 match_label 칸 수 감소 | ____ |
| g1 expect의 니트를 "구매"로 바꿈 | g1 코드 채점 실패 | ____ |
| c1 응답의 claimed_owned_item_ids에 없는 id "w999" 추가 | c1 owned_ids 실패 | ____ |
| c1 judge 응답의 c1을 false로 | c1 judge 실패 | ____ |
| judge 응답을 JSON이 아닌 문장으로 | 오류 표시, 집계에서 안 빠짐 | ____ |
| ____ (두 사람이 하나 더) | ____ | ____ |

- 확인한 사람: ____ / 날짜: ____ / 러너 커밋: ____

## 3. 실행 기록

- 첫 실행 명령: `node evals/run_evals.ts --change "첫 베이스라인" --golden "47/47 passed"`
- 실행ID: ____
