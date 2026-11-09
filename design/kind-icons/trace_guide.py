"""옷 종류 그림 v7 (11/9) — 은재님이 준 두 번째 참고 그림(참고_옷종류가이드2.png, 심플 미니멀 실루엣)을 따라 48종을 그린다.
"좀 더 귀엽게": 모서리를 둥글게 깎고(ROUND), 옆으로 살짝 통통하게(CHUBBY), 안쪽 선은 꼭 필요한 것만 한 줄로.

- 바깥 모양: 테두리로 둘러싸인 부분(그림 밖에서 채워 들어가 닿지 않는 곳). 좌우 대칭 옷은 오른쪽 반을 거울로 붙인다.
  가방 손잡이·신발 구멍처럼 뚫린 곳은 구멍으로 남긴다.
- 안쪽 선: 옷 안의 가는 어두운 선(블랙햇)을 뼈대(가운데 선)로 따서 일정한 굵기의 선으로 긋는다.
  테두리에 붙어 두 겹처럼 보이는 선, 나란히 붙은 두 번째 선, 짧은 선, 작은 고리(무늬 점 등)는 뺀다.
- 옷 안쪽(목 안·후드 안): 선으로 갈린 칸 중 몸판보다 확실히 어두운 위쪽 칸(inner).
- 색은 쓰지 않는다. 칠은 앱(KindIcon.tsx)이 태깅 색으로 한다.
- 핏: 바지 3종은 참고 그림의 핏별 바지 모양(스키니·와이드)에 종류별 선을 옮기고, 부츠컷은 일자에서 무릎 아래만 살짝 퍼지게 만든다.
  스커트 3종은 참고 그림의 A라인·H라인 스커트로 길이(미니·미디·롱)와 핏(플레어는 밑단을 넓힘)을 만든다.
- 샌들은 두 번째 참고 그림에 없어서 첫 번째 참고 그림(참고_옷종류가이드.png)에서 같은 방법으로 딴다.

필요: python3 -m pip install opencv-python-headless scikit-image numpy
사용: python3 trace_guide.py traced_v4.json   (그다음 gen_icons_v4.py → gen_ts.py)
"""
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from skimage.morphology import skeletonize

from gen_icons_v3 import C, bez, fmt, line, pair, sym

HERE = Path(__file__).parent
GUIDE = cv2.imread(str(HERE / "참고_옷종류가이드2.png"))
GUIDE1 = cv2.imread(str(HERE / "참고_옷종류가이드.png"))
S = 4          # 4배로 키워서 딴다
ROUND = 1.3    # 모서리를 이만큼(64칸) 둥글게
CHUBBY = 1.07  # 옆으로 이만큼 통통하게

# 참고 그림 안 옷 위치(x, y, 너비, 높이 · 참고_옷종류가이드2.png 896×1200 픽셀)
BOXES = {
    "반소매티셔츠": (44, 171, 65, 64), "긴소매티셔츠": (134, 171, 71, 64), "민소매": (334, 169, 44, 70), "셔츠": (414, 169, 69, 68),
    "블라우스": (507, 170, 71, 66), "니트": (603, 170, 65, 67), "맨투맨": (694, 170, 69, 67), "후드": (787, 166, 68, 71),
    "미니원피스": (594, 316, 54, 84), "미디원피스": (666, 315, 48, 89), "롱원피스": (734, 315, 52, 87), "점프수트": (811, 314, 37, 88),
    "카디건": (39, 481, 65, 68), "재킷": (115, 479, 66, 70), "레더재킷": (192, 478, 67, 72), "데님재킷": (267, 478, 67, 70),
    "점퍼": (338, 480, 67, 68), "후드집업": (412, 476, 64, 74), "야상": (483, 478, 63, 75),
    "플리스": (35, 594, 71, 69), "베스트": (121, 592, 53, 75), "트렌치코트": (193, 585, 61, 89), "코트": (269, 585, 60, 89),
    "숏패딩": (338, 593, 67, 70), "롱패딩": (416, 585, 59, 91), "경량패딩": (483, 595, 65, 73),
    "스니커즈": (561, 498, 51, 26), "로퍼": (615, 501, 50, 23), "플랫슈즈": (667, 500, 51, 24), "힐": (720, 493, 43, 31),
    "부츠": (769, 479, 39, 49), "슬리퍼": (812, 500, 49, 24),
    "숄더백": (560, 607, 47, 70), "크로스백": (611, 605, 47, 71), "토트백": (661, 612, 47, 64), "백팩": (711, 616, 46, 60),
    "에코백": (765, 609, 40, 65), "클러치": (812, 630, 47, 33),
}
# 종류: (대칭 모양, 대칭 선, 그림 칸 가로, 세로, 가운데 y). 단추·주머니·여밈이 한쪽에만 있는 옷은 선을 대칭으로 맞추지 않는다.
TOP = (True, True, 50, 50, 32)
OUTER = (True, True, 50, 52, 32.5)
LONG = (True, True, 48, 56, 32)
SHOE = (False, False, 54, 34, 40)
BAG = (True, True, 46, 50, 33)
CFG = {
    "반소매티셔츠": TOP, "긴소매티셔츠": TOP, "민소매": (True, True, 44, 48, 32), "셔츠": (True, False, 50, 50, 32),
    "블라우스": TOP, "니트": TOP, "맨투맨": TOP, "후드": (True, True, 50, 52, 32),
    "조거팬츠": (True, True, 40, 54, 33), "숏팬츠": (True, True, 46, 34, 28), "레깅스": (True, True, 38, 54, 33),
    "미니원피스": LONG, "미디원피스": LONG, "롱원피스": LONG, "점프수트": LONG,
    "카디건": OUTER, "재킷": (True, False, 50, 52, 32.5), "레더재킷": (True, False, 50, 52, 32.5), "데님재킷": OUTER,
    "점퍼": OUTER, "후드집업": OUTER, "야상": OUTER, "플리스": OUTER, "베스트": (True, True, 46, 52, 32.5),
    "트렌치코트": (True, True, 48, 56, 32), "코트": (True, False, 48, 56, 32), "숏패딩": OUTER, "롱패딩": LONG, "경량패딩": OUTER,
    "스니커즈": SHOE, "로퍼": SHOE, "플랫슈즈": SHOE, "힐": (False, False, 52, 36, 40), "부츠": (False, False, 44, 48, 34),
    "슬리퍼": SHOE,
    "숄더백": BAG, "크로스백": BAG, "토트백": BAG, "백팩": BAG, "에코백": BAG, "클러치": (True, True, 48, 34, 38),
}
SANDAL_BOX = (459, 800, 76, 39)  # 첫 번째 참고 그림
BAGS = {"숄더백", "크로스백", "토트백", "백팩", "에코백", "클러치"}
SHADE = f"M{fmt(42.2)},0 L64,0 L64,64 L{fmt(42.2)},64 Z"  # 오른쪽 옆구리 그림자(옷 모양 안으로 잘린다)


def load(box, img=None, pad=6):
    img = GUIDE if img is None else img
    x, y, w, h = box
    crop = img[max(0, y - pad):y + h + pad, max(0, x - pad):x + w + pad]
    return cv2.resize(crop, None, fx=S, fy=S, interpolation=cv2.INTER_CUBIC)


def largest(mask):
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    if n <= 1:
        return mask.astype(np.uint8)
    return (lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)


def fill_holes(mask):
    m = mask.astype(np.uint8).copy()
    h, w = m.shape
    inv = (1 - m).astype(np.uint8)
    cv2.floodFill(inv, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 2)
    return ((inv != 2) | (m == 1)).astype(np.uint8)


