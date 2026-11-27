"""아가일 무늬(11/27 은재 님 "짜임 아가일 두 개는 너무 이상한데", "아가일도 몸통만 있는 것도", 시안 아가일_시안.png).

전에는 아가일이 두 군데 있었다.
- 짜임 '아가일'(니트·카디건): 마름모 테두리 선만 긋고, 핏별 그림으로 늘리면서 사선이 꺾였다(오버사이즈).
- 무늬 '아가일'(모든 옷): 작은 마름모 무늬 칸(ClothPattern)을 옷 면에 깔았다.
→ 니트·카디건·베스트는 무늬 '아가일' 하나로 합치고, 핏별 그림(icons_b.json)의 몸판·소매 자리를 재서 마름모를 새로 그린다.
   다른 종류(스커트·양말 등)는 지금처럼 무늬 칸으로 칠한다.

무늬 모양(details '무늬 모양')
- 정석: 작은 마름모를 번갈아 칠하고(아가일 색) 칸 가운데로 가는 점선 사선(오버체크).
- 큰 아가일: 큰 마름모 + 점선 사선.
- 가슴 띠: 가슴에 마름모 한 줄(칠한 것 · 테두리만 번갈아) + 위아래 지그재그.
- 세로 띠(카디건만): 앞판 양쪽에 마름모 한 줄씩 세로로.
팔('팔' 칸, 저장 값 같이 · 무지 = 화면 '팔까지' · '몸통만'): 같이면 소매에도, 무지면 몸판만. 베스트는 팔이 없어 '같이'만.

쓰는 것: sleeves_b.py 상의 · motifs_build.py · crop_build.py 다음에 돌린다(icons_b.json · crop_b.json을 읽는다).
만드는 것: source/argyle_b.json  {'ag|종류|모양|팔[|크롭][@핏]': {'f': [칠할 면], 'l': [선], 's': 1(선이 실선)}}
  좌표는 시안 그림 좌표(그림과 같은 좌표) — gen_add_item.py가 wardrobeArt.ts의 argyles로 넣는다.
  앱(wardrobeLook.ts argyleFor · KindIcon)은 면을 아가일 색으로 칠하고, 점선 사선은 옷 색 · 아가일 색과 다른 색으로 긋는다.
"""
import json
import math
import os

from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union

import motifs_build as MB
import sleeves_b as SB

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'source')
OUT = os.path.join(SRC, 'argyle_b.json')
FITS = ('', '@슬림', '@오버사이즈')
C = SB.C
SLOPE = 1.28          # 마름모 세로/가로 비(세로가 조금 긴 마름모)

# 종류 → (그림들: 기장 이름 → 그림 id, 무늬 모양들, 팔이 있나)
KINDS = {
    '니트': ({'': 'i67', '크롭': 'i79'}, ('정석', '큰 아가일', '가슴 띠'), True),
    '카디건': ({'': 'i99', '크롭': 'i99c'}, ('정석', '큰 아가일', '가슴 띠', '세로 띠'), True),   # 크롭: crop_build.py
    '베스트': ({'': 'i101', '크롭': 'i101c'}, ('정석', '큰 아가일', '가슴 띠'), False),
}
SHAPES = ('정석', '큰 아가일', '가슴 띠', '세로 띠')


