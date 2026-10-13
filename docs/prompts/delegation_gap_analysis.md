# 갭 분석 위임 프롬프트와 검증 루프 기록

> 상태: **골든 케이스 팀 승인, 기능 구현·자동 검증 및 최초 push 완료, 테스트 하니스 최종 사람 리뷰 대기**. 2026-10-13에 7개 기대값, `visibility=일부`의 일반 판정 및 실제 일치한 `wardrobe_item_ids`만 반환하는 원칙을 승인받았다. 최초 구현 커밋은 `232cbd2`이다.

## 1. 위임 대상 선정

- 첫 위임 기능: `src/fulljoin/gap_analysis.ts`의 `classifyGap(item, wardrobe)` — 사진 속 Item 하나를 옷장의 WardrobeItem 목록과 대조해 `gap_status`와 근거가 된 `wardrobe_item_ids`를 반환
- 사람이 직접 정할 것: 활용/비슷함/구매 판정 기준, 색 계열, 두 부위 중복 kind, 골든 케이스의 입력과 기대값, 최종 수용 여부
- 에이전트에 위임할 것: 승인된 기준을 TypeScript 함수로 구현하고 고정된 골든 테스트를 통과시키는 일
- 선정 이유: 입력과 출력이 작고 AC9에 결정적으로 정의되어 있어 첫 위임을 함수 하나로 한정할 수 있다. 네트워크·LLM 없이 반복 실행할 수 있다.
- 이번 기능에서 다루지 않는 것: 빈 옷장 상태의 화면(AC12), Outfit 생성(AC11), `visibility=판단불가`의 별도 정책(현재 미정), 이미지 태깅 정확도(evals 대상)

## 2. 테스트 하니스 위임 프롬프트

아래 내용은 이번 작업에서 테스트 하니스를 만들 때 사용한 요구사항을 재구성한 기록이다.

```text
tests/test_gap_analysis_golden.ts를 만들어줘.
- 목표: tests/harness/golden_cases.yaml을 읽어 cases의 각 항목을 독립 테스트로 실행한다.
- 케이스를 테스트 코드에 복사하지 말고 name을 테스트 id로 사용한다.
- 검사 키: expect_gap_status, expect_wardrobe_item_ids, must_not_use_wardrobe_item_ids.
- 기대 키가 없거나, 이름이 중복되거나, AC와 note가 비어 있으면 로더 검사에서 실패한다.
- 구현 파일이 없을 때 케이스 테스트만 skip하고 YAML 로더 검사는 항상 실행한다.
- src/ 아래는 수정하지 않는다.
```

### 사람이 확인한 항목

- 골든 케이스 7개의 기대를 현재 내용대로 실행하도록 승인했다.
- `expect_wardrobe_item_ids`에는 판정에 실제로 일치한 옷만 넣는다.
- `visibility=일부`인 Item은 현재 AC9와 동일하게 판정한다.
- `visibility=판단불가`의 별도 정책은 이번 함수 범위에서 정하지 않았다.
- `멀티`·`기타`·`null`에서 같은 slot·kind가 있으면 `비슷함`으로 둔다.
- 두 부위 중복 kind는 SPEC AC9의 카디건·후드집업·베스트·점프수트를 사용한다.

## 3. 기능 위임 프롬프트 원본

> 골든 케이스 승인 후 아래 범위로 구현했다.

```text
src/fulljoin/gap_analysis.ts의 classifyGap(item, wardrobe)를 구현해줘.
- 목표: 사진 속 Item 하나를 WardrobeItem 목록과 대조해 gap_status와 근거가 된 wardrobe_item_ids를 반환한다.
- 절대 규칙(AGENTS.md 3절, SPEC AC9): 같은 enum 어휘만 사용하고, 옷장에 없는 id를 만들지 않는다.
- 판단 규칙: docs/SPEC.md AC9의 같은 색=활용, 같은 색 계열=비슷함, 없으면=구매 규칙을 그대로 따른다. 카디건·후드집업·베스트·점프수트만 slot을 무시한다. visual_fit은 현재 갭 판정에 쓰지 않는다.
- 완료 기준: `npm run test:golden`에서 필수 골든 케이스 7개 전수 통과, skip 0건. 타입 오류와 린트 오류도 없어야 한다.
- tests/, tests/harness/golden_cases.yaml, fixture를 수정하지 말고 구현 파일만 고친다.
- 중단 조건: 2회 안에 통과하지 못하거나, AC9로 정해지지 않은 동작 또는 판정 기준 변경이 필요하면 구현을 멈추고 질문한다.
끝나면 실제 실행 결과와 각 골든 케이스를 왜 통과하는지 한 줄씩 설명해줘.
```

출처:

- 목표와 판정 규칙: `docs/SPEC.md` 6절 AC9
- 어휘와 불변 규칙: `AGENTS.md` 2~5절
- 실행 가능한 기대값: `tests/harness/golden_cases.yaml`
- 색·kind 목록: `src/fulljoin/schemas/style_image.schema.json`

## 4. 테스트 하니스 검증 기록

