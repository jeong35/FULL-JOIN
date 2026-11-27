"""B안: 옷 추가 시안 그림(source/icons.json)의 긴소매를 지금 앱 그림(v12)의 '코트 팔'로 다시 그린다.

11/16에 v12 긴소매 19종을 다듬은 방법(design/kind-icons/README.md '팔 모양 통일')을 시안 그림에 그대로 쓴다.
- 팔은 어깨 끝(소매 구분선 시작점)에서 몸 옆으로 곧게 내려오고, 폭은 코트 소매의 1.35배, 팔꿈치는 0.45만 들어간다.
- 어깨선은 소매 구분선보다 1.6 목 쪽에서부터 기울기 0.24로 내려오다 어깨 끝에서 둥글게 팔로 이어진다.
- 몸판·목·칼라는 그대로, 소매 길이는 옷마다 원래대로. 소매 위 선(시보리·누빔·결)은 새 소매 폭에 맞춰 옮긴다.

시안 그림은 v12보다 조금 작아서 앱이 종류마다 배율(place)을 씌운다(gen_add_item.py). 그래서
  시안 좌표 → (그림 transform, 종류 place) → v12 좌표에서 소매를 바꾸고 → 다시 시안 좌표로 되돌린다.
v12 긴소매는 크기 맞추기 전에 팔을 바꾸고 나중에 종류마다 늘리고 줄였다. 그래서 종류마다 팔 치수에 곱할 배율 g를
v12 그림의 팔과 가장 잘 겹치게 골라 쓴다(fit_g).
"""
import json
import math

import numpy as np
import shapely
import os
import sys

from shapely.affinity import scale
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import split, unary_union

sys.path.insert(0, os.path.dirname(__file__))
from geo import C, fmt, map_d, poly_to_d, subpaths, to_poly  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'source')
KI = os.path.join(HERE, '..', '..', 'kind-icons')

# ── 코트 팔 치수(design/kind-icons 11/16과 같은 값). (어깨 끝 S에서 x 차이, 소매 길이 비율 t) ──
OUTER = [(0.0, 0.0), (1.2, 0.012), (2.3, 0.036), (3.3, 0.10), (3.85, 0.17), (4.25, 0.28), (4.75, 0.44), (5.3, 0.61),
         (5.85, 0.77), (6.2, 0.89), (6.2, 0.955), (5.6, 0.99), (4.2, 1.0)]
INNER = [(0.0, 0.0), (-0.2, 0.18), (-0.45, 0.42), (-0.4, 0.58), (-0.1, 0.74), (0.35, 0.88), (0.8, 0.965), (1.25, 0.995), (2.0, 1.0)]
WIDEN = 1.35
CAP_T = 0.17
SLOPE = 0.24
CAP_IN = 1.6

# ── 핏별 그림(11/20 원칙, 11/22 "슬림핏은 모든 상의 모양에") ──
# 레귤러: 위 코트 팔 그대로. 슬림: 어깨 폭은 거의 그대로, 허리가 들어가고(밑단에서 다시 조금 나옴) 소매가 조금 가늘다.
# 오버사이즈: 그림을 키우지 않고 천이 남게 — 어깨가 처지고(드롭숄더), 몸통·소매가 길고, 소매가 넉넉하게 부풀었다가
# 소매 끝에서 모인다. 선은 더하지 않고 윤곽만. 치수는 11/20 니트 초안(FULL-JOIN-evals/design/fit-drafts)과 같게 맞췄다.
# seam_end_t: 소매 구분선(겨드랑이~소매 안쪽)이 끝나는 높이. 오버사이즈는 그 아래가 시보리라 몸판과 떨어진다.
# cap_round: 어깨 끝이 팔로 꺾이는 곳의 둥근 정도(1 = 둥글게, 작을수록 살짝 각지게 — 드롭숄더 재봉선 자리).
REGULAR = dict(outer=OUTER, inner=INNER, widen=WIDEN, slope=SLOPE, cap_t=CAP_T, cap_in=CAP_IN, max_yc=None, seam_end_t=1.0, cap_round=1.0,
               hem_step=0.0, box=False, rib=0.0)
# 11/22 23시 은재 님: 슬림 가로폭이 너무 좁다 → 어깨 폭은 거의 그대로, 허리에서 들어갔다가 밑단에서 다시 살짝 나오게
# (참고: 컴포트·레귤러·슬림·타이트 핏 가이드 그림). 소매만 조금 가늘게.
SLIM = dict(REGULAR, widen=WIDEN * 0.88)
# 11/23 오후 은재 님: 슬림은 몸에 딱 붙는 핏(골지티 사진) — 허리가 들어가고(waist: 허리에서 몸판 반폭을 이만큼 줄임),
# 부해 보이지 않게 소매를 더 가늘게(widen 1.19 → 1.0). 허리는 몸판만 좁히고 소매는 그대로라 팔과 허리 사이가 벌어진다.
SLIM = dict(SLIM, widen=1.0, waist=0.20)
# 11/22 밤 은재 님: 부푼 풍선 소매는 이상하다 → 사이즈표 그림의 후드집업·카디건처럼.
# 어깨선이 위팔까지 내려오고(드롭숄더), 소매는 몸에 붙지 않고 바깥으로 비스듬히 내려가는 넓은 통(겨드랑이 아래로 몸판과 틈),
# 소매 끝은 시보리로 살짝 모이고, 몸판은 옆선이 곧은 박스 모양 + 밑단 시보리가 조금 안으로.
OVER_OUTER = [(0.0, 0.0), (1.8, 0.03), (3.4, 0.09), (5.4, 0.2), (7.4, 0.36), (8.7, 0.5), (9.8, 0.65), (10.7, 0.8), (11.1, 0.885),
              (10.5, 0.9), (10.4, 0.97), (10.1, 0.995), (9.6, 1.0)]
# 11/23 저녁 은재 님 "왜 오버사이즈 팔 통이 더 작은지": 레귤러 소매는 widen 1.35로 굵어졌는데 오버사이즈는 그대로라 아래팔이
# 오히려 가늘었다(아래팔 6.7 vs 7.9, 소매 끝 5.4 vs 7.7). → 안쪽 선을 옮겨 아래팔 통 8.7~8.9(레귤러보다 조금 굵게), 소매 끝은 조금만 모이게.
# 어깨가 처지는 모양·겨드랑이 아래 몸판과의 틈은 그대로(위쪽 0~0.37은 안 바꿈).
OVER_INNER = [(0.0, 0.0), (-0.5, 0.1), (-0.7, 0.22), (-0.6, 0.32), (-0.3, 0.37), (0.4, 0.5), (1.1, 0.65), (1.8, 0.8), (2.2, 0.885),
              (2.9, 0.9), (3.0, 0.97), (3.5, 0.995), (4.2, 1.0)]
# seam_end_t: 겨드랑이(소매 구분선이 몸판에서 떨어지는 곳). box: 그 아래 몸판 옆선을 곧게. rib: 밑단 시보리가 안으로 들어가는 폭.
OVER = dict(outer=OVER_OUTER, inner=OVER_INNER, widen=1.0, slope=0.30, cap_t=0.2, cap_in=1.6, max_yc=59.6, seam_end_t=0.37,
            cap_round=0.45, hem_step=0.0, box=True, rib=0.9)
PROFILES = {None: REGULAR, '슬림': SLIM, '오버사이즈': OVER}
# 11/23 저녁 은재 님 "트렌치코트 팔 너무 긴데요": 오버사이즈는 몸판을 넓히면(k 1.4) 밑단으로 퍼지는 코트(롱·트렌치)의 몸판이
# 어깨선 바깥까지 나와 소매 끝을 밑단으로 잘못 찾았다(소매가 레귤러의 1.38배, 밑단까지). → 오버사이즈 소매 길이는 같은 그림
# 레귤러 소매의 OVER_LEN배까지만(다른 옷은 1.03~1.15배라 그대로).
OVER_LEN = 1.12
def over_len_prof(prof, fit, name, reg_len):
    return dict(prof, max_len=reg_len * OVER_LEN) if fit == '오버사이즈' and reg_len and name not in SHORT_KINDS else prof
# 밑단 시보리가 있는 옷만 오버사이즈 밑단을 안으로 들인다(셔츠·블라우스·긴소매티는 밑단이 곧게).
RIB_HEM = {'니트', '맨투맨', '후드', '트레이닝 상의', '카디건', '후드집업'}


# 11/23 은재 님: 반소매티 소매가 세모 같다 → 긴팔(코트 팔)과 같은 팔을 그려 위쪽만 남긴 짧은 소매.
# short_L: 같은 팔을 긴팔로 그렸을 때 길이(어깨 끝 → 소매 끝, 긴소매티와 같게), short_t: 그중 남길 비율,
# flare: 소매 끝으로 갈수록 바깥으로 살짝 넉넉하게(티셔츠 소매는 팔보다 조금 넓다).
SHORT_KINDS = {'반소매티'}
SHORT = {None: dict(short_L=39.0, short_t=0.38, flare=0.34, hem=1.8, body_hem=1.5), '슬림': dict(short_L=39.0, short_t=0.33, flare=0.08, hem=1.8, body_hem=1.5),
         '오버사이즈': dict(short_L=39.0, short_t=0.44, flare=0.12, hem=2.0, body_hem=1.6)}


# 원피스 반팔(dresses.py)이 쓰는 반소매티 소매: 시안 5 때 값 그대로(반팔 슬림을 바꿔도 원피스는 안 바뀌게) → '그림id@원피스'
DRESS_SRC = dict(short_L=39.0, short_t=0.37, flare=0.2, hem=1.8, body_hem=1.5)


def profile_for(name, fit):
    p = PROFILES[fit]
    p = dict(p, rib=0.0) if fit == '오버사이즈' and name not in RIB_HEM else p
    if name in SHORT_KINDS:
        p = dict(p, **SHORT[fit])
    return p
FIT_BODY = {
    # k: 목(가운데에서 6) 바깥 몸판 가로 배율, k2: 어깨 끝(14) 바깥(짧은 소매) 배율, nip: 허리 들어감, e: 가슴(24) 아래 세로 늘림
    '슬림': dict(k=0.93, k2=0.92, nip=1.4, e=0.0, hem_in=0.0),
    # hem_in: 오버사이즈 밑단이 시보리로 모이며 안으로 들어가는 정도(소매 끝과 몸판 밑단 사이에 틈이 생기게)
    '오버사이즈': dict(k=1.4, k2=1.15, nip=0.0, e=0.22, hem_in=0.0),
}


def hem_y(ic):
    """몸판 밑단 높이(가운데 ±6의 가장 아래)."""
    ys = [p[1] for d in ic['shapes'] for sp in subpaths(d, step=0.5) for p in sp if abs(p[0] - C) < 6]
    return max(ys) if ys else 52.0


# 종류별 핏 몸판 배율 바꾸기(11/23 오후): 나시 슬림은 덜 좁게(좁히면 세로로 길어 보였음)
FIT_BODY_BY_NAME = {('슬리브리스', '슬림'): dict(k=0.97, k2=0.96),
                    # 반팔 슬림(11/23 B안): 가로폭을 줄여 옆으로 넓고 부해 보이지 않게
                    ('반소매티', '슬림'): dict(k=0.88, k2=0.86),
                    # 셔츠·블라우스 슬림: 카라·어깨 쪽(가운데 8.5)은 레귤러 그대로(좁히면 카라가 어깨보다 커 보여 목이 이상했음)
                    ('셔츠', '슬림'): dict(d0=8.5), ('블라우스', '슬림'): dict(d0=8.5)}


