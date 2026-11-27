"""원피스·점프수트 B안 시안(11/23 은재 님: "원피스는 바뀌면 어떻게 될지 알려주세요", "목모양 다 반영", "허리끈 고르면 끈").
만드는 법(윗옷 + 치마/바지 잇기): 이미 정한 상의 그림(반소매티·긴소매티의 목 모양별·핏별, 블라우스 카라)을 원피스 크기로
줄여(S배) 어깨를 원피스 어깨 높이에 맞추고, 몸판만 허리선까지 잘라 허리로 갈수록 좁힌 뒤(소매는 그대로),
원피스 그림의 허리선 아래(치마) / 점프수트의 허리 아래(바지)와 합친다.
- 소매: 끈 = 원피스 시안의 끈 그림 그대로(목 모양 없음) · 민소매 = 반소매티에서 소매를 뺀 몸판 · 반팔 = 반소매티 · 긴팔 = 긴소매티(B안 새 소매).
- 목 모양: 라운드·V넥·스퀘어넥·오프숄더 = 상의 그림의 목 그대로, 셔츠 카라·라운드 카라 = 블라우스(B안) 카라를 라운드 목 위에.
- 핏: 슬림 = 상의 슬림 + 허리 조금 더 + 치마 폭 좁게, 오버사이즈 = 상의 오버 + 허리 안 좁히고 치마를 몸판 폭에 맞춰 일자로.
- 허리 끈: 점프수트 시안의 리본을 허리 가운데에.
- 치마 주름: A = 미니 원래 주름 중 윗부분만 / B = 미디·롱에도 같은 주름(허리에서 퍼지는 선).
아직 시안 단계(앱 그림에는 안 넣음). 사용: python3 dresses.py <출력 html> <출력 png>"""
import copy
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from shapely.geometry import LineString, MultiLineString, Point, Polygon, box  # noqa: E402
from shapely.ops import unary_union  # noqa: E402

import sleeves_b as SB  # noqa: E402
from geo import map_d, poly_to_d, subpaths, to_poly  # noqa: E402
from sleeves_b import line_d  # noqa: E402

ICONS, SPECS, WEAVES, V12 = SB.load()
PL = SB.places(ICONS, SPECS, V12)
NEW = json.load(open(SB.OUT_ICONS, encoding='utf-8'))
C = 32.0
S = 0.70            # 상의 → 원피스 크기(세로)
SX = 0.63           # 가로(원피스 몸판은 티셔츠보다 좁게)
# 반팔 원피스(11/23 오후 "윗부분이 부해 보인다"): 가로를 조금 더 줄이고, 소매는 반소매티 슬림 소매(덜 퍼짐)를 쓴다
SX_SHORT = 0.58
# 반팔 원피스 소매: 시안 5 때 반소매티 슬림 소매('그림id@원피스', sleeves_b가 따로 만든다 — 반팔 슬림을 바꿔도 그대로)
SHORT_SRC_FIT = {None: '원피스', '슬림': '원피스', '오버사이즈': '오버사이즈'}
ARMPIT = 22.0       # 상의(v12)에서 몸판이 좁아지기 시작하는 높이(겨드랑이)

# 원피스 종류: 치마를 가져올 그림(반팔), 끈 그림, 허리선 높이(v12, 가운데), 어깨 높이(목 옆, v12)
DRESS = {
    '미니원피스': dict(skirt='i165', strap='i166', top=12.1),
    '미디원피스': dict(skirt='i163', strap='i161', top=7.5),
    '롱원피스': dict(skirt='i172', strap='i170', top=4.5),
    '점프수트': dict(skirt='i160', strap='i161', top=4.6, strap_kind='미디원피스'),
}
TOPS = {   # 소매 → (상의 종류, {목 모양: 그림 id})
    '반팔': ('반소매티셔츠', {'라운드': 'i0', 'V넥': 'i3', '스퀘어넥': 'i5', '오프숄더': 'i9'}),
    '긴팔': ('긴소매티셔츠', {'라운드': 'i23', 'V넥': 'i26', '스퀘어넥': 'i28', '오프숄더': 'i32'}),
}
TOPS['민소매'] = TOPS['반팔']
COLLAR = {'셔츠 카라': 'i53', '라운드 카라': 'i54'}   # 블라우스(B안)


def v12(iid, kind, fit=None):
    key = iid if fit is None else f'{iid}@{fit}'
    ic = NEW.get(key) or NEW.get(iid) or ICONS[iid]
    v = SB.affine(ic, SB.fwd(PL[kind], ic.get('transform')))
    v.pop('transform', None)
    return v


def poly(ds):
    return unary_union([to_poly(d) for d in ds])


def lines_in(d, region):
    """선 path를 region 안 부분만 남긴다(점선 path 목록)."""
    out = []
    for sp in subpaths(d):
        if len(sp) < 2:
            continue
        g = LineString(sp).intersection(region)
        parts = [g] if isinstance(g, LineString) else (list(g.geoms) if isinstance(g, MultiLineString) else [])
        for p in parts:
            if p.length < 0.4:
                continue
            p = p.simplify(0.04)
            out.append('M' + ' L'.join(f'{x:.2f},{y:.2f}' for x, y in p.coords))
    return out


def waist_of(kind):
    """원피스 그림의 허리선(가운데 높이, 양끝 높이). 점프수트는 리본 가운데."""
    ref = v12(DRESS[kind]['skirt'], kind)
    if kind == '점프수트':
        y = SB.fwd(PL[kind], None)(32, 22.1)[1]
        return y, y
    for d in ref['details']:
        sp = subpaths(d)[0]
        xs = [p[0] for p in sp]
        if max(xs) - min(xs) > 8:
            ys = [p[1] for p in sp]
            return max(ys), min(ys)
    raise ValueError(kind)


