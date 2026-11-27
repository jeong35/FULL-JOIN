"""크롭 그림(11/27 은재 님 "후드집업 크롭 있어야죠", "여기 전부 크롭이 있어야 돼요",
"크롭 같은 건 안에 들어가서 설정하고 디자인이 바뀌어서 저장되어야 하는 것").

기장 '크롭'이 칩만 있고 그림이 안 바뀌던 상의(셔츠 · 블라우스 · 후드 · 트레이닝 상의 · 카디건 · 후드집업 · 베스트 ·
슬리브리스 민소매)의 크롭 그림을 핏별로 만든다. 이미 크롭 그림이 있는 종류(반소매티 · 긴소매티 · 니트 · 맨투맨)와 같은 방식:
- 몸판만 밑을 곧게 자른다. 긴 소매는 그대로(소매 재봉선 두 줄 사이 = 몸판 띠만 자름, 맨투맨 크롭 i96과 같게).
- 크롭 밑단 높이: 어깨 재봉선 꼭대기 → 밑단의 CROP_AT(맨투맨 크롭 0.70 · 니트 크롭 0.71과 같은 정도).
  슬림은 레귤러와 같은 높이(슬림 2번은 기장을 줄였으므로 비율로 재면 너무 짧아짐), 오버사이즈는 자기 길이로 잰다.
- 원래 밑단 시보리 선이 있던 옷은 크롭 밑단에도 같은 간격으로 긋는다.
- 밑단에 걸린 주머니는 통째로 뺀다(잘린 선 · 거기 붙은 선). 지퍼 · 단추 여밈(가운데 세로선)은 밑단까지 자른다. 밑단 근처 단추도 뺀다.
- 슬리브리스 민소매: 끈 크롭(i49)처럼 같은 높이에서 자르고 밑단 띠(tops)를 단다.
- 블라우스 허리 끈: 띠를 크롭 밑단 몸판 폭에 딱 맞추고 끈 가닥은 짧게(TIE).

쓰는 것: source/icons.json + icons_b.json. sleeves_b.py 상의 다음, argyle_build.py 앞에 돌린다.
만드는 것: source/crop_b.json  {원래 id + 'c'(i100 → i100c, i100@슬림 → i100c@슬림): 크롭 그림}
gen_add_item.py가 그림에 합치고 기장 '크롭' 보기 · 조합(셔츠 · 블라우스 카라 × 크롭, 슬리브리스 민소매|크롭)에 단다.
"""
import copy
import json
import os

from shapely.geometry import LineString, MultiLineString, Polygon, box
from shapely.ops import unary_union

import sleeves_b as SB
from geo import poly_to_d

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'source')
OUT = os.path.join(SRC, 'crop_b.json')
FITS = ('', '@슬림', '@오버사이즈')
C = SB.C

# 종류 → 크롭을 만들 그림(같은 종류 화면에서 고를 수 있는 그림 전부)
KINDS = {
    '후드': ['i97'], '트레이닝 상의': ['i98'], '카디건': ['i99'], '후드집업': ['i100'], '베스트': ['i101'],
    '셔츠': [f'i{n}' for n in range(52, 67)],   # 블라우스도 i59 ~ i66 같이 씀
    '슬리브리스': ['i47'],
}
CROP_AT = {'베스트': 0.74}      # 소매 없는 조끼는 어깨 꼭대기부터 잰다(V 목이 깊어 조금 길게, 단추 셋 중 둘이 남게)
CROP_AT_DEFAULT = 0.70
SLEEVELESS_FROM = 'i49'          # 민소매 크롭 밑단 높이 · 띠 두께는 끈 크롭(i49)과 같게
TIE = '밑단'                     # 블라우스 허리 끈: '밑단'(조임 밑단, 끈 조금 늘어짐) · '안에'(띠를 올려 끈이 밑단 안에서 끝남)
TIE_LEN = 2.6                    # 크롭 끈 가닥 길이(원래 9 정도 → 짧게)
TIE_INSIDE = 3.3                 # '안에': 띠 아래 끝 ~ 밑단
RIB_K = 0.75                     # 크롭 밑단 시보리 간격 = 원래 간격 × 이 값(1.8 ~ 2.6)


def bounds_of(d):
    pts = [p for sp in SB.subpaths(d) for p in sp]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def seam_top(ic):
    return min(p[1] for d in ic['seams'] for p in SB.subpaths(d)[0])


def garment_top(G):
    return G.bounds[1]


