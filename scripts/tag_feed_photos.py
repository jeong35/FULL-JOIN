"""
피드 사진 일괄 태깅 → data/seed/style_images.jsonl 만들기 (SPEC 5절 '데이터 보관 (11/4)' 형식)

하는 일
  feed_photos/ 의 사진(IMG-번호.jpg/png)과 출처 표(feed_photos/meta.csv)를 읽고,
  사진마다 AI 태깅을 한 번 돌려(구조화 출력, 스파이크와 같은 방식)
  data/seed/style_images.jsonl 에 한 줄에 사진 1장씩 정리한다.
  이 파일을 정인이 DB(style_images · style_image_items)에 한 번에 넣는다.
  사진 원본은 저장소에 올리지 않는다(feed_photos/ 는 .gitignore). JSONL에는 경로와 태그만 들어간다.

준비 (한 번만)
  1) python3 -m pip install openai jsonschema
  2) FULL-JOIN 폴더의 .env 에 아래 두 줄 (.env 는 GitHub에 안 올라감)
       OPENAI_API_KEY=sk-...
       OPENAI_MODEL=gpt-4.1-mini        # 스파이크에서 통과한 모델. 생략하면 이 값
  3) 스커트 핏(프롬프트 v7)이 든 스키마가 필요하다. 정인의 PR #1이 main에 합쳐졌으면 그대로,
     아직이면 --from-branch origin/codex/server-mvp-1104 를 붙여 그 브랜치의 스키마·프롬프트를 읽는다
     (git show 로 읽기만 하고 브랜치를 바꾸지 않는다).
  4) feed_photos/meta.csv — 구글 시트를 CSV로 내려받은 것. 열 이름은 아래 영어 이름이나
     한국어 이름(번호·스타일·출처·쇼핑몰·상품명·상품 링크·허락 상태 등) 둘 다 알아본다:
       id,style,source,source_url,shop,product_name,product_url,permission
     꼭 있어야 하는 열은 id·style 뿐. 없으면 이렇게 채운다:
       source → 쇼핑몰 / permission → 미요청 / 링크 열이 하나면 사진·상품 링크 둘 다에
       shop 이 없으면 상품명의 첫 단어(예: '퍼빗 퍼 니트' → 퍼빗)
     예) IMG-1,미니멀,쇼핑몰,https://...,○○몰,울 블렌드 코트,https://...,요청함
     - style: 팀이 정한 스타일 1~2개. 두 개면 "미니멀/청순" 처럼 / 로 구분
     - source: 쇼핑몰 / 인플루언서 / 연예인 / 자체_촬영
     - permission: 미요청 / 요청함 / 허락 / 필요 없음
     - shop, product_name, product_url, source_url 은 없으면 비워 둔다
  (선택) 캡션이 있으면 사진과 같은 이름의 .txt 파일(IMG-1.txt)에 넣는다.

실행 (FULL-JOIN 폴더에서)
  먼저 점검만:   python3 scripts/tag_feed_photos.py --check
  전체 태깅:     python3 scripts/tag_feed_photos.py
  PR #1 전:      python3 scripts/tag_feed_photos.py --from-branch origin/codex/server-mvp-1104
  일부만:        python3 scripts/tag_feed_photos.py --only IMG-1 IMG-2
  다시 태깅:     python3 scripts/tag_feed_photos.py --only IMG-3 --redo
  이미 태깅한 사진은 건너뛰므로, 중간에 멈춰도 다시 실행하면 이어서 한다.

결과
  data/seed/style_images.jsonl   (번호 순서로 정렬, 저장소에 커밋)
  화면에 사진별 결과 · 옷이 없는 사진(넣지 않음) · 실패 · 모델과 팀의 스타일이 다른 사진 요약
"""
import argparse, base64, csv, datetime, json, mimetypes, os, re, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "src/fulljoin/schemas/style_image.schema.json"
PROMPT_PATH = ROOT / "src/fulljoin/prompts/parse_query.md"
PHOTO_DIR = ROOT / "feed_photos"
META_PATH = PHOTO_DIR / "meta.csv"
OUT_PATH = ROOT / "data/seed/style_images.jsonl"
NO_CLOTHES_PATH = PHOTO_DIR / "tagging_no_clothes.txt"  # 옷이 없다고 나온 사진 (다시 실행할 때 건너뜀)