def analyze(up, keep_holes, ink_abs=135, wall_thr=32, line_thr=20):
    """반환: 회색 그림, 가는 선 마스크, 옷 마스크"""
    gray = cv2.cvtColor(up, cv2.COLOR_BGR2GRAY)
    bh = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17)))
    thin = (bh > line_thr).astype(np.uint8)
    wall = cv2.dilate(((gray < ink_abs) | (bh > wall_thr)).astype(np.uint8), np.ones((3, 3), np.uint8))
    n, lab = cv2.connectedComponents((1 - wall).astype(np.uint8), connectivity=4)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    item = largest(~np.isin(lab, list(edge)))
    item = cv2.morphologyEx(item, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return gray, thin, (item if keep_holes else fill_holes(item))


def symmetrize(mask, cx):
    out = np.zeros_like(mask)
    right = mask[:, cx:]
    rw = min(right.shape[1], cx + 1)
    out[:, cx:cx + rw] = right[:, :rw]
    out[:, cx - rw + 1:cx + 1] = np.maximum(out[:, cx - rw + 1:cx + 1], right[:, :rw][:, ::-1])
    return out


def center_x(item):
    xs = np.nonzero(item)[1]
    return int(round((xs.min() + xs.max()) / 2))


class Frame:
    """4배 픽셀 → 64칸 좌표. 옷을 (box_w × box_h) 칸에 맞춰 가운데 두고, 옆으로 CHUBBY배 한다."""

    def __init__(self, item, box_w, box_h, cy, cx_px=None):
        ys, xs = np.nonzero(item)
        self.s = min(box_w / CHUBBY / (xs.max() - xs.min() + 1), box_h / (ys.max() - ys.min() + 1))
        self.cx_px = cx_px if cx_px is not None else (xs.min() + xs.max()) / 2
        self.cy_px = (ys.min() + ys.max()) / 2
        self.cy = cy

    def pt(self, x, y):
        return (32 + (x - self.cx_px) * self.s * CHUBBY, self.cy + (y - self.cy_px) * self.s)


class FrameAt(Frame):
    """배율을 직접 정한 좌표계: (cx_px, top_px) 픽셀 → (32, top_y)."""

    def __init__(self, s, cx_px, top_px, top_y):
        self.s, self.cx_px, self.cy_px, self.cy = s, cx_px, top_px, top_y


def dedupe(pts, closed, gap=0.7):
    """gap(64칸)보다 가까이 붙은 점은 하나로(짧은 구간이 곡선을 삐죽하게 만든다)."""
    out = []
    for p in pts:
        if out and math.dist(out[-1], p) < gap:
            continue
        out.append(p)
    if closed and len(out) > 3 and math.dist(out[0], out[-1]) < gap:
        out.pop()
    if not closed and len(out) >= 2 and math.dist(out[-1], pts[-1]) > 1e-6:
        out[-1] = pts[-1]
    return out


def corner_flags(pts, closed, ang=58):
    """많이 꺾이는 점은 'c'(꺾이는 점)로 표시한다."""
    pts = dedupe(pts, closed)
    out, n = [], len(pts)
    for i, (x, y) in enumerate(pts):
        if not closed and (i == 0 or i == n - 1):
            out.append((x, y))
            continue
        a, b = pts[i - 1], pts[(i + 1) % n]
        v1, v2 = (a[0] - x, a[1] - y), (b[0] - x, b[1] - y)
        l1, l2 = math.hypot(*v1), math.hypot(*v2)
        if l1 < 1e-6 or l2 < 1e-6:
            continue
        turn = 180 - math.degrees(math.acos(max(-1, min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)))))
        out.append((x, y, "c") if turn > ang else (x, y))
    return out


def right_half_path(item, cx, fr, eps=0.45):
    """대칭 모양의 오른쪽 반 테두리(가운데 위 → 가운데 아래)를 거울로 붙인 닫힌 path."""
    half = item.copy()
    half[:, :cx] = 0
    cs, _ = cv2.findContours(half, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea)[:, 0, :]
    on_cut = c[:, 0] <= cx
    n = len(c)
    seq = list(range(n)) * 2
    runs, start = [], None
    for j, k in enumerate(seq):
        if not on_cut[k]:
            start = j if start is None else start
        elif start is not None:
            runs.append((start, j))
            start = None
    a, b = max(runs, key=lambda r: r[1] - r[0])
    arc = c[[seq[j] for j in range(a - 1, b + 1)]].astype(np.float32)
    arc[0, 0] = arc[-1, 0] = cx
    if arc[0, 1] > arc[-1, 1]:
        arc = arc[::-1]
    approx = cv2.approxPolyDP(arc.reshape(-1, 1, 2), eps / fr.s, False)[:, 0, :]
    pts = [fr.pt(x, y) for x, y in approx]
    pts[0], pts[-1] = (32.0, pts[0][1]), (32.0, pts[-1][1])
    return sym(corner_flags(pts, False, ang=55))


def closed_paths(mask, fr, eps=0.35, min_area=0.0):
    """마스크 → 칠할 수 있는 닫힌 path들(구멍 포함, evenodd로 칠한다)."""
    cs, hier = cv2.findContours(mask.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if hier is None:
        return []
    hier, out = hier[0], []
    for i, c in enumerate(cs):
        if hier[i][3] != -1 or cv2.contourArea(c) * fr.s * fr.s < min_area:
            continue
        d = ring(c, fr, eps)
        ch = hier[i][2]
        while ch != -1:
            if cv2.contourArea(cs[ch]) * fr.s * fr.s > 0.6:
                d += " " + ring(cs[ch], fr, eps)
            ch = hier[ch][0]
        out.append(d)
    return [d for d in out if d.strip()]


def ring(c, fr, eps):
    a = cv2.approxPolyDP(c, eps / fr.s, True)[:, 0, :]
    return bez(corner_flags([fr.pt(x, y) for x, y in a], True, ang=55), True) if len(a) >= 3 else ""


_NB = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def skeleton_paths(mask):
    """가는 선 마스크의 뼈대를 끝점·갈림점 사이 선들로 나눈다."""
    pts = set(zip(*np.nonzero(skeletonize(mask.astype(bool)))))

    def nbrs(p):
        return [(p[0] + dy, p[1] + dx) for dy, dx in _NB if (p[0] + dy, p[1] + dx) in pts]

    nodes = {p for p in pts if len(nbrs(p)) != 2}
    used, paths = set(), []

    def walk(a, b):
        path, prev, cur = [a, b], a, b
        used.add(frozenset((a, b)))
        while cur not in nodes:
            nxt = [q for q in nbrs(cur) if q != prev and frozenset((cur, q)) not in used]
            if not nxt:
                break
            used.add(frozenset((cur, nxt[0])))
            prev, cur = cur, nxt[0]
            path.append(cur)
        return path

    for start in list(nodes) + sorted(pts):
        for q in nbrs(start):
            if frozenset((start, q)) not in used:
                paths.append(walk(start, q))
    return [np.array([(x, y) for y, x in p], np.float32) for p in paths if len(p) > 1]


def line_paths(mask, fr, cx, mirror, item, eps=0.32, min_len=2.6, edge=1.7, merge=1.4, min_loop=1.8, tick=4.5, pre=()):
    """뼈대 선 → path. mirror면 오른쪽 반만 쓰고 거울로 붙인다.
    선은 한 줄로: 대부분이 테두리에서 edge(64칸) 안쪽에 붙은 선(테두리가 두 겹처럼 보인다), 이미 남긴 선에서 merge 안쪽으로
    나란히 붙은 선, min_len보다 짧은 선, min_loop보다 작은 고리(무늬 점·작은 단추)는 버린다."""
    runs = []
    for pth in skeleton_paths(mask):
        if float(np.sum(np.hypot(*np.diff(pth, axis=0).T))) * fr.s < min_len:
            continue
        if not mirror:
            runs.append(pth)
            continue
        cur = []
        for p in pth:
            if p[0] >= cx:
                cur.append(p)
            elif cur:
                runs.append(np.array(cur))
                cur = []
        if cur:
            runs.append(np.array(cur))
    dist = cv2.distanceTransform(item.astype(np.uint8), cv2.DIST_L2, 5)
    taken = np.zeros(mask.shape, np.uint8)
    width = 2 * int(round(merge / fr.s)) + 1
    for poly in pre:
        cv2.polylines(taken, [np.array(poly, np.int32).reshape(-1, 1, 2)], False, 1, width)
    res = []
    for run in sorted(runs, key=len, reverse=True):
        if len(run) < 2:
            continue
        xi = np.clip(run[:, 0].astype(int), 0, mask.shape[1] - 1)
        yi = np.clip(run[:, 1].astype(int), 0, mask.shape[0] - 1)
        if np.mean(dist[yi, xi] * fr.s < edge) > 0.6 or (len(run) > 2 and np.mean(taken[yi, xi] > 0) > 0.6):
            continue
        run_len = float(np.sum(np.hypot(*np.diff(run, axis=0).T))) * fr.s
        near_edge = min(dist[yi[0], xi[0]], dist[yi[-1], xi[-1]]) * fr.s < 1.2
        if near_edge and run_len < tick:  # 테두리에서 삐죽 나온 짧은 자국
            continue
        a = cv2.approxPolyDP(run.reshape(-1, 1, 2), eps / fr.s, False)[:, 0, :]
        pts = [fr.pt(x, y) for x, y in a]
        if sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)) < min_len * (0.6 if mirror else 1):
            continue
        closed = len(pts) > 3 and math.dist(pts[0], pts[-1]) < 0.6
        if closed:
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            if max(max(xs) - min(xs), max(ys) - min(ys)) < min_loop:
                continue
        cv2.polylines(taken, [run.astype(np.int32).reshape(-1, 1, 2)], False, 1, width)
        if mirror:
            cv2.polylines(taken, [np.stack([2 * cx - run[:, 0], run[:, 1]], 1).astype(np.int32).reshape(-1, 1, 2)], False, 1, width)
        variants = [pts]
        if mirror and max(abs(x - 32) for x, _ in pts) > 1.5:
            variants.append([(64 - x, y) for x, y in pts])
        for v in variants:
            res.append(bez(corner_flags(v[:-1], True, ang=70), True) if closed else line(corner_flags(v, False, ang=70)))
    return res