def below(yc, ye):
    """허리선 아래 영역(가운데가 조금 처진 곡선)."""
    pts = [(-5, ye), (C - 12, ye)] + [(C + t, yc - (yc - ye) * (t / 12) ** 2) for t in range(-12, 13, 2)] + [(C + 12, ye), (69, ye), (69, 80), (-5, 80)]
    return Polygon(pts)


def body_zone(top):
    """상의의 몸판 영역: 좌우 소매 재봉선 사이(아래로 늘림)."""
    sm = sorted((subpaths(d)[0] for d in top['seams']), key=lambda s: s[0][0])
    left, right = sm[0], sm[-1]
    # 위로도 늘린다(11/23 고침: 재봉선 위 끝에서 잘라 어깨에 가로줄이 생기고 민소매 목이 튀어나왔음)
    pts = [(left[0][0], -10)] + left + [(left[-1][0], 90), (right[-1][0], 90)] + right[::-1] + [(right[0][0], -10)]
    return Polygon(pts).buffer(0)


def set_in_sleeve(S, U, side, L_k=1.18, w_k=0.52, theta=19.0, flare=0.12):
    """원피스 반팔(11/23 은재 님 참고 그림 C): 어깨 끝 S에서 팔을 따라 비스듬히(theta도) 내려오는 짧은 소매.
    진동선은 S→겨드랑이 U로 안쪽으로 살짝 들어가는 곡선, 밑단은 팔 방향에 거의 수직, 밑으로 조금만 퍼진다."""
    import math
    a = U[1] - S[1]
    t = math.radians(theta)
    d = (side * math.sin(t), math.cos(t))           # 팔 방향
    n = (side * math.cos(t), -math.sin(t))          # 바깥(밑단 방향)
    L, w = L_k * a, w_k * a
    Ho = (S[0] + L * d[0] + flare * a * n[0], S[1] + L * d[1] + flare * a * n[1])
    Hi = (Ho[0] - w * n[0], Ho[1] - w * n[1])

    def bez(p0, p1, p2, p3, k=10):
        return [((1 - u) ** 3 * p0[0] + 3 * (1 - u) ** 2 * u * p1[0] + 3 * (1 - u) * u * u * p2[0] + u ** 3 * p3[0],
                 (1 - u) ** 3 * p0[1] + 3 * (1 - u) ** 2 * u * p1[1] + 3 * (1 - u) * u * u * p2[1] + u ** 3 * p3[1]) for u in [i / k for i in range(k + 1)]]
    # 소매산: 어깨 끝에서 바깥으로 둥글게 내려간다
    cap = bez(S, (S[0] + side * 0.32 * a, S[1] + 0.02 * a), (Ho[0] - d[0] * 0.55 * L + side * 0.06 * a, Ho[1] - d[1] * 0.55 * L), Ho)
    hem = bez(Ho, (Ho[0] - 0.33 * w * n[0], Ho[1] - 0.33 * w * n[1] + 0.06 * a), (Hi[0] + 0.33 * w * n[0], Hi[1] + 0.33 * w * n[1] + 0.06 * a), Hi, 6)
    inner = bez(Hi, (Hi[0] - 0.3 * (Hi[0] - U[0]), Hi[1] - 0.3 * (Hi[1] - U[1])), (U[0] + side * 0.02 * a, U[1] + 0.05 * a), U, 6)
    # 진동선(몸판 위로): 겨드랑이에서 어깨 끝으로, 안쪽으로 살짝
    arm = bez(U, (U[0] - side * 0.1 * a, U[1] - 0.3 * a), (S[0] - side * 0.12 * a, S[1] + 0.35 * a), S)
    return Polygon(cap + hem[1:] + inner[1:] + arm[1:]).buffer(0)


REF_NECK = {'반소매티셔츠': 'i0', '긴소매티셔츠': 'i23'}
UNDERARM = 26.5     # 반팔: 소매 아랫선이 몸판에 닿는 높이(상의 v12). 원래 티셔츠는 32까지 내려와 원피스엔 너무 낮다.


def short_sleeves(sl, seam_x):
    """반팔 소매를 소매 끝 아래 점 → 겨드랑이(재봉선, UNDERARM) 직선 위쪽만 남긴다."""
    out = []
    for part in getattr(sl, 'geoms', [sl]):
        if part.area < 1:
            continue
        side = 1 if part.centroid.x > C else -1
        xs = [p for p in part.exterior.coords]
        tip = max(xs, key=lambda p: side * p[0])
        sx = seam_x[side]
        a, b = (sx, UNDERARM), (tip[0] + side * 0.4, tip[1] + 0.9)
        far = 40
        dx, dy = b[0] - a[0], b[1] - a[1]
        keep = Polygon([(a[0] - dx * far, a[1] - dy * far), (a[0] + dx * far, a[1] + dy * far),
                        (a[0] + dx * far, a[1] + dy * far - 80), (a[0] - dx * far, a[1] - dy * far - 80)])
        out.append(part.intersection(keep))
    return [o for o in out if not o.is_empty]


def armholes(top_y):
    """민소매 진동: 목 옆 어깨에서 겨드랑이로 안쪽으로 파인 곡선 바깥을 뺀다(상의 v12)."""
    regs = []
    for side in (1, -1):
        X = lambda dx: C + side * dx
        a = LineString([(X(12.2), top_y - 2)] + [(X(12.2 + 4.2 * t ** 2.2), top_y + 2.5 + (UNDERARM - top_y - 2.5) * t ** 0.8) for t in [i / 12 for i in range(13)]])
        pts = list(a.coords) + [(X(40), UNDERARM), (X(40), top_y - 5), (X(12.2), top_y - 5)]
        regs.append(Polygon(pts).buffer(0))
    return unary_union(regs)