# 종류 자체 몸판(모든 핏에 먼저 적용, 11/23 은재 님 "셔츠도 가로폭이 되게 긴 느낌" → C안): 몸판·소매 자리를 12% 좁게 +
# 가슴 아래 6% 길게. 카라·목(가운데 8.5)은 그대로. 블라우스는 셔츠와 카라 그림(i53~i66)을 같이 쓰므로 같은 값.
FIT_BODY['기본'] = dict(k=1.0, k2=1.0, nip=0.0, e=0.0, hem_in=0.0)
BASE_BODY = {'셔츠': dict(k=0.88, k2=0.88, e=0.06, d0=8.5), '블라우스': dict(k=0.88, k2=0.88, e=0.06, d0=8.5)}
for _n, _p in BASE_BODY.items():
    FIT_BODY_BY_NAME[(_n, '기본')] = _p


def base_body(v, name):
    """BASE_BODY가 있는 종류는 핏 배율 전에 몸판을 먼저 바꾼다(v12 좌표 그림)."""
    return affine(v, fit_map('기본', hem_y(v), name)) if name in BASE_BODY else v


def fit_map(fit, hem=None, name=None):
    """v12 좌표 (x, y) → 핏 좌표. 목둘레(가운데 ±6)는 그대로 두고 그 바깥만 가로로 줄이거나 늘린다.
    hem: 밑단 높이. 오버사이즈로 늘려도 밑단이 59를 넘지 않게(칸 밖으로 잘리지 않게) 늘림을 줄인다."""
    import math
    p = dict(FIT_BODY[fit], **FIT_BODY_BY_NAME.get((name, fit), {}))
    if hem and p['e'] and hem > 24:
        p['e'] = max(0.0, min(p['e'], (59.0 - 24) / (hem - 24) - 1))
    d0, w, dS = p.get('d0', 6.0), 2.0, 14.0     # d0: 가운데에서 이만큼은 그대로(목·카라)
    k, k2 = p['k'], p['k2']

    def m(d):
        if d <= d0:
            return d
        if d <= d0 + w:
            t = d - d0
            return d0 + t + (k - 1) * t * t / (2 * w)
        base = d0 + w + (k - 1) * w / 2
        if d <= dS:
            return base + k * (d - d0 - w)
        return base + k * (dS - d0 - w) + k2 * (d - dS)

    def f(x, y):
        dx = x - C
        sg = 1 if dx >= 0 else -1
        d = abs(dx)
        nd = m(d)
        if p['nip'] and d > d0:
            nd -= p['nip'] * math.exp(-((y - 34) / 7) ** 2) * min(1.0, (d - d0) / 7)
        if p['hem_in'] and hem and d > d0:
            u = min(1.0, max(0.0, (y - (hem - 4.0)) / 2.0))
            nd -= p['hem_in'] * u * u * (3 - 2 * u) * min(1.0, (d - d0) / 5)
        ny = y if y <= 24 else 24 + (y - 24) * (1 + p['e'])
        return C + sg * nd, ny
    return f

# ── 종류 배율(place): gen_add_item.py와 같은 계산 ──
SERVER_KIND = {'반소매티': '반소매티셔츠', '긴소매티': '긴소매티셔츠', '슬리브리스': '민소매', '사파리재킷': '야상',
               '트레이닝 상의': '트레이닝상의', '트레이닝 하의': '조거팬츠'}
NEW_LIKE = {'트레이닝상의': '맨투맨', '카고팬츠': '코튼팬츠', '트위드자켓': '재킷', '퍼자켓': '레더재킷', '무스탕': '레더재킷',
            '숏코트': '코트', '하프코트': '코트', '롱코트': '코트', '퍼코트': '코트', '스타킹': '레깅스', '양말': '스니커즈'}
MOCK_OF_V12 = {'코트': '하프코트'}
CENTER = (32.0, 32.6)


def load():
    J = lambda p: json.load(open(p, encoding='utf-8'))
    return (J(os.path.join(SRC, 'icons.json')), J(os.path.join(SRC, 'specs.json')), J(os.path.join(SRC, 'weaves.json')),
            J(os.path.join(KI, 'icons_v12.json')))


def nums(d):
    import re
    return [float(x) for x in re.findall(r'-?\d+\.?\d*', d)]


def bbox(ic):
    t = ic.get('transform') or [0, 0, 1]
    xs, ys = [], []
    for d in ic['shapes'] + ic.get('straps', []):
        n = nums(d)
        xs += [t[0] + v * t[2] for v in n[0::2]]
        ys += [t[1] + v * t[2] for v in n[1::2]]
    return min(xs), min(ys), max(xs), max(ys)


def places(ICONS, SPECS, V12):
    by_name = {}
    for s in SPECS:
        by_name.setdefault(SERVER_KIND.get(s['name'], s['name']), s)

    def place_for(kind, base_id):
        v = NEW_LIKE.get(kind, kind)
        mock = by_name[MOCK_OF_V12.get(v, v)]
        a, b = bbox(ICONS[mock['baseIcon']]), bbox(V12[v])
        s = (b[3] - b[1]) / (a[3] - a[1])
        a = bbox(ICONS[base_id])
        cx, cy = (a[0] + a[2]) / 2, (a[1] + a[3]) / 2
        return [CENTER[0] - cx * s, CENTER[1] - cy * s, s]
    return {SERVER_KIND.get(s['name'], s['name']): place_for(SERVER_KIND.get(s['name'], s['name']), s['baseIcon'])
            for s in SPECS if not s['baseIcon'].startswith('x_')}


def icon_ids(spec):
    ids = {spec['baseIcon']}
    for g in spec['groups']:
        ids |= {o['icon'] for o in g['options'] if o['icon']}
    for c in spec.get('combos', []):
        ids |= set(c['map'].values())
    return ids


# ── 좌표 옮기기 ──
POINT_LAYERS = ('shapes', 'shade', 'details', 'seams', 'tops', 'inner', 'lining', 'metals', 'tex', 'plain', 'straps', 'chains', 'weave', 'ribs')


def affine(ic, fn):
    out = {}
    for k, v in ic.items():
        if k in POINT_LAYERS:
            out[k] = [map_d(d, fn) for d in v]
        elif k == 'dots':
            out[k] = [[*fn(x, y), r] for x, y, r in v]
        else:
            out[k] = v
    return out


def fwd(place, t):
    """시안 좌표 → v12 좌표."""
    t = t or [0, 0, 1]
    return lambda x, y: (place[0] + place[2] * (t[0] + t[2] * x), place[1] + place[2] * (t[1] + t[2] * y))


def inv(place, t):
    t = t or [0, 0, 1]
    return lambda x, y: (((x - place[0]) / place[2] - t[0]) / t[2], ((y - place[1]) / place[2] - t[1]) / t[2])


# ── 소매 바꾸기(v12 좌표) ──
def mirror(g):
    return scale(g, xfact=-1, yfact=1, origin=(C, 0))


def span(poly, y):
    inter = poly.intersection(LineString([(-10, y), (80, y)]))
    xs = [c[0] for g in getattr(inter, 'geoms', [inter]) if not g.is_empty for c in g.coords]
    return (min(xs), max(xs)) if xs else None


def bez(p0, p1, p2, p3, n=18):
    out = []
    for i in range(n + 1):
        t = i / n
        a, b, c, e = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + e * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + e * p3[1]))
    return out


def new_sleeve(S, yc, A, g, prof=REGULAR):
    xs, ys = S
    L = yc - ys
    OUT, INN, WID = prof['outer'], prof['inner'], prof['widen']
    q = next(p for p in OUT if p[1] >= prof['cap_t'])
    Q = (xs + q[0] * WID * g, ys + q[1] * L)
    w, h = Q[0] - A[0], Q[1] - A[1]
    P1 = (A[0] + 0.62 * w, min(A[1] + 0.62 * w * prof['slope'], Q[1] - 0.3 * h))
    cr = prof['cap_round']
    P2 = (Q[0] - (0.03 + 0.3 * (1 - cr)) * w, Q[1] - 0.42 * h * cr)
    cap = bez(A, P1, P2, Q)
    cl = LineString(cap)
    hit = cl.intersection(LineString([(xs, -5), (xs, 80)]))
    sy = min(c[1] for gg in getattr(hit, 'geoms', [hit]) for c in gg.coords) if not hit.is_empty else ys
    outer = cap + [(xs + dx * WID * g, ys + t * L) for dx, t in OUT if t > q[1]]
    inner = [(xs, sy + 0.15)] + [(xs + dx * g, ys + t * L) for dx, t in INN][1:]
    ring = outer + list(reversed(inner))
    above = Polygon([(A[0], -5), A] + cap + [(Q[0] + 12, Q[1]), (Q[0] + 12, -5)]).buffer(0)
    return Polygon(ring).buffer(0), inner, above


def x_at(line, y):
    """선(점 목록)의 y 높이 x. 범위 밖이면 None."""
    for (x0, y0), (x1, y1) in zip(line, line[1:]):
        if (y0 - y) * (y1 - y) <= 0 and y0 != y1:
            return x0 + (x1 - x0) * (y - y0) / (y1 - y0)
    return None


def line_d(pts):
    return 'M' + ' L'.join(f'{fmt(x)},{fmt(y)}' for x, y in pts)


WARP_LAYERS = ('details', 'weave', 'tops', 'metals', 'plain', 'inner', 'lining', 'shade', 'tex', 'ribs')


def top_y(geom, x):
    vl = geom.intersection(LineString([(x, -5), (x, 80)]))
    ys = [c[1] for gg in getattr(vl, 'geoms', [vl]) if not gg.is_empty for c in gg.coords]
    return min(ys) if ys else None


def off_sleeve(S, yc, yb, g, prof=REGULAR):
    """어깨가 드러나는 쪽(오프숄더·원숄더의 빈 어깨): 어깨선을 다시 그리지 않고, 목 밴드 아래에서 팔이 곧게 내려온다.
    밴드(tops)가 팔 윗부분을 덮으므로 팔 윗변은 밴드 아래(yb)에 숨는다."""
    xs, ys = S
    L = yc - ys
    outer = [(xs + dx * prof['widen'] * g, ys + t * L) for dx, t in prof['outer'] if t >= 0.10]
    top = (outer[0][0], yb - 1.2)
    inner = [(xs, yb)] + [(xs + dx * g, ys + t * L) for dx, t in prof['inner'] if ys + t * L > yb + 0.3]
    ring = [(xs, yb - 1.2), top] + outer + list(reversed(inner))
    return Polygon(ring).buffer(0), inner


def bottom_y(geom, x):
    if geom is None:
        return None
    vl = geom.intersection(LineString([(x, -5), (x, 80)]))
    ys = [c[1] for gg in getattr(vl, 'geoms', [vl]) if not gg.is_empty for c in gg.coords]
    return max(ys) if ys else None


