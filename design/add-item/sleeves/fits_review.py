"""핏 확인 표: 종류마다 지금 앱 기본(v12) 레귤러·슬림·오버사이즈 + 모양 고른 그림 하나의 세 핏."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import sleeves_b as B
import preview as PV
out_html, out_png = sys.argv[1], sys.argv[2]
ICONS, SPECS, WEAVES, V12 = B.load(); PL = B.places(ICONS, SPECS, V12)
NEW = json.load(open(B.OUT_ICONS)); NW = json.load(open(B.OUT_WEAVES)); VF = json.load(open(B.OUT_V12FITS))
samples = {'긴소매티셔츠': 'i27', '셔츠': 'i61', '블라우스': 'i55', '니트': 'i76', '맨투맨': 'i96', '후드': 'i97', '트레이닝상의': 'i98',
           '카디건': 'i99', '후드집업': 'i100', '반소매티셔츠': 'i4', '민소매': 'i47', '베스트': 'i101'}
rows = []
for kind, iid in samples.items():
    cells = []
    if kind in V12:
        cells.append(('기본 레귤러', PV.svg(V12[kind], size=120)))
        for f in B.FITS:
            cells.append(('기본 ' + f, PV.svg(VF[kind][f], size=120)))
    for f in (None,) + B.FITS:
        cells.append(('모양 고름 ' + (f or '레귤러'), PV.svg(NEW[B.fit_key(iid, f)], place=PL[kind], size=120)))
    rows.append((kind, cells))
cells = []
for key, base, kind in (('kn|꽈배기 전체|같이', 'i67', '니트'), ('cd|골지|같이', 'i99', '카디건')):
    for f in (None,) + B.FITS:
        cells.append((key.split('|')[1] + ' ' + (f or '레귤러'), PV.svg(NEW[B.fit_key(base, f)], place=PL[kind], overlay=NW[B.fit_key(key, f)], size=120)))
rows.append(('짜임 결', cells))
PV.sheet('B안 상의 · 핏별 그림 (레귤러 · 슬림 · 오버사이즈)', rows, out_html, size=120)
PV.shoot(out_html, out_png, width=1100, scale=2)