| 회차 | 결과 | 무엇이 문제였나 | 무엇을 고쳤나 |
|---|---|---|---|
| 1 | 미구현 상태: 보조 로더 1 passed, 골든 7 skipped | 구현 전이라 `classifyGap`이 없음 | 정상적인 미구현 상태인지 확인. 판정 기준은 변경하지 않음 |
| 2 | 통과 가능 확인: 8 passed, skipped 0 | — | AC9 규칙을 구현한 임시 코드로 모든 케이스가 실행·통과 가능한지 확인 |
| 3 | 판정 로직 제거 결함: 5 failed, 3 passed | 모든 입력을 `구매`로 반환 | 기대한 5개 케이스의 `gap_status` 단언문이 실패함을 확인 |
| 4 | 무관한 옷장 ID 포함 결함: 3 failed, 5 passed | 판정 상태는 유지하되 모든 옷장 ID를 근거로 반환 | 정확한 ID 목록 단언문이 실패하고, `w-loafer-multi` 같은 금지 ID를 검출함을 확인 |
| 5 | 임시 구현 제거: 보조 로더 1 passed, 골든 7 skipped | 기능 구현 전 상태로 복구 | `src/fulljoin/gap_analysis.ts` 제거, 테스트·골든 케이스 변경 없음 확인 |

실행 명령: `npm run test:golden`

테스트 노드: 골든 케이스 7개 + 로더 보조 검사 1개 = 8개.

결함 주입 중 테스트 파일과 기대값은 수정하지 않았다. 임시 구현은 검출 확인 후 제거했으며 기능 수용으로 보지 않는다.

## 5. 기능 위임 검증 루프

| 회차 | 골든 케이스 결과 | 보조 검사 | 문제 분류 | 수정 내용 |
|---|---:|---:|---|---|
| 1 | 7/7 passed, skipped 0, xfailed 0 | 로더 1/1 passed | 구현 완료 | `src/fulljoin/gap_analysis.ts` 구현. 테스트 기대값 변경 없음 |
| 2 | 7/7 passed, skipped 0, xfailed 0 | 로더 1/1 passed, 문법·strict 타입 검사 통과 | 테스트 타입 선언 보완 | 테스트 실행 로직과 단언문은 유지하고 구현 타입을 정적으로 연결 |

- 자동 검증 판단: 승인된 7개 케이스 전수 통과, skip·xfail 0건, Node 문법 검사와 `tsc --noEmit` 통과
- 사람의 최종 수용 판단: 테스트 하니스 최종 코드 리뷰 대기. 자동 검사 통과만으로 수용 처리하지 않는다.
- 승인 기준 해시: `golden_cases.yaml` = `0ab6e8c7a1a63c5f50e31bf55f2822f1665bdfad3337a2b9f46c144715f78d2c`
- 최종 테스트 파일 해시: `test_gap_analysis_golden.ts` = `c75383df8249574cda624a341cd047c4d715f6fbc08cf00ca06114edbfe31155`
- 최초 구현 커밋: `232cbd2` (`test: add AC9 gap analysis golden cases`)
- 실행 명령: `npm run check:syntax`, `npm run check:types`, `npm run test:golden`
- 수용 전 비교: `git diff -- tests/ tests/harness/golden_cases.yaml`

## 6. 에이전트 하니스

- 진입점: Codex는 저장소 루트의 `AGENTS.md`; Claude Code는 `CLAUDE.md`에서 `@AGENTS.md`를 불러온다.
- 허용 작업: 파일 읽기, `npm run test:golden`, 승인된 구현 파일 수정
- 확인이 필요한 작업: 테스트·골든 케이스·fixture 변경, 커밋, push, 외부 API 호출
- 판정 기준 보호: `AGENTS.md` 4절 1~3항. 수용 전 기준 커밋과 `tests/` 변경을 대조한다.
- 중단 조건: 2회 실패, 규칙 충돌, 미명세 발견, 판정 기준 변경 필요 시 원인과 선택지를 보고한다.
- 자동 수용 금지: 테스트 통과는 수용 조건일 뿐이며 최종 수용은 팀이 한다.
- 자체 검사: `npm run check:harness`가 `CLAUDE.md`의 `@AGENTS.md` 연결, 필수 규칙과 중단 조건, 승인 후보 테스트·골든 케이스 해시를 검사한다.
- 통합 검사: `npm run check`가 하니스 자체 검사, 문법 검사, strict 타입 검사, 골든 테스트를 순서대로 실행한다.
- CI 연결: `.github/workflows/verify.yml`이 push와 pull request마다 동일한 `npm run check`를 실행한다.

## 7. 팀 승인 체크리스트

- [x] 7개 케이스의 입력·기대값·AC9 근거를 확인했다.
- [x] `visibility=일부`의 현재 처리에 동의한다.
- [x] `expect_wardrobe_item_ids`는 판정에 실제 사용한 옷만 반환하는 것으로 확정했다.
- [x] 테스트 하니스의 검사 방향과 결함 주입 결과를 확인했다.
- [ ] 승인한 기준 커밋을 기록했다.
- [x] 위 기능 위임 프롬프트를 실제 사용본으로 확정했다.
- [ ] `tests/test_gap_analysis_golden.ts`의 로더·단언문·skip 조건을 사람이 직접 리뷰하고 최종 수용했다.
- [ ] 새 Claude Code 세션의 `/context`에서 `CLAUDE.md`와 `AGENTS.md`가 함께 로드됨을 확인했다.