def right_side(P, seam, g, T=None, prof=REGULAR):
    """오른쪽 소매 하나: 옛 소매 도형, 새 소매, 새 구분선, 지울 어깨 위쪽, 밴드 아래 높이(오프숄더).
    T: 덮는 면(tops) 도형 — 오프숄더 목 밴드의 아랫선을 찾는 데 쓴다."""
    S, N = seam[0], seam[-1]
    rows = [y / 10 for y in range(int(S[1] * 10), 640) if (span(P, y / 10) or (0, 0))[1] > S[0] + 3.0 * g]
    yc = max(rows) + 0.1
    attached = yc - N[1] < 2.0
    if prof['max_yc']:
        yc = min(yc, prof['max_yc'])
    if prof.get('max_len'):
        yc = min(yc, S[1] + prof['max_len'])
    end = seam[-1]
    tail = [(80, end[1] + 0.3)] if attached else [(end[0], 70)]
    ln = LineString([(seam[0][0], -2)] + [tuple(p) for p in seam] + tail)
    ref = Point(seam[0][0] + 4, (seam[0][1] + end[1]) / 2)
    old = unary_union([gg for gg in split(P, ln).geoms if gg.distance(ref) < 0.01])
    body_top = top_y(P.difference(old.buffer(0.02)), S[0] - prof['cap_in'] * g)
    off = body_top is None or body_top > S[1] + 2.0
    if off:
        yb = bottom_y(T, S[0]) or top_y(P, S[0] + 0.3) or S[1]
        slv, inner = off_sleeve(S, yc, yb, g, prof)
        above = None
    else:
        yb = None
        A = (S[0] - prof['cap_in'] * g, body_top)
        slv, inner, above = new_sleeve(S, yc, A, g, prof)
    seam_end = S[1] + prof['seam_end_t'] * (yc - S[1]) + 0.01
    hem_lines = []
    if prof.get('short_L'):
        slv, inner, yc, seam_end = short_cut(S, A if not off else None, yb, g, prof)
        hem_lines = short_cut.hem
    return dict(S=S, yc=yc, old=old, slv=slv, inner=inner, above=above, off=off, yb=yb, seam=[tuple(p) for p in seam],
                seam_end=seam_end, hem_lines=hem_lines)


def short_cut(S, A, yb, g, prof):
    """짧은 소매: 긴팔과 같은 팔을 그린 뒤 팔 방향에 거의 수직으로 자르고, 끝으로 갈수록 바깥으로 살짝 넓힌다."""
    yl = S[1] + prof['short_L']
    if A is None:
        slv, inner = off_sleeve(S, yl, yb, g, prof)
    else:
        slv, inner, _ = new_sleeve(S, yl, A, g, prof)
    y_cut = S[1] + prof['short_t'] * prof['short_L']
    xi = x_at(inner, y_cut) or inner[-1][0]
    # 팔이 바깥으로 조금 기울어 있어 밑단은 바깥쪽이 살짝 올라간다
    keep = Polygon([(xi - 30, -10), (xi + 40, -10), (xi + 40, y_cut - 0.16 * 40), (xi, y_cut), (xi - 30, y_cut)]).buffer(0)
    cut = slv.intersection(keep)
    if cut.geom_type != 'Polygon':
        cut = max(cut.geoms, key=lambda q: q.area)
    fl = prof.get('flare', 0.0)

    def widen(x, y):
        u = max(0.0, min(1.0, (y - S[1]) / (y_cut - S[1])))
        return (x + (x - xi) * fl * u * u, y) if x > xi else (x, y)
    cut = to_poly(map_d(poly_to_d(cut, tol=0.04), widen)).buffer(0.25, join_style=1).buffer(-0.25, join_style=1)
    inner = [p for p in inner if p[1] < y_cut] + [(xi, y_cut)]
    # 소매단 선(11/23 참고 그림: 티셔츠 소매 끝 박음질·밴드): 밑단과 나란히 조금 위
    hem = []
    if prof.get('hem'):
        k = 0.16 / (1 + fl)
        hl = LineString([(xi - 4, y_cut - prof['hem'] + k * 4), (xi + 40, y_cut - prof['hem'] - k * 40)]).intersection(cut.buffer(-0.28))
        for gg in getattr(hl, 'geoms', [hl]):
            if not gg.is_empty and gg.length > 1:
                hem.append(line_d(list(gg.coords)))
    short_cut.hem = hem
    return cut, inner, y_cut + 0.3, y_cut


def body_hem_line(poly, details, off):
    """몸판 밑단과 나란히 off 위에 긋는 밑단 선. 밑단 근처에 가로선이 이미 있으면 안 긋는다."""
    if not off:
        return []
    b = poly.bounds
    yb = bottom_y(poly, C) or b[3]
    for d in details:
        sp = subpaths(d)[0]
        xs, ys = [p[0] for p in sp], [p[1] for p in sp]
        if max(xs) - min(xs) > 8 and min(ys) > yb - 3.0:
            return []
    sh = span(poly, yb - off - 0.6)
    if not sh:
        return []
    inset = poly.buffer(-off)
    pts = [p for p in inset.exterior.coords if p[1] > yb - off - 1.2 and sh[0] + 0.9 < p[0] < sh[1] - 0.9]
    if len(pts) < 2:
        return []
    pts = sorted(pts)
    return [line_d(pts)]


def process(ic, g=1.0, prof=REGULAR):
    """v12 좌표의 그림 하나 → (새 그림, 정보, 소매 위 점 옮기기 함수). 왼쪽은 좌우를 뒤집어 오른쪽처럼 처리한다
    (원숄더처럼 양쪽 어깨가 다른 옷도 되게)."""
    P = unary_union([to_poly(d) for d in ic['shapes']])
    seams = [subpaths(d)[0] for d in ic['seams']]
    R = max(seams, key=lambda s: s[0][0])
    Lf = min(seams, key=lambda s: s[0][0])
    T = unary_union([to_poly(d) for d in ic['tops']]) if ic.get('tops') else None
    r = right_side(P, R, g, T, prof)
    lm = right_side(mirror(P), [(2 * C - x, y) for x, y in Lf], g, mirror(T) if T is not None else None, prof)
    # 왼쪽 결과를 다시 뒤집는다.
    mx = lambda pts: [(2 * C - x, y) for x, y in pts]
    l = dict(lm, S=(2 * C - lm['S'][0], lm['S'][1]), old=mirror(lm['old']), slv=mirror(lm['slv']), inner=mx(lm['inner']), seam=mx(lm['seam']),
             above=mirror(lm['above']) if lm['above'] is not None else None,
             hem_lines=[map_d(d, lambda x, y: (2 * C - x, y)) for d in lm.get('hem_lines', [])])
    body = P.difference(r['old'].buffer(0.02)).difference(l['old'].buffer(0.02))
    for sd in (r, l):
        if sd['above'] is not None:
            body = body.difference(sd['above'])
    # 새 구분선 바깥은 소매 자리: 소매 끝과 밑단이 붙은 옷(코트 등)은 옛 밑단 모서리가 남아 삐져나오지 않게 지운다.
    for sd, sgn in ((r, 1), (l, -1)):
        inn = sd['inner']
        far = 95 if sgn > 0 else -31
        beyond = Polygon(list(inn) + [(inn[-1][0], 75), (far, 75), (far, inn[0][1])]).buffer(0)
        body = body.difference(beyond)
    # 오버사이즈: 소매 구분선이 끝난 아래로 몸판 밑단이 안으로 들어가 소매 끝과 떨어진다.
    for sd, sgn in ((r, 1), (l, -1)):
        sd['step_x'] = None
        if prof['hem_step'] and not sd['off']:
            xe = x_at(sd['inner'], sd['seam_end'] - 0.05) or sd['S'][0]
            sx = xe - sgn * prof['hem_step'] * g
            far = 95 if sgn > 0 else -31
            notch = Polygon([(sx, sd['seam_end'] + 0.7), (far, sd['seam_end'] + 0.7), (far, 80), (sx, 80)]).buffer(0)
            notch = notch.buffer(0.6).buffer(-0.6)
            body = body.difference(notch)
            sd['step_x'], sd['step_y'] = sx, sd['seam_end'] + 0.5
    # 오버사이즈(박스): 겨드랑이 아래 몸판 옆선을 곧게 세우고(옛 옆선 굴곡·밑단 퍼짐 없앰), 밑단 시보리는 조금 안으로.
    if prof.get('box'):
        for sd, sgn in ((r, 1), (l, -1)):
            if sd['off']:
                continue
            ay = sd['seam_end']
            ax = x_at(sd['inner'], ay - 0.05) or sd['S'][0]
            far = 95 if sgn > 0 else -31
            hx = sd['S'][0] - 3.0 * sgn
            vl = body.intersection(LineString([(hx, -5), (hx, 80)]))
            hem = max((c[1] for gg in getattr(vl, 'geoms', [vl]) if not gg.is_empty for c in gg.coords), default=sd['yc'])
            body = body.difference(Polygon([(ax, ay), (far, ay), (far, 80), (ax, 80)]))
            sd['box_x'], sd['box_y'] = ax, ay
            fill = Polygon([(hx, ay - 0.6), (ax, ay - 0.6), (ax, hem), (hx, hem)]).buffer(0)
            body = body.union(fill.intersection(Polygon([(hx, -5), (ax, -5), (ax, 80), (hx, 80)])))
            if prof.get('rib'):
                rx = ax - prof['rib'] * sgn
                body = body.difference(Polygon([(rx, hem - 3.2), (far, hem - 3.2), (far, 80), (rx, 80)]).buffer(0.5).buffer(-0.5))
                sd['step_x'], sd['step_y'] = rx, hem - 3.4
    parts = [body]
    for sd, sgn in ((r, 1), (l, -1)):
        S, inner = sd['S'], sd['inner']
        hx = S[0] - 1.6 * g * sgn
        vl = body.intersection(LineString([(hx, -5), (hx, 80)]))
        hem = max((c[1] for gg in getattr(vl, 'geoms', [vl]) if not gg.is_empty for c in gg.coords), default=sd['yc'])
        y0 = inner[0][1]
        # 몸판 옆을 채우는 곳은 소매 구분선이 끝나는 데까지만(오버사이즈의 시보리 아래까지 채우면 밑단 모서리가 뾰족하게 남는다)
        pts = [p for p in inner if p[1] <= min(hem, sd['seam_end'])]
        rest = [p for p in inner if p[1] > hem]
        last = pts[-1][0] if (pts and (pts[-1][1] >= sd['seam_end'] - 0.02 or not rest)) else (rest[0][0] if rest else pts[-1][0])
        strip = Polygon([(hx, y0)] + pts + [(last, hem), (hx, hem)]).buffer(0)
        far = 80 if sgn > 0 else -16
        strip = strip.intersection(Polygon([(hx, y0), (far, y0), (far, hem), (hx, hem)]).buffer(0))
        if sd.get('step_x') is not None:
            strip = strip.intersection(Polygon([(hx, y0), (far, y0), (far, sd['step_y'] + 0.2), (hx, sd['step_y'] + 0.2)]).buffer(0))
        sd['strip'] = strip
        parts += [strip, sd['slv']]
    new = unary_union(parts).buffer(0.05).buffer(-0.05)
    if new.geom_type != 'Polygon':
        new = max(new.geoms, key=lambda gg: gg.area)
    out = dict(ic)
    out['shapes'] = [poly_to_d(new)]
    seam_ds = []
    for sd in (r, l):
        seam = [p for p in sd['inner'] if p[1] <= sd['yc'] - 0.25]
        sm = LineString(seam)
        seam_ds.append(line_d([sm.interpolate(i / 24, normalized=True).coords[0] for i in range(25)]))
    out['seams'] = seam_ds

    sides = [(r['old'].buffer(0.35), r['slv'], r, 1), (l['old'].buffer(0.35), l['slv'], l, -1)]

    def warp(x, y):
        for old, nw, sd, sgn in sides:
            if sd['off'] and y < sd['yb'] + 0.6:
                # 오프숄더 목 밴드: 높이는 그대로 두고, 소매 쪽 끝만 밴드 바로 아래 높이의 새 팔 폭에 맞춘다.
                if (x - sd['S'][0]) * sgn <= 0:
                    continue
                yr = sd['yb'] + 0.6
                a, b = span(old, yr) or (None, None)
                c2 = span(nw, yr)
                if a is None or c2 is None or b - a < 0.5:
                    return x, y
                if sgn > 0:
                    return sd['S'][0] + (x - sd['S'][0]) * (c2[1] - sd['S'][0]) / max(0.5, b - sd['S'][0]), y
                return sd['S'][0] - (sd['S'][0] - x) * (sd['S'][0] - c2[0]) / max(0.5, sd['S'][0] - a), y
            if old.contains(Point(x, y)):
                a, b = span(old, y) or (None, None)
                c2 = span(nw, min(max(y, nw.bounds[1] + 0.01), nw.bounds[3] - 0.01))
                if a is None or c2 is None or b - a < 0.5:
                    return x, y
                u = (x - a) / (b - a)
                return c2[0] + u * (c2[1] - c2[0]), y
        return x, y
    def body_fix(x, y):
        """몸판 선: 옛 구분선 쪽 끝을 새 구분선까지 늘리고(허리 끈·밑단이 옆선에 닿게), 새 구분선 밖(소매)으로는 못 나가게."""
        for old, nw, sd, sgn in sides:
            if sd['off'] and y < sd['yb'] + 0.6:
                if (x - sd['S'][0]) * sgn > 0:
                    return warp(x, y)
                continue
            xo, xn = x_at(sd['seam'], y), x_at(sd['inner'], y)
            if sd.get('box_x') is not None and y > sd['box_y'] and (x - (sd['box_x'] - 0.05 * sgn)) * sgn > 0:
                x = sd['box_x'] - 0.05 * sgn
            if xo is None or xn is None:
                continue
            x0 = xo - 4 * sgn
            if (x - x0) * sgn < 0:
                continue
            nx = x0 + (x - x0) * (xn - x0) / (xo - x0) if (x - xo) * sgn <= 0.6 else x
            if (nx - (xn - 0.05 * sgn)) * sgn > 0:
                nx = xn - 0.05 * sgn
            if sd.get('box_x') is not None and y > sd['box_y'] and (nx - (sd['box_x'] - 0.05 * sgn)) * sgn > 0:
                nx = sd['box_x'] - 0.05 * sgn   # 겨드랑이 아래 몸판 선(허리 끈 등)은 곧은 옆선까지만
            if sd.get('step_x') is not None and y > sd['step_y'] and (nx - (sd['step_x'] - 0.3 * sgn)) * sgn > 0:
                nx = sd['step_x'] - 0.3 * sgn
            return nx, y
        return x, y

    sleeve_parts = [old for old, _, _, _ in sides]

    def warp_ext(x, y):
        """소매 선의 점: 옛 소매 밖으로 살짝 나간 점(무스탕 소매 끝 털처럼 윤곽 밖으로 오돌토돌한 선)도
        가까운 소매의 같은 높이 폭 비율로 옮긴다(비율이 0~1 밖이면 그대로 늘려서)."""
        old, nw, sd, sgn = min(sides, key=lambda t: t[0].distance(Point(x, y)))
        b0, b1 = old.bounds[1] + 0.01, old.bounds[3] - 0.01
        a, b = span(old, min(max(y, b0), b1)) or (None, None)
        c2 = span(nw, min(max(y, nw.bounds[1] + 0.01), nw.bounds[3] - 0.01))
        if a is None or c2 is None or b - a < 0.5:
            return x, y
        u = (x - a) / (b - a)
        return c2[0] + u * (c2[1] - c2[0]), y

    def move_path(d):
        """선 하나: 점 대부분이 옛 소매 위에 있으면 소매 선(새 소매 폭에 맞춰 옮김), 아니면 몸판 선(body_fix)."""
        pts = [p for sp in subpaths(d, step=0.5) for p in sp]
        on_sleeve = sum(any(o.contains(Point(p)) for o in sleeve_parts) for p in pts)
        return map_d(d, warp_ext if on_sleeve >= 0.6 * len(pts) else body_fix)
    for key in WARP_LAYERS:
        if ic.get(key):
            # 그림자는 면 전체에 걸친 옅은 색이라 점마다 옮긴다.
            out[key] = [map_d(d, warp) if key == 'shade' else move_path(d) for d in ic[key]]
    if ic.get('dots'):
        out['dots'] = [[*(warp(x, y) if any(o.contains(Point(x, y)) for o in sleeve_parts) else body_fix(x, y)), rr]
                       for x, y, rr in ic['dots']]
    if prof.get('short_L'):
        # 짧은 소매 옷(반소매티): 소매단 선 + 몸판 밑단 선(이미 밑단 선이 있는 크롭 등은 그대로)
        out['details'] = out.get('details', []) + r['hem_lines'] + l['hem_lines'] + body_hem_line(new, out.get('details', []), prof.get('body_hem', 0))
    return out, dict(S=r['S'], yc=r['yc'], poly=new, sleeve=r['slv'], off=(r['off'], l['off']), sides=(r, l)), warp