def compose(kind, sleeve='반팔', neck='라운드', fit=None, tie=False, pleat=None):
    """원피스 그림 하나(v12 좌표 층 사전). shapes[0] = 몸판+치마, 나머지 = 소매(위에 겹쳐 그림)."""
    yc, ye = waist_of(kind)
    skirt_src = v12(DRESS[kind]['skirt'], kind)
    low = below(yc, ye)
    skirt = smooth_sides(poly(skirt_src['shapes']).intersection(low))
    skirt0 = skirt
    sk_w = skirt.intersection(box(0, ye - 0.01, 64, yc + 0.3)).bounds   # 허리 폭
    half_w = (sk_w[2] - sk_w[0]) / 2
    out = {'shapes': [], 'details': [], 'inner': [], 'plain': [], 'tops': [], 'shade': skirt_src['shade'], 'dots': []}
    sleeves = []
    if sleeve == '끈':
        sk = DRESS[kind].get('strap_kind', kind)
        st = v12(DRESS[kind]['strap'], sk)
        if sk != kind:   # 점프수트: 미디 끈 윗옷을 점프수트 허리에 맞춰 올림
            yc2, _ = waist_of(sk)
            st = SB.affine(st, lambda x, y: (x, y - (yc2 - yc)))
        body = poly(st['shapes']).difference(low)
        out['details'] = [d for d in st.get('details', []) if subpaths(d)[0][0][1] < ye - 0.5]
    else:
        tkind, ids = TOPS[sleeve]
        base_neck = neck if neck in ids else '라운드'
        raw = v12(ids[base_neck], tkind, SHORT_SRC_FIT[fit] if sleeve == '반팔' else fit)
        t0 = poly(v12(REF_NECK[tkind], tkind)['shapes']).bounds[1]
        y0 = DRESS[kind]['top']
        sx = SX_SHORT if sleeve == '반팔' and fit != '오버사이즈' else SX
        T = lambda x, y: (C + sx * (x - C), y0 + S * (y - t0))
        P = poly(raw['shapes'])
        zone = body_zone(raw)
        body_t = P.intersection(zone)
        sm = sorted((subpaths(d)[0] for d in raw['seams']), key=lambda q: q[0][0])
        seam_x = {-1: sm[0][0][0], 1: sm[-1][0][0]}
        if sleeve == '민소매':
            if base_neck != '오프숄더':
                body_t = body_t.difference(armholes(t0))
            sl_t = []
        elif sleeve == '반팔':
            # 11/23 "원피스 반팔을 반팔 티셔츠 반팔 모양 느낌으로": 새 반소매티(긴팔 같은 팔 + 소매단 선) 소매를 그대로
            # 소매 아래로 몸판 옆이 재봉선 밖으로 살짝 나온 가는 조각은 빼고(소매 끝 높이까지만)
            ye_s = max(p[1] for q in raw['seams'] for p in subpaths(q)[0])
            cutoff = P.difference(zone).intersection(box(-20, -20, 90, ye_s + 0.35))
            sl_t = [g for g in getattr(cutoff, 'geoms', [cutoff]) if g.area > 1]
        else:
            sl_t = [g for g in getattr(P.difference(zone), 'geoms', [P.difference(zone)]) if g.area > 1]
        # 몸판이 좁아지기 시작하는 높이: 반팔은 소매 아랫선이 몸판에 닿는 곳(소매 끝이 아래로 삐죽 남지 않게)
        seam_end_t = max(p[1] for q in raw['seams'] for p in subpaths(q)[0])
        y_arm = T(0, {'반팔': seam_end_t, '민소매': UNDERARM - 1.5, '긴팔': 22.0}[sleeve])[1]
        to_d = lambda g: map_d(poly_to_d(g, tol=0.05), T)
        body = to_poly(to_d(body_t))
        sleeves = [to_poly(to_d(g)) for g in sl_t]
        cur = body.intersection(box(0, yc - 0.6, 64, yc - 0.2)).bounds
        cur_half = (cur[2] - cur[0]) / 2 if cur[2] > cur[0] else half_w
        target = half_w * (0.94 if fit == '슬림' else 1.0)
        r = 1.0 if fit == '오버사이즈' else min(1.0, target / cur_half)
        if fit == '오버사이즈' and kind == '점프수트':
            # 점프수트 오버: 바지 통은 1.3배까지만, 몸판은 그 폭으로 좁힌다
            jk = min(1.3, cur_half / half_w)
            r = min(1.0, half_w * jk / cur_half)

        def taper(x, y):
            if y <= y_arm:
                return x, y
            u = min(1.0, (y - y_arm) / max(0.5, yc - y_arm))
            u = u * u * (3 - 2 * u)
            return C + (x - C) * (1 - (1 - r) * u), y
        body = to_poly(map_d(poly_to_d(body, tol=0.05), taper)).difference(low)
        # 선: 목·소매 선만(티셔츠 밑단·옆 재봉선은 뺀다)
        keep_t = box(0, -5, 64, UNDERARM - 4).intersection(zone)
        for g in (sl_t if sleeve != '반팔' else []):   # 반팔: 소매 끝 선은 안 그린다(11/23 오후)
            keep_t = keep_t.union(g.buffer(-0.25))
        if sleeve == '반팔':
            # 소매를 몸판과 한 덩어리로 잇고(어깨·겨드랑이 꺾임 없이) 이음새는 진동선 하나로
            body = unary_union([body] + sleeves).buffer(0.5, join_style=1).buffer(-0.5, join_style=1)
            sleeves = []
            out['details'] += [map_d(d, T) for d in raw['seams']]
        if neck not in COLLAR:
            for d in raw.get('details', []):
                out['details'] += [map_d(map_d(q, T), taper) for q in lines_in(d, keep_t)]
            for k in ('inner', 'plain', 'tops'):
                out[k] = [map_d(map_d(d, T), taper) for d in raw.get(k, [])]
            if sleeve == '민소매' and base_neck == '오프숄더':
                # 어깨 없는 민소매: 오프숄더 띠를 몸판 폭까지만(양옆으로 막대처럼 튀어나오지 않게)
                bb = body.bounds
                out['tops'] = [poly_to_d(to_poly(d).intersection(box(bb[0] - 0.25, -10, bb[2] + 0.25, 90)), tol=0.05) for d in out['tops']]
        if fit == '오버사이즈':
            bw = body.intersection(box(0, ye - 1.2, 64, ye - 0.4)).bounds
            bh = (bw[2] - bw[0]) / 2
            hb = skirt.bounds
            if kind == '점프수트':
                # 바지: 통을 넓힌다(몸판 아래 폭에 맞춰 같은 배율, 1.3배까지)
                k = min(1.3, bh / half_w)
                skirt = to_poly(map_d(poly_to_d(skirt, tol=0.05), lambda x, y: (C + (x - C) * k, y)))
            else:
                # 치마: 몸판 폭에서 거의 곧게 내려가는 A라인(밑단만 조금 넓게), 밑단은 살짝 둥글게
                hh = max(bh * 1.14, (hb[2] - hb[0]) / 2 * 0.92)
                hem = hb[3] - 0.4
                pts = [(C - bh, ye - 0.3), (C + bh, ye - 0.3)]
                pts += [(C + hh * (1 - t / 10), hem + 0.5 * (1 - (1 - t / 10) ** 2)) for t in range(0, 21)][:11]
                pts += [(C - hh * t / 10, hem + 0.5 * (1 - (t / 10) ** 2)) for t in range(1, 11)]
                skirt = Polygon(pts).buffer(0)
    if fit == '슬림':
        hb = skirt.bounds
        skirt = to_poly(map_d(poly_to_d(skirt, tol=0.05), lambda x, y: (C + (x - C) * (0.94 - 0.1 * min(1, max(0, (y - ye) / (hb[3] - ye)))), y)))
    main = unary_union([body, skirt]).buffer(0.15).buffer(-0.15)
    out['shapes'] = [poly_to_d(main, tol=0.05)] + [poly_to_d(g, tol=0.05) for g in sleeves]
    whole = unary_union([main] + sleeves)
    # 허리선(오버사이즈는 없음)
    if fit != '오버사이즈':
        w = main.intersection(LineString([(0, ye), (64, ye)])).bounds
        out['details'].append(f'M{w[0] + 0.3:.2f},{ye:.2f} C{C - 4:.2f},{yc:.2f} {C + 4:.2f},{yc:.2f} {w[2] - 0.3:.2f},{ye:.2f}')
    # 치마/바지 선(원래 그림에서 허리선 아래만) — 핏으로 치마 폭이 바뀌면 선도 같은 비율로 옮긴다
    smap = skirt_mapper(skirt0, skirt, ye)
    for d in skirt_src['details']:
        sp = subpaths(d)[0]
        xs = [p[0] for p in sp]
        if max(xs) - min(xs) > 8:
            continue   # 원래 허리선
        if kind == '점프수트' and min(p[1] for p in sp) < yc + 3.2:
            continue   # 점프수트 리본은 허리 끈일 때만
        if kind == '미니원피스' and tie:
            continue   # 허리 끈이 있으면 미니도 주름 없이(11/23)
        if kind == '미니원피스' and min(p[1] for p in sp) > SB.fwd(PL[kind], None)(0, 39.4)[1]:
            continue   # 미니: 아래쪽 주름은 지운다(11/23 은재 님 "미니는 윗부분만")
        if fit == '오버사이즈' and kind != '점프수트':
            continue   # 오버사이즈 원피스는 치마 주름 없이(11/23 "오버는 치마주름 빼자")
        out['details'] += [map_d(q, smap) for q in lines_in(d, low)]
    if pleat == 'B' and kind in ('미디원피스', '롱원피스'):
        out['details'] += [map_d(q, smap) for q in pleats(skirt0, yc)]
    # 끝처리: 선이 바깥선 밖으로 삐져나오지 않게
    inside = whole.buffer(-0.22)
    out['details'] = [q for d in out['details'] for q in lines_in(d, inside)]
    if neck in COLLAR and sleeve != '끈':
        add_collar(out, raw, T, y_arm, COLLAR[neck], t0)
    if tie:
        add_tie(out, yc, ye, main)     # 띠는 몸판 위에만(긴팔 소매 위로 지나가지 않게)
    out['shapes'] = [d for d in out['shapes'] if d]
    return {k: v for k, v in out.items() if v}