STYLES = ["캐주얼", "미니멀", "러블리", "청순", "엘레강스", "시크", "스트릿", "레트로", "프레피", "스포티", "글램"]
SOURCES = ["쇼핑몰", "인플루언서", "연예인", "자체_촬영"]
PERMISSIONS = ["미요청", "요청함", "허락", "필요 없음"]
META_COLUMNS = ["id", "style", "source", "source_url", "shop", "product_name", "product_url", "permission"]
COLUMN_ALIASES = {  # 시트 열 이름 → 스크립트 이름 (띄어쓰기·대소문자 무시)
    "id": ["id", "번호", "사진번호", "사진id", "이미지번호", "photoid"],
    "style": ["style", "스타일", "styles"],
    "source": ["source", "출처구분", "출처종류", "출처"],
    "source_url": ["source_url", "sourceurl", "사진출처링크", "출처링크", "사진링크", "출처url"],
    "shop": ["shop", "쇼핑몰", "쇼핑몰명", "쇼핑몰이름", "브랜드", "brand", "mall"],
    "product_name": ["product_name", "productname", "상품명", "상품이름", "상품", "제품명"],
    "product_url": ["product_url", "producturl", "상품링크", "상품url", "링크", "url", "link"],
    "permission": ["permission", "허락상태", "허락", "허락여부", "permission_status"],
}
REQUIRED_COLUMNS = ["id", "style"]
FROM_REF = None  # --from-branch 로 정하면 스키마·프롬프트를 그 브랜치에서 읽는다
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}
KST = datetime.timezone(datetime.timedelta(hours=9))
PRICE_PER_1M = {"gpt-4.1-mini": (0.40, 1.60), "gpt-6-luna": (0.10, 0.50)}  # (입력, 출력) 달러 — 대략치, 정확한 금액은 OpenAI 대시보드 Usage


def fail(msg):
    sys.exit("멈춤: " + msg)


def load_dotenv():
    """FULL-JOIN/.env 의 KEY=VALUE 줄을 환경변수로 읽는다 (이미 설정된 값은 그대로 둔다)."""
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.split(" #", 1)[0].strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), value)


def id_number(photo_id):
    m = re.fullmatch(r"IMG-(\d+)", (photo_id or "").strip(), re.I)
    return int(m.group(1)) if m else None


def canon_id(photo_id):
    """IMG-48 · IMG-048 · img-048 을 모두 IMG-048 로 맞춘다."""
    n = id_number(photo_id)
    return f"IMG-{n:03d}" if n is not None else None


def read_repo_text(path):
    """저장소 파일을 읽는다. --from-branch 를 줬으면 그 브랜치의 파일을 git show 로 읽는다(읽기만)."""
    if not FROM_REF:
        return path.read_text(encoding="utf-8")
    rel = path.relative_to(ROOT).as_posix()
    res = subprocess.run(["git", "--no-optional-locks", "show", f"{FROM_REF}:{rel}"], cwd=ROOT,
                         capture_output=True)
    if res.returncode != 0:
        fail(f"{FROM_REF} 에서 {rel} 을 못 읽었어요. 'git fetch' 를 한 번 하고 다시 해 보세요. ({res.stderr.decode(errors='ignore').strip()[:120]})")
    return res.stdout.decode("utf-8")


def load_prompt():
    text = read_repo_text(PROMPT_PATH)
    lines = text.splitlines()
    start = lines.index("<!-- prompt:start -->")
    end = lines.index("<!-- prompt:end -->")
    prompt = "\n".join(lines[start + 1:end]).strip()
    versions = [int(v) for v in re.findall(r"\| prompt_version \| (\d+) \|", text)]
    versions += [int(v) for v in re.findall(r"^- v(\d+) \(", text, re.M)]  # 변경 이력 줄
    return prompt, (str(max(versions)) if versions else "?")


