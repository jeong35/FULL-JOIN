"""icons.json(gen_icons_v3.py 결과) → mobile/src/data/kindIcons.ts
사용: python3 gen_ts.py <icons.json> <kindIcons.ts>"""
import json, sys
icons = json.load(open(sys.argv[1], encoding="utf-8"))
order = ['반소매티셔츠','긴소매티셔츠','민소매','셔츠','블라우스','니트','맨투맨','후드','카디건','후드집업','베스트','데님팬츠','슬랙스','코튼팬츠','조거팬츠','숏팬츠','레깅스','미니스커트','미디스커트','롱스커트','점프수트','미니원피스','미디원피스','롱원피스','재킷','레더재킷','데님재킷','점퍼','야상','플리스','트렌치코트','코트','숏패딩','롱패딩','경량패딩','스니커즈','로퍼','플랫슈즈','힐','부츠','샌들','슬리퍼','숄더백','크로스백','토트백','백팩','에코백','클러치']
assert sorted(order) == sorted(icons)
J = lambda arr: ", ".join(json.dumps(x, ensure_ascii=False) for x in arr)
L = ["// 자동 생성 파일 — design/kind-icons/gen_icons_v3.py → gen_ts.py. 직접 고치지 말 것.",
     "// 옷 종류 그림 48종 (64×64, 앞모습 / 신발은 옆모습). 층(아래→위):",
     "// straps 끈(옷 색 굵은 선) · shapes 옷 면(옷 색 + 테두리) · shade 그림자(옷 안으로 잘림) · inner 옷 안쪽(목 안·후드 안)",
     "// · lining 안감(고정 베이지) · tops 위에 겹치는 면(라펠·칼라·주머니 덮개) · details 솔기·주름 선(옷 안으로 잘림) · dots 단추.",
     "// transform: [x 이동, y 이동, 배율] — 신발처럼 작은 그림을 칸 가운데로 키울 때만.",
     "// variants: 핏에 따라 바뀌는 모양 (데님팬츠·슬랙스·코튼팬츠의 스키니·일자·와이드·부츠컷, 스커트의 A라인·H라인·플레어).",
     "import type { Kind, VisualFit } from './catalog';", "",
     "export type KindIconShape = { shapes: string[]; details: string[]; shade?: string[]; inner?: string[]; tops?: string[] };", "",
     "export type KindIconData = {",
     "  shapes: string[];", "  details: string[];", "  shade: string[];", "  inner: string[];", "  tops: string[];",
     "  dots: [number, number, number][];", "  straps: string[];", "  // 안감(힐 안쪽 등): 옷 색과 상관없이 밝은 베이지로 칠한다.",
     "  lining?: string[];", "  // 소매 구분선(어깨 → 겨드랑이 → 소매 안쪽): 팔과 몸판이 갈려 보이게 안쪽 선보다 진하게 긋는다.", "  seams?: string[];",
     "  // 체인 끈(크로스백): 차가운 색 가방은 은색, 나머지는 금색으로 그린다.", "  chains?: string[];", "  // 금속 장식(지퍼 고리·클러치 테·잠금): 체인 끈과 같은 금색·은색.", "  metals?: string[];",
     "  transform?: [number, number, number];",
     "  variants?: Partial<Record<VisualFit, KindIconShape>>;", "};", "",
     "export const KIND_ICONS: Record<Kind, KindIconData> = {"]
for k in order:
    ic = icons[k]
    L.append(f"  {k}: {{")
    for key in ("shapes", "details", "shade", "inner", "tops", "straps"):
        L.append(f"    {key}: [{J(ic[key])}],")
    L.append("    dots: [" + ", ".join(f"[{a}, {b}, {c}]" for a, b, c in ic["dots"]) + "],")
    if ic.get("lining"):
        L.append(f"    lining: [{J(ic['lining'])}],")
    if ic.get("seams"):
        L.append(f"    seams: [{J(ic['seams'])}],")
    if ic.get("chains"):
        L.append(f"    chains: [{J(ic['chains'])}],")
    if ic.get("metals"):
        L.append(f"    metals: [{J(ic['metals'])}],")
    if ic.get("transform"):
        t = ic["transform"]; L.append(f"    transform: [{t[0]}, {t[1]}, {t[2]}],")
    if ic.get("variants"):
        L.append("    variants: {")
        for fit, v in ic["variants"].items():
            extra = "".join(f", {key}: [{J(v[key])}]" for key in ("shade", "inner", "tops") if key in v)
            L.append(f"      {fit}: {{ shapes: [{J(v['shapes'])}], details: [{J(v['details'])}]{extra} }},")
        L.append("    },")
    L.append("  },")
L.append("};")
open(sys.argv[2], "w", encoding="utf-8").write("\n".join(L) + "\n")
print("ts ok")
