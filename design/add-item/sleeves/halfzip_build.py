"""하프넥 고치기 · 하프집업 목(11/27 은재 님).

- "하이넥인데 지퍼 가슴까지만 내려오는 디자인", "목 모양 고르는 데에는 다 넣어 주세요"
- "이 디자인의 핵심은 카라와는 다르게 지퍼가 열려서 그 부분이 자연스럽게 퍼진 거", "하프넥 넥이 지금 밑으로 꺼져 있음"

- "이렇게 누워진 형태가 좋을 것 같은데"(목이 접혀 어깨에 누운 니트 사진), "너무 지퍼가 눈에 띄는 것만 아니면", "같은 색에 지퍼 연하게"

하프넥(고침): 전에는 목 아랫선이 몸판 목선보다 한참 아래(반소매티는 2 넘게)로 처져서 목이 가슴으로 꺼져 보였다.
  → 목선을 살짝(0.55) 덮는 아랫선 + 어깨 꼭대기에서 곧게 서는 낮은 통(윗선 평평 + 안쪽 테두리 호). 니트는 골지 줄(ribs)도 다시.
하프집업(누운 깃): 높은 목을 지퍼로 내려 목이 바깥으로 접혀 어깨 위에 눕는다. 목 뒤는 접혀 넘어간 띠, 앞은 두 쪽 깃이
  어깨 쪽으로 넓게 눕고, 그 안쪽 가장자리(지퍼)가 V로 내려와 옷과 같은 색 작은 손잡이(tops)에서 만난다. 그 아래로 닫힌 지퍼(안쪽 선)가 조금.
  지퍼 이빨(zips)은 은색 대신 옷 안쪽 선 색의 가는 점선(KindIcon) — 작게 보면 거의 안 보인다.

몸판은 하프넥 그림(반소매티 i7 · 긴소매티 i30 · 니트 i74와 크롭, 핏별)과 맨투맨(i95 · 크롭 i96, 핏별)을 쓴다 — 목만 떼고 새로 단다.
쓰는 것: source/icons.json + icons_b.json. sleeves_b.py 상의 다음에 돌린다.
만드는 것: source/halfzip_b.json  {'neck': {하프넥 그림 id: 고친 그림}, 'zip': {원래 id + 'z'(i74 → i74z, i74@슬림 → i74z@슬림): 하프집업 그림}}
gen_add_item.py가 그림에 합치고(하프넥은 같은 id를 덮어씀), 목 모양 칸에 '하프집업' · 조합(하프넥|크롭 → 하프집업|크롭)을 더한다.
"""
import copy
import json
import os
import re

from shapely.geometry import LineString

import sleeves_b as SB

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'source')
OUT = os.path.join(SRC, 'halfzip_b.json')
FITS = ('', '@슬림', '@오버사이즈')
NUM = re.compile(r'-?\d+\.?\d*')

HALF_NECK = {'i7': False, 'i18': False, 'i30': False, 'i41': False, 'i74': True, 'i90': True}   # 하프넥 그림 → 니트(골지 줄)인가
ZIP_BODY = ('i7', 'i18', 'i30', 'i41', 'i74', 'i90', 'i95', 'i96')

MOCK_H = 3.0          # 하프넥 높이(어깨 꼭대기에서, 11/27 "두 번째 진짜 구린데" → 낮게)
ZIP_W = 2.9           # 누운 앞 깃이 어깨 쪽으로 퍼진 폭
ZIP_DROP = 6.6        # 몸판 목선 가운데에서 V 맨 아래(지퍼 손잡이)까지
ZIP_OPEN = 1.6        # 목 뒤에서 벌어진 안쪽 폭(옆으로)
ZIP_ROLL = 1.5        # 목 뒤 접혀 넘어간 띠 높이
ZIP_PULL = 1.2        # 지퍼 손잡이 길이(작게)


def P(pts, close=True):
    return 'M' + ' L'.join(f'{x:.2f},{y:.2f}' for x, y in pts) + (' Z' if close else '')


def bez(p0, p1, p2, n=8):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in [i / n for i in range(n + 1)]]


def mirror(pts):
    return [(64 - x, y) for x, y in pts]


def body_top(ic):
    """몸판 윗선 y(x)."""
    G = SB.to_poly(ic['shapes'][0])

    def f(x):
        hit = G.intersection(LineString([(x, -5), (x, 30)]))
        return min(c[1] for g in getattr(hit, 'geoms', [hit]) if not g.is_empty for c in g.coords)
    return f


def neck(ic):
    """어깨 꼭대기(목 옆) x · y와 목선 가운데 y."""
    top = body_top(ic)
    nx = min([24 + 0.2 * i for i in range(16)], key=top)
    return nx, top(nx), top(32), top