def slot_kind_map(prompt):
    table = {}
    for slot, kinds in re.findall(r"^\s+- (상의|하의|원피스|아우터|신발|가방): \[(.+?)\]", prompt, re.M):
        table[slot] = {k.strip() for k in kinds.split(",")}
    return table


def find_photos():
    photos = {}
    if not PHOTO_DIR.is_dir():
        fail(f"{PHOTO_DIR.relative_to(ROOT)} 폴더가 없어요.")
    for p in PHOTO_DIR.iterdir():
        if p.suffix.lower() not in IMAGE_EXT or not p.is_file():
            continue
        pid = canon_id(p.stem)
        if pid is None:
            print(f"  건너뜀: {p.name} — 이름이 IMG-번호 형식이 아니에요")
            continue
        if pid in photos:
            fail(f"{pid} 사진이 두 개예요: {photos[pid].name}, {p.name}")
        photos[pid] = p
    return photos


def read_meta(photo_ids=None):
    if not META_PATH.exists():
        fail(f"{META_PATH.relative_to(ROOT)} 가 없어요. 구글 시트를 CSV로 내려받아(파일 → 다운로드 → CSV) 이 이름으로 넣어 주세요.")
    with META_PATH.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        norm = lambda h: re.sub(r"[\s_\-()]", "", (h or "").lower())
        colmap, used = {}, set()
        for key in META_COLUMNS:
            for h in headers:
                if h not in used and norm(h) in {norm(a) for a in COLUMN_ALIASES[key]}:
                    colmap[key] = h
                    used.add(h)
                    break
        missing = [c for c in REQUIRED_COLUMNS if c not in colmap]
        if missing:
            fail(f"meta.csv 첫 줄에서 {', '.join(missing)} 열을 못 찾았어요. 지금 열: {headers}")
        filled = []
        if "source" not in colmap: filled.append("source → 전부 '쇼핑몰'")
        if "permission" not in colmap: filled.append("permission → 전부 '미요청'")
        if "source_url" not in colmap and "product_url" in colmap: filled.append(f"사진 링크 → '{colmap['product_url']}' 열")
        if "product_url" not in colmap and "source_url" in colmap: filled.append(f"상품 링크 → '{colmap['source_url']}' 열")
        if "shop" not in colmap: filled.append("shop → 상품명 첫 단어")
        print("  열 연결: " + ", ".join(f"{k}←'{v}'" for k, v in colmap.items()))
        if filled:
            print("  없는 열은 이렇게 채워요: " + "; ".join(filled))
        rows, problems = {}, []
        for line_no, raw in enumerate(reader, start=2):
            row = {k: (raw.get(colmap[k]) or "").strip() if k in colmap else "" for k in META_COLUMNS}
            if not row["id"] and not any(row.values()):
                continue
            if not row["source"]: row["source"] = "쇼핑몰"
            if not row["permission"]: row["permission"] = "미요청"
            if not row["source_url"]: row["source_url"] = row["product_url"]
            if not row["product_url"] and "product_url" not in colmap: row["product_url"] = row["source_url"]
            if not row["shop"] and "shop" not in colmap and row["product_name"]:
                row["shop"] = row["product_name"].split()[0]
            pid = canon_id(row["id"])
            where = f"meta.csv {line_no}줄({row['id'] or '번호 없음'})"
            if not row["style"] and not any(v for k, v in row.items() if k not in ("id", "source", "permission")):
                continue  # 번호만 있고 아직 안 채운 줄
            if pid is None:
                problems.append(f"{where}: id는 IMG-번호 형식이어야 해요")
                continue
            row["id"] = pid
            if photo_ids is not None and pid not in photo_ids:
                rows[pid] = None  # 사진이 아직 없는 줄 — 사진이 들어오면 그때 점검
                continue
            if rows.get(pid):
                problems.append(f"{where}: 같은 번호가 두 번 있어요")
            styles = [s.strip() for s in re.split(r"[/,·]", row["style"]) if s.strip()]
            if not 1 <= len(styles) <= 2 or len(set(styles)) != len(styles):
                problems.append(f"{where}: style은 1~2개여야 해요 (지금: '{row['style']}')")
            bad = [s for s in styles if s not in STYLES]
            if bad:
                problems.append(f"{where}: 목록에 없는 스타일 {bad} — 가능: {', '.join(STYLES)}")
            if row["source"] not in SOURCES:
                problems.append(f"{where}: source는 {' / '.join(SOURCES)} 중 하나 (지금: '{row['source']}')")
            if row["permission"] not in PERMISSIONS:
                problems.append(f"{where}: permission은 {' / '.join(PERMISSIONS)} 중 하나 (지금: '{row['permission']}')")
            for url_key in ("source_url", "product_url"):
                if row[url_key] and not row[url_key].startswith(("http://", "https://")):
                    problems.append(f"{where}: {url_key}는 http로 시작하는 주소여야 해요")
            row["styles"] = styles
            rows[pid] = row
    if problems:
        print("meta.csv에서 고칠 곳:")
        for p in problems:
            print("  - " + p)
        fail(f"{len(problems)}곳을 고친 뒤 다시 실행해 주세요.")
    return rows


