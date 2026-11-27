"""옷 추가 시안(11/15, 옷추가_눌러보기_전체-2.html)의 그림·선택지 → 앱 데이터.

사용(저장소 루트에서):  python3 design/add-item/gen_add_item.py

읽는 것(design/add-item/source/):
  icons.json   시안 그림 399개(11/19 후드 코트 24개 고침: 후드가 목 바로 아래에서 만나고 단추가 위부터 내려옴)
  weaves.json  짜임·털 결 19개(니트·카디건 골지·꽈배기·아가일, 퍼 결)
  specs.json   종류 61개의 고르는 칸(색·핏·목 모양·기장·소재·무늬·계절 …)과 조합 그림
  mdesc.json   소재 설명
  extra_icons.json  시안에 없던 모자(캡·비니·베레모)·벨트 그림(11/19, make_extra.py로 만듦)
  + design/kind-icons/icons_v12.json (지금 앱 그림 48종)

만드는 것:
  mobile/src/data/wardrobeArt.ts      시안 그림·짜임 결·고르는 칸(옷 추가 ②·옷장에 들어갈 때만 불러옴)
  design/kind-icons/icons_v13.json    v12 48종 + 새 종류 13개 기본 그림(크기 맞춤) → gen_ts.py로 kindIcons.ts

크기 맞추기(11/19 A안): 시안 그림은 v12보다 조금 작고 옆으로 넓다. 종류마다 시안 기본 그림 → v12 그림의
높이 배율을 구해 그 종류의 모든 그림에 같이 적용하고(place), 칸 가운데(32, 32.6)에 둔다.
v12에 없는 새 종류는 비슷한 종류의 배율을 쓴다(NEW_LIKE)."""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(os.path.dirname(__file__), 'source')
J = lambda f: json.load(open(os.path.join(SRC, f), encoding='utf-8'))
ICONS, WEAVES, SPECS, MDESC = J('icons.json'), J('weaves.json'), J('specs.json'), J('mdesc.json')
EXTRA = J('extra_icons.json')
# 모자·벨트: 시안에 화면이 없어서 니트 화면의 색 · 소재 · 무늬 · 계절 칸을 빌려 만든다(처음 값은 비움). 그림 id는 x_ + 종류.
_knit = next(s for s in SPECS if s['name'] == '니트')


def _borrow(title, note=None):
    g = json.loads(json.dumps(next(x for x in _knit['groups'] if x['title'] == title)))
    for o in g['options']:
        o['on'] = o['def'] if title == '무늬' else False
    if note is not None:
        g['note'] = note
    return g


HAT_SHAPES = {'캡': 'x_모자', '비니': 'x_모자_비니', '베레모': 'x_모자_베레모'}   # 11/19 은재 님: 모자는 이 3가지만
for key, icon in EXTRA.items():
    ICONS['x_' + key] = icon


def _hat_shape_group():
    opts = [{'v': v, 'label': v, 'icon': i, 'def': v == '캡', 'on': v == '캡', 'new': False, 'iconColor': '', 'iconPat': '', 'iconOv': ''}
            for v, i in HAT_SHAPES.items()]
    return {'title': '모양', 'note': '', 'ui': 'grid', 'role': '', 'multi': False, 'fixed': False, 'noswap': False,
            'nooverlay': False, 'weave': '', 'inDetails': False, 'cond': None, 'options': opts}


for name in ('모자', '벨트'):
    groups = [_borrow('색')] + ([_hat_shape_group()] if name == '모자' else []) + [
        _borrow('소재', '여러 개 골라도 돼요'), _borrow('무늬'), _borrow('계절')]
    SPECS.append({'name': name, 'slot': '잡화', 'baseIcon': 'x_' + name, 'combos': [], 'groups': groups})

# 11/27 은재 님: 신발 소재는 옷 기준 문구가 안 맞는다.
# - '면'은 신발에서 '천'으로 보이게(저장 값은 '면' 그대로 — 서버·판정 값은 안 바뀜).
# - 신발은 소재를 골라도 그림이 안 바뀌어서 '데님 · 니트 · 퍼는 그림이 바뀌어요' 안내를 뺀다.
# - 누르면 나오는 소재 설명도 신발용으로('신발|면'처럼 부위를 앞에 붙인 열쇠, 앱이 먼저 찾고 없으면 공통 설명).
SHOE_MDESC = {
    '가죽': '매끈한 가죽 신발 · 인조 가죽 포함',
    '스웨이드': '겉이 보들보들한 무광 가죽 · 어그 · 스웨이드 로퍼',
    '면': '캔버스 운동화처럼 천으로 된 신발',
    '퍼': '털이 달리거나 안에 털이 든 신발 · 털 슬리퍼',
}
for s in SPECS:
    if s['slot'] != '신발':
        continue
    for g in s['groups']:
        if g['title'] != '소재':
            continue
        g['note'] = ''
        for o in g['options']:
            if o['v'] == '면':
                o['label'] = '천'
