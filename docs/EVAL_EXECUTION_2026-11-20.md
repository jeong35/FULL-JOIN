# 2026-11-20 MATCH-02/03·CHAT-01 평가 기록

## 비-live baseline 비교

저장소의 승인된 `evalset.jsonl`, fixtures, targets를 수정하지 않고 결과만 `/private/tmp/odit-evals-20261120`에 기록했다.

```bash
node evals/run_evals.ts \
  --change "cosine A bucket ranking and grounded chat integration" \
  --golden "47/47 passed" \
  --results-dir /private/tmp/odit-evals-20261120
```

| 지표 | 2026-11-17 baseline | 2026-11-20 실행 | 결과 |
|---|---:|---:|---|
| 태깅 정확도 | 84/93 = 90.3% | 84/93 = 90.3% | 동일 |
| 형식 준수 | 12/12 = 100% | 12/12 = 100% | 동일 |
| gap 일치 | 11/11 = 100% | 11/11 = 100% | 동일, AC9 판정 보존 |
| 전체 | 실행 16, 통과 9, 미실행 12 | 실행 16, 통과 9, 미실행 12 | 동일 |

결과의 `commit`은 working tree 기준 SHA `b53b6d6`을 표시한다. 이번 변경은 미커밋 상태이므로 평가 설명과 파일 위치를 함께 기록해야 한다. eval dataset hash는 `3e697f4`다.

## 추가 로컬 회귀

- cosine 단위·통합 19/19 통과
- AC9 실제 버킷 밖 후보가 `match_metadata`로 새지 않음
- 승인된 대체 종류 버킷 내부만 cosine 정렬
- 데님팬츠↔슬랙스는 대체 관계가 아님
- 빈 옷장 상품 검색은 가능, 빈 옷장 보유 코디는 등록 안내
- 챗이 반환한 보유 ID는 현재 옷장과 공통 비교/승인 대체 결과의 부분집합

## 미실행 live 12건

### live tagging 5건

`n1`, `n2`, `b1`, `b2`, `i1`이다. 현재 runner에는 `live_tagging` 실행 경로가 구현되지 않아 API key만 넣어도 실행되지 않는다.

필요 조건:

1. 팀 소유 또는 사용 허락된 평가 이미지 5개의 접근 경로
2. 운영 데이터와 분리된 staging Storage/DB
3. 고정 모델 snapshot, prompt/schema version, `OPENAI_API_KEY`
4. 이미지 업로드→분석→결과 수집→평가 데이터 삭제 절차
5. 호출별 usage/latency 기록

### live chat 7건

`i2`, `c1`, `c2`, `c3`, `h1`, `h2`, `o1`이다.

필요 조건:

1. 변경 코드가 배포된 staging `EVAL_API_BASE`
2. 평가용 style image가 staging에 존재하고 분석·게시돼 있음
3. runner가 만드는 `eval-*` 사용자, wardrobe, heart를 테스트 후 정리하는 절차
4. judge용 `OPENAI_API_KEY`와 고정 `EVAL_JUDGE_MODEL`
5. 운영 DB를 변경하지 않는 격리 환경

현재 승인된 runner는 모든 live chat 응답에 `answer_source=openai`를 요구한다. CHAT-01은 보유 옷·상품 탐색·사진 질문을 의도적으로 `answer_source=grounded`로 바꿔 LLM 환각 경로를 없앴다. 따라서 기존 기준을 임의로 고치지 않은 현재 상태에서는 5개 grounded 케이스가 코드 품질과 무관하게 runner 오류가 된다. 팀이 “grounded 답변도 동일 judge 기준으로 평가할지”를 승인한 뒤 별도 eval version으로 갱신해야 한다. 이번 작업에서는 승인된 평가 기준을 변경하지 않았고 live 호출도 하지 않았다.

## 호출 수와 비용 산정

현재 코드 기준 예상 모델 호출:

- live tagging: 5회 vision 요청
- live chat 제품 요청: 7개 API 요청 중 grounded intent는 0회 LLM, 일반으로 분류되는 케이스만 최대 2회 LLM
- judge: 승인 후 7개 답변을 채점하면 7회
- 총 모델 호출 예상: 최대 14회(5 tagging + 2 chat + 7 judge). evaluator가 예전처럼 chat 7건 모두 LLM을 요구하면 최대 19회지만 현재 CHAT-01 설계와 충돌한다.

코드의 기본 모델 `gpt-4.1-mini-2025-04-14`는 2026-11-20 공식 문서상 deprecated이며 표준 가격은 input $0.40/1M tokens, cached input $0.10/1M, output $1.60/1M이다. 이미지 입력도 input token으로 과금된다.

- 공식 모델 문서: https://developers.openai.com/api/docs/models/gpt-4.1-mini
- 공식 가격: https://developers.openai.com/api/docs/pricing

정확 비용 공식:

```text
input_tokens × 0.40 / 1,000,000
+ cached_input_tokens × 0.10 / 1,000,000
+ output_tokens × 1.60 / 1,000,000
```

이미지 크기, 실제 context, judge 출력 길이가 확정되지 않아 총액은 추측하지 않는다. 참고로 앱 코드의 출력 상한만 모두 사용한다고 가정하면 tagging 5건은 최대 10,000 output tokens($0.016), 일반 chat 2건은 최대 1,000 output tokens($0.0016)이다. 입력·이미지·judge 비용은 별도다. 실행 직전 deprecated snapshot 사용 가능 여부와 가격을 공식 문서에서 다시 확인해야 한다.
