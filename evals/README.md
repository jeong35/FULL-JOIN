# evals — FULL JOIN

핵심 기능(사진 태깅, 옷장 대조 판정)이 품질 기준을 얼마나 충족하는지 숫자로 재는 폴더다.
설계와 결과 해석은 [`EVAL_DESIGN.md`](EVAL_DESIGN.md)에 있다. 이 파일은 길 안내만 한다.

| 파일 | 내용 |
|---|---|
| [`EVAL_DESIGN.md`](EVAL_DESIGN.md) | 지표와 합격선, 데이터셋 구성, 첫 베이스라인, 오류 분석, 개선 백로그 |
| [`evalset.jsonl`](evalset.jsonl) | 케이스 28개 (필수 21 + 챗봇 베타 7) |
| [`targets.json`](targets.json) | 합격선 |
| [`judge_prompt.md`](judge_prompt.md) | 챗봇 답변 채점 기준 (초안) |
| [`run_evals.ts`](run_evals.ts) | 러너 |
| [`export_fixtures.ts`](export_fixtures.ts) | 검수 기록에서 태깅 결과와 사람 정답을 뽑는 스크립트 |
| [`fixtures/tagging.jsonl`](fixtures/tagging.jsonl) | 저장된 태깅 결과와 사람 정답 (사진·상품 정보 없음) |
| [`results/`](results/) | 실행마다 결과 JSON 하나, `history.csv`에 한 줄 |

## 실행

```bash
npm ci
node --env-file-if-exists=.env evals/run_evals.ts --change "무엇을 바꿨는지" --golden "47/47 passed"
```

- 저장된 태깅 결과와 판정 규칙으로 재는 16개는 API 키 없이 실행된다.
- 챗봇 케이스 7개는 `--live-chat`과 `EVAL_API_BASE`가 있을 때만 실행된다. 없으면 "미실행"으로 기록한다.
- 미실행과 오류는 집계에서 빼지 않고 통과하지 못한 것으로 센다.

## 지금 상태 (2026-11-18)

- 28개 중 16개 실행, 12개 미실행(새 사진 태깅 5, 챗봇 7). 이유는 `EVAL_DESIGN.md` 5절.
- 태깅 정확도 90.3%, 형식 준수 100%, 판정 일치 100%.
- 이 문서의 10/13 초안(E1~E11 번호)은 `EVAL_DESIGN.md`로 대체했다. 초안에 있던 응답 시간과 재분석 호출 수는 아직 재지 않는다.
