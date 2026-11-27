"""노르딕 니트 · 레터링 티 결(11/23 은재 님 "노르딕은 둘 다 넣고 레터링도 이렇게").

sleeves_b.py(상의) · dresses_build.py 다음에 돌린다. 다 그려진 핏별 기본 그림(icons_b.json)의 목·어깨·몸판 자리를 재서
선을 긋고, 시안 좌표(그림과 같은 좌표)로 source/motifs_b.json에 쓴다 → gen_add_item.py가 짜임 결(weaves)에 합친다.

- 노르딕(니트 kn · 카디건 cd): 짜임 칸 '노르딕 가로'(가슴을 가로지르는 띠) · '노르딕 목둘레'(목을 둥글게 감싸는 요크).
  키는 다른 짜임과 같이 'kn|노르딕 가로|같이' · '…|무지'(팔에는 안 넣음 = 소매 재봉선 사이 몸판만) + '@슬림' · '@오버사이즈'.
  선 색은 다른 짜임처럼 옷 색에서 뽑은 안쪽 선 색(어두운 옷은 밝은 선).
- 프린팅(반소매티 · 긴소매티 · 맨투맨 · 후드): '레터링'(가슴에 필기체 같은 고리선 세 줄 — 진짜 글자는 아님) ·
  '작은 로고'(왼쪽 가슴 작은 고리선). 키 'pr|종류|레터링' (+ '@핏'). 색은 앱에서 '프린팅 색' 칸 값(안 고르면 안쪽 선 색).
"""
import json
import math
import os

from shapely.geometry import LineString
from shapely.ops import unary_union

import sleeves_b as SB

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'source')
OUT = os.path.join(SRC, 'motifs_b.json')
FITS = ('', '@슬림', '@오버사이즈')

NORDIC = {'니트': 'kn', '카디건': 'cd'}
NORDIC_KINDS = {'노르딕 가로': 'band', '노르딕 목둘레': 'yoke'}
# 레터링: top = 가운데 옷 윗선(목 뒤)에서 첫 줄 위까지, gap = 줄 간격, widths = 줄 길이, h = 글자 높이.
# 후드는 끈 끝(29.5)과 캥거루 주머니 위(36.8) 사이에 두 줄로 작게. 작은 로고 자리(logo: 가운데에서 몸판 반폭의 비율, 윗선에서 아래).
LETTER = {'반소매티': dict(top=8.6, gap=5.0, widths=(13, 15, 9), h=2.3, logo=(0.38, 11.0)),
          '긴소매티': dict(top=7.6, gap=5.0, widths=(13, 15, 9), h=2.3, logo=(0.38, 11.0)),
          '맨투맨': dict(top=8.6, gap=5.0, widths=(13, 15, 9), h=2.3, logo=(0.38, 11.0)),
          '후드': dict(top=20.4, gap=3.3, widths=(11, 8.5), h=1.9, logo=(0.5, 16.4))}


def d_of(pts):
    return 'M' + ' L'.join(f'{x:.2f},{y:.2f}' for x, y in pts)


def clip(lines, region):
    """선(점 목록)들을 region 안만 남긴다."""
    out = []
    for pts in lines:
        g = LineString(pts).intersection(region)
        for gg in getattr(g, 'geoms', [g]):
            if gg.is_empty or gg.geom_type != 'LineString' or gg.length < 0.35:
                continue
            out.append(list(gg.coords))
    return out


# ── 노르딕 ──
def band(y0, h=9.0, x0=0.0, x1=64.0):
    """가슴 가로 띠: 위아래 테두리 + 지그재그 두 줄 + 가운데 마름모 줄 + 띠 위아래 작은 십자."""
    L = [[(x0, y0), (x1, y0)], [(x0, y0 + h), (x1, y0 + h)]]
    for ya, yb in ((y0 + 1.1, y0 + 2.7), (y0 + h - 1.1, y0 + h - 2.7)):
        zz, x, up = [], x0, True
        while x <= x1:
            zz.append((x, ya if up else yb))
            x += 1.2
            up = not up
        L.append(zz)
    cy, s = y0 + h / 2, 1.25
    x = SB.C - 3.2 * math.floor((SB.C - x0) / 3.2)          # 가운데(32)에 마름모 하나가 오게
    while x <= x1:
        L.append([(x - s, cy), (x, cy - s), (x + s, cy), (x, cy + s), (x - s, cy)])
        x += 3.2
    for yy in (y0 - 1.9, y0 + h + 1.9):
        x = SB.C + 1.6 - 3.2 * math.floor((SB.C + 1.6 - x0) / 3.2)
        while x <= x1:
            L += [[(x - 0.55, yy), (x + 0.55, yy)], [(x, yy - 0.55), (x, yy + 0.55)]]
            x += 3.2
    return L