def weave_mover(info):
    """짜임 결(골지·꽈배기·아가일) 선 옮기기. 소매 위 선을 새 소매 폭에 꽉 맞춰 누르면 결이 촘촘하고 진해 보여서,
    소매 가운데를 기준으로 결 간격을 거의 그대로(새 폭/옛 폭, 0.85 아래로는 안 줄임) 옮기고,
    새 소매(+ 몸판 옆 메운 곳) 밖으로 나가는 선은 뺀다. 몸판 선은 그대로."""
    sides = []
    for sd in info['sides']:
        sides.append((sd['old'].buffer(0.35), sd['slv'], unary_union([sd['slv'], sd['strip']]).buffer(0.25), sd))

    def stretch(x, y):
        """몸판 옆 결: 옛 구분선이 새 구분선에 오도록 옆구리 쪽 4만 살짝 늘린다(새로 메운 몸판 옆에 결이 비지 않게)."""
        for _, _, _, sd in sides:
            sgn = 1 if sd['S'][0] > C else -1
            xo, xn = x_at(sd['seam'], y), x_at(sd['inner'], y)
            if sd.get('box_x') is not None and y > sd['box_y'] and (x - (sd['box_x'] - 0.05 * sgn)) * sgn > 0:
                x = sd['box_x'] - 0.05 * sgn
            if xo is None or xn is None:
                continue
            x0 = xo - 4 * sgn
            if (x - x0) * sgn < 0 or (x - xo) * sgn > 0.5:
                continue
            return x0 + (x - x0) * (xn - x0) / (xo - x0), y
        return x, y

    def move(d):
        pts = [p for sp in subpaths(d) for p in sp]
        # 옛 구분선에 붙은 선(결의 가장자리 선)은 새 구분선으로
        for _, _, _, sd in sides:
            near = sum(1 for p in pts if (lambda xo: xo is not None and abs(p[0] - xo) < 0.5)(x_at(sd['seam'], p[1])))
            if near >= 0.8 * len(pts):
                return map_d(d, stretch)
        for old, nw, keep, sd in sides:
            inside = sum(old.contains(Point(p)) for p in pts)
            if inside < 0.6 * len(pts):
                continue
            yr = (nw.bounds[1] + 0.01, nw.bounds[3] - 0.01)

            def f(x, y):
                a, b = span(old, y) or (None, None)
                c2 = span(nw, min(max(y, yr[0]), yr[1]))
                if a is None or c2 is None or b - a < 0.5:
                    return x, y
                k = min(1.0, max(0.85, (c2[1] - c2[0]) / (b - a)))
                return (c2[0] + c2[1]) / 2 + (x - (a + b) / 2) * k, y
            moved = [f(*p) for p in pts]
            if sum(keep.contains(Point(p)) for p in moved) < 0.7 * len(moved):
                return None
            return map_d(d, f)
        return map_d(d, stretch)
    return move


def sleeve_region(ic):
    """v12 좌표 그림에서 오른쪽 소매(구분선 바깥) 도형 — 배율 g 맞추기용."""
    P = unary_union([to_poly(d) for d in ic['shapes']])
    R = max((subpaths(d)[0] for d in ic['seams']), key=lambda s: s[0][0])
    return P.intersection(Polygon([(R[0][0], -5)] + [tuple(p) for p in R] + [(R[-1][0], 70), (80, 70), (80, -5)]).buffer(0))


def fit_g(ic_v12space, v12_icon):
    """v12 그림의 오른쪽 소매와 가장 많이 겹치는 g."""
    target = sleeve_region(v12_icon)
    best = None
    for k in range(80, 131, 2):
        g = k / 100
        try:
            out, info, _ = process(ic_v12space, g)
        except Exception:
            continue
        mine = sleeve_region(out)
        iou = mine.intersection(target).area / max(1e-6, mine.union(target).area)
        if best is None or iou > best[1]:
            best = (g, iou)
    return best


def extend_up(lines, outline, xlo, xhi):
    """꽈배기 결을 목·어깨 쪽 위까지 올린다(11/22 은재 님: "목 부분 위쪽은 좀 더 올라가야").
    몸판 결을 x가 겹치는 조각끼리 한 줄(기둥)로 묶고, 기둥마다 맨 위 한 칸(반복 간격 P)을 위로 복사해 옷 윗선까지 채운다.
    긴 세로선은 윗끝을 옷 윗선까지 늘린다. 옷 밖으로 나간 부분은 앱이 옷 모양으로 잘라 그린다."""
    import re
    num = re.compile(r'-?\d+(?:\.\d+)?')
    info = []
    for d in lines:
        v = [float(x) for x in num.findall(d)]
        xs, ys = v[0::2], v[1::2]
        info.append((d, min(xs), max(xs), min(ys), max(ys)))
    body = [t for t in info if t[1] >= xlo and t[2] <= xhi]
    pieces = [t for t in body if t[4] - t[3] < 8]
    longs = [t for t in body if t[4] - t[3] >= 8]
    sig = lambda d, dy: tuple(round(x, 1) for x in (float(a) + (dy if i % 2 else 0) for i, a in enumerate(num.findall(d))))
    have = {sig(t[0], 0) for t in pieces}
    P = max((k / 20 for k in range(30, 141)), key=lambda P: sum(sig(t[0], P) in have for t in pieces)) if pieces else 0
    # 기둥 묶기: x 범위가 겹치는 조각끼리
    cols = []
    for t in sorted(pieces, key=lambda t: t[1]):
        if cols and t[1] <= cols[-1]['x1'] + 0.1:
            cols[-1]['items'].append(t)
            cols[-1]['x1'] = max(cols[-1]['x1'], t[2])
        else:
            cols.append({'x0': t[1], 'x1': t[2], 'items': [t]})

    def roof(x, y_from):
        """x에서 (x, y_from)이 들어 있는 옷 면 토막의 윗끝(목 시보리·V넥 안쪽은 뺀 면). 없으면 None."""
        vl = outline.intersection(LineString([(x, -5), (x, 80)]))
        best = None
        for gg in getattr(vl, 'geoms', [vl]):
            if gg.is_empty or gg.geom_type != 'LineString':
                continue
            ys = [c[1] for c in gg.coords]
            if min(ys) - 0.01 <= y_from <= max(ys) + 0.01:
                best = min(ys)
        return None if best is None else best - 0.6

    out = list(lines)
    for c in cols:
        top = min(t[3] for t in c['items'])
        bottom = max(t[4] for t in c['items'])
        # 몸판 위쪽에서 길게 내려오는 꽈배기 기둥만(밑단 시보리 같은 짧은 묶음은 그대로)
        if top > 24 or bottom - top < 12:
            continue
        roofs = [roof(x, top + 0.5) for x in (c['x0'] + 0.1, (c['x0'] + c['x1']) / 2, c['x1'] - 0.1)]
        if any(r is None for r in roofs):
            continue
        limit = max(roofs)
        band = [t for t in c['items'] if t[3] < top + P - 0.05]
        k = 1
        while top - k * P + P > limit and k < 6:
            for t in band:
                v = [float(x) for x in num.findall(t[0])]
                si = iter([x - k * P if i % 2 else x for i, x in enumerate(v)])
                out.append(num.sub(lambda m, _si=si: fmt(next(_si)), t[0]))
            k += 1
    for t in longs:
        x = t[1] if t[2] - t[1] < 0.3 else None
        lim = roof(t[1], t[3] + 0.5) if x is not None else None
        if x is not None and lim is not None and t[3] < 24 and t[3] > lim + 0.3:
            out.append(f'M{fmt(x)},{fmt(lim)} L{fmt(x)},{fmt(t[3] + 0.3)}')
    return out


