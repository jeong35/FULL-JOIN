"""도형 도우미: path 글자 ↔ shapely 도형. 곡선은 design/kind-icons/gen_icons_v3.py의 bez로 다시 그린다(같은 느낌)."""
import math
import os
import re
import sys

from shapely.geometry import MultiPolygon, Polygon
from shapely.ops import unary_union
from svgpathtools import parse_path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'kind-icons'))
import gen_icons_v3 as V  # noqa: E402

C = 32
NUM = re.compile(r'-?\d+(?:\.\d+)?')


def fmt(v):
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def subpaths(d, step=0.25):
    """path → 하위 경로마다 점 목록."""
    out = []
    for sp in parse_path(d).continuous_subpaths():
        pts = []
        for seg in sp:
            n = max(4, int(seg.length() / step))
            pts += [(seg.point(i / n).real, seg.point(i / n).imag) for i in range(n)]
        z = sp[-1].point(1)
        pts.append((z.real, z.imag))
        out.append(pts)
    return out


def to_poly(d):
    return unary_union([Polygon(p).buffer(0) for p in subpaths(d) if len(p) > 3])


def map_d(d, fn):
    """path의 모든 좌표 (x, y)에 fn을 씌운다(M·L·C·Z 절대 좌표만 쓰는 데이터)."""
    vals = [float(x) for x in NUM.findall(d)]
    flat = []
    for i in range(0, len(vals), 2):
        flat += fn(vals[i], vals[i + 1])
    it = iter(flat)
    return NUM.sub(lambda m: fmt(next(it)), d)


def corners(pts, closed=True, ang=50):
    n = len(pts)
    out = []
    for i, p in enumerate(pts):
        a = pts[i - 1] if (closed or i > 0) else None
        b = pts[(i + 1) % n] if (closed or i < n - 1) else None
        flag = False
        if a is not None and b is not None:
            v1, v2 = (p[0] - a[0], p[1] - a[1]), (b[0] - p[0], b[1] - p[1])
            l1, l2 = math.hypot(*v1), math.hypot(*v2)
            if l1 > 1e-6 and l2 > 1e-6:
                c = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)
                flag = math.degrees(math.acos(max(-1, min(1, c)))) > ang
        out.append((p[0], p[1], 'c') if flag else (p[0], p[1]))
    return out


def poly_to_d(geom, tol=0.12, ang=50):
    geoms = list(geom.geoms) if isinstance(geom, MultiPolygon) else [geom]
    ds = []
    for g in geoms:
        g = g.simplify(tol, preserve_topology=True)
        ds.append(V.bez(corners(list(g.exterior.coords)[:-1], True, ang), True))
    return ' '.join(ds)