# 소매가 있는 옷: 팔과 몸판이 분명히 갈리도록 어깨 솔기 → 겨드랑이 → 소매 안쪽 선을 긋는다(11/9 은재님: 팔 구분이 분명하게)
SLEEVES = {k: "long" for k in ("긴소매티셔츠", "셔츠", "블라우스", "니트", "맨투맨", "후드", "카디건", "후드집업", "재킷", "레더재킷",
                                "데님재킷", "점퍼", "야상", "플리스", "트렌치코트", "코트", "숏패딩", "롱패딩", "경량패딩", "롱원피스")}
SLEEVES.update({k: "short" for k in ("반소매티셔츠", "미니원피스", "미디원피스")})



SEAM_MANUAL = {"야상": [(46.0, 15.4), (47.6, 52.6)]}
# 소매 구분선 모양(11/9 은재님: 일자 말고 여성스러운 라인에 맞게 안쪽으로 자연스럽게): 어깨 끝 → 소매 끝 직선을 기준으로
# (위치 비율, 안쪽으로 들어가는 칸).
# 11/9 은재님: 여성스러운 라인은 허리만 들어가는 것 — 가슴 쪽 굴곡은 하나도 없이, 어깨 끝에서 허리까지 곧게 내려와
# 허리에서만 들어갔다가 소매 끝으로 나간다. (허리 높이 비율, 허리에서 들어가는 칸)
WAIST_AT, WAIST_IN = 0.56, 1.3


def curved_seam(p0, p1, kind=None):
    """어깨 끝 p0 → 허리(곧게) → 소매 끝 p1 (64칸, 오른쪽 반). 허리 위는 직선이라 가슴처럼 불룩한 데가 없다."""
    y_w = p0[1] + (p1[1] - p0[1]) * WAIST_AT
    x_w = min(p0[0], p1[0]) - WAIST_IN
    a = [(p0[0] + (x_w - p0[0]) * k, p0[1] + (y_w - p0[1]) * k) for k in (0.0, 0.5, 0.85)]  # 허리 위: 한 직선 위의 점들
    b = [(x_w + (p1[0] - x_w) * k, y_w + (p1[1] - y_w) * k) for k in (0.15, 0.5, 1.0)]         # 허리 아래도 직선 — 허리에서만 꺾인다
    return a + [(x_w, y_w)] + b


def sleeve_lines(item, fr, cx, kind):
    """소매 구분선. 반환: (안 씀, 겹침 거르기용 픽셀 선들, 소매 구분선 path들).
    긴소매: 어깨 끝 → 겨드랑이 → 소매와 몸판이 갈라지는 곳까지 한 줄(11/9 은재님: 실루엣은 그대로 두고 선으로).
    어깨 끝은 칼라·후드 옆이 아니라 위 테두리가 6칸 넘게 계속 내려가기 시작하는 곳이라 선이 목에서 길게 내려오지 않는다.
    반소매: 어깨 → 겨드랑이까지만."""
    u = 1 / fr.s  # 1칸 = 몇 픽셀
    H, W = item.shape
    ys = np.nonzero(item.any(axis=1))[0]
    top, bot = ys.min(), ys.max()

    def runs(y):
        row = np.concatenate([[0], item[y, cx:], [0]]).astype(np.int8)
        ed = np.nonzero(np.diff(row))[0]
        return [(cx + a, cx + b - 1) for a, b in zip(ed[::2], ed[1::2])]

    if kind in SEAM_MANUAL:
        pts = curved_seam(*SEAM_MANUAL[kind])
        LAST["seam_units"] = pts
        return [], [], [line(pts), line([(64 - x, y) for x, y in pts])]
    tops = {x: int(np.nonzero(item[:, x])[0].min()) for x in range(cx, W) if item[:, x].any()}
    span = int(round(6 * u))
    # 어깨 끝: 위 테두리가 가파르게 꺾여 6칸 넘게 계속 내려가는 곳(칼라 옆처럼 잠깐 가파른 곳은 건너뛴다)
    x_s = next((x for x in sorted(tops) if x - cx > 5 * u and x + span in tops and (tops[x + span] - tops[x]) / span > 1.1), None)
    if x_s is None:
        return [], [], []
    y_s = tops[x_s]
    p0 = (x_s - 0.6 * u, y_s + 1.0 * u)
    gaps = []
    for y in range(int(y_s + 4 * u), bot + 1):
        r = runs(y)
        if len(r) >= 2 and r[0][0] <= cx + 1 and r[1][0] - r[0][1] > 1:
            gaps.append((y, (r[0][1] + r[1][0]) / 2))
    cut = []
    if SLEEVES[kind] == "long" and not gaps:
        # 소매 끝이 몸판에 붙어 틈이 없는 옷(코트·롱패딩): 소매가 끝나 바깥 테두리가 몸판 쪽으로 들어가는 곳을 찾는다
        edge = {y: runs(y)[-1][1] for y in range(int(y_s), bot + 1) if runs(y)}
        x_body = edge[int(bot - 2 * u)]
        below = [y for y, e in edge.items() if e > x_body + 2 * u]
        if below:
            y_c = max(below)
            x_b = edge.get(int(y_c + 2 * u), x_body)
            gaps = [(int(y_c + 2 * u), x_b + 0.3 * u)]
    if SLEEVES[kind] == "long" and gaps:
        # 틈이 여러 군데면(허리끈에 잘록한 곳 등) 맨 아래 틈 묶음의 꼭대기 = 소매와 몸판이 갈라지는 곳
        blocks, cur = [], [gaps[0]]
        for g in gaps[1:]:
            if g[0] - cur[-1][0] <= 2:
                cur.append(g)
            else:
                blocks.append(cur)
                cur = [g]
        blocks.append(cur)
        y_n, x_n = blocks[-1][0]
        y_a = y_s + 0.42 * (y_n - y_s)
        x_a = x_n - 0.4 * u
        arm = [p0, (x_a + 0.3 * (p0[0] - x_a), p0[1] + 0.6 * (y_a - p0[1])), (x_a, y_a),
               (x_a + 0.5 * (x_n - x_a), y_a + 0.5 * (y_n - y_a)), (x_n, y_n)]
    else:  # 반소매(또는 소매가 몸판에 붙어 틈이 없는 옷): 어깨에서 겨드랑이까지만
        y_m = int(top + 0.75 * (bot - top))
        x_b = runs(y_m)[0][1]
        y_u = next((y for y in range(y_m, int(y_s), -1) if runs(y)[-1][1] > x_b + 1.2 * u), int(y_s + 0.3 * (bot - y_s)))
        arm = [p0, (x_b + 0.35 * (p0[0] - x_b), p0[1] + 0.55 * (y_u - p0[1])), (x_b - 0.2 * u, y_u + 0.2 * u)]
    seams_px = [arm, [(2 * cx - x, y) for x, y in arm]]
    units = [fr.pt(x, y) for x, y in arm]
    if SLEEVES[kind] == "long":
        # 어깨 끝은 몸판 옆선 바로 위에 둔다(어깨가 목부터 쭉 흘러내리는 옷은 위 테두리만으로는 어깨 끝을 못 찾아서 목 옆에서 선이 시작됐다)
        y_hip = min(bot, int(arm[-1][1] + 3 * u))
        r = runs(y_hip)
        x_body = min(r[0][1] if r and r[0][0] <= cx + 1 else arm[-1][0], arm[-1][0] + 0.6 * u)
        x0 = int(round(x_body - 0.4 * u))
        y0 = tops.get(x0, arm[0][1]) + 0.9 * u
        units = curved_seam(fr.pt(x0, y0), units[-1], kind)
        seams_px = [[(x0, y0), arm[-1]], [(2 * cx - x0, y0), (2 * cx - arm[-1][0], arm[-1][1])]]
    LAST["seam_units"] = units
    paths = [line(units), line([(64 - x, y) for x, y in units])]
    return cut, seams_px, paths


def rounded(item, fr):
    """귀엽게: 모서리를 ROUND만큼 둥글게 깎는다(흐리게 한 뒤 다시 자른다)."""
    k = int(round(ROUND / fr.s * 2)) | 1
    return (cv2.GaussianBlur(item.astype(np.float32), (k, k), 0) > 0.5).astype(np.uint8)


