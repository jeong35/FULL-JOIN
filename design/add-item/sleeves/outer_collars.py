"""아우터 칼라(11/23 은재 님).
- 코트·재킷 칼라(테일러드·숄·노카라·스탠드·퍼·후드)는 지금 그대로 둔다("나머지 코트나 자켓들은 둬도").
  (스탠드를 앞이 갈라진 통으로 바꾼 예시는 안 쓰기로 함.)
- 퍼자켓 '큰 칼라'는 실제로는 내려놓은 후드처럼 보여서 이름을 '후드'로 바꾸고(gen_add_item.py), 짧은 털(i192)은
  후드 면에 털 점이 비어 가슴이 휑해 보여서 몸판과 같은 털 점을 채운다. 긴 털·뽀글은 이미 결이 있어 그대로.
- 퍼자켓 스탠드 예시(좁고 낮은 통 + V 틈)는 "무슨 모양인지 모르겠다"로 안 씀. 대신 짧은 털 스탠드(i193)에
  털 점 + 지퍼를 목 끝까지 올린 안을 비교용으로 그린다(fur_stand_zip, 아직 결정 전이라 apply에는 안 넣음).
털 점(tex)은 가로 3, 세로 4.5마다 같은 자리가 되풀이되는 무늬라, 같은 세로줄의 점을 4.5씩 위로 옮겨 빈 곳을 채운다."""
import copy
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from shapely.geometry import Point, box  # noqa: E402

from geo import NUM, map_d, poly_to_d, to_poly  # noqa: E402

FUR_HOOD = 'i192'      # 퍼자켓 큰 칼라(→ 후드) · 짧은 털
FUR_REF = 'i190'       # 같은 털(짧은 털) 셔츠 카라 — 몸판 털 점이 가슴까지 다 있는 그림
FUR_STAND = 'i193'     # 퍼자켓 스탠드 · 짧은 털
PERIOD_Y = 4.5


def _pts(d):
    v = [float(x) for x in NUM.findall(d)]
    return list(zip(v[0::2], v[1::2]))


def fill_tex(ic, ref, region, margin=0.45):
    """region(도형) 안에 ref의 털 점을 세로 주기로 옮겨 채운다. 이미 있는 점과 겹치는 자리는 건너뛴다."""
    inside = region.buffer(-margin)
    have = [_pts(d)[0] for d in ic.get('tex', [])]
    add = []
    for d in ref['tex']:
        for k in range(0, 6):
            dd = map_d(d, lambda x, y, k=k: (x, y - PERIOD_Y * k))
            p = _pts(dd)
            if not all(inside.contains(Point(q)) for q in p):
                continue
            if any(abs(p[0][0] - h[0]) < 0.6 and abs(p[0][1] - h[1]) < 0.6 for h in have):
                continue
            have.append(p[0])
            add.append(dd)
    ic['tex'] = ic.get('tex', []) + add
    return len(add)


def fur_hood_dots(ic, ref):
    """후드(옛 큰 칼라) 면 = tops 첫 조각에서 안쪽(inner) 빼고 털 점을 채운다."""
    o = copy.deepcopy(ic)
    region = to_poly(o['tops'][0])
    for d in o.get('inner', []):
        region = region.difference(to_poly(d).buffer(0.5))
    n = fill_tex(o, ref, region)
    return o, n


def fur_stand_zip(ic, ref):
    """스탠드: 통에도 털 점 + 지퍼를 목 끝까지(비교용)."""
    o = copy.deepcopy(ic)
    band = to_poly(o['tops'][0])
    n = fill_tex(o, ref, band.difference(Point(32, 0).buffer(0.01)))
    top = band.bounds[1]
    o['details'] = [(f'M32,{top + 0.7:.1f} C32,19.3 32,45.5 32,52' if d.startswith('M32,12.8') else d) for d in o['details']]
    return o, n


FUR_HOODS_FURRY = ('i198', 'i199')   # 후드 · 긴 털 / 뽀글


def hood_opening(ic):
    """긴 털·뽀글 후드는 후드 면(tops)이 안쪽(inner)을 덮어 큰 칼라처럼 보였다(11/23 "후드가 맞는지 모자가 없는데").
    → 짧은 털처럼 후드 안쪽이 보이게 후드 면에서 안쪽 자리를 뚫고, 그 자리의 털 결은 뺀다."""
    o = copy.deepcopy(ic)
    hole = to_poly(o['inner'][0])
    o['tops'] = [poly_to_d(to_poly(o['tops'][0]).difference(hole.buffer(0.05)), tol=0.04)] + o['tops'][1:]
    near = hole.buffer(0.35)
    o['tex'] = [d for d in o.get('tex', []) if not any(near.contains(Point(p)) for p in _pts(d))]
    return o


def apply(src):
    """시안 그림(그림 좌표) 사전 src를 고친다. sleeves_b.main에서 '아우터' 묶음 전에 부른다.
    11/23: 짧은 털 후드에 털 점 채우던 것은 되돌림("첫번째 유지"). 긴 털·뽀글 후드는 안쪽이 보이게."""
    for iid in FUR_HOODS_FURRY:
        src[iid] = hood_opening(src[iid])
    # 스탠드(11/23 사진 2장 + "끝이 세모 말고 네모같게"): 목을 감싸는 털 칼라를 몸판과 한 덩어리로(목 밑 선 없음).
    # 짧은 털 i193은 위가 평평한 네모 칼라 + 털 점, 긴 털 i200·뽀글 i201은 원래 칼라 모양 그대로 이어 붙인다.
    src[FUR_STAND] = fur_stand_soft(src[FUR_STAND], src[FUR_REF])
    for iid in ('i200', 'i201'):
        src[iid] = fur_stand_soft(src[iid])


