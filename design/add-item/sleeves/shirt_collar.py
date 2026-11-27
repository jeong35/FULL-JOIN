"""셔츠 카라 다시 그리기(11/23 오후 은재 님: "카라가 아니라 산 뒤집어놓은 것 같다", "목이 로봇 같다").
- 셔츠 카라(i53·i61, 블라우스와 같이 씀): 네모난 날개·납작한 띠 → 목을 따라 부드럽게 휜 뒷띠 + 끝이 살짝 둥근 날개.
- i52(셔츠 기본 그림·지금 앱 기본 셔츠 v12와 같은 그림): 선 두 줄로 그린 카라가 솟은 띠 위에 있어 산 모양 → i53 목 윤곽 + 새 카라.
그림 좌표(시안 좌표, 셔츠 배율 [0, 0.55, 1])."""
import copy
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from shapely.geometry import Polygon, box  # noqa: E402
from shapely.ops import unary_union  # noqa: E402

from geo import poly_to_d, subpaths, to_poly  # noqa: E402

C = 32.0


def _mirror(pts):
    return [(2 * C - x, y) for x, y in pts]


def collar_parts(dy=0.0):
    """[뒷띠, 오른쪽 날개, 왼쪽 날개] (path d). dy: 세로 이동(v12 좌표는 셔츠 배율만큼 0.55 아래)."""
    # 뒷띠: 위는 목둘레를 따라 거의 곧게, 아래는 가운데가 살짝 내려온 얇은 초승달
    top = [(27.0 + i * 0.5, 10.25 + 0.006 * (27.0 + i * 0.5 - C) ** 2) for i in range(21)]
    bot = [(37.0 - i * 0.5, 10.45 + 1.45 * (1 - ((37.0 - i * 0.5 - C) / 5.0) ** 2)) for i in range(21)]
    band = Polygon(top + bot).buffer(0.15, join_style=1).buffer(-0.15, join_style=1)
    # 날개: 목 옆에서 어깨 쪽으로 살짝 나갔다가 바깥선이 볼록하게 내려와 끝(살짝 둥근 뾰족)에서 가운데로 돌아온다
    wing = [(32.35, 13.65), (33.6, 12.6), (35.2, 11.5), (36.9, 10.55), (38.3, 10.7), (39.35, 11.15), (39.45, 12.4),
            (39.2, 14.3), (38.85, 16.2), (38.55, 17.05), (37.9, 16.75), (36.3, 15.75), (34.6, 14.75), (33.3, 14.1)]
    rw = Polygon(wing).buffer(0.3, join_style=1).buffer(-0.3, join_style=1)        # 오목한 곳 매끈하게
    rw = rw.buffer(-0.22, join_style=1).buffer(0.22, join_style=1)                  # 모서리 살짝만 둥글게(끝은 뾰족한 느낌 남김)
    lw = Polygon(_mirror(list(rw.exterior.coords)))
    from shapely.affinity import translate
    return [poly_to_d(translate(g, 0, dy), tol=0.02) for g in (band, rw, lw)]


def apply_collar(ic):
    """셔츠 카라 그림(tops 앞 3개가 뒷띠·날개)의 카라를 새 것으로."""
    o = copy.deepcopy(ic)
    o['tops'] = collar_parts() + o['tops'][3:]
    return o


def from_plain_shirt(ic52, ic53, dy=0.0):
    """i52: 솟은 목 띠·카라 선 두 줄을 빼고 i53의 목 윤곽 + 새 카라를 얹는다(주머니·단추는 그대로)."""
    o = copy.deepcopy(ic52)
    P52, P53 = to_poly(ic52['shapes'][0]), to_poly(ic53['shapes'][0])
    neck = box(24.6, -5, 39.4, 12.6 + dy)
    new = unary_union([P52.difference(neck), P53.intersection(neck)]).buffer(0.1, join_style=1).buffer(-0.1, join_style=1)
    if new.geom_type != 'Polygon':
        new = max(new.geoms, key=lambda g: g.area)
    o['shapes'] = [poly_to_d(new, tol=0.03)] + o['shapes'][1:]
    o['details'] = [d for d in o['details'] if not (max(p[1] for p in subpaths(d)[0]) < 17.0 + dy and len(subpaths(d)[0]) > 1)]
    o['tops'] = collar_parts(dy) + o.get('tops', [])
    return o


SHIRT_COLLAR_IDS = ('i53', 'i61')


def apply(src):
    for iid in SHIRT_COLLAR_IDS:
        src[iid] = apply_collar(src[iid])
    src['i52'] = from_plain_shirt(src['i52'], src['i53'])


def v12_shirt(v12, ic53_v12):
    """지금 앱 기본 셔츠 그림(v12 '셔츠', i52와 같은 그림을 v12 좌표로)에도 같은 카라(소매는 v12 그대로)."""
    return from_plain_shirt(v12, ic53_v12, dy=0.55)