# ── 그림 자리 재기 ──
def regions(v):
    """옷 전체 G, 목 윗선 top, 몸판 body, 소매 sleeves(시보리 빼고)."""
    G = unary_union([SB.to_poly(d) for d in v['shapes']]).buffer(0)
    hit = G.intersection(LineString([(C, -5), (C, 70)]))
    top = min(c[1] for g in getattr(hit, 'geoms', [hit]) for c in g.coords)
    hem, cuffs = None, []
    for d in v.get('details', []):
        for sp in SB.subpaths(d):
            xs, ys = [p[0] for p in sp], [p[1] for p in sp]
            if max(xs) - min(xs) > 15 and max(ys) - min(ys) < 0.6 and min(ys) > 30:
                hem = min(ys) if hem is None else min(hem, min(ys))
            elif max(xs) - min(xs) < 7 and min(ys) > 30 and (max(xs) < C - 8 or min(xs) > C + 8):
                cuffs.append(sp)
    if v.get('seams'):
        strip = SB.body_strip(v['seams'])
        body = strip.intersection(G)
        sleeves = G.difference(strip.buffer(0.05))
    else:   # 베스트: 소매가 없다. 목·진동 둘레 시보리 자리만큼 안쪽으로.
        body = G.buffer(-1.25)
        sleeves = Polygon()
    if hem is not None:
        body = body.intersection(box(-10, -10, 80, hem))
    for sp in cuffs:   # 소매 끝 선 너머(시보리)는 뺀다
        (x1, y1), (x2, y2) = sp[0], sp[-1]
        dx, dy = x2 - x1, y2 - y1
        n = math.hypot(dx, dy)
        dx, dy = dx / n, dy / n
        a, b = (x1 - dx * 8, y1 - dy * 8), (x2 + dx * 8, y2 + dy * 8)
        nx, ny = -dy, dx
        if ny < 0:
            nx, ny = -nx, -ny
        sleeves = sleeves.difference(Polygon([a, b, (b[0] + nx * 20, b[1] + ny * 20), (a[0] + nx * 20, a[1] + ny * 20)]))
    return G, top, body.buffer(0), sleeves.buffer(0)


def sleeve_sides(sleeves):
    """왼소매 · 오른소매와 각 소매 방향(위 가운데 → 아래 가운데)."""
    out = []
    for half in (box(-10, -10, C, 90), box(C, -10, 90, 90)):
        sl = sleeves.intersection(half)
        if sl.is_empty or sl.area < 4:
            continue
        x0, y0, x1, y1 = sl.bounds
        t = sl.intersection(box(-10, y0, 90, y0 + 3)).centroid
        b = sl.intersection(box(-10, y1 - 3, 90, y1)).centroid
        out.append((sl, (t.x, t.y), (b.x - t.x, b.y - t.y)))
    return out


# ── 마름모 격자 ──
class Frame:
    """(cx, cy)가 꼭짓점인 마름모 격자. P = 세로 대각선, ax = 세로축 방향(소매는 소매 방향)."""

    def __init__(self, cx, cy, P, slope=SLOPE, ax=(0, 1)):
        n = math.hypot(*ax)
        self.ux, self.uy = ax[0] / n, ax[1] / n
        self.px, self.py = self.uy, -self.ux
        self.cx, self.cy, self.P, self.slope = cx, cy, P, slope

    def pt(self, a, b):
        along, across = (a + b) / 2, (a - b) / (2 * self.slope)
        return (self.cx + self.ux * along + self.px * across, self.cy + self.uy * along + self.py * across)

    def cells(self, extent=70):
        K = int(extent / self.P) + 3
        for i in range(-K, K):
            for j in range(-K, K):
                yield (i + j) % 2, Polygon([self.pt(a * self.P, b * self.P) for a, b in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))])

    def overcheck(self, extent=70):
        """칸 가운데를 지나는 사선 두 갈래."""
        K = int(extent / self.P) + 3
        for k in range(-K, K):
            a = (k + 0.5) * self.P
            for fam in (0, 1):
                ends = [(a, b) if fam == 0 else (b, a) for b in (-K * self.P * 2, K * self.P * 2)]
                yield LineString([self.pt(*e) for e in ends])


def polys(g):
    return [p for p in getattr(g, 'geoms', [g]) if not p.is_empty and p.geom_type == 'Polygon' and p.area > 0.05]


def lines(g):
    return [l for l in getattr(g, 'geoms', [g]) if not l.is_empty and l.geom_type == 'LineString' and l.length > 0.4]


def lattice(frame, region, parity):
    f = [p for par, c in frame.cells() if par == parity for p in polys(c.intersection(region))]
    l = [x for ln in frame.overcheck() for x in lines(ln.intersection(region))]
    return f, l