def yoke(cx, cy, r1, r2):
    """목둘레 요크: 둥근 테두리 두 줄 + 안쪽 지그재그 두 줄 + 가운데 마름모."""
    def arc(r, n=160):
        return [(cx + r * math.cos(a), cy + r * math.sin(a)) for a in [math.pi * (-0.1 + 1.2 * i / n) for i in range(n + 1)]]
    L = [arc(r1), arc(r2)]
    for rr in (r1 + 1.6, r2 - 1.6):
        n = int(math.pi * 1.2 * rr / 1.2)
        L.append([(cx + (rr + (0.8 if i % 2 else -0.8)) * math.cos(a), cy + (rr + (0.8 if i % 2 else -0.8)) * math.sin(a))
                  for i, a in enumerate(math.pi * (-0.1 + 1.2 * i / n) for i in range(n + 1))])
    rm, s = (r1 + r2) / 2, 1.2
    n = int(math.pi * 1.2 * rm / 3.2)
    for i in range(n + 1):
        a = math.pi * (-0.1 + 1.2 * i / n)
        x, y = cx + rm * math.cos(a), cy + rm * math.sin(a)
        L.append([(x - s, y), (x, y - s), (x + s, y), (x, y + s), (x - s, y)])
    return L


# ── 프린팅 ──
def script_line(x0, y0, w, h=2.3, slant=0.3, step=2.7, amp=0.55, cap=True):
    """필기체 같은 고리선 한 줄(진짜 글자는 아님) + 첫 글자 큰 고리."""
    loops = max(2, int(w / step))
    n = loops * 30
    pts = []
    for i in range(n + 1):
        t = i / n * loops * 2 * math.pi
        x = x0 + w * i / n - amp * math.sin(t)
        y = y0 - h * 0.5 * (1 - math.cos(t))
        pts.append((x + (y0 - y) * slant, y))
    out = [pts]
    if cap:
        r = h / 2.3       # 첫 글자 고리도 글자 높이에 맞춰
        out.append([(x0 + 0.2 * r + 1.5 * r * math.cos(a), y0 - 1.9 * r + 1.9 * r * math.sin(a)) for a in [math.pi * (0.35 + 1.8 * i / 40) for i in range(41)]])
    return out


def lettering(cx, ytop, k=1.0, gap=5.0, widths=(13, 15, 9), h=2.3):
    L = []
    for i, w in enumerate(widths):
        w *= k
        L += script_line(cx - w / 2 + 0.8 * (i % 2), ytop + gap * (i + 1), w, h=h, step=2.7 * h / 2.3)
    return L


def small_logo(x, y):
    return script_line(x - 2.2, y, 5.0, h=1.6, step=2.4, amp=0.45)


def disp(I, iid, place):
    ic = I[iid]
    v = SB.affine(ic, SB.fwd(place, ic.get('transform')))
    v.pop('transform', None)
    return v


def geo(v):
    G = unary_union([SB.to_poly(d) for d in v['shapes']]).buffer(0)
    hit = G.intersection(LineString([(SB.C, -5), (SB.C, 70)]))
    top = min(c[1] for g in getattr(hit, 'geoms', [hit]) for c in g.coords)
    seams = [SB.subpaths(d)[0] for d in v.get('seams', [])]
    seams = [sp if sp[0][1] < sp[-1][1] else sp[::-1] for sp in seams]
    right = max(seams, key=lambda sp: sp[0][0])
    strip = SB.body_strip(v['seams'])
    return G, top, right, strip


def half_at(region, y):
    hit = region.intersection(LineString([(-10, y), (80, y)]))
    xs = [c[0] for g in getattr(hit, 'geoms', [hit]) if not g.is_empty for c in g.coords]
    return (max(xs) - min(xs)) / 2 if xs else 15.5


def main():
    I = json.load(open(os.path.join(SRC, 'icons_b.json'), encoding='utf-8'))
    specs = {s['name']: s for s in json.load(open(os.path.join(SRC, 'specs.json'), encoding='utf-8'))}
    log = json.load(open(os.path.join(HERE, 'log.json'), encoding='utf-8'))
    out = {}

    def put(key, lines, place):
        back = SB.inv(place, None)
        out[key] = [d_of([back(x, y) for x, y in pts]) for pts in lines]

    for name, pre in NORDIC.items():
        place = log[name]['place']
        for fit in FITS:
            v = disp(I, specs[name]['baseIcon'] + fit, place)
            G, top, right, strip = geo(v)
            sx = (right[0][0] - SB.C) / 13.9          # 어깨가 넓은 오버사이즈는 요크도 크게
            for label, kind in NORDIC_KINDS.items():
                if kind == 'band':
                    lines = band(top + 10.5)
                else:
                    lines = yoke(SB.C, top - 3.5, 9.8 * sx, 19.0 * sx)
                full = clip(lines, G.buffer(0.6))
                body = clip(lines, strip.intersection(G.buffer(0.6)))
                put(f'{pre}|{label}|같이{fit}', full, place)
                put(f'{pre}|{label}|무지{fit}', body, place)
        print(f'{name}: 노르딕 {len(NORDIC_KINDS)} × 팔 2 × 핏 3')

    for name in LETTER:
        place = log[name]['place']
        for fit in FITS:
            v = disp(I, specs[name]['baseIcon'] + fit, place)
            G, top, right, strip = geo(v)
            p = LETTER[name]
            half = half_at(strip.intersection(G), top + p['top'] + 6)
            k = max(0.85, min(1.1, half / 15.5))
            put(f'pr|{name}|레터링{fit}', clip(lettering(SB.C, top + p['top'], k, p['gap'], p['widths'], p['h']), G), place)
            put(f'pr|{name}|작은 로고{fit}', clip(small_logo(SB.C + p['logo'][0] * half, top + p['logo'][1]), G), place)
        print(f'{name}: 프린팅 2 × 핏 3')

    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'motifs_b.json 결 {len(out)}개')


if __name__ == '__main__':
    main()