# ── 묶음 단위로 돌리기 ──
# 묶음: 시안 화면 이름(specs.json의 name).
BATCHES = {
    # 긴소매: 소매를 코트 팔로 다시 그리고 + 핏별(슬림·오버사이즈)
    '상의': ['긴소매티', '셔츠', '블라우스', '니트', '맨투맨', '후드', '트레이닝 상의', '카디건', '후드집업', '반소매티'],
    '아우터': ['재킷', '트위드자켓', '레더재킷', '데님재킷', '점퍼', '사파리재킷', '퍼코트', '무스탕', '숏코트', '하프코트', '롱코트',
             '트렌치코트', '숏패딩', '롱패딩', '경량패딩'],
}
# 소매가 짧거나 없는 상의: 소매는 그대로, 핏별 그림만(몸판 늘리고 줄이기)
FIT_ONLY = {'상의': ['슬리브리스', '베스트'], '아우터': ['퍼자켓']}
# 소매를 다시 그리지 않는 옷 중 슬림 허리를 넣는 것(소매가 없어 그림 전체가 몸판). 퍼자켓은 소매가 붙어 있어 빼둔다.
SLIM_WAIST_ONLY = {'슬리브리스', '베스트'}
# 시안 화면이 없는 v12 종류: (종류, 배율을 빌릴 시안 화면)
V12_ONLY = {'아우터': [('코트', '하프코트'), ('플리스', '점퍼')]}
FITS = ('슬림', '오버사이즈')
# 짜임 결(weaves.json)을 같이 쓰는 종류: 결 이름 앞부분 → 그 결을 그린 기준 그림의 종류
WEAVE_OF = {'kn|': '니트', 'cd|': '카디건', 'fur|숏코트': '숏코트', 'fur|하프코트': '하프코트', 'fur|롱코트': '롱코트'}
OUT_ICONS = os.path.join(SRC, 'icons_b.json')       # 시안 그림 id → 레귤러, 'id@슬림'·'id@오버사이즈' → 핏별
OUT_WEAVES = os.path.join(SRC, 'weaves_b.json')     # 결 이름 → 레귤러, '결@핏' → 핏별
OUT_V12FITS = os.path.join(KI, 'fits_b.json')       # v12 종류 → {슬림, 오버사이즈} (지금 앱 기본 그림의 핏별)
LOG = os.path.join(HERE, 'log.json')


def fit_key(iid, fit):
    return iid if fit is None else f'{iid}@{fit}'


def body_strip(seams):
    """소매 재봉선 두 줄(어깨→소맷부리) 사이 = 몸판 띠. 위는 목 위까지, 아래는 재봉선 끝에서 곧게 내린다."""
    sps = [subpaths(d)[0] for d in seams]
    sps = [sp if sp[0][1] < sp[-1][1] else sp[::-1] for sp in sps]
    a, b = sorted(sps, key=lambda sp: sp[0][0])[0], sorted(sps, key=lambda sp: sp[0][0])[-1]
    pts = [(a[0][0], -5)] + list(a) + [(a[-1][0], 90), (b[-1][0], 90)] + list(b[::-1]) + [(b[0][0], -5)]
    return Polygon(pts).buffer(0)


def _even_xs(gap, lo, hi):
    """lo~hi 안에서 가운데(C)부터 gap 간격으로 놓은 x 목록. 몸판·밑단 시보리·목 골지(collars.RIB_X)가 같은 자리에 온다."""
    i0 = math.ceil((lo - C) / gap)
    i1 = math.floor((hi - C) / gap)
    return [C + i * gap for i in range(i0, i1 + 1)]


def _vlines(xs, y0, y1, region):
    out = []
    for x in xs:
        g = LineString([(x, y0), (x, y1)]).intersection(region)
        for gg in getattr(g, 'geoms', [g]):
            if gg.is_empty or gg.geom_type != 'LineString' or gg.length < 0.8:
                continue
            ys = [c[1] for c in gg.coords]
            out.append(f'M{fmt(x)},{fmt(min(ys))} L{fmt(x)},{fmt(max(ys))}')
    return out


def even_ribs(lines, seams, outline):
    """니트 골지 몸판 줄을 같은 간격으로 다시 긋는다(11/23 오후 "골지 간격이 일정하지 않다").
    핏을 바꾸며 몸판을 넓히면(특히 오버사이즈) 원래 줄이 같이 늘어나 옆으로 갈수록 간격이 1.5~4로 벌어지고,
    소매 옮기기에 휜 옆 줄은 새 줄과 겹쳐 0.1 간격이 생겼다.
    → 소매 재봉선 사이(몸판 띠) 안의 줄은 다 지우고, 가운데(안 늘어난 곳) 줄의 평균 간격으로 몸판 폭을 다시 채운다.
      밑단 시보리 줄(몸판 아래 짧은 줄)도 같은 식으로. 소매 줄은 그대로. 위쪽은 뒤에서 extend_up이 옷 윗선까지 채운다."""
    strip = body_strip(seams)
    body, hem, rest = [], [], []
    for d in lines:
        sp = subpaths(d)[0]
        inside = sum(strip.contains(Point(p)) for p in sp) / len(sp)
        xs, ys = [p[0] for p in sp], [p[1] for p in sp]
        t = (sum(xs) / len(xs), min(ys), max(ys))
        if inside == 0:
            rest.append(d)
        elif inside < 0.7:
            # 소매 줄인데 끝이 재봉선 넘어 몸판으로 조금 들어온 것 → 몸판 쪽 토막은 잘라 낸다(재봉선 옆 짧은 토막 없애기)
            g = LineString(sp).difference(strip.buffer(0.35))
            for gg in getattr(g, 'geoms', [g]):
                if not gg.is_empty and gg.geom_type == 'LineString' and gg.length > 0.8:
                    c = list(gg.coords)
                    rest.append(f'M{fmt(c[0][0])},{fmt(c[0][1])} ' + ' '.join(f'L{fmt(x)},{fmt(y)}' for x, y in c[1:]))
        elif t[2] - t[1] > 6:
            body.append(t)
        else:
            hem.append(t)
    if len(body) < 6:
        return lines
    region = outline.intersection(strip).buffer(-0.45)
    out = list(rest)
    # 간격: 가운데(안 늘어난 곳) 몸판 줄의 평균 간격(1.15). 밑단 시보리도 같은 간격으로(11/23 오후 "밑이랑 위랑 굵기가 달라 보인다").
    mid = sorted(t[0] for t in body if abs(t[0] - C) < 5.0)
    gap = round((mid[-1] - mid[0]) / (len(mid) - 1), 3) if len(mid) >= 3 else 1.15
    bx = region.bounds
    xs = _even_xs(gap, bx[0], bx[2])
    for group, tall in ((body, True), (hem, False)):
        mid = [t for t in group if abs(t[0] - C) < 5.0 and (tall or t[1] > max(b[2] for b in body) - 0.5)]
        if len(mid) < 3:
            out += [f'M{fmt(t[0])},{fmt(t[1])} L{fmt(t[0])},{fmt(t[2])}' for t in group]
            continue
        y1 = sorted(t[2] for t in mid)[len(mid) // 2]
        # 몸판 줄은 위로 옷 면(목 시보리 밑·어깨선) 끝까지, 밑단 시보리 줄은 가운데 줄과 같은 높이
        y0 = -5 if tall else sorted(t[1] for t in mid)[len(mid) // 2]
        out += _vlines(xs, y0, y1, region)
    return out


# 슬림 허리(11/23 오후): process()가 그린 새 소매(info sides의 slv)는 그대로 두고 나머지(몸판)만 허리 쪽으로 좁힌다(v12 좌표).
WAIST_Y = 37.0           # 허리(가장 많이 들어가는 높이)
HIP_SPAN = 11.0          # 허리에서 엉덩이(조금 다시 넓어지는 곳)까지


def waist_k(d, ya, hem):
    """y → 가로 배율. ya(겨드랑이 아래)부터 서서히 들어가 허리에서 1-d, 엉덩이에서 1-0.45d, 그 아래는 그대로."""
    yw = max(WAIST_Y, ya + 4.0)
    yh = max(yw + 1.0, min(hem, yw + HIP_SPAN))

    def k(y):
        if y <= ya:
            return 1.0
        if y <= yw:
            u = (y - ya) / (yw - ya)
            return 1 - d * u * u * (3 - 2 * u)
        u = min(1.0, (y - yw) / (yh - yw))
        return 1 - d * (1 - 0.55 * u * u * (3 - 2 * u))
    return k


def _dens(d, step=0.8):
    """선을 짧은 마디로 나눈다(곧은 선도 몸판을 따라 휘게)."""
    out = []
    for sp in subpaths(d):
        pts = [sp[0]]
        for a, b in zip(sp, sp[1:]):
            n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / step))
            pts += [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(1, n + 1)]
        out.append(f'M{fmt(pts[0][0])},{fmt(pts[0][1])} ' + ' '.join(f'L{fmt(x)},{fmt(y)}' for x, y in pts[1:]))
    return ' '.join(out)


NIP_LINES = ('details', 'tex', 'metals', 'chains', 'ribs')   # 끈(straps)은 몸판 위쪽이라 그대로


def _bend(q, f):
    """선을 잘게 나눠 f로 옮긴 뒤 다시 줄인다(그림 데이터가 커지지 않게, 0.03 안의 점은 뺀다)."""
    out = []
    for sp in subpaths(map_d(_dens(q), f)):
        if len(sp) < 2:
            continue
        g = LineString(sp).simplify(0.03)
        c = list(g.coords)
        out.append(f'M{fmt(c[0][0])},{fmt(c[0][1])} ' + ' '.join(f'L{fmt(x)},{fmt(y)}' for x, y in c[1:]))
    return ' '.join(out) or q
# 허리 들어가는 정도(몸판 반폭 대비). 상의는 SLIM['waist'](0.20, 골지티 사진), 아우터는 덜(11/23 슬림 코트 사진: 거의 곧고 살짝만).
# 아우터는 사진(슬림 코트)처럼 곧게: 허리 없이 소매만 가늘게 — 팔이 몸판에 붙어 내려온다.
# (재킷·패딩에 5~6%만 넣으면 팔과 몸판 사이가 가는 틈으로 벌어져 진한 줄처럼 보여서 뺐다)
WAIST_BY_NAME = {k: 0.0 for k in ('재킷', '트위드자켓', '레더재킷', '데님재킷', '점퍼', '사파리재킷', '퍼코트', '무스탕', '숏코트',
                                  '하프코트', '롱코트', '트렌치코트', '숏패딩', '롱패딩', '경량패딩', '코트', '플리스')}