def pleats(skirt, yc):
    """허리 바로 아래에서 시작해 조금 벌어지며 내려가는 주름 2줄(양쪽 1줄씩, 미니 윗주름과 같은 모양)."""
    hem = skirt.bounds[3]
    ya = yc + 1.0
    yb = ya + (hem - ya) * 0.42
    return [f'M{C + side * 2.7:.2f},{ya:.2f} C{C + side * 3.0:.2f},{ya + (yb - ya) * 0.35:.2f} {C + side * 3.9:.2f},{ya + (yb - ya) * 0.75:.2f} {C + side * 4.5:.2f},{yb:.2f}'
            for side in (1, -1)]


def smooth_sides(g, win=2.5):
    """치마 옆선의 작은 혹·홈(시안의 엉덩이 자리)을 부드럽게 편다. 허리 끝과 밑단 물결은 그대로 둔다."""
    from shapely.geometry import Polygon as _P
    g = g.buffer(0)
    if g.geom_type != 'Polygon':
        g = max(g.geoms, key=lambda q: q.area)
    ring = LineString(g.exterior.coords)
    n = max(40, int(ring.length / 0.25))
    pts = [ring.interpolate(i / n, normalized=True).coords[0] for i in range(n)]
    y0, y1 = g.bounds[1] + 0.8, g.bounds[3] - 2.6
    k = int(win / 0.25)
    out = []
    for i, (x, y) in enumerate(pts):
        if y0 < y < y1 and abs(x - C) > 3:
            nb = [pts[(i + j) % n] for j in range(-k, k + 1)]
            nb = [q for q in nb if abs(q[0] - C) > 3 and (q[0] - C) * (x - C) > 0]
            out.append((sum(q[0] for q in nb) / len(nb), sum(q[1] for q in nb) / len(nb)))
        else:
            out.append((x, y))
    return _P(out).buffer(0)