def split_meta(meta):
    """사진이 있는 줄(점검 끝남)과 사진이 아직 없는 줄을 나눈다."""
    return {k: v for k, v in meta.items() if v}, sorted((k for k, v in meta.items() if not v), key=id_number)


def read_existing():
    done = {}
    if OUT_PATH.exists():
        for line_no, line in enumerate(OUT_PATH.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.strip():
                continue
            try:
                rec = json.loads(line)
                done[rec["id"]] = rec
            except (json.JSONDecodeError, KeyError):
                fail(f"{OUT_PATH.relative_to(ROOT)} {line_no}줄을 읽을 수 없어요. 그 줄을 지우고 다시 실행해 주세요.")
    return done


def read_no_clothes():
    if not NO_CLOTHES_PATH.exists():
        return set()
    return {l.strip() for l in NO_CLOTHES_PATH.read_text(encoding="utf-8").splitlines() if l.strip()}


def write_no_clothes(ids):
    NO_CLOTHES_PATH.write_text("".join(i + "\n" for i in sorted(ids, key=id_number)), encoding="utf-8")


def write_all(records):
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    ordered = sorted(records.values(), key=lambda r: id_number(r["id"]))
    tmp = OUT_PATH.with_suffix(".jsonl.tmp")
    tmp.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in ordered), encoding="utf-8")
    tmp.replace(OUT_PATH)


def to_data_url(path):
    mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def tag_one(client, model, prompt, api_schema, validator, pairs, photo):
    caption_file = photo.with_suffix(".txt")
    caption = caption_file.read_text(encoding="utf-8").strip() if caption_file.exists() else ""
    user_content = [{"type": "input_image", "image_url": to_data_url(photo)},
                    {"type": "input_text", "text": f"<caption>{caption}</caption>" if caption else "캡션 없음"}]
    resp = client.responses.create(
        model=model,
        max_output_tokens=2000,
        input=[{"role": "system", "content": prompt}, {"role": "user", "content": user_content}],
        text={"format": {"type": "json_schema", "name": "style_image_analysis", "schema": api_schema, "strict": True}},
    )
    usage = getattr(resp, "usage", None)
    tokens = (getattr(usage, "input_tokens", 0) or 0, getattr(usage, "output_tokens", 0) or 0)
    data = json.loads(resp.output_text)
    errors = [f"{'/'.join(map(str, e.path)) or '(전체)'}: {e.message}" for e in validator.iter_errors(data)]
    if errors:
        raise ValueError("목록 밖 값 · 형식 오류 → " + "; ".join(errors[:3]))
    notes = []
    for i, it in enumerate(data.get("items", [])):
        if it.get("slot") in pairs and it.get("kind") not in pairs[it["slot"]]:
            notes.append(f"{i + 1}번 옷 {it['slot']}-{it['kind']} 짝이 안 맞음")
    return data, notes, tokens