def finish(gray, thin, item, symmetric, sym_lines, box_w, box_h, cy, cx=None, fr=None, holes=False, kind=None, **line_opts):
    """옷 마스크·선 마스크 → 그림 데이터(바깥 모양 · 안쪽 선 · 옷 안쪽). fr을 주면 그 좌표계를 그대로 쓴다(핏별 그림)."""
    cx = center_x(item) if cx is None else cx
    if symmetric:
        item = symmetrize(item, cx)
    fr = fr or Frame(item, box_w, box_h, cy, cx_px=cx if symmetric else None)
    item = rounded(item, fr)
    if symmetric:
        item = symmetrize(item, cx)
    LAST["seam_units"] = None
    cut, sl_px, sl_paths = sleeve_lines(item, fr, cx, kind) if symmetric and kind in SLEEVES else ([], [], [])
    ys = np.nonzero(item)[0]
    if holes:
        shapes = closed_paths(item, fr, eps=0.4)
    else:
        shapes = [right_half_path(item, cx, fr) if symmetric else closed_paths(fill_holes(item), fr, eps=0.4)[0]]
    inside = cv2.erode(item, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    ln = cv2.morphologyEx((thin & inside).astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    if sym_lines:
        ln = symmetrize(ln, cx)
    details = line_paths(ln, fr, cx, sym_lines, item, pre=sl_px, **line_opts)
    # 옷 안쪽: 선으로 갈린 칸 중 몸판보다 확실히 어두운 위쪽 칸
    cells = (inside & (1 - cv2.dilate(thin, np.ones((3, 3), np.uint8)))).astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(cells, connectivity=4)
    inner = []
    if n > 1 and not holes:
        body = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        body_g = float(np.median(gray[lab == body]))
        y0, y1 = ys.min(), ys.max()
        im = np.zeros_like(cells)
        for i in range(1, n):
            if i == body or st[i, cv2.CC_STAT_AREA] < 0.004 * item.sum():
                continue
            if float(np.median(gray[lab == i])) < body_g - 20 and cen[i][1] < y0 + (y1 - y0) * 0.42:
                im |= (lab == i).astype(np.uint8)
        if im.any():
            im = rounded(cv2.dilate(im, np.ones((5, 5), np.uint8)), fr)
            inner = closed_paths((symmetrize(im, cx) if symmetric else im) & item, fr, eps=0.35, min_area=0.6)
    LAST.update(item=item, fr=fr, cx=cx)
    out = {"shapes": shapes, "details": details, "shade": [SHADE], "inner": inner, "tops": [], "dots": [], "straps": []}
    if sl_paths:
        out["seams"] = sl_paths
    return out


LAST = {}


# 무늬가 있는 옷(물방울 원피스)은 무늬 선이 따라오지 않게 긴 선만 남긴다. 트렌치코트는 자잘한 선을 빼고 허리끈은 손으로 다시 긋는다.
LINE_OPTS = {"미디원피스": {"min_len": 7.0, "min_loop": 6.0}, "트렌치코트": {"min_len": 5.5, "tick": 8.0, "eps": 0.45}}
EXTRA_LINES = {
    "트렌치코트": [line([(22.0, 29.2), (42.0, 29.2)]), line([(22.0, 31.6), (42.0, 31.6)]),          # 허리끈
                bez([(30.7, 28.4, "c"), (33.3, 28.4, "c"), (33.3, 32.4, "c"), (30.7, 32.4, "c")]),   # 버클
                line([(31.3, 32.4), (30.8, 36.6), (30.3, 41.0)]), line([(32.8, 32.4), (33.6, 36.4), (34.4, 40.2)])],
}


def bag_holes(up, thin, item):
    """가방 손잡이 안쪽처럼 테두리에 둘러싸였지만 바탕색인 칸을 구멍으로 뺀다."""
    border = np.concatenate([up[0], up[-1], up[:, 0], up[:, -1]])
    bg = np.median(border, 0)
    cells = (item & (1 - cv2.dilate(thin, np.ones((3, 3), np.uint8)))).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(cells, connectivity=4)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] > 400 and np.abs(np.median(up[lab == i], 0) - bg).sum() < 32:
            item[cv2.dilate((lab == i).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0] = 0
    return largest(item)


# ── 헷갈리는 옷은 안쪽 선을 손으로 다시 긋는다(11/9 은재님: 선은 심플하되 옷이 분명하게 구분되게) ──
def waves(x0, y0, y1, amp, n):
    """세로로 내려가는 물결 선(니트 꽈배기)."""
    pts = []
    for i in range(n * 4 + 1):
        y = y0 + (y1 - y0) * i / (n * 4)
        pts.append((x0 + amp * math.sin(math.pi * i / 2), y))
    return line(pts)


def across(y, x0=3.0, x1=61.0, gap=0.0):
    """옷 전체를 가로지르는 선(옷 모양 안으로 잘린다). gap이 있으면 가운데 지퍼 자리를 비운다."""
    if gap:
        return [line([(x0, y), (C - gap, y)]), line([(C + gap, y), (x1, y)])]
    return [line([(x0, y), (x1, y)])]


MANUAL = {
    # 긴소매 티셔츠: 목둘레 한 줄 + 어깨에서 내려오는 옆선만(밑단·소매 시보리 없음)
    "긴소매티셔츠": lambda: ([line([(27.0, 11.0), (29.4, 13.2), (C, 13.8), (34.6, 13.2), (37.0, 11.0)])] +
                       [], []),
    # 맨투맨: 목 시보리 + 가운데 V 스티치 + 밑단·소매 시보리
    "맨투맨": lambda: ([line([(26.8, 10.6), (29.4, 13.4), (C, 14.0), (34.6, 13.4), (37.2, 10.6)]),
                     line([(30.4, 14.0), (C, 16.8), (33.6, 14.0)]), line([(19.0, 48.6), (45.0, 48.6)])] +
                    [] + pair([(58.6, 48.2), (51.2, 48.8)]), []),
    # 니트: 목 시보리 + 가운데 꽈배기 + 양옆 골 + 밑단·소매 시보리
    "니트": lambda: ([line([(26.6, 9.6), (29.4, 12.6), (C, 13.2), (34.6, 12.6), (37.4, 9.6)]),
                    waves(30.4, 15.6, 45.6, 1.3, 5), waves(33.6, 15.6, 45.6, -1.3, 5),
                    line([(19.0, 47.6), (45.0, 47.6)])] +
                   pair([(38.4, 15.4), (38.4, 45.6)]) + [] +
                   pair([(59.0, 50.0), (52.0, 50.6)]), []),
    # 점퍼(블루종): 세운 칼라 + 가운데 지퍼 + 비스듬한 주머니 + 밑단·소매 시보리(누빔 없음)
    "점퍼": lambda: ([line([(27.4, 11.6), (29.6, 12.6), (C, 12.9), (34.4, 12.6), (36.6, 11.6)]), line([(C, 12.9), (C, 50.6)]),
                    line([(19.6, 47.4), (44.4, 47.4)])] +
                   pair([(37.4, 35.6), (40.2, 42.0)]) + [] +
                   pair([(59.2, 53.0), (52.6, 53.8)]), [(C, 14.6, 0.75)]),
    # 숏패딩: 높은 칼라 + 가운데 지퍼 + 넓은 가로 누빔 4줄
    "숏패딩": lambda: ([line([(25.8, 12.4), (29.0, 13.4), (C, 13.6), (35.0, 13.4), (38.2, 12.4)]), line([(C, 13.6), (C, 56.8)])] +
                    quilt((22.0, 31.0, 40.0, 49.0), (25.6, 34.6, 43.6, 52.6)), [(C, 15.4, 0.8)]),
    # 경량패딩: 가운데 지퍼 + 좁은 가로 누빔 8줄
    "경량패딩": lambda: ([line([(24.8, 11.8), (28.6, 12.8), (C, 13.0), (35.4, 12.8), (39.2, 11.8)]), line([(C, 13.0), (C, 56.6)])] +
                     quilt([16.6 + 4.9 * i for i in range(8)], [19.2 + 4.9 * i for i in range(8)]), [(C, 14.8, 0.7)]),
    # 플리스: 세운 칼라 + 가운데 지퍼 + 한쪽 가슴 지퍼 주머니 + 뽀글 결(점은 trace에서 찍는다)
    "플리스": lambda: ([line([(25.8, 13.4), (29.0, 14.4), (C, 14.6), (35.0, 14.4), (38.2, 13.4)]), line([(C, 14.6), (C, 55.4)]),
                     line([(19.8, 49.6), (44.2, 49.6)])] + pair([(57.0, 50.0), (50.6, 50.8)]) + [
                    line([(37.0, 21.6), (37.0, 29.4)])] + [], [(C, 16.2, 0.7)]),
    # 재킷(블레이저): 노치 라펠 + 한 줄 여밈 + 단추 2개 + 덮개 주머니 + 한쪽 가슴 주머니
    "재킷": lambda: (pair([(36.0, 8.8), (38.6, 14.0), (36.8, 15.4), (32.6, 30.4)]) + pair([(34.0, 9.4), (33.4, 12.8)]) +
                   [line([(32.6, 30.4), (32.6, 54.6)]), line([(36.4, 25.2), (41.2, 24.6)])] +
                   [bez([(36.0, 43.4, "c"), (42.6, 43.4, "c"), (42.6, 45.6, "c"), (36.0, 45.6, "c")]),
                    bez([(21.4, 43.4, "c"), (28.0, 43.4, "c"), (28.0, 45.6, "c"), (21.4, 45.6, "c")])] +
                   [],
                   [(32.6, 35.0, 0.85), (32.6, 40.6, 0.85)]),
    # 레더재킷(라이더): 넓은 라펠 + 비스듬한 지퍼 + 밑단 벨트와 버클 + 한쪽 가슴 지퍼 주머니
    "레더재킷": lambda: (pair([(36.6, 8.4), (40.8, 14.0), (38.4, 16.6), (34.4, 23.6)]) +
                     [line([(38.6, 15.6), (33.0, 27.0), (35.4, 51.4)]), line([(19.4, 47.0), (44.8, 47.0)]),
                      bez([(39.6, 45.8, "c"), (42.4, 45.8, "c"), (42.4, 48.2, "c"), (39.6, 48.2, "c")]),
                      line([(23.0, 22.0), (27.4, 30.4)])] +
                     [], []),
    # 셔츠: 뾰족한 칼라 + 가운데 여밈과 단추 + 한쪽 가슴 주머니 + 소매 커프스
    "셔츠": lambda: (pair([(36.6, 9.6), (35.2, 15.8), (C, 13.2)]) + [line([(C, 13.2), (C, 55.0)]),
                   bez([(35.6, 22.2, "c"), (41.2, 22.2, "c"), (41.2, 28.0, "c"), (38.4, 29.0, "c"), (35.6, 28.0, "c")])] +
                   [] + pair([(59.4, 49.4), (53.6, 50.8)]),
                   [(33.6, y, 0.6) for y in (20.0, 27.0, 34.0, 41.0, 48.0)]),
    # 블라우스: 둥글고 부드러운 칼라 + 가운데 여밈 + 소매 끝 커프스(뾰족한 셔츠 칼라·주머니 없음)
    "블라우스": lambda: (pair([(36.6, 10.6), (37.8, 14.4), (35.0, 16.2), (C, 17.6)]) + [line([(C, 17.6), (C, 54.8)])] +
                     [] + pair([(59.8, 50.2), (54.2, 51.8)]),
                     [(C, y, 0.55) for y in (24.0, 31.0, 38.0, 45.0)]),
    # 데님재킷: 칼라 + 가운데 단추 여밈 + 뾰족한 덮개 가슴 주머니 + 아래로 내려가는 솔기 + 허리 밴드 + 커프스
    "데님재킷": lambda: (pair([(37.6, 9.4), (39.6, 15.8), (35.4, 16.8), (C, 13.8)]) + [line([(C, 13.8), (C, 55.0)])] +
                     [bez(p, True) for p in ([(36.4, 24.2, "c"), (44.2, 24.2, "c"), (44.2, 26.8), (40.3, 28.6, "c"), (36.4, 26.8)],
                                              [(27.6, 24.2, "c"), (19.8, 24.2, "c"), (19.8, 26.8), (23.7, 28.6, "c"), (27.6, 26.8)])] +
                     pair([(36.6, 27.4), (36.6, 32.2), (44.0, 32.2), (44.0, 27.4)]) + pair([(40.3, 32.2), (40.3, 50.0)]) +
                     [line([(18.6, 50.0), (45.4, 50.0)])] + pair([(60.2, 54.0), (54.0, 55.0)]),
                     [(C, y, 0.75) for y in (20.0, 28.0, 36.0, 44.0)] + [(40.3, 27.0, 0.6), (23.7, 27.0, 0.6)]),
    # 야상: 후드 + 가운데 여밈 + 덮개 주머니 4개 + 허리 끈
    "야상": lambda: ([line([(25.6, 13.2), (29.0, 15.6), (C, 16.2), (35.0, 15.6), (38.4, 13.2)]), line([(C, 16.2), (C, 57.8)]),
                    line([(19.0, 36.6), (45.0, 36.6)])] +
                   [bez(p, True) for p in ([(35.6, 21.2, "c"), (42.6, 21.2, "c"), (42.6, 24.4, "c"), (35.6, 24.4, "c")],
                                            [(28.4, 21.2, "c"), (21.4, 21.2, "c"), (21.4, 24.4, "c"), (28.4, 24.4, "c")],
                                            [(35.2, 41.0, "c"), (43.6, 41.0, "c"), (43.6, 44.4, "c"), (35.2, 44.4, "c")],
                                            [(28.8, 41.0, "c"), (20.4, 41.0, "c"), (20.4, 44.4, "c"), (28.8, 44.4, "c")])] +
                   pair([(35.8, 24.4), (35.8, 30.4), (42.4, 30.4), (42.4, 24.4)]) +
                   pair([(35.4, 44.4), (35.4, 52.6), (43.4, 52.6), (43.4, 44.4)]),
                   [(39.1, 22.8, 0.55), (24.9, 22.8, 0.55), (39.4, 42.7, 0.55), (24.6, 42.7, 0.55), (C, 36.6, 0.75)]),
    # 롱패딩: 후드 + 가운데 지퍼 + 넓은 가로 누빔 5줄
    "롱패딩": lambda: ([line([(25.0, 15.4), (28.6, 13.6), (C, 13.2), (35.4, 13.6), (39.0, 15.4)]), line([(C, 13.2), (C, 59.0)])] +
                    quilt((21.4, 29.4, 37.4, 45.4, 53.0), (25.4, 33.4, 41.4)), [(C, 15.0, 0.75)]),
    # 카디건: 브이넥 시보리 + 가운데 단추 여밈 + 밑단·소매 시보리
    "카디건": lambda: (pair([(37.4, 10.4), (32.8, 27.4)]) + [line([(C, 27.6), (C, 54.8)]), line([(19.4, 51.4), (44.6, 51.4)])] +
                    [] + pair([(57.8, 51.6), (51.2, 52.6)]),
                    [(C, y, 0.7) for y in (31.0, 37.0, 43.0, 49.0)]),
    # 트렌치코트: 넓은 칼라·라펠 + 더블 단추 + 허리 벨트와 버클 + 비스듬한 주머니 + 소매 스트랩(가슴께 굴곡 선은 뺀다)
    "트렌치코트": lambda: (pair([(36.2, 6.0), (39.4, 12.4), (36.8, 14.0), (34.8, 24.6)]) + pair([(34.4, 6.4), (33.6, 10.4), (33.0, 13.6)]) +
                       [line([(34.8, 24.6), (34.8, 58.6)]),
                        line([(19.6, 29.2), (44.4, 29.2)]), line([(19.6, 31.6), (44.4, 31.6)]),
                        bez([(30.7, 28.4, "c"), (33.3, 28.4, "c"), (33.3, 32.4, "c"), (30.7, 32.4, "c")]),
                        line([(31.3, 32.4), (30.8, 36.6), (30.3, 41.0)]), line([(32.8, 32.4), (33.6, 36.4), (34.4, 40.2)])] +
                       pair([(37.6, 38.6), (42.2, 40.8)]) + pair([(52.4, 39.4), (46.8, 40.2)]),
                       [(37.4, 20.2, 0.75), (26.6, 20.2, 0.75), (37.4, 25.4, 0.75), (26.6, 25.4, 0.75)]),
    # 코트: 노치 라펠 + 앞여밈 + 주머니(참고 그림의 긴 세로 선들은 뺀다 — 11/9 은재님: 세로 선이 너무 길다)
    "코트": lambda: (pair([(36.4, 8.6), (39.2, 14.8), (37.0, 16.2), (33.4, 30.0)]) + pair([(34.6, 9.0), (33.8, 13.2), (33.2, 16.6)]) +
                   [line([(33.4, 30.0), (33.6, 60.2)])] + pair([(36.4, 45.0), (41.4, 44.2)]), []),
    # 토트백: 위 테두리 띠 한 줄(반듯한 가방)
    "토트백": lambda: ([line([(15.0, 33.4), (49.0, 33.4)])], [(21.6, 33.4, 0.7), (42.4, 33.4, 0.7)]),
    # 에코백: 손잡이 끈이 가방 몸판까지 내려와 박음질된 천 가방 + 아래 선
    "에코백": lambda: (pair([(26.6, 31.6), (26.6, 44.0)]) + [line([(22.2, 50.8), (41.8, 50.8)])], []),
}


# 코트: 참고 그림 선(라펠·여밈)은 그대로 두고 단추만 더한다(롱패딩·트렌치와 구분)
EXTRA_DOTS = {"코트": [(34.6, 33.0, 0.8), (34.6, 40.0, 0.8), (34.6, 47.0, 0.8)]}


def seam_x(y):
    """소매 구분선(오른쪽)의 y 높이에서 x(64칸). 선 아래쪽은 끝점 x."""
    pts = sorted(LAST["seam_units"], key=lambda p: p[1])
    if y <= pts[0][1]:
        return pts[0][0]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if y0 <= y <= y1:
            return x0 + (x1 - x0) * (y - y0) / max(1e-6, y1 - y0)
    return pts[-1][0]


def quilt(body_ys, sleeve_ys):
    """패딩 누빔: 몸판은 양쪽 소매 선 사이, 소매는 반 칸 어긋나게(팔이 따로 보이게). 가운데 지퍼 자리는 비운다."""
    out = []
    for y in body_ys:
        x = seam_x(y) - 0.3
        out += [line([(64 - x, y), (C - 0.9, y)]), line([(C + 0.9, y), (x, y)])]
    for y in sleeve_ys:
        x = seam_x(y) + 0.3
        out += [line([(x, y), (61.5, y)]), line([(64 - x, y), (2.5, y)])]
    return out


def fleece_dots(n_rows=9):
    """플리스 뽀글 결: 옷 안쪽(테두리·선에서 떨어진 곳)에 작은 점을 엇갈려 찍는다."""
    item, fr, cx = LAST["item"], LAST["fr"], LAST["cx"]
    inside = cv2.erode(item, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(3.2 / fr.s) | 1,) * 2))
    dots = []
    for j, y in enumerate(np.arange(19.0, 54.0, 3.6)):
        for x in np.arange(34.6 + (1.6 if j % 2 else 0), 61, 3.8):
            if abs(x - 37.0) < 1.4 and 20 < y < 30.5:  # 가슴 주머니 자리
                continue
            px = int(round(fr.cx_px + (x - 32) / (fr.s * CHUBBY)))
            py = int(round(fr.cy_px + (y - fr.cy) / fr.s))
            if 0 <= py < item.shape[0] and 0 <= px < item.shape[1] and inside[py, px]:
                dots += [[round(x, 1), round(y, 1), 0.42], [round(64 - x, 1), round(y, 1), 0.42]]
    return dots