# 셔츠 슬림(11/23 참고 사진 5장): 허리가 더 많이 들어가고, 앞판에 세로 다트 두 줄, 기장은 골반까지 조금 짧게.
WAIST_BY_NAME['셔츠'] = 0.24
# 나시·베스트(11/23 슬림 나시 사진 4장): 몸에 붙지만 허리는 살짝만.
WAIST_BY_NAME.update({'슬리브리스': 0.09, '베스트': 0.10, '반소매티': 0.12})
# 블라우스는 셔츠와 카라 그림(i53~i66)을 같이 쓰고 나중에 그려 덮으므로 셔츠와 같게(11/23)
WAIST_BY_NAME['블라우스'] = 0.24
SLIM_EXTRA = {'셔츠': dict(shorten=0.80), '블라우스': dict(shorten=0.80),
              # 반팔: 기장 그대로(줄이면 옆으로 넓어 보였음), 옆선은 겨드랑이 점에서 바로 이어지는 한 곡선(11/23 "옆곡선 안 깔끔")
              '반소매티': dict(start=-1.0, flare=0.4, round_r=0.5, from_seam=True, shorten=0.92)}   # 11/23 "길이 좀만 줄여"   # 셔츠 앞 다트는 뺌(11/23 "세로줄 별로")
# 소매 없는 옷(나시): 허리는 살짝, 밑단은 위 폭만큼 다시 넓게(사진: 거의 곧은 통에 허리만 살짝)
SLIM_EXTRA_ONLY = {'슬리브리스': dict(flare=0.6), '베스트': dict(flare=0.9)}   # 나시 밑단 · 기장은 SLIM_STYLES['2n'](11/27)
NIP_POLYS = ('tops', 'inner', 'plain', 'lining')

# 반소매티 슬림 다시(11/27 은재 님 "슬림핏 티셔츠가 너무 부해 보여, 가슴 라인 말고 좀 슬림한 느낌으로",
# "슬림은 이 허리 라인 그대로 따라가 줘(여성 폴로 도식), 크롭은 이 허리 라인에 짧게 자른 느낌").
# 소매를 코트 팔로 다시 그리면(짧게 자른 팔) 팔이 몸에 붙어 내려와 소매가 어깨에 붙은 혹처럼 보이고 가슴께가 부풀어 보였다.
# → 레귤러 그림(소매 각도 · 모양 그대로)을 가로로만 줄인다.
#   - 겨드랑이 위(어깨 · 목): 목(가운데 d0)은 그대로, 바깥만 k0배. 소매(소매 구분선 바깥)는 ks배로 더 가늘게.
#   - 겨드랑이 아래 몸판: 도식의 허리 선 — 겨드랑이 폭을 1로 허리(겨드랑이~밑단의 WAIST_T)에서 WAIST_M, 밑단에서 HEM_M.
#   - 크롭: 같은 허리 선을 긴 티 길이(span)로 재서 짧게 자른다(크롭 밑단이 허리께라 아래로 갈수록 좁아짐).
SLIM_TEE = dict(k0=0.80, ks=0.78, d0=6.0, depth=0.245, hip=1.05)
# 슬림 몸통 선 두 가지(11/27 은재 님 "1번 기반 전체 슬림핏이랑 2번 기반 전체 슬림핏 주면 비교해서 괜찮은 걸로"):
#  '1' — 어깨 끝에서 거의 곧게 떨어지다 가슴 아래에서 휘어 허리(어깨~밑단 64%)에서 가장 좁고, 밑단은 어깨 폭의 1.05. 기장 그대로.
#  '2' — 어깨 끝부터 비스듬히 들어가(k1) 허리(56%)에서 가장 좁고, 밑단은 어깨보다 좁게(0.95). 기장 10% 줄임.
# 반소매티는 이 선을 그대로(slim_tee), 다른 상의는 겨드랑이(y 22) 아래 몸판 옆선을 같은 선(어깨 기준)으로 맞춘다(slim_waist).
SLIM_STYLES = {'1': dict(waist_at=0.64, k1=0.0, depth=0.245, hip=1.05, shorten=1.0, ks=0.78, follow=0.0),
               '2': dict(waist_at=0.56, k1=1.3, depth=0.245, hip=0.95, shorten=0.9, ks=0.66, follow=0.0)}
# ks: 반팔 소매 가로 배율, follow: 소매 구분선이 안으로 들어간 만큼 소매도 따라 들어가는 비율(0 = 소매 바깥 모양 그대로 → 소매 밑단이
# 몸통 선까지 넓어짐, 1 = 소매가 통째로 따라 들어감). 11/27 "2번 기반이 1번에 비해 소매가 통통한 거 같은데 반팔 소매 줄여서".
# 11/27 은재 님 결정: "슬리브리스랑 베스트 1번으로 가고 나머지 2번으로", 그 뒤 "반소매티 2번으로"(크롭 · 반팔 하프넥 · 하프집업 포함).
SLIM_STYLE_BY_NAME = {'슬리브리스': '2n', '베스트': '1'}
# 슬리브리스(11/27 "라인이 좀 이상한데 베스트 같은 느낌이어야", 시안 C 둥글게 2 → "2번으로 가자"): 2번 선(겨드랑이부터 비스듬히)에
# 밑단은 가슴보다 조금 좁게(0.98), 기장 그대로. 진동이 깊게 파여 겨드랑이 밑이 뾰족한 모서리라 허리를 넣으면 가슴께 혹처럼 보여서
# 그 모서리를 둥글게 편다(ARM_ROUND).
SLIM_STYLES['2n'] = dict(SLIM_STYLES['2'], hip=0.98, shorten=1.0)
ARM_ROUND = {'슬리브리스': (2.0, 18.0, 32.0)}    # 반지름, 위 · 아래(v12 좌표)


def slim_style(name):
    return SLIM_STYLES[SLIM_STYLE_BY_NAME.get(name, '2')]


def slim_tee(ic, k0, ks, d0, depth, hip, span=None, waist_at=None, k1=None, shorten=None, name='반소매티'):
    import copy
    st = slim_style(name)
    depth, hip = st['depth'], st['hip']
    waist_at = st['waist_at'] if waist_at is None else waist_at
    k1 = st['k1'] if k1 is None else k1
    shorten_style = shorten is None
    seams = [subpaths(d)[0] for d in ic['seams']]
    seams = [sp if sp[0][1] < sp[-1][1] else sp[::-1] for sp in seams]
    ys = min(sp[0][1] for sp in seams)        # 어깨 끝(소매 구분선 위 끝)
    ya = max(sp[-1][1] for sp in seams)       # 겨드랑이
    hem = to_poly(ic['shapes'][0]).bounds[3]
    own_span = max(1.0, hem - ys)
    slim_tee.last_span = own_span
    is_crop = span is not None and own_span < 0.9 * span
    span = span or own_span                   # 크롭은 긴 티 길이로 잰다(같은 곡선을 짧게 자른 것)
    if shorten_style:
        shorten = 1.0 if is_crop else st['shorten']   # 크롭은 이미 짧다

    side_seam = {1: max(seams, key=lambda sp: sp[0][0]), -1: min(seams, key=lambda sp: sp[0][0])}

    def rs(y, sg=None):
        """그 높이의 소매 구분선 반폭(sg: 오른쪽 1 · 왼쪽 -1, 없으면 두 쪽 평균). 겨드랑이 아래는 99(몸판)."""
        xs = []
        for sp in ([side_seam[sg]] if sg else seams):
            if y <= sp[0][1]:
                xs.append(abs(sp[0][0] - C))
                continue
            if y >= sp[-1][1]:
                return 99.0
            for (x1, y1), (x2, y2) in zip(sp, sp[1:]):
                if y1 <= y <= y2 and y2 > y1:
                    xs.append(abs(x1 + (x2 - x1) * (y - y1) / (y2 - y1) - C))
                    break
        return sum(xs) / len(xs) if xs else 99.0
    href = d0 + (rs(ys + 0.05) - d0) * k0     # 줄인 어깨 끝 반폭

    def B(y):                                 # 몸통 옆선 반폭: 어깨 끝 → 밑단 한 곡선
        return href * tee_profile((y - ys) / span, depth, hip, waist_at, k1)
    hw = _half_width(to_poly(ic['shapes'][0]))
    yse = ya + 2.0                            # 옆선이 끝나고 밑단 모서리가 시작하는 곳 — 그 아래는 같은 배율
    while yse < hem - 0.3 and hw(yse + 0.5) > 0.93 * hw(yse):
        yse += 0.25
    kc = {}

    def kb(y):
        yy = round(min(y, yse), 1)
        if yy not in kc:
            h = hw(yy)
            kc[yy] = B(yy) / h if h > 1 else 1.0
        return kc[yy]

    def f(x, y):
        r, sg = abs(x - C), (1 if x >= C else -1)
        R = rs(y, sg)
        if y > ya and R > 90:                # 겨드랑이 아래 몸판: 어깨에서 이어지는 같은 곡선(shorten: 기장 줄이기)
            return C + sg * r * kb(y), ya + (y - ya) * shorten
        if r <= d0:
            return x, y
        Ry = B(max(y, ys)) if R < 90 else R
        if r <= R + 0.05:                     # 몸판(목 바깥 ~ 소매 구분선): 구분선이 곡선에 오게
            return C + sg * (d0 + (r - d0) * (Ry - d0) / max(0.5, R - d0)), y
        # 소매: 바깥 모양은 그대로(가늘게만) — 구분선이 안으로 들어간 만큼 소매 밑단이 몸통 선까지 이어진다(도식처럼).
        # follow만큼은 소매도 구분선을 따라 안으로(소매가 통통해 보이지 않게).
        old = d0 + (R - d0) * k0
        return C + sg * (old + (Ry - old) * st['follow'] + (r - R) * st['ks']), y
    def dense(d):
        # 옆선이 겨드랑이~밑단 한 줄(곡선 하나)이면 끝점만 옮겨져 허리가 안 들어간다 → 촘촘한 점으로 바꿔 옮긴다
        close = 'Z' in d or 'z' in d
        out = []
        for sp in subpaths(d, step=0.4):
            pts = [f(x, y) for x, y in sp]
            out.append('M' + ' L'.join(f'{fmt(x)},{fmt(y)}' for x, y in pts) + (' Z' if close else ''))
        return ' '.join(out)
    z = copy.deepcopy(ic)
    for key in POINT_LAYERS:
        if z.get(key):
            z[key] = [dense(d) for d in z[key]]
    if z.get('dots'):
        z['dots'] = [[*f(x, y), r] for x, y, r in z['dots']]
    return z


def _half_width(g):
    """y → 몸판 반폭(가운데에서 가장 먼 옆선까지). 0.1 단위로 기억해 둔다."""
    cache = {}

    def hw(y):
        key = round(y, 1)
        if key not in cache:
            h = g.intersection(LineString([(-20, key), (90, key)]))
            cache[key] = 0.0 if h.is_empty else max(abs(h.bounds[0] - C), abs(h.bounds[2] - C))
        return cache[key]
    return hw


def _hermite(t, p0, m0, p1, m1):
    t2, t3 = t * t, t * t * t
    return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1


# 슬림 몸통 선(11/27 은재 님, 여성 폴로 도식): "허리선 곡선이 어깨선부터 내려와서 자연스럽게 허리선을 들어가서 골반 전까지".
# 긴소매 슬림(slim_waist): 겨드랑이(y 22)에서 거의 곧게 비스듬히 들어가다(k1: 시작 기울기) 허리(WAIST_AT)에서 둥글게 가장 좁고,
# 골반(밑단)까지 천천히 나간다 — 니트 슬림 그림에 "이거 맞아요"(17:50). 팔은 그대로.
WAIST_AT = 0.46


def polo_profile(t, depth, hip, k1=1.25):
    """겨드랑이 폭 1 기준 몸판 폭 배율. t: 겨드랑이 0 → 밑단 1(크롭은 긴 옷 길이로 재서 1보다 앞에서 끝난다)."""
    if t <= 0:
        return 1.0
    if t <= WAIST_AT:
        return _hermite(t / WAIST_AT, 1.0, -k1 * depth, 1 - depth, 0.0)
    u = min(1.0, (t - WAIST_AT) / (1 - WAIST_AT))
    w = 1 - depth
    return w + (hip - w) * (3 * u * u - 2 * u * u * u)


