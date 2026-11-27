"""B안 확인용 표: 종류마다 '전(시안 그대로)'과 '후(새 소매)'를 앱과 같은 크기 배율로 나란히 그린다.
사용: python3 review.py <묶음> <출력 폴더>"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import sleeves_b as B
import preview as PV

batch, out_dir = sys.argv[1], sys.argv[2]
os.makedirs(out_dir, exist_ok=True)
ICONS, SPECS, WEAVES, V12 = B.load()
NEW = json.load(open(B.OUT_ICONS, encoding='utf-8'))
NEWW = json.load(open(B.OUT_WEAVES, encoding='utf-8'))
PL = B.places(ICONS, SPECS, V12)
spec_by = {s['name']: s for s in SPECS}
COLOR = '#D7C5AA'


def labels(s):
    lab = {}
    for g in s['groups']:
        for o in g['options']:
            if o['icon']:
                lab.setdefault(o['icon'], []).append(o['v'])
    for c in s.get('combos', []):
        for k, v in c['map'].items():
            lab.setdefault(v, []).append(k.replace('|', '·'))
    return lab


files = []
for name in B.BATCHES[batch]:
    s = spec_by[name]
    kind = B.SERVER_KIND.get(name, name)
    pl = PL[kind]
    lab = labels(s)
    ids = sorted(B.icon_ids(s), key=lambda x: (x != s['baseIcon'], int(x[1:])))
    rows = []
    v12k = kind if kind in V12 else None
    per = 9
    for i in range(0, len(ids), per):
        chunk = ids[i:i + per]
        name_of = lambda iid: '기본' if iid == s['baseIcon'] else ' · '.join(dict.fromkeys(lab.get(iid, [''])))[:16]
        before = [(name_of(iid), PV.svg(ICONS[iid], place=pl, color=COLOR, size=120)) for iid in chunk]
        after = [(name_of(iid), PV.svg(NEW[iid], place=pl, color=COLOR, size=120)) for iid in chunk]
        if i == 0 and v12k:
            before = [('지금 앱 기본(v12)', PV.svg(V12[v12k], color=COLOR, size=120))] + before
            after = [('지금 앱 기본(v12)', PV.svg(V12[v12k], color=COLOR, size=120))] + after
        rows += [('전 (시안)', before), ('후 (새 소매)', after)]
    # 짜임 결(같이 = 소매에도 결)
    pre = next((p for p, n in B.WEAVE_OF.items() if n == name), None)
    if pre:
        base = s['baseIcon']
        cells_b, cells_a = [], []
        for w in ('골지', '꽈배기 가운데', '꽈배기 전체', '아가일'):
            key = f'{pre}{w}|같이'
            cells_b.append((w, PV.svg(ICONS[base], place=pl, color=COLOR, overlay=WEAVES[key], size=120)))
            cells_a.append((w, PV.svg(NEW[base], place=pl, color=COLOR, overlay=NEWW[key], size=120)))
        rows += [('짜임 결 전', cells_b), ('짜임 결 후', cells_a)]
    html_path = os.path.join(out_dir, f'B_{kind}.html')
    PV.sheet(f'{name} · 그림 {len(ids)}개', rows, html_path, size=120)
    png = os.path.join(out_dir, f'B_{kind}.png')
    PV.shoot(html_path, png, width=1520, scale=2)
    files.append((name, kind, png))
    print(name, png)
json.dump(files, open(os.path.join(out_dir, 'files.json'), 'w'), ensure_ascii=False)
