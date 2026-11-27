"""B안 카라 다시 만들기(11/22 은재 님: "카라가 이상한 게 많은데 셔츠나 블라우스 기준으로").
기준은 셔츠·블라우스 화면의 '셔츠' 카라 그림(i53): 목 뒤 밴드 1개 + 양쪽으로 벌어지는 뾰족한 날개 2개.
- 빅카라(i55·i63): 둥근 큰 카라는 실제로 잘 안 입어서, 셔츠 카라 날개를 크게 키운 뾰족한 큰 카라로.
- 스탠드(i58·i66): 따로 떨어진 귀 같은 두 조각 → 셔츠 카라의 목 뒤 밴드를 위로 높인 한 줄 밴드 + 앞 가운데 트임 선.
- 니트 셔츠 카라(i78·i94): 셔츠 카라(밴드 + 날개)를 니트 목둘레에 맞춰 옮긴다 + 카라 아래 짧은 앞트임 선.
라운드·세일러·프릴은 이미 셔츠 카라와 같은 자리(목 뒤 밴드)에 붙어 있어서 모양은 그대로 둔다.
11/22 23시 은재 님: 양쪽 날개가 가운데에서 딱 붙어 있으면 인위적 → 날개 아래 끝(첫 단추 자리)은 그대로 두고 위로 갈수록
바깥으로 벌려(spread) 가운데에 V 모양 틈을 둔다. 틈으로 목 뒤 밴드가 보인다(지금 앱 셔츠 그림 v12처럼).
셔츠·빅카라·니트 셔츠 카라는 크게, 라운드는 조금 벌린다.
11/23 은재 님: 하프넥·터틀넥 목에 세로 골지 줄이 없으면 좋겠다 → 반소매티·긴소매티·니트의 하프넥·터틀넥(기본·크롭)에서
목 밴드 안의 짧은 세로줄만 뺀다. 목둘레 선과 터틀넥 접힌 선(가로줄)은 그대로 둔다.
니트 몸판의 '짜임: 골지'(고르는 무늬)는 목 모양과 상관없어서 그대로다.
같은 날 은재 님: 니트 하프넥이 너무 낮다 → 니트 하프넥·터틀넥 밴드를 위로 올린다(raise_neck).
밴드를 올리면 그 아래(예전 둥근 목 시보리 자리)에 짜임 결이 비어서, 니트 결(골지·꽈배기)을 목선까지 채운다(sleeves_b.py)."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from geo import map_d  # noqa: E402

REF = 'i53'            # 셔츠·블라우스 '셔츠' 카라
SHIRT_KIND = '블라우스'  # i53~i66은 셔츠·블라우스가 같이 쓰는 그림(마지막으로 블라우스 배율로 처리됨)


def _scale(d, ax, ay, sx, sy):
    return map_d(d, lambda x, y: (ax + (x - ax) * sx, ay + (y - ay) * sy))


def spread(d, side, k=0.34, pivot_y=14.8):
    """날개를 위로 갈수록 바깥으로 민다(높이는 그대로라 밴드에 붙은 채). side: 1 오른쪽 날개, -1 왼쪽."""
    return map_d(d, lambda x, y: (x + side * k * max(0.0, pivot_y - y), y))


def shirt_collar(ref, k=0.34):
    band, right, left = ref['tops'][:3]
    return [band, spread(right, 1, k), spread(left, -1, k)]


def big_collar(ref, shoulder=None):
    """셔츠 카라 날개를 목에 붙은 자리를 기준으로 키운다(가로·세로 1.32).
    11/22 밤 은재 님: 1.55배는 어깨를 덮어 끔찍 → 줄이고, 날개 바깥 끝이 어깨선 위로 솟지 않게 어깨선 아래로 내린다."""
    band, right, left = shirt_collar(ref)
    right, left = _scale(right, 33.6, 11.8, 1.32, 1.32), _scale(left, 30.4, 11.8, 1.32, 1.32)
    if shoulder is not None:
        from sleeves_b import top_y

        def under(x, y):
            t = top_y(shoulder, x)
            return (x, max(y, t + 0.7)) if t is not None and abs(x - 32) > 5.5 else (x, y)
        right, left = map_d(right, under), map_d(left, under)
    return [band, right, left]


def stand_collar(ref):
    """목 뒤 밴드의 윗선을 2.2 올려 목을 감싸는 밴드로. 앞 가운데는 트임 선."""
    band = ref['tops'][0]

    def lift(x, y):
        # 윗선을 올리면서 조금 안으로 모아 목을 감싸게(위가 벌어진 컵 모양이 되지 않게)
        w = 1.0 if y < 10.9 else max(0.0, (11.6 - y) / 0.7)
        return 32 + (x - 32) * (1 - 0.07 * w), y - 2.2 * w
    return [map_d(band, lift)], ['M32,12.7 L32,9.2']


# 하프넥·터틀넥 그림(기본·크롭): 반소매티 i7·i8·i18·i19, 긴소매티 i30·i31·i41·i42, 니트 i74·i75·i90·i91
PLAIN_NECKS = ('i7', 'i8', 'i18', 'i19', 'i30', 'i31', 'i41', 'i42', 'i74', 'i75', 'i90', 'i91')


def plain_neck(ic):
    """목 밴드(tops 첫 조각) 안에 세로로 그은 짧은 줄(골지)을 뺀다. 뺀 줄 수를 돌려준다."""
    from geo import NUM

    def xy(d):
        v = [float(x) for x in NUM.findall(d)]
        return v[0::2], v[1::2]
    bx, by = xy(ic['tops'][0])
    x0, x1, y0, y1 = min(bx), max(bx), min(by), max(by)

    def rib(d):
        xs, ys = xy(d)
        return (max(xs) - min(xs) < 0.3 and 1 < max(ys) - min(ys) < 8
                and x0 - 0.5 <= min(xs) and max(xs) <= x1 + 0.5 and y0 - 0.5 <= min(ys) and max(ys) <= y1 + 1)
    keep = [d for d in ic.get('details', []) if not rib(d)]
    n = len(ic.get('details', [])) - len(keep)
    ic['details'] = keep
    return n


# 니트 하프넥·터틀넥(기본·크롭): 니트 몸판 목선이 티셔츠보다 3쯤 높아서, 티셔츠와 같은 밴드를 그대로 쓰면
# 하프넥이 목선 위로 안 올라와 라운드넥처럼 보인다(11/23 은재 님: "하프넥 좀 더 위에").
# → 밴드 아래 끝이 목선보다 1.1 아래(긴소매티와 같은 겹침)가 되게 밴드를 통째로 올린다. 터틀넥도 같이(두 목 모양 차이 유지).
KNIT_NECKS = ('i74', 'i75', 'i90', 'i91')
KNIT_NECK_UP = 3.1


def raise_neck(ic, dy):
    """목 밴드(tops 첫 조각)와 밴드 안 가로줄(목둘레·접힌 선)을 위로 dy 올린다."""
    from geo import NUM
    v = [float(x) for x in NUM.findall(ic['tops'][0])]
    x0, x1, y1 = min(v[0::2]), max(v[0::2]), max(v[1::2])

    def inband(d):
        w = [float(x) for x in NUM.findall(d)]
        return min(w[0::2]) >= x0 - 0.5 and max(w[0::2]) <= x1 + 0.5 and max(w[1::2]) <= y1
    up = lambda x, y: (x, y - dy)
    ic['tops'] = [map_d(ic['tops'][0], up)] + ic['tops'][1:]
    ic['details'] = [map_d(d, up) if inband(d) else d for d in ic.get('details', [])]


# 터틀넥(반소매티·긴소매티·니트, 기본·크롭): 밴드 가운데를 가로지르는 목둘레 선은 뺀다(11/23 "중간에 그어진 선 이상해 보여").
# 위쪽 접힌 선은 그대로.
TURTLES = ('i8', 'i19', 'i31', 'i42', 'i75', 'i91')
# 11/23 오후 "밑이랑 위랑 골지 굵기가 달라 보인다": 목 골지도 몸판 골지와 같은 간격(1.15)·같은 자리(가운데 32에서 1.15씩)로.
RIB_GAP = 1.15
RIB_X = tuple(round(32 + k * RIB_GAP, 2) for k in range(-4, 5))   # 27.4 … 36.6, 9줄


def turtle_midline(ic):
    """밴드 안 가로줄 중 아래쪽(목둘레)을 뺀다. 뺀 줄 수를 돌려준다."""
    from geo import NUM
    v = [float(x) for x in NUM.findall(ic['tops'][0])]
    x0, x1, y0, y1 = min(v[0::2]), max(v[0::2]), min(v[1::2]), max(v[1::2])
    rows = []
    for d in ic.get('details', []):
        w = [float(x) for x in NUM.findall(d)]
        xs, ys = w[0::2], w[1::2]
        if min(xs) >= x0 - 0.5 and max(xs) <= x1 + 0.5 and y0 <= min(ys) and max(ys) <= y1 and max(xs) - min(xs) > 8:
            rows.append((min(ys), d))
    assert len(rows) == 2, rows
    low = max(rows)[1]
    ic['details'] = [d for d in ic['details'] if d != low]
    return 1


def knit_ribs(ic):
    """니트 하프넥·터틀넥 밴드에 넣을 골지 줄(짜임이 골지일 때만 앱이 그린다). 위쪽 가로줄 바로 아래부터 밴드 아래 끝까지."""
    from geo import NUM, to_poly
    band = to_poly(ic['tops'][0])
    x0, y0, x1, y1 = band.bounds
    tops_y = []
    for d in ic.get('details', []):
        w = [float(x) for x in NUM.findall(d)]
        if min(w[0::2]) >= x0 - 0.5 and max(w[0::2]) <= x1 + 0.5 and max(w[1::2]) <= y1 and max(w[0::2]) - min(w[0::2]) > 8:
            tops_y.append(max(w[1::2]))
    start = (max(tops_y) if tops_y else y0) + 0.45
    inside = band.buffer(-0.4)
    out = []
    from shapely.geometry import LineString
    for x in RIB_X:
        g = LineString([(x, start), (x, y1 + 1)]).intersection(inside)
        if not g.is_empty and g.length > 1:
            (ax, ay), (bx, by) = g.coords[0], g.coords[-1]
            out.append(f'M{ax:.2f},{ay:.2f} L{bx:.2f},{by:.2f}')
    return out


def apply(out_icons, PL, fwd, inv):
    """out_icons: 시안 그림(그림 좌표) 사전. 소매를 바꾸기 전에 고친다."""
    for iid in PLAIN_NECKS:
        n = plain_neck(out_icons[iid])
        assert n == 5, (iid, n)   # 시안 그림마다 골지 줄은 5개
    for iid in KNIT_NECKS:
        raise_neck(out_icons[iid], KNIT_NECK_UP)
    for iid in TURTLES:
        turtle_midline(out_icons[iid])
    for iid in KNIT_NECKS:
        out_icons[iid]['ribs'] = knit_ribs(out_icons[iid])
        assert len(out_icons[iid]['ribs']) == len(RIB_X), (iid, len(out_icons[iid]['ribs']))
    ref = {'tops': list(out_icons[REF]['tops'])}   # 고치기 전 셔츠 카라(기준)
    for iid in ('i53', 'i61'):
        ic = out_icons[iid]
        ic['tops'] = shirt_collar(ref) + ic['tops'][3:]
    for iid in ('i54', 'i62'):
        ic = out_icons[iid]
        band, right, left = ic['tops'][:3]
        ic['tops'] = [band, spread(right, 1, 0.18), spread(left, -1, 0.18)] + ic['tops'][3:]
    from geo import to_poly
    for iid in ('i55', 'i63'):
        ic = out_icons[iid]
        ic['tops'] = big_collar(ref, to_poly(ic['shapes'][0])) + ic['tops'][3:]
    for iid in ('i58', 'i66'):
        ic = out_icons[iid]
        tops, lines = stand_collar(ref)
        ic['tops'] = tops + ic['tops'][2:]
        ic['details'] = ic.get('details', []) + lines
    # 니트: 셔츠 그림 좌표 → v12 → 니트 목 높이에 맞춰 위로 → 니트 그림 좌표
    ps, pk = PL[SHIRT_KIND], PL['니트']
    f, b = fwd(ps, None), inv(pk, None)
    band_top_shirt = f(32, 10.4)[1]
    knit_neck_top = fwd(pk, None)(32, 8.6)[1]
    dy = knit_neck_top - band_top_shirt + 0.5
    move = lambda x, y: b(f(x, y)[0], f(x, y)[1] + dy)
    collar = [map_d(d, move) for d in shirt_collar(ref)]
    placket = map_d('M32,15.2 L32,19', move)
    for iid in ('i78', 'i94'):
        ic = out_icons[iid]
        ic['tops'] = collar + ic['tops'][2:]
        ic['details'] = ic.get('details', []) + [placket]
