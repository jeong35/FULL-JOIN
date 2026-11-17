"""icons_v12.json → mobile/src/data/kindIcons.ts
사용: python3 gen_ts.py icons_v12.json ../../mobile/src/data/kindIcons.ts

icons_v12.json은 옷 추가 시안(11/16, 옷추가_눌러보기_전체.html)에서 DB 종류 48개 그림만 뽑은 것이다.
예전 v7 그림(gen_icons_v4.py 결과)도 같은 모양의 json이라 이 스크립트로 그대로 바꿀 수 있다."""
import json
import sys

icons = json.load(open(sys.argv[1], encoding="utf-8"))
order = ['반소매티셔츠', '긴소매티셔츠', '민소매', '셔츠', '블라우스', '니트', '맨투맨', '후드', '카디건', '후드집업', '베스트',
         '데님팬츠', '슬랙스', '코튼팬츠', '조거팬츠', '숏팬츠', '레깅스', '미니스커트', '미디스커트', '롱스커트', '점프수트',
         '미니원피스', '미디원피스', '롱원피스', '재킷', '레더재킷', '데님재킷', '점퍼', '야상', '플리스', '트렌치코트', '코트',
         '숏패딩', '롱패딩', '경량패딩', '스니커즈', '로퍼', '플랫슈즈', '힐', '부츠', '샌들', '슬리퍼',
         '숄더백', '크로스백', '토트백', '백팩', '에코백', '클러치']
assert sorted(order) == sorted(icons), set(order) ^ set(icons)

# 꼭 있는 층(없으면 빈 목록)과 있을 때만 쓰는 층. 순서는 그리는 순서와 상관없다(KindIcon.tsx가 정한다).
REQUIRED = ("shapes", "details", "shade", "inner", "tops", "straps")
OPTIONAL = ("plain", "weave", "lining", "seams", "chains", "metals")
LAYERS = REQUIRED + ("dots",) + OPTIONAL


def J(arr):
    return ", ".join(json.dumps(x, ensure_ascii=False) for x in arr)


def dots(arr):
    return "[" + ", ".join(f"[{a}, {b}, {c}]" for a, b, c in arr) + "]"


def body(ic, indent, full):
    """한 그림의 층들. full이면(핏별 모양) 없는 층도 빈 목록으로 적어서 기본 그림의 층이 섞여 들지 않게 한다."""
    out = []
    for key in LAYERS:
        val = ic.get(key)
        if not val and not (full or key in REQUIRED or key == "dots"):
            continue
        val = val or []
        out.append(f"{indent}{key}: {dots(val) if key == 'dots' else '[' + J(val) + ']'},")
    if ic.get("transform"):
        t = ic["transform"]
        out.append(f"{indent}transform: [{t[0]}, {t[1]}, {t[2]}],")
    return out


L = ["// 자동 생성 파일 — design/kind-icons/icons_v12.json → gen_ts.py. 직접 고치지 말 것.",
     "// 옷 종류 그림 48종 (64×64, 앞모습 / 신발은 옆모습). 11/16 옷 추가 시안(v12) 그림. 층(아래→위):",
     "// straps 끈(옷 색 굵은 선) · shapes 옷 면(옷 색 + 테두리) · shade 그림자(옷 안으로 잘림) · weave 짜임 결(니트 꽈배기, 옷 안으로 잘림)",
     "// · plain 무늬 없이 옷 색만 칠하는 면(목 시보리 등) · inner 옷 안쪽(목 안·후드 안) · lining 안감(고정 베이지)",
     "// · tops 위에 겹치는 면(라펠·칼라·주머니 덮개) · details 솔기·주름 선(옷 안으로 잘림) · seams 소매 구분선 · metals 금속 · dots 단추.",
     "// transform: [x 이동, y 이동, 배율] — 그림을 칸 가운데로 옮기거나 키울 때만.",
     "// variants: 핏에 따라 바뀌는 그림 전체 (데님팬츠·슬랙스·코튼팬츠의 스키니·일자·와이드·부츠컷, 조거팬츠의 일자·와이드,",
     "//           스커트의 A라인·H라인·플레어). 핏 그림은 층을 다 적어서 기본 그림과 섞이지 않는다.",
     "import type { Kind, VisualFit } from './catalog';", "",
     "export type KindIconLayers = {",
     "  shapes: string[];", "  details: string[];", "  shade: string[];", "  inner: string[];", "  tops: string[];",
     "  dots: [number, number, number][];", "  straps: string[];",
     "  // 무늬 없이 옷 색만 칠하는 면(목 시보리 등).", "  plain?: string[];",
     "  // 짜임 결(니트 꽈배기·시보리 골): 안쪽 선과 같은 색, 옷 모양 안으로 잘라 그린다.", "  weave?: string[];",
     "  // 안감(힐 안쪽 등): 옷 색과 상관없이 밝은 베이지로 칠한다.", "  lining?: string[];",
     "  // 소매 구분선(어깨 → 겨드랑이 → 소매 안쪽): 팔과 몸판이 갈려 보이게 안쪽 선보다 진하게 긋는다.", "  seams?: string[];",
     "  // 체인 끈(크로스백): 차가운 색 가방은 은색, 나머지는 금색으로 그린다.", "  chains?: string[];",
     "  // 금속 장식(지퍼 고리·클러치 테·잠금): 체인 끈과 같은 금색·은색.", "  metals?: string[];",
     "  transform?: [number, number, number];", "};", "",
     "export type KindIconData = KindIconLayers & {",
     "  variants?: Partial<Record<VisualFit, KindIconLayers>>;", "};", "",
     "export const KIND_ICONS: Record<Kind, KindIconData> = {"]
for k in order:
    ic = icons[k]
    L.append(f"  {k}: {{")
    L += body(ic, "    ", False)
    if ic.get("variants"):
        L.append("    variants: {")
        for fit, v in ic["variants"].items():
            L.append(f"      {fit}: {{")
            L += body(v, "        ", True)
            L.append("      },")
        L.append("    },")
    L.append("  },")
L.append("};")
open(sys.argv[2], "w", encoding="utf-8").write("\n".join(L) + "\n")
print("ts ok", len(order))