def skirt_mapper(old, new, ye):
    """원래 치마의 점을 새 치마(핏 바꾼 것)의 같은 상대 위치로."""
    if old.equals(new):
        return lambda x, y: (x, y)
    cache = {}

    def half(g, y):
        h = g.intersection(LineString([(-10, y), (80, y)]))
        return None if h.is_empty else (h.bounds[2] - h.bounds[0]) / 2

    def fn(x, y):
        k = round(y, 1)
        if k not in cache:
            a, b = half(old, k), half(new, k)
            cache[k] = (b / a) if a and b else 1.0
        return C + (x - C) * cache[k], y
    return fn


def add_collar(out, raw, T, y_arm, cid, t0):
    """블라우스(B안) 카라(목 뒤 밴드 + 날개 2개)를 라운드 목 위에. 블라우스 목 높이를 상의 목 높이에 맞춘 뒤 같은 T로."""
    bl = v12(cid, '블라우스')
    tb = poly(bl['shapes']).bounds[1]
    out['tops'] = [map_d(d, lambda x, y: T(x, y - tb + t0)) for d in bl['tops'][:3]]
    out['plain'] = []
    yb = max(to_poly(d).bounds[3] for d in out['tops'])
    out['details'].append(f'M{C:.2f},{yb - 0.3:.2f} L{C:.2f},{yb + 4.5:.2f}')


def add_tie(out, yc, ye=None, whole=None, drop_waist=True):
    """허리 끈(11/23 "리본 말고 끈"): 허리선을 따라 도는 띠 + 가운데 매듭 + 아래로 늘어진 끈 두 가닥(블라우스 '허리 끈'과 같은 모양)."""
    import math
    ye = yc - 0.6 if ye is None else ye
    if whole is None:
        whole = poly(out['shapes'])
    hb = 1.9   # 띠 폭
    cy = lambda x: ye + (yc - ye) * max(0.0, 1 - ((x - C) / 12) ** 2)
    xs = [C + t * 0.5 for t in range(-30, 31)]
    band = Polygon([(x, cy(x) - 0.2) for x in xs] + [(x, cy(x) + hb) for x in reversed(xs)]).intersection(whole.buffer(-0.05))
    if band.is_empty:
        return
    band = max(getattr(band, 'geoms', [band]), key=lambda q: q.area)
    kx, ky = C + 0.9, yc + hb / 2 - 0.1
    knot = Point(kx, ky).buffer(0.95, 24)
    knot = Polygon([(kx + 1.25 * math.cos(a), ky + 1.0 * math.sin(a)) for a in [i * math.pi / 18 for i in range(36)]])

    def strand(x0, y0, x1, y1, w0=1.05, w1=0.9):
        dx, dy = x1 - x0, y1 - y0
        ln = math.hypot(dx, dy)
        nx, ny = -dy / ln, dx / ln
        mid = (x0 + dx * 0.5 + nx * 0.25, y0 + dy * 0.5 + ny * 0.25)
        pts = [(x0 + nx * w0 / 2, y0 + ny * w0 / 2), (mid[0] + nx * 0.28, mid[1] + ny * 0.28), (x1 + nx * w1 / 2, y1 + ny * w1 / 2),
               (x1 - nx * w1 / 2, y1 - ny * w1 / 2), (mid[0] - nx * 0.28, mid[1] - ny * 0.28), (x0 - nx * w0 / 2, y0 - ny * w0 / 2)]
        return Polygon(pts).buffer(0.12, join_style=1)
    s1 = strand(kx - 0.4, ky + 0.5, kx - 1.6, ky + 7.4)
    s2 = strand(kx + 0.5, ky + 0.5, kx + 2.4, ky + 6.6)
    out['tops'] = out.get('tops', []) + [poly_to_d(band, tol=0.03), poly_to_d(s1, tol=0.03), poly_to_d(s2, tol=0.03), poly_to_d(knot, tol=0.03)]
    if drop_waist:
        out['details'] = [d for d in out.get('details', []) if not (abs(subpaths(d)[0][0][1] - ye) < 0.6 and len(subpaths(d)[0]) > 8 and
                                                                     max(p[0] for p in subpaths(d)[0]) - min(p[0] for p in subpaths(d)[0]) > 8)]


# ── 롱원피스는 지금 그림(V넥·퍼프 소매)을 살린다(11/23 은재 님 "이건 지금이 나은데요") ──
# 고칠 것: 어깨에서 엉덩이까지 일자로 그은 소매 재봉선, 엉덩이 옆 작은 꺾임.
# → 소매를 둥근 진동선으로 떼어 따로 그리고(몸판 위에 겹침), 긴팔은 몸판을 허리 쪽으로 살짝 좁혀 팔과 몸 사이가 보이게.
LONG = {'반팔': 'i172', '긴팔': 'i169', '민소매': 'i171', '끈': 'i170'}


def _armhole(side, y_end):
    """어깨 끝(41.1, 5.6)에서 겨드랑이까지 안쪽으로 살짝 들어가는 곡선(시안 좌표)."""
    X = lambda x: C + side * (x - C)
    pts = []
    for t in [i / 16 for i in range(17)]:
        # 3차 베지어: (41.1,5.6) (40.2,7.9) (39.9,11) (40.5,y_end)
        p0, p1, p2, p3 = (41.1, 5.6), (40.2, 7.9), (39.95, 10.8), (40.5, y_end)
        x = (1 - t) ** 3 * p0[0] + 3 * (1 - t) ** 2 * t * p1[0] + 3 * (1 - t) * t ** 2 * p2[0] + t ** 3 * p3[0]
        y = (1 - t) ** 3 * p0[1] + 3 * (1 - t) ** 2 * t * p1[1] + 3 * (1 - t) * t ** 2 * p2[1] + t ** 3 * p3[1]
        pts.append((X(x), y))
    return pts