# 구분이 잘 되도록 실루엣을 첫 번째 참고 그림에서 가져오는 종류(점퍼는 패딩과, 재킷은 레더재킷과 헷갈려서)
SHAPE_SRC = {"점퍼": (586, 688, 87, 95), "재킷": (677, 566, 87, 92)}


# 원피스 길이 구분(11/9 은재님: 롱·미디 라인 구분): 허리 아래 치마만 늘리거나 줄이고, 허리 폭을 같게 맞춰 그린다
DRESS_SKIRT = {"미니원피스": 0.78, "미디원피스": 1.0, "롱원피스": 1.2}
DRESS_BODICE = 15.5  # 목 ~ 허리 높이(64칸) — 세 원피스 윗몸 크기를 같게 맞춘다
DRESS_WAIST_AT = {"롱원피스": 0.3}  # 긴소매가 허리까지 붙어 있어 가장 잘록한 줄을 못 찾는 옷은 비율로


def dress_arrays(gray, thin, item, k, waist_at=None):
    cx = center_x(item)
    ys = np.nonzero(item.any(axis=1))[0]
    top, bot = ys.min(), ys.max()

    def width(y):
        r = right_run(item[y], cx)
        return (r[1] - cx) if r and r[0] <= cx + 1 else 10 ** 6
    lo, hi = int(top + 0.15 * (bot - top)), int(top + 0.5 * (bot - top))
    waist = int(top + waist_at * (bot - top)) if waist_at else min(range(lo, hi), key=width)
    new_h = int(round((bot - waist) * k))
    out = []
    for a, fill in ((gray, 255), (thin, 0), (item, 0)):
        seg = cv2.resize(a[waist:bot + 1], (a.shape[1], new_h + 1), interpolation=cv2.INTER_LINEAR if fill else cv2.INTER_NEAREST)
        b = np.full((waist + new_h + 1 + 8, a.shape[1]), fill, a.dtype)
        b[:waist] = a[:waist]
        b[waist:waist + new_h + 1] = seg
        out.append(b)
    return out, cx, top, waist, waist + new_h, width(waist)


