"""카탈로그에 아직 없는 종류의 그림 예시 (11/8): 터틀넥(목티) · 끈나시(캐미솔) · 운동화(러닝화).
카탈로그·스키마에 종류를 추가하면 gen_icons_v3.py로 옮긴다."""
import json, sys
import gen_icons_v3 as g
from gen_icons_v3 import C, sym, bez, line, pair, pair_shape, ticks, RIGHT_SHADE, LONG_CUFF, rect, zoom

EX = {}
def add(kind, shapes, details=(), shade=(), inner=(), tops=(), dots=(), straps=(), transform=None):
    ic = {"shapes": list(shapes), "details": list(details), "shade": list(shade), "inner": list(inner), "tops": list(tops),
          "dots": [list(x) for x in dots], "straps": list(straps)}
    if transform: ic["transform"] = transform
    EX[kind] = ic

# 터틀넥(목티): 몸에 붙는 긴소매 + 접힌 목
TURTLE = g.top_body("long", hem=52.2, side=44.4, neck=12.4, neck_side=(36.6, 10.4))
TURTLE_NECK = sym([(C, 4.6), (36.8, 4.8, "c"), (37.6, 12.2, "c"), (C, 13.0)])
add("터틀넥", [TURTLE], LONG_CUFF + [line([(18.8, 49.6), (45.2, 49.6)])], RIGHT_SHADE, [],
    [TURTLE_NECK], )
EX["터틀넥"]["details"] += [line([(27.2, 8.6), (C, 9.2), (36.8, 8.6)])]  # 접힌 선 하나만(세로 골지는 철창처럼 보여서 뺌)
EX["터틀넥"]["tops"] = [TURTLE_NECK]

# 끈나시(캐미솔): 가는 끈 + 살짝 V 넥 + 레이스 단
CAMI = sym([(C, 21.4), (35.4, 19.8), (39.4, 16.8, "c"), (41.6, 18.2), (43.6, 23.6, "c"), (44.4, 37), (45.2, 50.4, "c"), (39, 51.4), (C, 51.6)])
STRAP = pair_shape([(37.9, 8.0, "c"), (38.9, 8.0, "c"), (40.0, 17.2, "c"), (39.0, 17.4, "c")])
add("끈나시", [CAMI], [line([(24.6, 18.4), (28.6, 21.6), (C, 22.8), (35.4, 21.6), (39.4, 18.4)])] +
    [line([(19.4, 48.6), (44.6, 48.6)])], RIGHT_SHADE, [], STRAP)

# 운동화(러닝화): 두툼한 밑창 + 앞코가 들린 모양 + 망사 느낌 선
RUN = bez([(10.8, 40.6, "c"), (10.4, 32.6), (12.6, 26.4), (17, 25.4), (21.8, 28.2), (26.6, 24.2), (30.6, 22.4), (33.6, 24.4),
           (38.8, 28.4), (46.2, 31.2), (54.2, 33.4), (59.8, 36.6), (61.2, 40.6, "c")])
SOLE = bez([(9.4, 40.2, "c"), (61.6, 40.2, "c"), (62, 43.0), (59.6, 46.6, "c"), (13, 46.8, "c"), (9.6, 45.4), (9.0, 42.8)])
add("운동화", [RUN],
    [line([(30.4, 25.6), (44.4, 32.4)]), line([(31.6, 24.6), (33.8, 28.6)]), line([(35.2, 26.6), (37.4, 30.4)]), line([(38.8, 28.6), (41, 32)]),
     line([(12.6, 30.6), (16.8, 31.6), (18.8, 39.6)]), line([(47.6, 32.4), (50.8, 36.6), (60.8, 38.4)]),
     line([(20.6, 36.8), (29.4, 34.2), (40.2, 36.6)])],
    [rect(10, 37.8, 64, 64)], [bez([(12.6, 26.4), (17, 25.2), (21.8, 28.2), (17.2, 28.2)])],
    [SOLE], transform=zoom(1.06, 35, 35.4))
EX["운동화"]["details"] += [line([(14, 44.6), (58.4, 44.6)])]

if __name__ == "__main__":
    json.dump(EX, open(sys.argv[1], "w"), ensure_ascii=False, indent=1); print(len(EX), "extras")