def neck_details(ic):
    """목 둘레의 짧은 안쪽 선(둥근 시보리 · V 스티치 · 목 안쪽 윗선)."""
    out = []
    for d in ic.get('details', []):
        v = [float(x) for x in NUM.findall(d)]
        xs, ys = v[0::2], v[1::2]
        if max(ys) < 18 and min(xs) > 24 and max(xs) < 40:
            out.append(d)
    return out


def strip_neck(ic):
    z = copy.deepcopy(ic)
    drop = set(neck_details(z))
    z['details'] = [d for d in z.get('details', []) if d not in drop]
    z['tops'] = []
    z['plain'] = []
    z.pop('ribs', None)
    return z


def mock_neck(ic, rib):
    nx, ny, cy, top = neck(ic)
    z = strip_neck(ic)
    L, R = nx + 0.7, 64 - nx - 0.7
    yt = ny - MOCK_H
    n = 16
    bottom = [(x, top(x) + 0.55) for x in [R - (R - L) * i / n for i in range(n + 1)]]
    bottom = [(R + 0.15, ny + 0.5)] + bottom[1:-1] + [(L - 0.15, ny + 0.5)]
    z['tops'] = [P([(L - 0.15, ny + 0.5), (L, yt + 0.6), (L + 0.5, yt), (R - 0.5, yt), (R, yt + 0.6)] + bottom)]
    z['details'] = z['details'] + [P(bez((L + 0.5, yt + 0.9), (32, yt + 2.2), (R - 0.5, yt + 0.9)), False)]
    if rib:
        z['ribs'] = [P([(x, yt + 1.6 + 0.9 * (1 - ((x - 32) / (R - L) * 2) ** 2)), (x, top(x) + 0.2)], False)
                     for x in [32 + 1.15 * k for k in range(-4, 5)]]
    return z


def lying_zip(ic):
    nx, ny, cy, _ = neck(ic)
    z = strip_neck(ic)
    L, R = nx + 0.6, 64 - nx - 0.6
    yb = ny - 0.5                                # 목 뒤(벌어진 안쪽 윗선) 옆 높이
    vb = (32, cy + ZIP_DROP)
    it = (L + ZIP_OPEN, yb)                      # 안쪽(지퍼) 윗점
    back = bez((L - 0.2, yb - 0.2), (32, yb - ZIP_ROLL - 1.6), (R + 0.2, yb - 0.2)) + bez((R - ZIP_OPEN, yb), (32, yb - 1.3), it)
    inner = bez(it, (32, yb - 1.3), (R - ZIP_OPEN, yb)) + [vb]
    outer = bez((L - 0.2, yb - 0.2), (L - ZIP_W, ny + 1.0), (L - ZIP_W * 0.55, ny + 3.4)) + \
        bez((L - ZIP_W * 0.55, ny + 3.4), (29.4, vb[1] - 1.6), (31.6, vb[1] - 0.2))[1:]
    edge = bez((31.8, vb[1] - 0.1), (30.2, cy + 2.0), it)
    flap = outer + edge
    teeth = bez((31.75, vb[1] - 0.3), (30.3, cy + 2.0), (it[0] + 0.25, it[1] + 0.2))
    z['inner'] = z.get('inner', []) + [P(inner)]
    z['tops'] = [P(back), P(flap), P(mirror(flap))]
    z['details'] = z['details'] + [P([vb, (32, vb[1] + 3.0)], False)]
    y0 = vb[1] + 0.1     # 손잡이: 옷과 같은 색 작은 탭(금속 아님)
    z['tops'].append(P([(31.62, y0 + 0.15), (31.78, y0), (32.22, y0), (32.38, y0 + 0.15), (32.38, y0 + ZIP_PULL), (32.2, y0 + ZIP_PULL + 0.2),
                        (31.8, y0 + ZIP_PULL + 0.2), (31.62, y0 + ZIP_PULL)]))
    z['zips'] = [P(teeth, False), P(mirror(teeth), False)]
    return z


def main():
    I = json.load(open(os.path.join(SRC, 'icons.json'), encoding='utf-8'))
    I.update(json.load(open(os.path.join(SRC, 'icons_b.json'), encoding='utf-8')))
    out = {'neck': {}, 'zip': {}}
    for base in ZIP_BODY:
        for fit in FITS:
            iid = base + fit
            if iid not in I:
                continue
            if base in HALF_NECK:
                out['neck'][iid] = mock_neck(I[iid], HALF_NECK[base])
            out['zip'][f'{base}z{fit}'] = lying_zip(I[iid])
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f"halfzip_b.json 하프넥 {len(out['neck'])}개 · 하프집업 {len(out['zip'])}개")


if __name__ == '__main__':
    main()