def trace(kind, box=None, img=None):
    if kind in DRESS_SKIRT:
        symmetric, sym_lines, box_w, box_h, cy = CFG[kind]
        gray, thin, item = analyze(load(BOXES[kind]), keep_holes=False)
        (gray, thin, item), cx, top, waist, bot, hw = dress_arrays(gray, thin, item, DRESS_SKIRT[kind], DRESS_WAIST_AT.get(kind))
        s_ = min(DRESS_BODICE / (waist - top), 59 / (bot - top))
        top_y = 32.5 - (bot - top) * s_ / 2
        fr = FrameAt(s_, cx, top, top_y)
        v = finish(gray, thin, item, True, sym_lines, 0, 0, 0, cx, fr=fr, kind=kind, **LINE_OPTS.get(kind, {}))
        wy = fr.pt(cx, waist)[1]
        neck_y = fr.pt(cx, top)[1]
        def ys_of(d):
            nums = [float(t) for t in __import__("re").findall(r"-?\d+(?:\.\d+)?", d)]
            return nums[1::2]
        # 목선에 닿는 선(V넥)과 허리 아래 긴 치마 선만 남긴다(윗몸의 가슴 다트·엠파이어 선, 치마의 짧은 점선은 뺀다)
        v["details"] = [d for d in v["details"]
                        if min(ys_of(d)) < neck_y + 4.0 or (min(ys_of(d)) >= wy - 0.5 and max(ys_of(d)) - min(ys_of(d)) >= 6.0)]
        wx = seam_x(wy) if SLEEVES.get(kind) == "long" and LAST.get("seam_units") else fr.pt(cx + hw, waist)[0]
        v["details"].append(line([(64 - wx + 0.4, wy), (C, wy + 0.6), (wx - 0.4, wy)]))  # 허리선
        return v
    if box is None and kind in SHAPE_SRC:
        box, img = SHAPE_SRC[kind], GUIDE1
    symmetric, sym_lines, box_w, box_h, cy = CFG[kind]
    holes = kind in BAGS or not symmetric
    up = load(box or BOXES[kind], img)
    gray, thin, item = analyze(up, keep_holes=holes)
    if kind in BAGS:
        item = bag_holes(up, thin, item)
        item = largest(cv2.morphologyEx(item, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))))
    opts = dict({"edge": 2.3, "min_len": 3.0, "tick": 5.0, "eps": 0.45} if not symmetric else {}, **LINE_OPTS.get(kind, {}))
    v = finish(gray, thin, item, symmetric, sym_lines, box_w, box_h, cy, holes=holes, kind=kind, **opts)
    v["details"] += EXTRA_LINES.get(kind, [])
    if kind in MANUAL:
        v["details"], dots = MANUAL[kind]()
        v["dots"] = [list(d) for d in dots]
    v["dots"] += [list(d) for d in EXTRA_DOTS.get(kind, [])]
    return v


# ── 핏에 따라 바뀌는 모양 ──
def right_run(row, cx):
    """오른쪽 반에서 옷이 있는 구간(가장 왼쪽 ~ 가장 오른쪽)."""
    xs = np.nonzero(row[cx:])[0]
    return (cx + xs.min(), cx + xs.max()) if len(xs) else None


def map_rows(src_arrs, src_item, dst_item, cx):
    """줄마다 src 옷 구간을 dst 옷 구간으로 늘리거나 줄여서 옮긴다(선·회색)."""
    out = [np.zeros_like(a) if a.max() <= 1 else np.full_like(a, 255) for a in src_arrs]
    w = src_item.shape[1]
    for y in range(min(src_item.shape[0], dst_item.shape[0])):
        rs, rd = right_run(src_item[y], cx), right_run(dst_item[y], cx)
        if not rs or not rd:
            continue
        (a, b), (c, d) = rs, rd
        xs = np.arange(c, d + 1)
        sx = a + (xs - c) * ((b - a) / max(1, d - c))
        for o, s in zip(out, src_arrs):
            vals = np.interp(sx, np.arange(w), s[y].astype(np.float32))
            o[y, xs] = (vals > 0.5).astype(o.dtype) if s.max() <= 1 else vals.astype(o.dtype)
    return [symmetrize(o, cx) for o in out]


PAD = 160


def padded(box, img=None):
    gray, thin, item = analyze(load(box, img), keep_holes=False)
    cx = center_x(item)
    item, thin = symmetrize(item, cx), symmetrize(thin & item, cx)
    gray, thin, item = (np.pad(a, ((0, 0), (PAD, PAD)), constant_values=v) for a, v in ((gray, 255), (thin, 0), (item, 0)))
    cx += PAD
    ys = np.nonzero(item)[0]
    top, hem = ys.min(), ys.max()
    waist = right_run(item[top + 10], cx)[1] - cx
    return gray, thin, item, cx, top, hem, waist


def warp_to(base, target):
    """target 모양을 base 크기(허리 폭·길이)에 맞춰 base 칸으로 옮긴다."""
    gray, thin, item, cx, top, hem, waist = base
    tg, tt, ti, tcx, ttop, them, twaist = target
    h, w = item.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    map_y = (ttop + (yy - top) * ((them - ttop) / (hem - top))).astype(np.float32)
    map_x = (tcx + (xx - cx) * (twaist / waist)).astype(np.float32)
    new = (cv2.remap(ti.astype(np.float32), map_x, map_y, cv2.INTER_LINEAR, borderValue=0) > 0.5).astype(np.uint8)
    return symmetrize(largest(new), cx)