def argyle(v, shape, arms, crop_top=None):
    """한 그림(핏별)의 아가일 → (칠할 면들, 선들, 실선인가)."""
    G, top, body, sleeves = regions(v)
    bw = body.bounds[2] - body.bounds[0]
    sides = sleeve_sides(sleeves) if arms else []
    reg = unary_union([body] + [s[0] for s in sides])
    if shape == '정석':
        P = 9.6 * bw / 27
        f, l = lattice(Frame(C, top + 4, P), body, 0)
        for sl, (tx, ty), ax in sides:
            ff, ll = lattice(Frame(tx, ty, P * 0.85, ax=ax), sl, 0)
            f, l = f + ff, l + ll
        return f, l, False
    if shape == '큰 아가일':
        H = ((crop_top or body.bounds[3]) - top) * 0.62
        f, l = lattice(Frame(C, top + 1, H, SLOPE * 1.05), reg, 1)
        return f, l, False
    if shape == '가슴 띠':
        h = 9.0
        w = h / SLOPE
        yc = top + 14
        f, l = [], []
        for k in range(-9, 10):
            xc = C + k * w
            dia = Polygon([(xc, yc - h / 2), (xc + w / 2, yc), (xc, yc + h / 2), (xc - w / 2, yc)])
            if k % 2 == 0:
                f += polys(dia.intersection(reg))
            else:
                l += lines(dia.exterior.intersection(reg))
        for yy in (yc - h / 2 - 1.6, yc + h / 2 + 1.6):
            pts, x, up = [], C - 45, True
            while x <= C + 45:
                pts.append((x, yy + (0.7 if up else -0.7)))
                x += w / 2
                up = not up
            l += lines(LineString(pts).intersection(reg))
        return f, l, True
    if shape == '세로 띠':
        # 앞판 양쪽(단추 줄과 옆선 사이 가운데)에 마름모를 세로로 쌓는다. 칠한 것 · 테두리만 번갈아.
        x0, y0, x1, y1 = body.bounds
        f, l = [], []
        for side in (-1, 1):
            xc = C + side * bw * 0.25
            w = bw * 0.2
            h = w * SLOPE * 1.25
            y = top + 3
            k = 0
            while y < y1 + h:
                dia = Polygon([(xc, y), (xc + w / 2, y + h / 2), (xc, y + h), (xc - w / 2, y + h / 2)])
                if k % 2 == 0:
                    f += polys(dia.intersection(body))
                else:
                    l += lines(dia.exterior.intersection(body))
                y += h
                k += 1
            for xx in (xc - w / 2 - 0.9, xc + w / 2 + 0.9):   # 띠 양옆 가는 선
                l += lines(LineString([(xx, top - 5), (xx, y1 + 5)]).intersection(body))
        return f, l, True
    raise ValueError(shape)


def d_poly(p, back):
    return 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in (back(*c) for c in p.simplify(0.05).exterior.coords[:-1])) + 'Z'


def d_line(ln, back):
    return 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in (back(*c) for c in ln.simplify(0.05).coords))


def main():
    I = json.load(open(os.path.join(SRC, 'icons_b.json'), encoding='utf-8'))
    if os.path.exists(os.path.join(SRC, 'crop_b.json')):   # 카디건 · 베스트 크롭(crop_build.py)
        I.update(json.load(open(os.path.join(SRC, 'crop_b.json'), encoding='utf-8')))
    log = json.load(open(os.path.join(HERE, 'log.json'), encoding='utf-8'))
    out = {}
    for name, (icons, shapes, has_arms) in KINDS.items():
        place = log[name]['place']
        back = SB.inv(place, None)
        for length, iid in icons.items():
            for fit in FITS:
                v = MB.disp(I, iid + fit, place)
                for shape in shapes:
                    for arm in (('같이', '무지') if has_arms else ('같이',)):
                        f, l, solid = argyle(v, shape, arm == '같이' and shape != '세로 띠')
                        key = f"ag|{name}|{shape}|{arm}{'|' + length if length else ''}{fit}"
                        out[key] = {'f': [d_poly(p, back) for p in f], 'l': [d_line(x, back) for x in l]}
                        if solid:
                            out[key]['s'] = 1
        print(f'{name}: 모양 {len(shapes)} × 팔 {2 if has_arms else 1} × 기장 {len(icons)} × 핏 3')
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'argyle_b.json {len(out)}개 · {os.path.getsize(OUT) // 1024}KB')


if __name__ == '__main__':
    main()