MDESC.update({f'신발|{k}': v for k, v in SHOE_MDESC.items()})

V12 = json.load(open(os.path.join(ROOT, 'design/kind-icons/icons_v12.json'), encoding='utf-8'))

# 시안 화면 이름 → 서버 kind 값(친구분 서버 catalog.ts). 나머지는 이름 그대로.
SERVER_KIND = {'반소매티': '반소매티셔츠', '긴소매티': '긴소매티셔츠', '슬리브리스': '민소매', '사파리재킷': '야상',
               '트레이닝 상의': '트레이닝상의', '트레이닝 하의': '조거팬츠'}
# v12에 그림이 없는 새 종류 → 크기 배율을 빌려 올 종류(v12 이름)와 그 종류의 시안 기본 그림
NEW_LIKE = {'트레이닝상의': '맨투맨', '카고팬츠': '코튼팬츠', '트위드자켓': '재킷', '퍼자켓': '레더재킷', '무스탕': '레더재킷',
            '숏코트': '코트', '하프코트': '코트', '롱코트': '코트', '퍼코트': '코트', '스타킹': '레깅스', '양말': '스니커즈'}
MOCK_OF_V12 = {'코트': '하프코트'}   # v12 '코트'는 시안 하프코트를 다듬은 그림
CENTER = (32.0, 32.6)


def nums(d):
    return [float(x) for x in re.findall(r'-?\d+\.?\d*', d)]


def bbox(ic):
    t = ic.get('transform') or [0, 0, 1]
    xs, ys = [], []
    for d in ic['shapes'] + ic.get('straps', []):
        n = nums(d)
        xs += [t[0] + v * t[2] for v in n[0::2]]
        ys += [t[1] + v * t[2] for v in n[1::2]]
    return min(xs), min(ys), max(xs), max(ys)


def r(x):
    return round(x, 3)


by_name = {}
for s in SPECS:
    by_name.setdefault(SERVER_KIND.get(s['name'], s['name']), s)


def scale_for(kind):
    """시안 기본 그림 → v12 그림 높이 배율."""
    v = NEW_LIKE.get(kind, kind)
    mock = by_name[MOCK_OF_V12.get(v, v)]
    a, b = bbox(ICONS[mock['baseIcon']]), bbox(V12[v])
    return (b[3] - b[1]) / (a[3] - a[1])


def place_for(kind, base_id):
    """그 종류 그림 전체에 씌울 [x 이동, y 이동, 배율]: 기본 그림을 배율만큼 키우고 칸 가운데로."""
    if base_id.startswith('x_'):
        return [0, 0, 1]   # 모자·벨트는 처음부터 v12 크기로 그렸다
    s = scale_for(kind)
    a = bbox(ICONS[base_id])
    cx, cy = (a[0] + a[2]) / 2, (a[1] + a[3]) / 2
    return [r(CENTER[0] - cx * s), r(CENTER[1] - cy * s), r(s)]


# ── 경로 표: 같은 선을 한 번만 적는다(그림 399개의 선 11,623개 중 서로 다른 건 2천여 개) ──
paths, pidx = [], {}


def P(d):
    if d not in pidx:
        pidx[d] = len(paths)
        paths.append(d)
    return pidx[d]


LAYERS = ('shapes', 'shade', 'details', 'seams', 'tops', 'inner', 'lining', 'metals', 'tex', 'plain', 'straps', 'chains')
used = set()
for s in SPECS:
    used.add(s['baseIcon'])
    for g in s['groups']:
        used |= {o['icon'] for o in g['options'] if o['icon']}
    for c in s.get('combos', []):
        used |= set(c['map'].values())
icons_out = {}
for iid in sorted(used, key=lambda x: (x.startswith('x_'), int(x[1:]) if x[1:].isdigit() else 0, x)):
    ic = ICONS[iid]
    o = {}
    for k in LAYERS:
        if ic.get(k):
            o[k] = [P(d) for d in ic[k]]
    if ic.get('dots'):
        o['dots'] = [[r(x) for x in d] for d in ic['dots']]
    if ic.get('transform'):
        o['transform'] = [r(x) for x in ic['transform']]
    if ic.get('sheer'):
        o['sheer'] = ic['sheer']
    icons_out[iid] = o