def hem_line_off(ic, hem):
    """원래 밑단 시보리 선(가로로 긴 선, 지퍼 자리에서 끊긴 것 포함)과 밑단 사이 간격 · 가운데가 끊겼나. 없으면 (None, False)."""
    pieces = []
    for d in ic.get('details', []):
        for sp in SB.subpaths(d):
            xs, ys = [p[0] for p in sp], [p[1] for p in sp]
            if max(xs) - min(xs) > 6 and max(ys) - min(ys) < 1.2 and hem - 5.5 < min(ys) < hem:
                pieces.append((min(xs), max(xs), (min(ys) + max(ys)) / 2))
    if not pieces or sum(b - a for a, b, _ in pieces) < 14:
        return None, False
    off = hem - min(y for _, _, y in pieces)
    split = any(abs(a - C) < 0.6 or abs(b - C) < 0.6 for a, b, _ in pieces)
    return off, split


def center_line(d):
    """가운데 세로선(지퍼 · 단추 여밈)."""
    xs = [p[0] for sp in SB.subpaths(d) for p in sp]
    return max(abs(x - C) for x in xs) < 0.6


def clip_line(d, keep):
    """선 d를 keep 안쪽만 남긴다. 안 잘리면 원래 선 그대로, 잘리면 가운데 세로선(지퍼 · 여밈)만 잘라 남기고
    다른 선(주머니 등)은 None(통째로 뺌)."""
    out = []
    total = kept = 0.0
    for sp in SB.subpaths(d):
        if len(sp) < 2:
            continue
        ln = LineString(sp)
        total += ln.length
        part = ln.intersection(keep)
        kept += part.length
        for g in getattr(part, 'geoms', [part]):
            if isinstance(g, LineString) and g.length > 0.3:
                out.append(list(g.coords))
    if total == 0 or kept >= total - 1e-3:
        return d
    if not center_line(d):
        return None
    return ' '.join(SB.line_d(pts) for pts in out) if out else None


def ends(d):
    out = []
    for sp in SB.subpaths(d):
        out += [sp[0], sp[-1]]
    return out


def drop_attached(kept, dropped, tol=0.7):
    """뺀 선(주머니 옆 · 아래)에 끝이 붙은 선(주머니 윗선)도 뺀다. 가운데 세로선은 남긴다."""
    gone = [p for d in dropped for p in ends(d)]
    changed = True
    while changed:
        changed = False
        for d in list(kept):
            if center_line(d):
                continue
            if any(abs(a[0] - b[0]) < tol and abs(a[1] - b[1]) < tol for a in ends(d) for b in gone):
                kept.remove(d)
                gone += ends(d)
                changed = True
    return kept


def tie_parts(ic):
    """블라우스 허리 끈(tops): 띠 · 매듭 · 늘어진 끈 가닥들의 (path, bounds). 없으면 None."""
    bs = [(d, bounds_of(d)) for d in ic.get('tops', [])]
    band = next(((d, b) for d, b in bs if b[2] - b[0] > 15 and b[3] - b[1] < 3.2 and b[1] > 25), None)
    if band is None:
        return None
    bb = band[1]
    knot = [(d, b) for d, b in bs if b[2] - b[0] < 3 and abs(b[1] - bb[1]) < 0.3 and abs(b[3] - bb[3]) < 0.3]
    strings = [(d, b) for d, b in bs if abs(b[1] - bb[3]) < 0.4 and b[3] - b[1] > 3]
    return band, knot, strings


def move_tie(z, ic, body, strip, yc, style):
    """허리 끈을 크롭 밑단에 맞게 다시 단다(11/27 "오버에 블라우스 끈 너무 웃기다").
    띠는 그 높이의 몸판 폭(소매 재봉선 사이)에 딱 맞추고, 끈 가닥은 짧게.
    style '밑단': 띠가 밑단(조임 밑단), 끈이 밑단 아래로 조금 늘어짐 · '안에': 띠를 조금 올려 끈 끝이 밑단 안에서 끝남."""
    parts = tie_parts(ic)
    if parts is None:
        return
    (band_d, bb), knot, strings = parts
    old = {band_d} | {d for d, _ in knot} | {d for d, _ in strings}
    z['tops'] = [d for d in z.get('tops', []) if d not in old]
    bh = bb[3] - bb[1]
    bottom = yc if style == '밑단' else yc - TIE_INSIDE
    top = bottom - bh
    band = body.intersection(strip).intersection(box(-20, top, 90, bottom)).buffer(0)
    if band.is_empty:
        return
    dy = top - bb[1]
    new = [poly_to_d(band)]
    for d, b in strings:
        k = TIE_LEN / (b[3] - b[1])
        new.append(SB.map_d(d, lambda x, y, k=k: (x, bottom + (y - bb[3]) * k)))
    new += [SB.map_d(d, lambda x, y: (x, y + dy)) for d, _ in knot]
    z['tops'] += new