def tee_short_sleeves(S_right, fit='슬림'):
    """새 반소매티(B안) 소매를 원피스 크기(SX_SHORT·S배)로 줄여 어깨 끝 S_right(롱 시안 좌표)에 붙인다(양쪽).
    돌려주는 것: 소매 도형들, 진동선(재봉선) 선들. 소매 끝 선은 안 쓴다(11/23 오후)."""
    raw = v12('i0', '반소매티셔츠', '원피스' if fit == '슬림' else fit)
    P = poly(raw['shapes'])
    zone = body_zone(raw)
    sm = sorted((subpaths(d)[0] for d in raw['seams']), key=lambda q: q[0][0])
    to_m = SB.inv(PL['롱원피스'], None)        # v12 → 롱 시안 좌표
    fw = SB.fwd(PL['롱원피스'], None)
    Sv = fw(*S_right)                           # 롱 어깨 끝(v12)
    out, lines = [], []
    for side, seam in ((1, sm[-1]), (-1, sm[0])):
        St = seam[0]
        Sd = (C + side * (Sv[0] - C), Sv[1])
        T = lambda x, y, St=St, Sd=Sd: to_m(Sd[0] + SX_SHORT * (x - St[0]), Sd[1] + S * (y - St[1]))
        ye_s = max(p[1] for q in raw['seams'] for p in subpaths(q)[0])
        cutoff = P.difference(zone).intersection(box(-20, -20, 90, ye_s + 0.35))
        parts = [g for g in getattr(cutoff, 'geoms', [cutoff]) if g.area > 1 and (g.centroid.x - C) * side > 0]
        for g in parts:
            out.append(to_poly(map_d(poly_to_d(g, tol=0.04), T)))
        lines.append(map_d(line_d(seam), T))
    return out, lines


def long_fixed(sleeve, tie=False, pleat=None):
    """롱원피스 지금 그림을 고친 것(v12 좌표)."""
    kind = '롱원피스'
    src = copy.deepcopy(ICONS[LONG[sleeve]])
    P = poly(src['shapes'])
    yc, ye = waist_of(kind)
    to_v = SB.fwd(PL[kind], None)
    sleeves = []
    if sleeve in ('반팔', '긴팔'):
        regs = []
        for side in (1, -1):
            X = lambda x: C + side * (x - C)
            if sleeve == '반팔':
                # 퍼프 소매 자리를 어깨 끝 세로선 바깥으로만 떼고, 새 반소매티 소매를 그 자리에 붙인다
                pts = [(X(41.1), -10), (X(41.1), 17.5), (X(70), 17.5), (X(70), -10)]
            else:
                arm = _armhole(side, 12.6)
                seam = [p for p in subpaths(src['seams'][0 if side == 1 else 1])[0] if p[1] > 12.7]
                seam = [(X(x) if side == -1 else x, y) for x, y in seam] if side == 1 else [(x, y) for x, y in seam]
                pts = arm + seam + [(X(41.6), 31.5), (X(70), 31.5), (X(70), -10), (X(41.1), -10)]
            regs.append(Polygon(pts).buffer(0))
        if sleeve == '반팔':
            # 퍼프 소매 대신 참고 그림 C 같은 반팔(11/23). 소매 끝 선(퍼프 밴드)도 뺀다.
            sleeves, seam_l = tee_short_sleeves((41.1, 5.6))
            src['details'] = src['details'] + seam_l
            src['details'] = [d for d in src['details'] if not d.startswith(('M47,13', 'M17,13'))]
            regs_used = []
        for r in (regs if sleeve == '긴팔' else []):
            g = P.intersection(r)
            if not g.is_empty:
                g = max(getattr(g, 'geoms', [g]), key=lambda q: q.area)
                if sleeve == '긴팔':
                    # 팔을 어깨 끝 기준으로 바깥쪽으로 3도쯤 벌려 몸과 사이가 보이게
                    from shapely import affinity
                    side = 1 if g.centroid.x > C else -1
                    g = affinity.rotate(g, -3.2 * side, origin=(C + side * 9.1, 5.6))
                sleeves.append(g)
        body = P.difference(unary_union(regs).buffer(0.02))
        body = max(getattr(body, 'geoms', [body]), key=lambda q: q.area)
        if sleeve == '긴팔':
            # 팔과 몸 사이가 보이게 겨드랑이~엉덩이 몸판을 살짝 좁힌다(허리에서 가장 많이)
            import math

            def nip(x, y):
                if 12.6 < y < 30.5:
                    a = 0.05 * math.sin(math.pi * (y - 12.6) / (30.5 - 12.6))
                    return C + (x - C) * (1 - a), y
                return x, y
            body = to_poly(map_d(poly_to_d(body, tol=0.04), nip))
        src['seams'] = []
    else:
        body = P
    # 엉덩이 옆 꺾임 펴기(허리 아래만)
    ym = 19.2
    low = body.intersection(box(-10, ym, 80, 90))
    high = body.intersection(box(-10, -10, 80, ym))
    body = unary_union([high, smooth_sides(low)]).buffer(0.05).buffer(-0.05)
    if sleeve == '끈':
        body = unary_union([body] + [to_poly(d) for d in src['shapes'][:2]])
        src['shapes'] = [poly_to_d(body.difference(unary_union([to_poly(d) for d in src['shapes'][:2]])), tol=0.04)] + src['shapes'][:2]
    else:
        if sleeve == '반팔':
            # 소매를 몸판과 한 덩어리로(어깨·겨드랑이 이음새 꺾임 없이), 이음새는 진동선만(11/23 오후)
            body = unary_union([body] + sleeves).buffer(0.5, join_style=1).buffer(-0.5, join_style=1)
            sleeves = []
        src['shapes'] = [poly_to_d(body, tol=0.04)] + [poly_to_d(g, tol=0.04) for g in sleeves]
    whole = unary_union([to_poly(d) for d in src['shapes']])
    v = SB.affine(src, to_v)
    v.pop('transform', None)
    inside = SB.affine({'shapes': [poly_to_d(whole.buffer(-0.22), tol=0.04)]}, to_v)['shapes'][0]
    if pleat == 'B':
        v['details'] = v.get('details', []) + pleats(poly(v['shapes']), yc)
    v['details'] = [q for d in v.get('details', []) for q in lines_in(d, to_poly(inside))]
    if tie:
        add_tie(v, yc, ye, poly(v['shapes']))
    return v