weaves_out = {k: ([P(d) for d in v] if isinstance(v, list) else {'t': [P(d) for d in v['t']]}) for k, v in WEAVES.items()}


# ── 고르는 칸: 기본값만 있는 보기는 글자 하나로 줄인다 ──
def opt(o):
    x = {'v': o['v']}
    if o['label'] != o['v']:
        x['label'] = o['label']
    if o['icon']:
        x['icon'] = o['icon']
    for k in ('def', 'on', 'new'):
        if o[k]:
            x[k] = True
    if o['iconOv']:
        x['ov'] = o['iconOv']
    return x['v'] if list(x) == ['v'] else x


# 시안을 검토할 때 붙인 설명(만든 사람용)은 앱 화면에서 뺀다.
DEV_NOTES = {'천이 아니라 꾸밈이라 소재에서 여기로 옮겼어요', '그림은 니트와 같은 방식', '그림은 하나로', '상의와 같은 보기',
             '조거팬츠는 여기 "조거"로', '핏 대신 길이', '핏 대신 두께', '크롭이면 "브라탑"으로 보여 줘요'}


def clean_note(note):
    parts = [p.strip() for p in note.split('·') if p.strip()]
    return ' · '.join(p for p in parts if p not in DEV_NOTES)


def group(g):
    x = {'title': g['title'], 'ui': g['ui']}
    note = clean_note(g['note'])
    if note:
        x['note'] = note
    if g['role']:
        x['role'] = g['role']
    for k, name in (('multi', 'multi'), ('fixed', 'fixed'), ('noswap', 'noswap'), ('nooverlay', 'nooverlay'), ('inDetails', 'more')):
        if g[k]:
            x[name] = True
    if g['weave']:
        x['weave'] = g['weave']
    if g['cond']:
        x['cond'] = g['cond']
    x['options'] = [opt(o) for o in g['options']]
    return x


specs_out = []
for s in SPECS:
    kind = SERVER_KIND.get(s['name'], s['name'])
    x = {'slot': s['slot'], 'kind': kind, 'name': s['name'], 'base': s['baseIcon'], 'place': place_for(kind, s['baseIcon']),
         'groups': [group(g) for g in s['groups']]}
    if s.get('combos'):
        x['combos'] = s['combos']
    if s.get('furov'):
        f = dict(s['furov'])
        if isinstance(f.get('map'), str):
            f['map'] = json.loads(f['map'])
        x['furov'] = f
    specs_out.append(x)

D = lambda v: json.dumps(v, ensure_ascii=False, separators=(',', ':'))
ts = ['// 자동 생성 파일 — design/add-item/gen_add_item.py. 직접 고치지 말 것.',
      '// 옷 추가 시안(11/15) 그림 399개·짜임 결 19개·종류 61개의 고르는 칸. 크기가 커서 옷 추가 ②·옷장에 들어갈 때만 불러온다',
      '// (data/wardrobeLook.ts의 loadWardrobeArt). 그림의 선은 paths 표의 번호로 적었다.',
      "import type { PackedArt } from './wardrobeLook';", '',
      'export const ART: PackedArt = {',
      f'  paths: {D(paths)},',
      f'  icons: {D(icons_out)},',
      f'  weaves: {D(weaves_out)},',
      f'  specs: {D(specs_out)},',
      f'  materialNotes: {D(MDESC)},',
      '};', '']
out = os.path.join(ROOT, 'mobile/src/data/wardrobeArt.ts')
open(out, 'w', encoding='utf-8').write('\n'.join(ts))

# ── 옷 종류 그림 v13: v12 48종 + 새 종류 기본 그림(크기 맞춤) ──
v13 = dict(V12)
for kind in NEW_LIKE:
    s = by_name[kind]
    ic = json.loads(json.dumps(ICONS[s['baseIcon']]))
    pl = place_for(kind, s['baseIcon'])
    t = ic.get('transform') or [0, 0, 1]
    ic['transform'] = [r(pl[0] + t[0] * pl[2]), r(pl[1] + t[1] * pl[2]), r(pl[2] * t[2])]
    for k in ('tex', 'sheer'):
        ic.pop(k, None)
    v13[kind] = ic
for name in ('모자', '벨트'):
    v13[name] = dict(EXTRA[name])
json.dump(v13, open(os.path.join(ROOT, 'design/kind-icons/icons_v13.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'wardrobeArt.ts {os.path.getsize(out) // 1024}KB · 그림 {len(icons_out)} · 선 {len(paths)} · 종류 {len(specs_out)} · v13 {len(v13)}종')
