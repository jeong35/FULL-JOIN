"""
스파이크: 구조화 출력 (docs/spikes/structured_output.md)

가정: OpenAI API(Structured Outputs strict 모드)가 피드 사진을 보고
      src/fulljoin/schemas/style_image.schema.json 형식(목록 값만)으로 결과를 돌려준다.
성공 조건: 사진 3장 모두 파싱 오류 없음 + 목록 밖 값 없음

준비
  pip install openai jsonschema
  OPENAI_API_KEY는 터미널에서 숨김 입력으로 설정한다 (키를 명령문에 쓰지 않는다).
  export OPENAI_MODEL=사용할_모델_ID   # 사진 입력을 지원하는 모델
  사진 3장을 FULL-JOIN/spike_photos/ 에 넣는다 (이 폴더는 .gitignore — 저장소에 올리지 않음)
    influencer.jpeg, personal.jpeg, shopping_mall.png
  캡션 파일이 있으면 이미지와 같은 이름의 .txt 파일을 사용하고, 없으면 생략한다.

실행 (FULL-JOIN 폴더에서)
  python3 docs/spikes/run_structured_output.py
  1장 연결 확인: --images influencer.jpeg
  나머지 2장: --images personal.jpeg shopping_mall.png

결과
  화면에 사진별 판정 출력
  docs/spikes/results/날짜_시각_structured_output.json 에 기록 (사진 원본은 저장하지 않고 파일 이름만)
"""
import argparse, base64, datetime, json, mimetypes, os, re, sys, time
from pathlib import Path

from jsonschema import Draft202012Validator
from openai import OpenAI

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = ROOT / "src/fulljoin/schemas/style_image.schema.json"
PROMPT_PATH = ROOT / "src/fulljoin/prompts/parse_query.md"
PHOTO_DIR = ROOT / "spike_photos"
RESULT_DIR = ROOT / "docs/spikes/results"


def load_prompt():
    text = PROMPT_PATH.read_text(encoding="utf-8")
    lines = text.splitlines()
    start = lines.index("<!-- prompt:start -->")  # 마커만 있는 줄 기준
    end = lines.index("<!-- prompt:end -->")
    prompt = "\n".join(lines[start + 1:end]).strip()
    m = re.search(r"\| prompt_version \| (\d+) \|", text)
    return prompt, (m.group(1) if m else "?")


def slot_kind_map(prompt):
    """프롬프트의 '  - 상의: [...]' 줄에서 부위별 종류 목록을 읽는다 (후처리 짝 검사용)."""
    table = {}
    for slot, kinds in re.findall(r"^\s+- (상의|하의|원피스|아우터|신발|가방): \[(.+?)\]", prompt, re.M):
        table[slot] = {k.strip() for k in kinds.split(",")}
    return table