# ── 앱에 넣기(11/23 오후 "이대로 ㄱㄱ") ──
# 아무것도 안 고른 칸은 그 종류 지금 그림의 모양으로: 미니·미디 = 반팔·라운드, 롱 = 긴팔·V넥, 점프수트 = 민소매·V넥.
KINDS = ('미니원피스', '미디원피스', '롱원피스', '점프수트')
SLEEVES = ('끈', '민소매', '반팔', '긴팔')
NECKS = ('라운드', 'V넥', '스퀘어넥', '오프숄더', '셔츠 카라', '라운드 카라')
DEFAULT_SLEEVE = {'미니원피스': '반팔', '미디원피스': '반팔', '롱원피스': '긴팔', '점프수트': '민소매'}
DEFAULT_NECK = {'미니원피스': '라운드', '미디원피스': '라운드', '롱원피스': 'V넥', '점프수트': 'V넥'}
LONG_ARM = 12.6     # 롱 시안 그림의 겨드랑이 높이(시안 좌표)


def _half(g, y):
    h = g.intersection(LineString([(-10, y), (80, y)]))
    return None if h.is_empty else max(abs(h.bounds[0] - C), abs(h.bounds[2] - C))


def _is_waist(d, ye):
    sp = subpaths(d)[0]
    xs = [p[0] for p in sp]
    return abs(sp[0][1] - ye) < 1.0 and max(xs) - min(xs) > 8


def long_fit(v, fit):
    """롱 핏(시안 5에 없던 것, 다른 원피스와 같은 규칙): 슬림 = 겨드랑이 아래 몸판·치마를 조금씩 좁힘,
    오버사이즈 = 허리선 없이 겨드랑이 폭에서 곧게 내려오다 밑단만 조금 넓게(A라인). 소매·끈은 그대로."""
    if fit is None:
        return v
    v = copy.deepcopy(v)
    yc, ye = waist_of('롱원피스')
    ya = SB.fwd(PL['롱원피스'], None)(C, LONG_ARM)[1]
    body = to_poly(v['shapes'][0])
    hem = body.bounds[3]
    # 몸판과 한 덩어리인 짧은 소매(반팔·오프숄더 반팔)는 소매 아랫선 밑부터 바꾼다: 폭이 확 줄어드는 높이를 찾는다
    y = ya - 4.0
    while y < ya + 8.0:
        a, b = _half(body, y), _half(body, y + 0.3)
        if a and b and a - b > 0.8:
            ya = max(ya, y + 0.6)
        y += 0.3
    if fit == '슬림':
        def k(y):
            if y <= ya:
                return 1.0
            if y <= ye:
                u = (y - ya) / (ye - ya)
                return 1 - 0.05 * u * u * (3 - 2 * u)
            return 0.95 - 0.09 * min(1.0, (y - ye) / (hem - ye))
    else:
        ha = _half(body, ya + 0.6) or 8.0
        hh = (_half(body, hem - 2.0) or ha) * 1.08
        cache = {}

        def k(y):
            if y <= ya:
                return 1.0
            key = round(min(y, hem - 2.0), 1)      # 밑단 물결 자리는 그 바로 위 배율 그대로(모서리가 안 뒤틀리게)
            if key not in cache:
                cur = _half(body, key) or ha
                u = min(1.0, (key - ya) / (hem - 2.0 - ya))
                want = ha + (hh - ha) * u ** 1.6
                t = min(1.0, (key - ya) / 2.0)          # 겨드랑이 바로 아래는 부드럽게 이어서
                cache[key] = 1 + (max(1.0, want / cur) - 1) * t
            return cache[key]
        v['details'] = [d for d in v.get('details', []) if not _is_waist(d, ye)]
    f = lambda x, y: (C + (x - C) * k(y), y)
    main = to_poly(map_d(v['shapes'][0], f))
    if fit == '오버사이즈':
        # 넓힌 몸판이 반팔 소매 끝 안쪽을 밀고 나와 생기는 작은 홈을 메운다
        main = main.buffer(0.6, join_style=1).buffer(-0.6, join_style=1)
    v['shapes'] = [poly_to_d(main, tol=0.04)] + v['shapes'][1:]
    v['details'] = [map_d(d, f) for d in v.get('details', [])]
    v['shade'] = [map_d(d, f) for d in v.get('shade', [])]
    return v