# 반소매티 슬림 몸통 선(11/27 "처음은 어깨선, 님은 가슴에서 시작한다고요"): 도식은 몸통 옆선이 어깨 끝에서 시작해 소매 구분선을
# 따라 내려오고, 겨드랑이 아래로 그대로 이어져 허리 · 골반까지 한 줄이다(소매는 그 선 바깥에 붙음). 전에는 소매 구분선은 곧게 두고
# 겨드랑이 아래부터 따로 휘어서 곡선이 가슴에서 시작했다. → 어깨 끝(소매 구분선 위 끝) 0 → 밑단 1로 한 곡선:
# 어깨에서 천천히(u^4(5-4u)) 들어가 허리(TEE_WAIST_AT)에서 가장 좁고, 밑단까지 다시 나간다. 도식: 겨드랑이 0.93 · 허리 0.755 · 밑단 1.05.
TEE_WAIST_AT = 0.64
TEE_K1 = 0.0          # 어깨에서 들어가는 기울기(곧은 선 대비). 0이면 어깨에서 거의 곧게 떨어지다 가슴 아래에서 휜다


def tee_profile(t, depth, hip, waist_at=None, k1=None):
    waist_at = TEE_WAIST_AT if waist_at is None else waist_at
    k1 = TEE_K1 if k1 is None else k1
    if t <= 0:
        return 1.0
    if t <= waist_at:
        u = t / waist_at
        if k1:
            return 1.0 - depth * _hermite(u, 0.0, k1, 1.0, 0.0)
        return 1.0 - depth * u ** 4 * (5 - 4 * u)
    u = min(1.0, (t - waist_at) / (1 - waist_at))
    w = 1 - depth
    return w + (hip - w) * u * u * (3 - 2 * u)


def slim_waist(o, info, d, darts=False, shorten=1.0, flare=1.15, round_r=0.9, start=None, from_seam=False, span=None, name=None):
    """슬림(11/23 오후 다시): 몸판 옆선을 옛 선을 줄이는 대신 새로 그린 매끈한 곡선에 맞춘다(옛 그림의 혹·꺾임도 펴짐).
    옆선 = 겨드랑이(ya)에서 바로 안으로 휘기 시작해(사인 곡선) 허리(겨드랑이~밑단 가운데)에서 가장 좁고(1-d),
    밑단 쪽으로 살짝 다시 넓어진다(1-d+flare·d). 밑단 모서리는 둥글게. 소매(info sides의 slv)는 그대로.
    darts: 앞판 세로 다트 두 줄(셔츠). shorten: 겨드랑이 아래 길이 배율(셔츠·티셔츠 짧게).
    돌려주는 것: (새 그림, 몸판 선을 같이 옮기는 함수 — 짜임 결에 씀). d가 0이면 그대로(아우터)."""
    import copy
    if not d:
        return o, None
    o = copy.deepcopy(o)
    # 몸판 면: 가장 큰 면(나시는 끈이 앞쪽 면으로 따로 있다)
    mi = max(range(len(o['shapes'])), key=lambda i: to_poly(o['shapes'][i]).area)
    P = to_poly(o['shapes'][mi])
    sleeves = unary_union([sd['slv'] for sd in info['sides']]) if info else Polygon()
    body = P.difference(sleeves) if info else P
    if body.geom_type != 'Polygon':
        body = max(body.geoms, key=lambda g: g.area)
    hwo = _half_width(body)
    top, hem = body.bounds[1], body.bounds[3]
    if info:
        seam_end = max((p[1] for q in o.get('seams', []) for p in subpaths(q)[0]), default=30.0)
        ya = 22.0 if seam_end > 40 else seam_end + 0.3
    else:
        # 소매 없는 옷: 겨드랑이부터. 어깨가 있는 옷(베스트)은 진동이 가장 좁아지는 곳,
        # 나시·캐미는 위에서 내려오며 몸판 폭(가운데 높이 폭의 97%)에 처음 닿는 곳.
        ys = [top + 1.0 + 0.25 * i for i in range(int((hem - top) * 0.5 / 0.25))]
        ymin = min(ys, key=hwo)
        if hwo(ymin) < 0.95 * hwo(top + 1.0):
            ya = ymin
        else:
            mid = hwo(top + 0.45 * (hem - top))
            ya = next((y for y in ys if hwo(y) >= 0.97 * mid), top + 1.0)
    # 옆선이 끝나고 밑단 곡선이 시작하는 높이(폭이 갑자기 줄어드는 곳) — 그 아래는 같은 배율
    yse = ya + 2.0
    while yse < hem - 0.3 and hwo(yse + 0.5) > 0.93 * hwo(yse):
        yse += 0.25
    yw = ya + 0.5 * (yse - ya)
    href = hwo(ya + 0.2)
    if from_seam and info and o.get('seams'):
        # 옆선을 소매 밑 끝(겨드랑이 점)에서 바로 시작한다(몸판이 소매 끝보다 튀어나와 생기던 작은 턱 없앰)
        ends = [subpaths(q)[0][-1] for q in o['seams']]
        href = sum(abs(x - C) for x, _ in ends) / len(ends)

    # 몸통 선(11/27 SLIM_STYLES, 종류별 slim_style): 반소매티 슬림과 같은 선을 어깨 끝(소매 구분선 위 끝 · 소매 없는 옷은 몸판 위)부터 재서,
    # 겨드랑이(ya) 아래 몸판 옆선을 맞춘다(ya에서 지금 폭과 이어지게 나눠 줌). 들어가는 깊이는 종류별 d에 비례(d 0.20 = 기본).
    # 크롭은 긴 옷의 길이(span)로 잰다.
    st = slim_style(name)
    if info and o.get('seams'):
        ysh = min(p[1] for q in o['seams'] for p in subpaths(q)[0])
    else:
        ysh = top + 1.0
    own_span = max(0.5, yse - ysh)
    slim_waist.last_span = own_span
    sp_ = span or own_span
    # 긴소매 · 소매 없는 옷은 겨드랑이(ya) 위가 소매에 가려 있으므로, 같은 높이(어깨~밑단의 waist_at)에 허리가 오게 하되
    # 곡선은 겨드랑이부터 잰다(겨드랑이 폭 1 → 허리 1-d → 밑단 hip). 어깨 기준 그대로 쓰면 허리가 거의 안 보이거나 밑단이 퍼졌다.
    end_ = ysh + sp_
    w_rel = min(0.9, max(0.15, (ysh + st['waist_at'] * sp_ - ya) / max(0.5, end_ - ya)))
    def target(y):
        return href * tee_profile((y - ya) / max(0.5, end_ - ya), d, st['hip'], w_rel, st['k1'])
    kc = {}

    def k(y):
        if y <= ya:
            return 1.0
        yy = round(min(y, yse), 1)
        if yy not in kc:
            h = hwo(yy)
            kc[yy] = target(yy) / h if h > 1 else 1.0
        return kc[yy]
    sy = lambda y: y if y <= ya else ya + (y - ya) * shorten
    f = lambda x, y: (C + (x - C) * k(y), sy(y))
    move = lambda g: shapely.transform(g.segmentize(0.5), lambda a: np.array([f(x, y) for x, y in a]))
    nb = move(body).buffer(0)          # 옮기다 생긴 꼬임은 바로잡는다
    if nb.geom_type != 'Polygon':
        nb = max(nb.geoms, key=lambda g: g.area)
    if round_r:
        low = box(-20, ya + 2.0, 90, 95)
        rounded = nb.buffer(-round_r, join_style=1).buffer(round_r, join_style=1)
        nb = unary_union([nb.difference(low), rounded.intersection(low)]).buffer(0.02).buffer(-0.02)
    new = unary_union([P.difference(body), nb]).buffer(0.08, join_style=1).buffer(-0.08, join_style=1)
    if new.geom_type != 'Polygon':
        new = max(new.geoms, key=lambda g: g.area)
    if name in ARM_ROUND:
        # 겨드랑이 밑 모서리를 둥글게(그 높이만)
        rr, ry0, ry1 = ARM_ROUND[name]
        band = box(-20, ry0, 90, ry1)
        rnd = new.buffer(-rr, join_style=1).buffer(rr, join_style=1)
        new = unary_union([new.difference(band), rnd.intersection(band)]).buffer(0.05).buffer(-0.05)
        if new.geom_type != 'Polygon':
            new = max(new.geoms, key=lambda g: g.area)
    o['shapes'] = o['shapes'][:mi] + [poly_to_d(new, tol=0.04)] + o['shapes'][mi + 1:]
    reg = body.buffer(0.3)
    sl = sleeves.buffer(-0.05) if info else Polygon()
    on_body = lambda pts: sum(reg.contains(Point(p)) and not sl.contains(Point(p)) for p in pts) > 0.6 * len(pts)
    inside = new.buffer(-0.28)

    def clip(q):
        out = []
        for sp in subpaths(q):
            if len(sp) < 2:
                continue
            g = LineString(sp).intersection(inside)
            for gg in getattr(g, 'geoms', [g]):
                if not gg.is_empty and gg.geom_type == 'LineString' and gg.length > 0.4:
                    out.append(line_d(list(gg.simplify(0.03).coords)))
        return out
    for L in NIP_LINES:
        if o.get(L):
            o[L] = [q2 for q in o[L] for q2 in (clip(_bend(q, f)) if on_body(subpaths(q)[0]) else [q])]
    for L in NIP_POLYS:
        if o.get(L):
            o[L] = [poly_to_d(move(to_poly(q)).buffer(0), tol=0.03) if on_body(subpaths(q)[0]) else q for q in o[L]]
    if o.get('dots'):
        o['dots'] = [[*f(x, y), r] if on_body([(x, y)]) else [x, y, r] for x, y, r in o['dots']]
        o['dots'] = [dt for dt in o['dots'] if new.buffer(-0.6).contains(Point(dt[0], dt[1]))]
    if darts:
        for sg in (1, -1):
            q = _dens(f'M{fmt(C + sg * 6.2)},{fmt(ya + 3.0)} L{fmt(C + sg * 6.6)},{fmt(yse - 0.8)}', 0.5)
            o['details'] = o.get('details', []) + clip(map_d(q, f))

    # 짜임 결: 몸판 줄인지는 소매 구분선 사이(body_strip)에 있는지로 정한다(소매 면이 몸판 옆을 조금 덮어
    # 가장자리 골지 줄이 소매 줄로 잘못 잡혀 허리 옆이 비던 것 고침)
    strip_b = body_strip(o['seams']) if info and o.get('seams') else None

    def move_line(q):
        pts = subpaths(q)[0]
        body_line = (sum(strip_b.contains(Point(p)) for p in pts) > 0.6 * len(pts)) if strip_b is not None else on_body(pts)
        return _bend(q, f) if body_line else q
    return o, move_line


def outline_for_weave(back, keep_plain=False):
    loc = to_poly(back['shapes'][0])
    for k in (('inner',) if keep_plain else ('inner', 'plain')):
        for d in back.get(k, []):
            loc = loc.difference(to_poly(d).buffer(0.3))
    sx = sorted(subpaths(d)[0][0][0] for d in back['seams'])
    return loc, (sx[0], sx[-1])


