"""아우터 확인 표: 종류마다 [지금 앱 기본 v12 · 슬림 · 오버] + [시안 기본 전 · 후] + 모양 고른 그림 몇 개(후)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import sleeves_b as B
import preview as PV
out_html, out_png = sys.argv[1], sys.argv[2]
ICONS, SPECS, WEAVES, V12 = B.load(); PL = B.places(ICONS, SPECS, V12)
NEW = json.load(open(B.OUT_ICONS)); VF = json.load(open(B.OUT_V12FITS))
spec_by = {s['name']: s for s in SPECS}
rows = []
for name in B.BATCHES['아우터'] + B.FIT_ONLY['아우터']:
    s = spec_by[name]; kind = B.SERVER_KIND.get(name, name); pl = PL[kind]
    cells = []
    if kind in V12:
        cells.append(('지금 기본', PV.svg(V12[kind], size=118)))
        for f in B.FITS:
            cells.append(('기본 ' + f, PV.svg(VF[kind][f], size=118)))
    base = s['baseIcon']
    cells.append(('시안 전', PV.svg(ICONS[base], place=pl, size=118)))
    cells.append(('시안 후', PV.svg(NEW[base], place=pl, size=118)))
    seen = set()
    for iid in sorted(B.icon_ids(s), key=lambda x: int(x[1:])):
        sig = NEW[iid]['shapes'][0][:60] + str(len(NEW[iid].get('tops', [])))
        if iid == base or sig in seen:
            continue
        seen.add(sig)
        cells.append((iid + ' 후', PV.svg(NEW[iid], place=pl, size=118)))
        if len(cells) >= 11:
            break
    cells.append(('오버(모양)', PV.svg(NEW[B.fit_key(base, '오버사이즈')], place=pl, size=118)))
    rows.append((name, cells))
PV.sheet('B안 아우터 · 새 소매 + 핏별', rows, out_html, size=118)
PV.shoot(out_html, out_png, width=1800, scale=1)