def swap_neck(v, donor):
    """롱(지금 그림 살린 것)의 V넥을 다른 목 모양으로: 목 둘레(가운데 띠)만 원피스 합성 그림(donor)에서 가져온다.
    V넥 두 줄은 빼고, donor의 목 안쪽(inner)·목 띠(plain)·카라(tops)·목 선을 넣는다."""
    v = copy.deepcopy(v)
    parts = [to_poly(d) for k in ('inner', 'plain', 'tops') for d in donor.get(k, [])]
    yz = max([g.bounds[3] for g in parts] + [9.0]) + 1.2
    xs = [g.bounds[0] for g in parts] + [g.bounds[2] for g in parts]
    nz = max([abs(x - C) for x in xs] + [4.6]) + 0.9
    zone = box(C - nz, -10, C + nz, yz)
    body = to_poly(v['shapes'][0])
    dbody = to_poly(donor['shapes'][0])
    new = unary_union([body.difference(zone), dbody.intersection(zone)]).buffer(0.25, join_style=1).buffer(-0.25, join_style=1)
    if new.geom_type != 'Polygon':
        new = max(new.geoms, key=lambda q: q.area)
    v['shapes'] = [poly_to_d(new, tol=0.04)] + v['shapes'][1:]

    def is_v(d):
        sp = subpaths(d)[0]
        return all(abs(p[0] - C) < 4.8 for p in sp) and max(p[1] for p in sp) < 14.5 and min(p[1] for p in sp) < 8
    v['details'] = [d for d in v.get('details', []) if not is_v(d)]
    v['details'] += [q for d in donor.get('details', []) for q in lines_in(d, zone)]
    for k in ('inner', 'plain', 'tops'):
        v[k] = [d for d in donor.get(k, []) if zone.contains(to_poly(d).centroid)]
    inside = unary_union([to_poly(d) for d in v['shapes']]).buffer(-0.22)
    v['details'] = [q for d in v['details'] for q in lines_in(d, inside)]
    return {k: x for k, x in v.items() if x}


def long_icon(sleeve, neck, fit=None, tie=False):
    """롱원피스 그림(v12 좌표): 지금 그림 살린 롱 + 핏 + 목 모양. 오프숄더는 어깨가 없어 합성 그림(compose)으로."""
    if sleeve != '끈' and neck == '오프숄더':
        # 오프숄더는 어깨가 없어 합성 그림으로, 핏은 다른 롱과 같은 규칙(long_fit)으로
        v = long_fit(compose('롱원피스', sleeve, neck), fit)
    else:
        v = long_fit(long_fixed(sleeve), fit)
    if sleeve != '끈' and neck not in ('V넥', '오프숄더'):
        v = swap_neck(v, compose('롱원피스', sleeve, neck, fit))
    if tie:
        yc, ye = waist_of('롱원피스')
        add_tie(v, yc, ye, to_poly(v['shapes'][0]))
    return v


def dress_icon(kind, sleeve=None, neck=None, fit=None, tie=False):
    """앱 그림 하나(v12 좌표). sleeve·neck이 None이면 그 종류 지금 그림의 모양."""
    sleeve = sleeve or DEFAULT_SLEEVE[kind]
    neck = neck or DEFAULT_NECK[kind]
    if kind == '롱원피스':
        return long_icon(sleeve, neck, fit, tie)
    return compose(kind, sleeve, neck, fit, tie)


if __name__ == '__main__':
    import preview as PV
    out_html, out_png = sys.argv[1], sys.argv[2]
    col = '#E8B4C8'
    Z = 132
    sv = lambda ic: PV.svg(ic, None, col, size=Z)
    now = lambda iid, kind: PV.svg(ICONS[iid], PL[kind], col, size=Z)
    rows = []
    rows.append(('반팔 · 티셔츠 반팔로', [('미니', sv(compose('미니원피스', '반팔'))), ('미디', sv(compose('미디원피스', '반팔'))), ('롱', sv(long_fixed('반팔'))),
                                  ('점프수트', sv(compose('점프수트', '반팔'))), ('미디 슬림', sv(compose('미디원피스', '반팔', fit='슬림'))), ('미니 V넥', sv(compose('미니원피스', '반팔', 'V넥')))]))
    rows.append(('롱원피스 · 지금', [(n, now(i, '롱원피스')) for n, i in (('반팔', 'i172'), ('긴팔(기본)', 'i169'), ('민소매', 'i171'), ('끈', 'i170'))]))
    rows.append(('롱원피스 · 고침', [(n, sv(long_fixed(n))) for n in ('반팔', '긴팔', '민소매', '끈')]))
    for kind in ('미니원피스', '미디원피스', '점프수트'):
        rows.append((kind + ' · 바뀌면', [(sl, sv(compose(kind, sl))) for sl in ('끈', '민소매', '반팔', '긴팔')]))
    NECKS = ('라운드', 'V넥', '스퀘어넥', '오프숄더', '셔츠 카라', '라운드 카라')
    for sl in ('반팔', '긴팔', '민소매'):
        rows.append((f'목 모양 · 미디 {sl}', [(nk, sv(compose('미디원피스', sl, nk))) for nk in NECKS]))
    for kind, sl in (('미니원피스', '반팔'), ('미디원피스', '반팔'), ('미디원피스', '긴팔'), ('점프수트', '반팔')):
        rows.append((f'핏 · {kind.replace("원피스", "")} {sl}', [(f, sv(compose(kind, sl, fit=None if f == '레귤러' else f))) for f in ('슬림', '레귤러', '오버사이즈')]))
    rows.append(('허리 끈', [(k.replace('원피스', ''), sv(compose(k, '반팔', tie=True))) for k in ('미니원피스', '미디원피스', '점프수트')]
                 + [('롱 반팔', sv(long_fixed('반팔', tie=True))), ('롱 긴팔', sv(long_fixed('긴팔', tie=True))), ('미디 긴팔', sv(compose('미디원피스', '긴팔', tie=True)))]))
    rows.append(('치마 주름', [('미니 (윗부분만)', sv(compose('미니원피스', '반팔'))), ('미니 + 허리 끈 (주름 없음)', sv(compose('미니원피스', '반팔', tie=True))),
                           ('미디 (없음)', sv(compose('미디원피스', '반팔'))), ('롱 (없음)', sv(long_fixed('반팔'))), ('미니 오버 (없음)', sv(compose('미니원피스', '반팔', fit='오버사이즈')))]))
    PV.sheet('원피스·점프수트 · 시안 5 (11/23 오후)', rows, out_html,
             '반팔 = 반소매티 소매 모양, 소매 끝 선 없음, 몸판과 한 덩어리(이음새는 진동선만), 윗부분 폭 줄임 · 치마 주름은 미니 윗부분만 · 롱은 지금 그림 살림 · 아직 앱에는 안 넣음', size=Z)
    PV.shoot(out_html, out_png, width=1160)