def main(batch_names):
    import copy
    import collars
    ICONS, SPECS, WEAVES, V12 = load()
    PL = places(ICONS, SPECS, V12)
    spec_by = {s['name']: s for s in SPECS}
    server = lambda n: SERVER_KIND.get(n, n)
    by_kind = {}
    for s in SPECS:
        by_kind.setdefault(server(s['name']), s)
    out_icons = json.load(open(OUT_ICONS, encoding='utf-8')) if os.path.exists(OUT_ICONS) else {}
    out_weaves = json.load(open(OUT_WEAVES, encoding='utf-8')) if os.path.exists(OUT_WEAVES) else {}
    v12fits = json.load(open(OUT_V12FITS, encoding='utf-8')) if os.path.exists(OUT_V12FITS) else {}
    log = json.load(open(LOG, encoding='utf-8')) if os.path.exists(LOG) else {}
    # 카라는 소매와 상관없는 면이라 먼저 고친다(collars.py) — 그 다음 레귤러·핏별을 같이 만든다.
    src = copy.deepcopy(ICONS)
    if '상의' in batch_names:
        collars.apply(src, PL, fwd, inv)
        # 셔츠 카라 다시 그림(11/23 "산 뒤집어놓은 것 같다", "목이 로봇 같다") — 지금 앱 기본 셔츠(v12)에도 같은 카라
        import shirt_collar
        shirt_collar.apply(src)
        # V12는 load()에서 새로 읽은 것 — 이 실행 안에서만 셔츠를 바꾼다
        i53v = affine(src['i53'], fwd(PL['셔츠'], src['i53'].get('transform')))
        i53v.pop('transform', None)
        V12['셔츠'] = shirt_collar.v12_shirt(V12['셔츠'], i53v)
    if '아우터' in batch_names:
        import outer_collars
        outer_collars.apply(src)   # 퍼자켓 후드(옛 큰 칼라) 털 점(11/23)

    def g_for(kind):
        k2 = kind if kind in V12 else NEW_LIKE[kind]
        base = by_kind[MOCK_OF_V12.get(k2, k2)]['baseIcon']
        v = affine(ICONS[base], fwd(PL[k2] if k2 in PL else PL[kind], ICONS[base].get('transform')))
        v.pop('transform', None)
        return fit_g(v, V12[k2])

    warps = {}
    tee_span = {}
    waist_span = {}
    full_outline = {}
    hems = {}
    for batch in batch_names:
        for name in BATCHES.get(batch, []) + FIT_ONLY.get(batch, []):
            long = name in BATCHES.get(batch, [])
            s = spec_by[name]
            kind = server(name)
            g, iou = g_for(kind) if long else (1.0, 0.0)
            place = PL[kind]
            done = []
            for iid in sorted(icon_ids(s), key=lambda x: int(x[1:])):
                ic = src[iid]
                t = ic.get('transform')
                reg_len = None
                o_reg = None
                for fit in ((None,) + FITS):
                    if fit == '슬림' and name in SHORT_KINDS and o_reg is not None:
                        # 반소매티 슬림: 레귤러 그림을 가로로만 줄인다(SLIM_TEE). 크롭은 긴 티(기본 그림)의 허리 선을 짧게 자른 것.
                        back = affine(slim_tee(o_reg, **SLIM_TEE, span=tee_span.get(name)), inv(place, t))
                        if t:
                            back['transform'] = t
                        out_icons[fit_key(iid, fit)] = back
                        continue
                    v = affine(ic, fwd(place, t))
                    v.pop('transform', None)
                    v = base_body(v, name)
                    if fit:
                        v = affine(v, fit_map(fit, hem_y(v), name))
                    nip = None
                    if long:
                        prof = over_len_prof(profile_for(name, fit), fit, name, reg_len)
                        o, info, _ = process(v, g, prof)
                        if fit is None:
                            reg_len = info['yc'] - info['S'][1]
                        o_pre = o          # 짜임 결은 허리 넣기 전 그림 윤곽에 맞춰 고른 뒤 같이 좁힌다
                        if prof.get('waist'):
                            o, nip = slim_waist(o, info, WAIST_BY_NAME.get(name, prof['waist']), **SLIM_EXTRA.get(name, {}),
                                                span=None if iid == s['baseIcon'] else waist_span.get(name), name=name)
                            if iid == s['baseIcon']:
                                waist_span[name] = slim_waist.last_span
                    else:
                        o, info = v, None
                        if fit == '슬림' and name in SLIM_WAIST_ONLY:
                            o, nip = slim_waist(o, None, WAIST_BY_NAME.get(name, SLIM['waist']), **SLIM_EXTRA_ONLY.get(name, {}),
                                                span=None if iid == s['baseIcon'] else waist_span.get(name), name=name)
                            if iid == s['baseIcon']:
                                waist_span[name] = slim_waist.last_span
                    if fit is None:
                        o_reg = o
                        if name in SHORT_KINDS and iid == s['baseIcon']:
                            _sp = [subpaths(q)[0] for q in o['seams']]
                            tee_span[name] = to_poly(o['shapes'][0]).bounds[3] - min(min(p[1] for p in sp) for sp in _sp)
                    back = affine(o, inv(place, t))
                    if t:
                        back['transform'] = t
                    out_icons[fit_key(iid, fit)] = back
                    if long and iid == s['baseIcon']:
                        pre = affine(o_pre, inv(place, t))
                        warps[(name, fit)] = (weave_mover(info), place, t, *outline_for_weave(pre), pre['seams'], nip)
                        full_outline[(name, fit)] = outline_for_weave(pre, keep_plain=True)[0]
                        if fit is None:
                            hems[name] = hem_y(affine(ic, fwd(place, t)))
                if name in SHORT_KINDS:
                    # 원피스 반팔용(시안 5 때 반팔 슬림): 예전 슬림 몸판 배율 + 예전 소매 값, 허리 넣기 없이
                    v = affine(ic, fwd(place, t))
                    v.pop('transform', None)
                    v = affine(v, fit_map('슬림', hem_y(v)))
                    o = process(v, g, dict(REGULAR, widen=WIDEN * 0.88, **DRESS_SRC))[0]
                    back = affine(o, inv(place, t))
                    if t:
                        back['transform'] = t
                    out_icons[f'{iid}@원피스'] = back
                done.append({'id': iid})
            # 지금 앱 기본 그림(v12)의 핏별
            if kind in V12:
                v12fits[kind] = {}
                v0 = base_body(V12[kind], name)
                if long:
                    _i = process(v0, g, profile_for(name, None))[1]
                    reg_len = _i['yc'] - _i['S'][1]
                for fit in FITS:
                    v = affine(v0, fit_map(fit, hem_y(v0), name))
                    prof = profile_for(name, fit)
                    if long:
                        prof = over_len_prof(prof, fit, name, reg_len)
                        o, info, _ = process(v, g, prof)
                        if prof.get('waist'):
                            o = slim_waist(o, info, WAIST_BY_NAME.get(name, prof['waist']), **SLIM_EXTRA.get(name, {}), name=name)[0]
                    else:
                        o = slim_waist(v, None, WAIST_BY_NAME.get(name, SLIM['waist']), **SLIM_EXTRA_ONLY.get(name, {}), name=name)[0] if fit == '슬림' and name in SLIM_WAIST_ONLY else v
                    v12fits[kind][fit] = o
                if name == '셔츠':
                    v12fits[kind]['기본'] = base_body(V12['셔츠'], name)   # 새 카라 + C안 몸판을 단 첫 화면 기본 그림
                elif name in BASE_BODY:
                    v12fits[kind]['기본'] = base_body(V12[kind], name)   # 첫 화면 블라우스도 같은 몸판
                if name in SHORT_KINDS:
                    # 짧은 소매 옷은 지금 앱 기본 그림(레귤러) 소매도 세모라 같이 바꾼다 → gen_add_item이 icons_v13(첫 화면 그림)에 넣는다
                    v12fits[kind]['기본'] = process(V12[kind], g, profile_for(name, None))[0]
                    v12fits[kind]['슬림'] = slim_tee(v12fits[kind]['기본'], **SLIM_TEE)   # 반소매티 슬림도 레귤러를 줄인 것
            log[name] = {'kind': kind, 'g': g, 'iou_with_v12': round(iou, 4), 'place': [round(x, 4) for x in place],
                         'sleeves': long, 'icons': done}
            print(f'{name}: 그림 {len(done)}개 x 핏 3 · 소매 {"새로" if long else "그대로"} · g {g}')
    # 시안에 화면이 없는 v12 종류(서버 kind '코트'·'플리스')도 지금 앱 그림의 핏별을 만든다.
    for batch in batch_names:
        for kind, like in V12_ONLY.get(batch, []):
            g = log.get(like, {}).get('g', 1.0)
            v12fits[kind] = {}
            _i = process(V12[kind], g, profile_for(kind, None))[1]
            reg_len = _i['yc'] - _i['S'][1]
            for fit in FITS:
                prof = over_len_prof(profile_for(kind, fit), fit, kind, reg_len)
                o, info, _ = process(affine(V12[kind], fit_map(fit, hem_y(V12[kind]))), g, prof)
                if prof.get('waist'):
                    o = slim_waist(o, info, WAIST_BY_NAME.get(kind, prof['waist']), name=kind)[0]
                v12fits[kind][fit] = o
            print(f'{kind}(v12만): 핏 2 · g {g}')
    # 짜임 결: 기준 그림(니트·카디건 기본)의 소매 옮기기로 같이 옮기고, 꽈배기는 목 쪽 위까지 올린다. 핏별로도.
    for key, lines in WEAVES.items():
        if '@' in key:
            continue
        for prefix, name in WEAVE_OF.items():
            if not key.startswith(prefix):
                continue
            for fit in ((None,) + FITS):
                if (name, fit) not in warps:
                    continue
                mover, place, t0, outline, seams_x, seams, nip = warps[(name, fit)]
                f, b = fwd(place, t0), inv(place, t0)   # 결은 그림 좌표(그림 transform 안쪽)
                fm = fit_map(fit, hems[name]) if fit else (lambda x, y: (x, y))
                src_lines = lines['t'] if isinstance(lines, dict) else lines   # 털 결은 {'t': [...]}(옅게 그리는 선)
                moved = [mover(map_d(map_d(d, f), fm)) for d in src_lines]
                moved = [map_d(d, b) for d in moved if d is not None]
                if prefix == 'kn|' and '골지' in key:
                    moved = even_ribs(moved, seams, outline)
                if prefix == 'kn|' and ('꽈배기' in key or '골지' in key):
                    # 니트 결은 옷 윗선까지(11/23): 니트 하프넥·터틀넥 밴드를 올려서(collars.raise_neck) 예전 둥근 목 시보리
                    # 자리(기본 그림의 plain)가 드러나므로 그 자리도 채운다. 기본 그림에선 plain이 결 위에 칠해져 안 보인다.
                    moved = extend_up(moved, full_outline[(name, fit)], seams_x[0] + 0.6, seams_x[1] - 0.6)
                elif '꽈배기' in key:
                    moved = extend_up(moved, outline, seams_x[0] + 0.6, seams_x[1] - 0.6)
                if nip is not None:
                    # 슬림 허리: 몸판 위 결도 같이 좁힌다(그림 좌표 → v12 → 허리 → 그림 좌표)
                    moved = [map_d(nip(map_d(q, f)), b) for q in moved]
                out_weaves[fit_key(key, fit)] = {'t': moved} if isinstance(lines, dict) else moved
    json.dump(out_icons, open(OUT_ICONS, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(out_weaves, open(OUT_WEAVES, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(v12fits, open(OUT_V12FITS, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(log, open(LOG, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'icons_b.json 그림 {len(out_icons)}개 · weaves_b.json 결 {len(out_weaves)}개 · fits_b.json {len(v12fits)}종')


if __name__ == '__main__':
    main(sys.argv[1:] or ['상의'])