def flare_legs(base, knee=0.5, hem_scale=1.3):
    """일자 바지에서 무릎까지는 그대로(살짝 좁게), 무릎 아래만 부드럽게 퍼지는 부츠컷 모양."""
    gray, thin, item, cx, top, hem, waist = base
    out = np.zeros_like(item)
    out[:, :] = item
    crotch = next(y for y in range(top + 20, hem) if item[y, cx] == 0)
    for y in range(crotch, hem + 1):
        r = right_run(item[y], cx)
        if not r:
            continue
        t = (y - crotch) / (hem - crotch)
        # 무릎까지 살짝 좁아졌다가(기울기 0으로 이어지게) 무릎 아래에서 부드럽게 퍼진다
        f = 0.94 + 0.06 * (1 - t / knee) ** 2 if t < knee else 0.94 + (hem_scale - 0.94) * ((t - knee) / (1 - knee)) ** 2
        xl, xr = r
        dw = (f - 1) * (xr - xl)
        a = 0.35 if dw > 0 else 0.5  # 넓어질 때는 바깥쪽으로 더
        nxl, nxr = max(cx + 3, int(round(xl - a * dw))), int(round(xr + (1 - a) * dw))
        out[y, cx:] = 0
        out[y, nxl:nxr + 1] = 1
    return symmetrize(out, cx)


PANTS_FIT_SRC = {"스키니": (128, 751, 46, 94), "와이드": (203, 751, 60, 96)}


def pants_icon(kind):
    """바지 3종: 일자는 종류별 참고 그림, 스키니·와이드는 참고 그림의 핏별 바지 모양, 부츠컷은 일자에서 무릎 아래만 살짝 퍼지게."""
    symmetric, sym_lines, box_w, box_h, cy = (True, True, 40, 54, 33)
    base = padded(BOXES[kind])
    gray, thin, item, cx = base[:4]
    fr = Frame(item, box_w, box_h, cy, cx_px=cx)
    shapes = {"일자": item}
    for fit, box in PANTS_FIT_SRC.items():
        shapes[fit] = warp_to(base, padded(box))
    shapes["부츠컷"] = flare_legs(base)
    variants = {}
    for fit in ("일자", "스키니", "와이드", "부츠컷"):
        g, t = map_rows([gray, thin], item, shapes[fit], cx)
        v = finish(g, t & shapes[fit], shapes[fit], True, True, 0, 0, 0, cx, fr=fr)
        variants[fit] = {"shapes": v["shapes"], "details": v["details"]}
    out = dict(variants["일자"], shade=[SHADE], inner=[], tops=[], dots=[], straps=[])
    out["variants"] = variants
    return out


SKIRT_A_MINI, SKIRT_A, SKIRT_H = (497, 327, 60, 60), (634, 751, 58, 96), (717, 751, 50, 96)
SKIRT_WAIST = 22.0


def skirt_masks(box):
    gray, thin, item = analyze(load(box), keep_holes=False)
    cx = center_x(item)
    item, thin = symmetrize(item, cx), symmetrize(thin & item, cx)
    gray, thin, item = (np.pad(a, ((0, 400), (PAD, PAD)), constant_values=v) for a, v in ((gray, 255), (thin, 0), (item, 0)))
    cx += PAD
    ys = np.nonzero(item)[0]
    top, hem = ys.min(), ys.max()
    return [gray, thin, item, cx, top, hem, (right_run(item[top + 8], cx)[1] - cx) * 2]


def stretch(m, k):
    """허리 아래를 세로로 k배(롱스커트)."""
    gray, thin, item, cx, top, hem, w = m
    band = top + int((hem - top) * 0.12)
    out = []
    for a in (gray, thin, item):
        b = a.copy()
        h = a.shape[0]
        seg = cv2.resize(a[band:hem + 1], (a.shape[1], int((hem - band) * k) + 1), interpolation=cv2.INTER_LINEAR if a.max() > 1 else cv2.INTER_NEAREST)
        b[band:] = 255 if a.max() > 1 else 0
        b[band:band + seg.shape[0]] = seg[: h - band]
        out.append(b)
    return out + [cx, top, band + int((hem - band) * k), w]


def reshape_skirt(m, fn):
    """허리 아래 줄마다 폭을 fn(t, 원래 반폭, 허리 반폭)으로 바꾼다."""
    gray, thin, item, cx, top, hem, w = m
    band = top + int((hem - top) * 0.12)
    hw0 = right_run(item[band], cx)[1] - cx
    new = item.copy()
    for y in range(band, hem + 1):
        r = right_run(item[y], cx)
        if not r:
            continue
        t = (y - band) / (hem - band)
        new[y, cx:] = 0
        new[y, cx:cx + int(round(fn(t, r[1] - cx, hw0))) + 1] = 1
    new = symmetrize(new, cx)
    g, t2 = map_rows([gray, thin], item, new, cx)
    return [g, t2 & new, new, cx, top, hem, w]


SKIRT_FIT = {
    "A라인": lambda t, hw, hw0: hw,
    "H라인": lambda t, hw, hw0: min(hw, hw0 * (1 + 0.1 * t)),
    "플레어": lambda t, hw, hw0: hw * (1 + 0.3 * t ** 1.4),
}


def skirt_icon(kind):
    if kind == "미니스커트":
        a = skirt_masks(SKIRT_A_MINI)
    elif kind == "미디스커트":
        a = skirt_masks(SKIRT_A)
    else:
        a = stretch(skirt_masks(SKIRT_A), 1.3)
    masks = {fit: reshape_skirt(a, fn) for fit, fn in SKIRT_FIT.items()}
    if kind != "미니스커트":  # 미디·롱 H라인은 참고 그림의 H라인 스커트
        h = skirt_masks(SKIRT_H)
        masks["H라인"] = h if kind == "미디스커트" else stretch(h, 1.3)
    waist = SKIRT_WAIST
    for g, t, i, cx, top, hem, w in masks.values():
        xs = np.nonzero(i)[1]
        waist = min(waist, 56 / ((hem - top) / w), 54 / ((xs.max() - xs.min()) / w))
    am = masks["A라인"]
    top_y = max(4.0, 32.5 - (am[5] - am[4]) / am[6] * waist / 2)
    variants = {}
    for fit in ("A라인", "H라인", "플레어"):
        g, t, i, cx, top, hem, w = masks[fit]
        v = finish(g, t, i, True, True, 0, 0, 0, cx, fr=FrameAt(waist / w, cx, top, top_y))
        variants[fit] = {"shapes": v["shapes"], "details": v["details"]}
    out = dict(variants["A라인"], shade=[SHADE], inner=[], tops=[], dots=[], straps=[])
    out["variants"] = variants
    return out


def rounded_rect(x0, y0, x1, y1, rt, rb):
    """위 모서리 반지름 rt, 아래 모서리 반지름 rb인 둥근 네모 path."""
    k = 0.5523
    f = lambda v: fmt(v)
    return (f"M{f(x0 + rt)},{f(y0)} L{f(x1 - rt)},{f(y0)} C{f(x1 - rt + rt * k)},{f(y0)} {f(x1)},{f(y0 + rt - rt * k)} {f(x1)},{f(y0 + rt)}"
            f" L{f(x1)},{f(y1 - rb)} C{f(x1)},{f(y1 - rb + rb * k)} {f(x1 - rb + rb * k)},{f(y1)} {f(x1 - rb)},{f(y1)}"
            f" L{f(x0 + rb)},{f(y1)} C{f(x0 + rb - rb * k)},{f(y1)} {f(x0)},{f(y1 - rb + rb * k)} {f(x0)},{f(y1 - rb)}"
            f" L{f(x0)},{f(y0 + rt)} C{f(x0)},{f(y0 + rt - rt * k)} {f(x0 + rt - rt * k)},{f(y0)} {f(x0 + rt)},{f(y0)} Z")


# ── 코트·트렌치코트: 은재님 참고 사진(싱글 노치 라펠 코트) 느낌으로 손으로 그린다(11/9) ──
# 몸통 라인(11/9 은재님: 자연스럽게 곡선으로): 둥근 어깨 → 살짝 바깥으로 휘는 소매 → 둥근 소매 끝 → 소매 아래에서 몸판이
# 부드럽게 이어져 밑단으로 살짝 퍼지고 → 둥근 밑단. 꺾이는 점 없이 모두 곡선.
# 팔 선은 허리 점에서 코트 밑단 모서리까지 한 직선으로 이어진다(11/9 은재님) — 소매 끝 안쪽 점(COAT_ARMPIT)이 그 직선 위에 오게 계산한다.
COAT_SHOULDER, COAT_HEM, COAT_CUFF_Y = (44.6, 9.6), (47.0, 59.2), 45.2
_xw = COAT_SHOULDER[0] - WAIST_IN
_yw = COAT_SHOULDER[1] + (COAT_CUFF_Y - COAT_SHOULDER[1]) * WAIST_AT
_xj = _xw + (COAT_HEM[0] - _xw) * (COAT_CUFF_Y - _yw) / (COAT_HEM[1] - _yw)
COAT_ARMPIT = (round(_xj, 2), COAT_CUFF_Y, "c")  # 소매 끝 안쪽과 몸판이 만나는 점 — 소매 구분선도 여기서 끝나 테두리와 딱 이어진다