def fur_stand_open(ic, ref, k=0.32, lower=0.6):
    """사진 같은 털 스탠드(11/23 은재 님이 보낸 사진): 목을 감싸고 선 칼라, 앞 가운데가 V로 벌어지고
    윗모서리가 살짝 바깥으로 젖혀진다. 칼라에도 털 점, 지퍼 선은 칼라 아래부터."""
    o = copy.deepcopy(ic)
    band = to_poly(o['tops'][0])
    x0, y0, x1, y1 = band.bounds
    pivot = y1 - 1.0                  # V가 시작하는 높이(칼라 아래쪽)
    halves = []
    for side in (1, -1):
        part = band.intersection(box(32 + 0.2, y0 - 1, x1 + 1, y1 + 1) if side == 1 else box(x0 - 1, y0 - 1, 32 - 0.2, y1 + 1))
        # 위로 갈수록 바깥으로(V), 앞쪽 윗모서리는 더 젖혀지게
        def f(x, y, s=side):
            u = max(0.0, pivot - y)
            front = max(0.0, 1 - abs(x - 32) / 7)      # 가운데 쪽일수록 많이
            return x + s * (k * u * (0.45 + 0.55 * front)), y + lower * (u / (pivot - y0)) * 0
        halves.append(to_poly(map_d(poly_to_d(part, tol=0.05), f)).buffer(0.35, join_style=1).buffer(-0.35, join_style=1))
    o['tops'] = [poly_to_d(h, tol=0.05) for h in halves]
    gap_top = y0 + 0.4
    w = k * (pivot - gap_top) * 1.0
    o['inner'] = [f'M{32 - 0.25 - w:.2f},{gap_top:.2f} C{32 - w * 0.6:.2f},{gap_top + 3:.2f} {31.8:.2f},{pivot - 2:.2f} 32,{pivot + 0.4:.2f} '
                  f'C{32.2:.2f},{pivot - 2:.2f} {32 + w * 0.6:.2f},{gap_top + 3:.2f} {32 + 0.25 + w:.2f},{gap_top:.2f} Z']
    n = fill_tex(o, ref, unary_union_safe(halves))
    o['details'] = [(f'M32,{y1 + 0.2:.1f} C32,19.3 32,45.5 32,52' if d.startswith('M32,12.8') else d) for d in o['details']]
    return o, n


def unary_union_safe(gs):
    from shapely.ops import unary_union
    return unary_union(gs)


def fur_stand_photo(ic, ref, k=0.32):
    """사진처럼(11/23 은재 님: "사진에는 목부분에 선이 없잖아"): 칼라를 몸판과 한 덩어리로 이어 목 밑 선을 없앤다.
    앞 가운데만 V로 벌어지고(안쪽은 목 안 색), 털 점은 칼라까지, 앞여밈 선은 V 아래부터."""
    o, _ = fur_stand_open(ic, ref, k=k)
    from shapely.ops import unary_union
    halves = [to_poly(d) for d in o['tops']]
    body = to_poly(o['shapes'][0])
    band = to_poly(ic['tops'][0])
    x0, y0, x1, y1 = band.bounds
    pivot = y1 - 1.0
    gap = to_poly(o['inner'][0]).buffer(0.05)
    merged = unary_union([body] + halves).difference(gap)
    merged = merged.buffer(0.3, join_style=1).buffer(-0.3, join_style=1)
    o['shapes'] = [poly_to_d(merged, tol=0.04)] + o['shapes'][1:]
    o['tops'] = []
    o['details'] = [(f'M32,{pivot + 0.6:.1f} C32,19.3 32,45.5 32,52' if d.startswith(f'M32,{y1 + 0.2:.1f}') else d) for d in o['details']]
    return o


def fur_stand_soft(ic, ref=None, notch=(1.2, 1.7)):
    """입었을 때처럼(11/23 은재 님 사진 2장): 목을 둥글게 감싸고 올라온 털 칼라가 몸판과 한 덩어리(목 밑 선 없음).
    짧은 털은 네모난 통을 둥근 머리 모양으로 바꾸고 털 점을 채운다. 앞은 가운데서 만나고 맨 위만 살짝 V로 파인다.
    앞여밈 선은 칼라 꼭대기부터 밑단까지."""
    from shapely.ops import unary_union
    from shapely.geometry import Polygon
    o = copy.deepcopy(ic)
    band = to_poly(o['tops'][0])
    x0, y0, x1, y1 = band.bounds
    if ref is not None:
        # 짧은 털: 11/23 "끝이 세모 말고 네모같게" → 위가 평평하고 모서리만 둥근 네모 칼라(폭은 원래 통의 0.92배)
        w = (x1 - x0) / 2 * 0.92
        r = 1.6
        band = box(32 - w + r, y0 + 0.4 + r, 32 + w - r, y1 + 1.5).buffer(r, join_style=1)
    body = to_poly(o['shapes'][0])
    nw, nd = notch
    ny0 = band.bounds[1]
    cut = Polygon([(32 - nw, ny0 - 1), (32 + nw, ny0 - 1), (32, ny0 + nd)])
    merged = unary_union([body, band]).difference(cut).buffer(0.3, join_style=1).buffer(-0.3, join_style=1)
    o['shapes'] = [poly_to_d(merged, tol=0.04)] + o['shapes'][1:]
    o['tops'] = []
    if ref is not None:
        fill_tex(o, ref, band.difference(cut.buffer(0.4)))
    o['tex'] = [d for d in o.get('tex', []) if not any(cut.buffer(0.3).contains(Point(p)) for p in _pts(d))]
    o['details'] = [(f'M32,{ny0 + nd + 0.2:.1f} C32,19.3 32,45.5 32,52' if d.startswith('M32,12.8') else d) for d in o['details']]
    return o