def build_record(photo_id, photo, meta, data, model, prompt_version, uploaded_at):
    items = [{"item_id": f"{photo_id}-{i + 1}", **item} for i, item in enumerate(data.get("items", []))]
    return {
        "id": photo_id,
        "image_path": f"feed/{photo.name}",
        "source": meta["source"],
        "source_url": meta["source_url"] or None,
        "shop": meta["shop"] or None,
        "product_name": meta["product_name"] or None,
        "product_url": meta["product_url"] or None,
        "permission": meta["permission"],
        "uploaded_at": uploaded_at,
        "style": meta["styles"],
        "items": items,
        "tagging": {"model": model, "prompt_version": prompt_version,
                    "tagged_at": datetime.datetime.now(KST).isoformat(timespec="seconds"),
                    "model_style": data.get("style", [])},
    }


def main():
    parser = argparse.ArgumentParser(description="피드 사진 일괄 태깅 → data/seed/style_images.jsonl")
    parser.add_argument("--check", action="store_true", help="AI를 부르지 않고 사진·표·설정만 점검")
    parser.add_argument("--only", nargs="+", metavar="IMG-번호", help="이 사진만 처리")
    parser.add_argument("--redo", action="store_true", help="이미 태깅한 사진도 다시 태깅")
    parser.add_argument("--from-branch", metavar="REF", help="스키마·프롬프트를 이 브랜치에서 읽기 (예: origin/codex/server-mvp-1104)")
    args = parser.parse_args()
    global FROM_REF
    FROM_REF = args.from_branch
    if args.only:
        args.only = [canon_id(x) or x for x in args.only]

    load_dotenv()
    print("1) 사진과 출처 표 확인")
    photos = find_photos()
    meta, no_photo = split_meta(read_meta(set(photos)))
    no_meta = sorted(set(photos) - set(meta), key=id_number)
    if no_meta:
        print(f"  표에 없는 사진 {len(no_meta)}장 (이번엔 건너뜀): {', '.join(no_meta)}")
    if no_photo:
        shown = ", ".join(no_photo) if len(no_photo) <= 12 else f"{no_photo[0]} ~ {no_photo[-1]}"
        print(f"  사진이 아직 없는 표 줄 {len(no_photo)}개 (사진이 들어오면 그때 태깅): {shown}")
    targets = sorted(set(photos) & set(meta), key=id_number)
    if args.only:
        unknown = [p for p in args.only if p not in targets]
        if unknown:
            fail(f"사진과 표에 둘 다 있는 번호만 고를 수 있어요: {', '.join(unknown)}")
        targets = [p for p in targets if p in args.only]
    existing = read_existing()
    skipped = read_no_clothes()
    todo = [p for p in targets if args.redo or (p not in existing and (p not in skipped or args.only))]
    if skipped and not args.redo:
        print(f"  옷이 없다고 나와 건너뛰는 사진 {len(skipped)}장 (다시 하려면 --only 번호): {', '.join(sorted(skipped, key=id_number))}")
    print(f"  사진 {len(photos)}장 · 사진 있는 표 줄 {len(meta)}개 · 이미 태깅 {len([p for p in targets if p in existing])}장 · 이번에 할 것 {len(todo)}장")

    print("2) 프롬프트·스키마·설정 확인")
    prompt, prompt_version = load_prompt()
    pairs = slot_kind_map(prompt)
    schema = json.loads(read_repo_text(SCHEMA_PATH))
    skirt_fit = "A라인" in json.dumps(schema, ensure_ascii=False)
    print(f"  prompt_version {prompt_version} · 스커트 핏 {'있음' if skirt_fit else '없음'}" + (f" · {FROM_REF} 에서 읽음" if FROM_REF else ""))
    if not skirt_fit:
        print("  주의: 스키마에 스커트 핏(A라인·H라인·플레어)이 없어요. PR #1이 합쳐질 때까지는 --from-branch origin/codex/server-mvp-1104 를 붙여 실행하세요.")
    model = os.environ.get("OPENAI_MODEL") or "gpt-4.1-mini"
    has_key = bool(os.environ.get("OPENAI_API_KEY"))
    print(f"  모델 {model} · API 키 {'있음' if has_key else '없음'}")

    if args.check:
        print("\n점검 끝 (AI는 부르지 않았어요).")
        return
    if not todo:
        print("\n새로 태깅할 사진이 없어요.")
        return
    if not skirt_fit:
        fail("스커트 핏이 없는 스키마로는 태깅하지 않아요. --from-branch origin/codex/server-mvp-1104 를 붙여 다시 실행해 주세요.")
    if not has_key:
        fail(".env 에 OPENAI_API_KEY=... 를 넣어 주세요.")
    try:
        from jsonschema import Draft202012Validator
        from openai import OpenAI
    except ImportError:
        fail("python3 -m pip install openai jsonschema 를 먼저 실행해 주세요.")

    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)
    api_schema = {k: v for k, v in schema.items() if k not in ("$schema", "title")}
    client = OpenAI(max_retries=2, timeout=90.0)
    uploaded_at = datetime.datetime.now(KST).isoformat(timespec="seconds")

    print(f"3) 태깅 시작 — {len(todo)}장")
    records = dict(existing)
    no_clothes, failed, style_diff = [], [], []
    tok_in = tok_out = 0
    for n, pid in enumerate(todo, start=1):
        t0 = time.perf_counter()
        try:
            data, notes, (t_in, t_out) = tag_one(client, model, prompt, api_schema, validator, pairs, photos[pid])
            tok_in += t_in
            tok_out += t_out
        except Exception as e:  # API 오류, 형식 오류 — 이 사진만 실패로 두고 계속
            msg = str(e).replace(os.environ.get("OPENAI_API_KEY", "") or "\0", "[KEY]")
            failed.append(f"{pid}: {msg[:200]}")
            print(f"  [{n}/{len(todo)}] {pid} 실패 — {msg[:120]}")
            continue
        sec = round(time.perf_counter() - t0, 1)
        if not data.get("items"):
            no_clothes.append(pid)
            records.pop(pid, None)
            skipped.add(pid)
            write_no_clothes(skipped)
            print(f"  [{n}/{len(todo)}] {pid} 옷을 찾지 못함 — 피드에 넣지 않아요 ({sec}초)")
        else:
            rec = build_record(pid, photos[pid], meta[pid], data, model, prompt_version,
                               existing.get(pid, {}).get("uploaded_at", uploaded_at))
            records[pid] = rec
            if pid in skipped:
                skipped.discard(pid)
                write_no_clothes(skipped)
            kinds = ", ".join(f"{it['kind']}({it['color'] or '색?'})" for it in data["items"])
            print(f"  [{n}/{len(todo)}] {pid} 옷 {len(data['items'])}벌: {kinds} ({sec}초)" + (f" · 참고: {'; '.join(notes)}" if notes else ""))
            model_styles = set(data.get("style", []))
            if model_styles and not model_styles & set(meta[pid]["styles"]):
                style_diff.append(f"{pid}: 팀 {'/'.join(meta[pid]['styles'])} · 모델 {'/'.join(sorted(model_styles))}")
        write_all(records)  # 한 장마다 저장 — 중간에 멈춰도 이어서 할 수 있게

    print(f"\n끝: {OUT_PATH.relative_to(ROOT)} 에 {len(records)}장")
    if tok_in or tok_out:
        line = f"  이번에 쓴 토큰: 입력 {tok_in:,} · 출력 {tok_out:,}"
        if model in PRICE_PER_1M:
            pin, pout = PRICE_PER_1M[model]
            usd = tok_in / 1e6 * pin + tok_out / 1e6 * pout
            line += f" → 약 ${usd:.3f} (약 {usd * 1400:,.0f}원, 정확한 금액은 OpenAI 대시보드 Usage)"
        print(line)
    if no_clothes:
        print(f"  옷을 못 찾아 뺀 사진 {len(no_clothes)}장: {', '.join(no_clothes)}")
    if style_diff:
        print(f"  팀 스타일과 모델 스타일이 겹치지 않는 사진 {len(style_diff)}장 (팀 값을 씀, 한번 봐 주세요):")
        for s in style_diff:
            print("    - " + s)
    if failed:
        print(f"  실패 {len(failed)}장 — 다시 실행하면 이 사진들만 다시 해요:")
        for s in failed:
            print("    - " + s)
        sys.exit(1)


if __name__ == "__main__":
    main()