def crop_icon(ic, yc, rib=(None, False), band=None, tie=None):
    """그림 ic(시안 좌표)를 몸판 밑 yc에서 자른 크롭 그림."""
    z = copy.deepcopy(ic)
    G = unary_union([SB.to_poly(d) for d in ic['shapes']]).buffer(0)
    strip = SB.body_strip(ic['seams']) if ic.get('seams') else box(-20, -20, 90, 90)
    cut = strip.intersection(box(-20, yc, 90, 90))
    keep = box(-20, -20, 90, 90).difference(cut)
    body = G.difference(cut).buffer(0)
    # 밑단 바깥 모서리만 살짝 둥글게(소매 없는 옷) — 다른 자리 모양은 그대로
    near = strip.intersection(box(-20, yc - 1.4, 90, yc + 0.1))
    rounded = body.buffer(-0.45, join_style=1).buffer(0.45, join_style=1)
    body = body.difference(near).union(rounded.intersection(near)).buffer(0)
    parts = list(getattr(body, 'geoms', [body]))
    parts = [p for p in parts if p.area > 0.5]
    z['shapes'] = [poly_to_d(p) for p in sorted(parts, key=lambda p: -p.area)]
    for k in ('details', 'weave', 'tex', 'zips', 'ribs'):
        if k in z:
            res = [(d, clip_line(d, keep)) for d in z[k]]
            kept = [q for d, q in res if q]
            if k == 'details':
                kept = drop_attached(kept, [d for d, q in res if not q])
            z[k] = kept
    for k in ('tops', 'inner', 'plain', 'metals', 'lining'):
        if k in z:
            z[k] = [d for d in z[k] if bounds_of(d)[1] < yc - 0.5]
    if 'dots' in z:
        z['dots'] = [p for p in z['dots'] if p[1] + p[2] < yc - 1.2 or not strip.contains(SB.Point(p[0], p[1]))]
    hem = body.intersection(strip)
    if rib[0]:
        # 크롭은 몸판이 짧아 밑단 시보리도 조금 좁게(맨투맨 3.4 → 크롭 2.5와 같은 비)
        y = yc - min(max(rib[0] * RIB_K, 1.8), 2.6)
        sh = SB.span(hem, y)
        if sh:
            segs = [[(sh[0] + 0.9, y), (C - 0.2, y)], [(C + 0.2, y), (sh[1] - 0.9, y)]] if rib[1] else [[(sh[0] + 0.9, y), (sh[1] - 0.9, y)]]
            z['details'] = z.get('details', []) + [SB.line_d(q) for q in segs]
    if band:
        b = hem.intersection(box(-20, yc - band, 90, yc + 1))
        if not b.is_empty:
            z['tops'] = z.get('tops', []) + [poly_to_d(b.buffer(0))]
    if tie:
        move_tie(z, ic, body, strip, yc, tie)
    return z


def main():
    I = json.load(open(os.path.join(SRC, 'icons.json'), encoding='utf-8'))
    I.update(json.load(open(os.path.join(SRC, 'icons_b.json'), encoding='utf-8')))
    out = {}
    for kind, ids in KINDS.items():
        for base in ids:
            yreg = None
            for fit in FITS:
                iid = base + fit
                if iid not in I:
                    continue
                ic = I[iid]
                G = unary_union([SB.to_poly(d) for d in ic['shapes']]).buffer(0)
                hem = SB.hem_y(ic)
                if kind == '슬리브리스':
                    ref = I[SLEEVELESS_FROM + fit]
                    tb = bounds_of(ref['tops'][0])
                    z = crop_icon(ic, tb[3], band=tb[3] - tb[1])
                else:
                    top = seam_top(ic) if ic.get('seams') else garment_top(G)
                    yc = top + CROP_AT.get(kind, CROP_AT_DEFAULT) * (hem - top)
                    if fit == '':
                        yreg = yc
                    elif fit == '@슬림' and yreg is not None:
                        yc = yreg
                    z = crop_icon(ic, yc, rib=hem_line_off(ic, hem), tie=TIE)
                out[f'{base}c{fit}'] = z
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'crop_b.json 크롭 그림 {len(out)}개')


if __name__ == '__main__':
    main()
