"""옷 종류 그림 v7 (11/9) — v3 그림(gen_icons_v3.py)에 참고 그림에서 따고 손으로 다듬은 그림(traced_v4.json)을 덮어쓴다.
바지 6종·스커트 3종·야상 일부·가방 일부는 v3 그림을 그대로 쓴다. (파일 이름의 v3·v4는 처음 만든 때 이름이라 그대로 둔다.)
traced_v4.json은 trace_guide.py로 만든다(참고_옷종류가이드2.png · 참고_옷종류가이드.png가 필요하다).
사용: python3 gen_icons_v4.py icons.json   (그다음 python3 gen_ts.py icons.json ../../mobile/src/data/kindIcons.ts)
"""
import json
import sys
from pathlib import Path

from gen_icons_v3 import ICONS

HERE = Path(__file__).parent
traced = json.load(open(HERE / "traced_v4.json", encoding="utf-8"))
unknown = set(traced) - set(ICONS)
assert not unknown, unknown
ICONS.update(traced)

if __name__ == "__main__":
    json.dump(ICONS, open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(len(ICONS), "kinds,", len(traced), "from the reference drawing")