def _on_side(k):
    """소매 끝 안쪽 점 → 밑단 모서리 직선 위의 점."""
    return (round(COAT_ARMPIT[0] + (COAT_HEM[0] - COAT_ARMPIT[0]) * k, 2), round(COAT_CUFF_Y + (COAT_HEM[1] - COAT_CUFF_Y) * k, 2))
COAT_BODY = sym([(C, 4.8), (35.8, 4.6, "c"), (38.4, 6.6), (41.4, 7.6), (44.6, 8.9), (46.9, 11.0), (48.3, 14.6), (49.0, 21.0),
                 (49.7, 30.0), (50.5, 38.0), (50.9, 42.4), (50.0, 44.4), (48.2, 45.0), COAT_ARMPIT, _on_side(0.33),
                 _on_side(0.66), COAT_HEM + ("c",), (40.0, 60.0), (C, 60.2)])  # 소매 아래 몸판은 팔 선 그대로 밑단까지 곧게
COAT_INNER = bez([(35.8, 4.8, "c"), (C, 6.4), (28.2, 4.8, "c"), (C, 11.8, "c")])
COAT_SEAM = [COAT_SHOULDER, COAT_ARMPIT[:2]]  # 어깨 끝 → 소매 끝 안쪽(허리만 들어가게 curved_seam으로 휜다)


def coat_seams():
    pts = curved_seam(*COAT_SEAM)
    return [line(pts), line([(64 - x, y) for x, y in pts])]


def coat_seam_x(y):
    """소매 구분선의 y 높이 x — 소매 끝 선이 구분선에 딱 닿게."""
    pts = curved_seam(*COAT_SEAM)
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if y0 <= y <= y1:
            return x0 + (x1 - x0) * (y - y0) / (y1 - y0)
    return pts[-1][0]


def cuff(y_out, y_in, x_out=50.6):
    """소매 끝 선: 바깥 테두리에서 소매 구분선까지(구분선에 딱 닿게)."""
    return pair([(x_out, y_out), (coat_seam_x(y_in), y_in)])


def lapels(break_y, lapel_w=40.6, notch=(37.4, 12.6), collar=(39.6, 11.2)):
    """노치 라펠: 바깥 선과 안쪽 카라 선이 첫 단추 자리(B)에서 딱 만나게(겹치거나 어긋나는 데 없이)."""
    bx = C + 0.6
    outer = pair([(35.8, 5.0), collar, notch, (lapel_w, notch[1] + 2.0), (bx, break_y)])
    inner = pair([(34.4, 5.6), (33.7, 13.0), (bx + 0.25, break_y - 6.0), (bx, break_y)])
    return outer + inner


def coat():
    """코트: 노치 라펠(안쪽 카라 선을 첫 단추까지 길게) + 싱글 단추 3개 + 비스듬한 주머니 + 소매 끝 선."""
    details = (lapels(30.4) + [line([(C + 0.6, 30.4), (C + 0.6, 59.8)])] +             # 라펠 · 앞여밈
               pair([(36.2, 43.8), (41.2, 41.6)]) + cuff(40.8, 41.6))                    # 주머니 · 소매 끝
    return {"shapes": [COAT_BODY], "details": details, "seams": coat_seams(), "shade": [SHADE], "inner": [COAT_INNER],
            "tops": [], "straps": [], "dots": [[34.6, 34.2, 0.8], [34.6, 40.6, 0.8], [34.6, 47.0, 0.8]]}


def rrect(x0, y0, x1, y1):
    return bez([(x0, y0, "c"), (x1, y0, "c"), (x1, y1, "c"), (x0, y1, "c")])


def trench():
    """트렌치코트: 코트와 같은 모양 + 넓은 라펠 + 더블 단추 + 허리 벨트(면으로 칠한 띠·옆으로 묶은 매듭·늘어진 두 끈) + 어깨 견장 + 소매 스트랩 + 덮개 주머니."""
    by0, by1 = 29.0, 32.2  # 벨트 위·아래
    bx = coat_seam_x((by0 + by1) / 2)
    belt = [bez([(64 - bx, by0, "c"), (bx, by0, "c"), (bx, by1, "c"), (64 - bx, by1, "c")]),             # 띠(소매 밑으로 들어감)
            # 묶은 매듭에서 늘어진 두 끈(11/9 은재님 참고 그림): 하나는 길게 곧게, 하나는 살짝 바깥으로 짧게. 끝은 비스듬히 자른 모양
            bez([(34.6, 32.0, "c"), (36.5, 32.0, "c"), (36.2, 37.6), (36.0, 43.0, "c"), (34.4, 42.0, "c"), (34.5, 37.4)]),
            bez([(36.3, 32.0, "c"), (38.0, 32.0, "c"), (38.5, 36.4), (38.9, 40.4, "c"), (37.4, 40.8, "c"), (37.0, 36.6)]),
            rrect(34.4, 28.4, 38.2, 32.8)]                                                               # 매듭
    details = (lapels(25.4, lapel_w=41.8, notch=(37.6, 12.4), collar=(39.8, 11.0)) +
               [line([(C + 0.6, 25.4), (C + 0.6, by0 - 0.5)]), line([(C + 0.6, by1 + 0.5), (C + 0.6, 59.8)])] +   # 앞여밈(벨트에서 끊김)
               pair([(39.6, 7.6), (45.4, 10.0)]) +                                   # 어깨 견장
               cuff(39.4, 40.2, 50.5) + cuff(41.4, 42.2) +                            # 소매 스트랩
               pair([(39.4, 41.0), (43.4, 39.0)]) + pair([(39.6, 43.2), (43.4, 41.2)]))   # 덮개 주머니(늘어진 끈 옆)
    dots = [[37.0, 26.8, 0.75], [27.0, 26.8, 0.75],  # 벨트 위 단추(라펠·벨트와 안 겹치게)
            [37.0, 46.4, 0.75], [27.0, 46.4, 0.75],  # 벨트 아래 단추(늘어진 끈 끝보다 아래, 11/9 은재님)
            [44.2, 9.6, 0.55], [19.8, 9.6, 0.55]]
    return {"shapes": [COAT_BODY], "details": details, "seams": coat_seams(), "shade": [SHADE], "inner": [COAT_INNER],
            "tops": belt, "straps": [], "dots": dots}


def vest():
    """베스트(11/9 은재님: 여성스럽게): 허리가 살짝 들어간 크롭 브이넥 니트 조끼 — 브이넥·진동 시보리, 가운데 단추 여밈, 밑단 시보리."""
    body = sym([(C, 27.0, "c"), (35.0, 18.6), (37.4, 10.0, "c"), (41.4, 10.2, "c"), (42.2, 15.2), (44.0, 20.2), (46.6, 23.4, "c"),
                (45.8, 30.0), (44.8, 36.0), (45.4, 42.0), (46.4, 48.2, "c"), (39.6, 49.4), (C, 49.6)])
    back = bez([(37.4, 10.0, "c"), (C, 12.6), (26.6, 10.0, "c"), (C, 27.0, "c")])
    details = (pair([(39.0, 10.6), (36.8, 18.6), (33.4, 27.2)]) +                          # 브이넥 시보리
               pair([(40.2, 11.0), (41.0, 15.8), (42.8, 20.6), (45.2, 23.8)]) +            # 진동 시보리
               [line([(C, 27.0), (C, 49.4)]), line([(18.4, 45.0), (C, 45.6), (45.6, 45.0)])])  # 가운데 여밈 · 밑단 시보리
    return {"shapes": [body], "details": details, "shade": [SHADE], "inner": [back], "tops": [], "straps": [],
            "dots": [[C, 31.2, 0.75], [C, 36.0, 0.75], [C, 40.8, 0.75]]}


def clutch():
    """클러치(11/9 은재님: 너무 네모라서): 모서리가 많이 둥근 파우치 + 봉투 덮개 선 + 가운데 잠금 단추."""
    return {"shapes": [rounded_rect(11.5, 25.5, 52.5, 50.5, 4.5, 7.0)],
            "details": [line([(13.0, 27.4), (22.0, 34.4), (29.4, 39.4), (C, 40.2), (34.6, 39.4), (42.0, 34.4), (51.0, 27.4)])],
            "shade": [SHADE], "inner": [], "tops": [], "dots": [[32, 38.6, 1.25]], "straps": []}


DERIVED = {"클러치": clutch, "베스트": vest, "코트": coat, "트렌치코트": trench, "샌들": lambda: trace("샌들", SANDAL_BOX, GUIDE1)}
CFG["샌들"] = SHOE

if __name__ == "__main__":
    out = {kind: trace(kind) for kind in BOXES if kind not in DERIVED}
    out.update({kind: make() for kind, make in DERIVED.items()})
    json.dump(out, open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False)
    print(len(out), "kinds traced")