def to_data_url(path):
    mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def main():
    parser = argparse.ArgumentParser(description="구조화 출력 스파이크 (선택 실행도 전체 성공 조건은 3장)")
    parser.add_argument("--images", nargs="+", help="spike_photos 안의 실제 파일명")
    args = parser.parse_args()
    model = os.environ.get("OPENAI_MODEL")
    if not model:
        sys.exit("OPENAI_MODEL 환경변수를 정해 주세요 (사진 입력을 지원하는 모델 ID).")
    photos = sorted(p for p in PHOTO_DIR.glob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"})
    expected = {"influencer.jpeg", "personal.jpeg", "shopping_mall.png"}
    if {p.name for p in photos} != expected or any(not p.is_file() or p.stat().st_size == 0 for p in photos):
        sys.exit(f"사진 3장의 경로를 확인해 주세요: {PHOTO_DIR} / {sorted(expected)}")
    if args.images:
        if len(set(args.images)) != len(args.images) or not set(args.images) <= expected:
            sys.exit("--images에는 중복 없이 준비된 실제 파일명만 지정해 주세요.")
        photos = [p for p in photos if p.name in args.images]
    for photo in photos:
        print(f"입력 확인: {photo.relative_to(ROOT)} · {mimetypes.guess_type(photo.name)[0]}")

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)
    api_schema = {k: v for k, v in schema.items() if k not in ("$schema", "title")}  # API에는 메타 키 제외
    prompt, prompt_version = load_prompt()
    pairs = slot_kind_map(prompt)
    if not os.environ.get("OPENAI_API_KEY"):
        sys.exit("OPENAI_API_KEY 환경변수를 터미널에서 설정해 주세요.")
    client = OpenAI(max_retries=0, timeout=60.0)

    records = []
    for photo in photos:
        caption_file = photo.with_suffix(".txt")
        caption = caption_file.read_text(encoding="utf-8").strip() if caption_file.exists() else ""
        user_content = [{"type": "input_image", "image_url": to_data_url(photo)}]
        user_content.append({"type": "input_text", "text": f"<caption>{caption}</caption>" if caption else "캡션 없음"})

        rec = {"photo_id": photo.name, "model": model, "prompt_version": prompt_version}
        t0 = time.perf_counter()
        try:
            resp = client.responses.create(
                model=model,
                max_output_tokens=2000,
                input=[{"role": "system", "content": prompt}, {"role": "user", "content": user_content}],
                text={"format": {"type": "json_schema", "name": "style_image_analysis", "schema": api_schema, "strict": True}},
            )
            rec["latency_sec"] = round(time.perf_counter() - t0, 2)
            usage = getattr(resp, "usage", None)
            rec["input_tokens"] = getattr(usage, "input_tokens", None)
            rec["output_tokens"] = getattr(usage, "output_tokens", None)
            raw = resp.output_text
            rec["raw"] = raw
        except Exception as e:  # 스키마 거절(400) 등
            error = str(e).replace(os.environ["OPENAI_API_KEY"], "[REDACTED]")
            rec.update(api_error=error, latency_sec=round(time.perf_counter() - t0, 2), parse_ok=False, schema_ok=False, pass_=False)
            records.append(rec)
            print(f"[{photo.name}] API 오류: {error}")
            continue

        # 1) 파싱
        try:
            data = json.loads(raw)
            rec["parse_ok"] = True
        except json.JSONDecodeError as e:
            rec.update(parse_ok=False, schema_ok=False, pass_=False, parse_error=str(e))
            records.append(rec)
            print(f"[{photo.name}] 파싱 실패")
            continue

        # 2) 스키마 검증 (목록 밖 값·빠진 키·추가 키)
        errors = [f"{'/'.join(map(str, e.path))}: {e.message}" for e in validator.iter_errors(data)]
        rec["schema_ok"] = not errors
        rec["schema_errors"] = errors
        rec["output"] = data
        if errors:
            rec["pass_"] = False
            records.append(rec)
            print(f"[{photo.name}] 스키마 실패 · {rec['latency_sec']}초 · {errors}")
            continue

        # 3) 후처리 점검 (판정에는 넣지 않고 기록만 — 실패 모드 6, style 중복)
        notes = []
        try:
            styles = data.get("style", [])
            if len(styles) != len(set(styles)):
                notes.append("style 중복")
            for i, it in enumerate(data.get("items", [])):
                slot, kind = it.get("slot"), it.get("kind")
                if slot in pairs and kind not in pairs[slot]:
                    notes.append(f"items/{i}: {slot}-{kind} 짝 안 맞음")
        except Exception as e:
            rec.update(postcheck_error=str(e), pass_=False)
            records.append(rec)
            print(f"[{photo.name}] 후처리 오류: {e}")
            continue
        rec["postcheck_notes"] = notes
        rec["pass_"] = rec["parse_ok"] and rec["schema_ok"]
        rec["output"] = data
        records.append(rec)
        print(f"[{photo.name}] {'통과' if rec['pass_'] else '실패'} · {rec['latency_sec']}초 · "
              f"토큰 {rec['input_tokens']}/{rec['output_tokens']} · 오류 {len(errors)} · 참고 {notes or '-'}")

    passed = sum(1 for r in records if r.get("pass_"))
    verdict = "합격" if passed == len(records) == 3 else ("부분 실행" if len(records) != 3 else "미달")
    if len(records) != 3:
        print(f"주의: 사진이 {len(records)}장입니다. 성공 조건은 3장 기준이에요.")
    print(f"\n{passed}/{len(records)}장 통과 → 판정: {verdict} (성공 조건: 3장 모두 파싱 오류 없음 + 목록 밖 값 없음)")

    RESULT_DIR.mkdir(parents=True, exist_ok=True)
    out = RESULT_DIR / f"{datetime.datetime.now().strftime('%Y-%m-%d_%H-%M-%S-%f')}_structured_output.json"
    out.write_text(json.dumps({"summary": {"passed": passed, "total": len(records), "verdict": verdict},
                               "records": records}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"기록: {out.relative_to(ROOT)}")
    if passed != len(records):
        sys.exit(1)


if __name__ == "__main__":
    main()
