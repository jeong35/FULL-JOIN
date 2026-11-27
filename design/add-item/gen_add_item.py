"""옷 추가 시안(11/15, 옷추가_눌러보기_전체-2.html)의 그림·선택지 → 앱 데이터.

사용(저장소 루트에서):  python3 design/add-item/gen_add_item.py

읽는 것(design/add-item/source/):
  icons.json   시안 그림 399개(11/19 후드 코트 24개 고침: 후드가 목 바로 아래에서 만나고 단추가 위부터 내려옴)
  weaves.json  짜임·털 결 19개(니트·카디건 골지·꽈배기·아가일, 퍼 결) — 짜임 아가일은 11/27부터 안 씀(무늬 아가일로)
  argyle_b.json  무늬 아가일(니트·카디건·베스트, 핏별, sleeves/argyle_build.py가 만듦) → argyles
  crop_b.json  크롭 그림(셔츠·블라우스·후드·트레이닝 상의·카디건·후드집업·베스트·민소매, 핏별, sleeves/crop_build.py가 만듦)
  specs.json   종류 61개의 고르는 칸(색·핏·목 모양·기장·소재·무늬·계절 …)과 조합 그림
  mdesc.json   소재 설명
  extra_icons.json  시안에 없던 모자(캡·비니·베레모)·벨트 그림(11/19, make_extra.py로 만듦)
  icons_b.json · weaves_b.json  B안(11/22~): 긴소매를 v12 코트 팔로 다시 그린 그림·짜임 결(sleeves/sleeves_b.py가 만듦).
                    있으면 icons.json·weaves.json의 같은 이름을 덮어쓴다. 크기 배율(place)은 원래 그림으로 계산한다.
                    핏별 그림은 '그림id@슬림'·'그림id@오버사이즈', 결은 '결이름@핏'으로 들어 있다(앱이 핏을 보고 고른다).
  + design/kind-icons/fits_b.json  지금 앱 기본 그림(v12)의 핏별(슬림·오버사이즈) → wardrobeArt.ts에 'v12:종류@핏'으로
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
ORIG_ICONS = dict(ICONS)   # 크기 배율은 B안 전 그림으로 계산한다(소매만 바뀌어도 배율이 그대로이게).
for _f, _d in (('icons_b.json', ICONS), ('weaves_b.json', WEAVES), ('motifs_b.json', WEAVES)):
    if os.path.exists(os.path.join(SRC, _f)):
        _d.update(J(_f))
EXTRA = J('extra_icons.json')
# 보기 이름 바꾸기(11/23 은재 님): 퍼자켓 '큰 칼라'는 내려놓은 후드처럼 보여서 '후드'로(서버 칼라 목록에 이미 있는 값).
RENAME = {('퍼자켓', '칼라', '큰 칼라'): '후드'}
for _s in SPECS:
    for (_name, _title, _old), _new in RENAME.items():
        if _s['name'] != _name:
            continue
        for _g in _s['groups']:
            if _g['title'] == _title:
                for _o in _g['options']:
                    if _o['v'] == _old:
                        _o['v'] = _new
                        if _o.get('label') == _old:
                            _o['label'] = _new
        for _c in _s.get('combos', []):
            if _title in _c['keys']:
                _i = _c['keys'].index(_title)
                _c['map'] = {'|'.join(_new if (j == _i and p == _old) else p for j, p in enumerate(k.split('|'))): v
                             for k, v in _c['map'].items()}
# 원피스·점프수트(11/23 오후 시안 5): 소매 × 목 모양 × 허리 끈 조합 그림(sleeves/dresses_build.py가 만든 dress_b.json).
# 소매 그림 칸도 새 그림으로, 점프수트 소매 칸은 이제 그림을 바꾼다(noswap 끔). 'base'는 아무것도 안 골랐을 때 그림.
DRESS_B = J('dress_b.json') if os.path.exists(os.path.join(SRC, 'dress_b.json')) else {}
for _s in SPECS:
    _d = DRESS_B.get(_s['name'])
    if not _d:
        continue
    _s['combos'] = _d['combos']
    for _g in _s['groups']:
        for _o in _g['options']:
            if _o['v'] in _d['icons'].get(_g['title'], {}):
                _o['icon'] = _d['icons'][_g['title']][_o['v']]
                _g['noswap'] = False
        if _g['title'] in _d.get('on', {}):
            for _o in _g['options']:
                _o['on'] = _o['def'] = _o['v'] == _d['on'][_g['title']]
# 핏은 처음에 '레귤러'가 골라져 있게(11/23 은재 님 "옷 기본은 다 레귤러로"). 레귤러가 없는 칸(바지 스키니·와이드 등,
# 길이·두께)은 그대로 안 고른 채로.
for _s in SPECS:
    for _g in _s['groups']:
        if _g['role'] == 'fit' and _g['title'] == '핏' and any(_o['v'] == '레귤러' for _o in _g['options']):
            for _o in _g['options']:
                _o['on'] = _o['v'] == '레귤러'
# 칸 그림 = 고르면 실제로 그려지는 그림(combos). 셔츠 카라 '없음' 칸이 i52(셔츠 기본 그림, 11/23부터 새 카라)를 보여서
# '없음'인데 카라가 보이던 것 → 고르면 그려지는 i59(카라 없는 셔츠)로 맞춘다.
for _s in SPECS:
    for _c in _s.get('combos', []):
        _k0, _rest = _c['keys'][0], '|' * (len(_c['keys']) - 1)
        for _g in _s['groups']:
            if _g['title'] != _k0:
                continue
            for _o in _g['options']:
                _t = _c['map'].get(_o['v'] + _rest)
                if _o.get('icon') and _t and _t != _o['icon']:
                    print(f"칸 그림 맞춤: {_s['name']} {_k0} {_o['v']} {_o['icon']} → {_t}")
                    _o['icon'] = _t
# 노르딕 니트 · 레터링 티(11/23 은재 님 "노르딕은 둘 다 넣고 레터링도 이렇게", "레터링 색도 정할 수 있게").
# 결은 sleeves/motifs_build.py가 source/motifs_b.json에 그린다(핏별). 서버 details: 짜임 '노르딕 가로'·'노르딕 목둘레',
# 프린팅 '레터링'·'작은 로고', 프린팅 색 · 노르딕 색(색 이름) — src/fulljoin/catalog.ts의 detailsSchema에도 같이 넣었다.
NORDIC = ('노르딕 가로', '노르딕 목둘레')
PRINT_KINDS = ('반소매티', '긴소매티', '맨투맨', '후드')
PRINTS = ('레터링', '작은 로고')
PRINT_COLORS = ('화이트', '블랙', '그레이', '아이보리', '베이지', '브라운', '네이비', '스카이블루', '레드', '핑크', '그린', '옐로우')
_O = lambda v, icon='', ov='', pr='', ag='': {'v': v, 'label': v, 'icon': icon, 'def': False, 'on': False, 'new': bool(icon), 'iconColor': '',
                                               'iconPat': '', 'iconOv': ov, 'iconPr': pr, 'iconAg': ag}
for _s in SPECS:
    for _g in _s['groups']:
        if _g.get('weave') and _g['title'] == '짜임':
            _icon = next((o['icon'] for o in _g['options'] if o['icon']), _s['baseIcon'])
            _g['options'] += [_O(v, _icon, f"{_g['weave']}|{v}|같이") for v in NORDIC]
            # 노르딕 무늬 색(11/23 "노르딕도 하게 하면 좋죠"): 노르딕을 고르면 나온다. 안 고르면 옷 색에서 뽑은 안쪽 선 색.
            _j = _s['groups'].index(_g) + 1
            if _j < len(_s['groups']) and _s['groups'][_j]['title'] == '팔':
                _j += 1
            _s['groups'].insert(_j, dict(_g, title='노르딕 색', ui='swg', note='· 안 고르면 옷 색에 맞춰요', weave='', nooverlay=False,
                                         cond={'t': '짜임', 'in': list(NORDIC)}, tint=True, options=[_O(c) for c in PRINT_COLORS]))
    if _s['name'] in PRINT_KINDS:
        _i = next(i for i, g in enumerate(_s['groups']) if g['title'] == '무늬') + 1
        _base = dict(_s['groups'][_i - 1], options=[], cond=None, note='', ui='grid', multi=False, role='', weave='', nooverlay=False)
        _s['groups'][_i:_i] = [
            dict(_base, title='프린팅', note='· 안 고르면 없음 · 글자 대신 글씨 느낌으로 그려요', print=f"pr|{_s['name']}",
                 options=[_O(v, _s['baseIcon'], '', f"pr|{_s['name']}|{v}") for v in PRINTS]),
            dict(_base, title='프린팅 색', ui='swg', note='· 안 고르면 옷 색에 맞춰요', cond={'t': '프린팅', 'not': ''},
                 options=[_O(c) for c in PRINT_COLORS])]
# 아가일(11/27 은재 님 "짜임 아가일 두 개는 너무 이상한데", "아가일을 선택하면 거기서 몸통 같은 거 세세하게",
# "꽈배기도 골지는 보통 몸통만 있는 경우가 거의 없어서").
# - 니트·카디건·베스트: 무늬 '아가일' 하나로 합친다. 짜임의 '아가일'(선만 긋던 것)은 뺀다(앱이 예전 짜임 아가일을 무늬 아가일로 보여 줌).
# - 무늬에서 아가일을 고르면 바로 아래에 '무늬 모양'(화면 이름 '아가일 모양' — 정석 · 큰 아가일 · 가슴 띠 · 세로 띠) ·
#   '아가일 색' · '팔'(팔까지 · 몸통만)이 나온다. 그림은 sleeves/argyle_build.py가 핏별로 그린 source/argyle_b.json.
# - 짜임(골지 · 꽈배기 · 노르딕)은 늘 팔까지 그린다 → 짜임 아래 '팔' 칸은 없앤다('팔' 칸은 아가일 아래로 옮김).
ARGYLE = J('argyle_b.json') if os.path.exists(os.path.join(SRC, 'argyle_b.json')) else {}
ARGYLE_SHAPES = ('정석', '큰 아가일', '가슴 띠', '세로 띠')
ARM_LABEL = {'같이': '팔까지', '무지': '몸통만'}
ARGYLE_COLORS = ('아이보리', '화이트', '베이지', '그레이', '차콜', '블랙', '브라운', '네이비', '레드', '와인', '그린', '카키', '스카이블루', '핑크', '옐로우')
for _s in SPECS:
    _shapes = [sh for sh in ARGYLE_SHAPES if any(k.startswith(f"ag|{_s['name']}|{sh}|") for k in ARGYLE)]
    _groups = _s['groups']
    for _g in _groups:
        if _g.get('weave') and _g['title'] == '짜임':
            _g['options'] = [o for o in _g['options'] if o['v'] != '아가일'] if _shapes else _g['options']
    if not _shapes:
        continue
    _arm = next((g for g in _groups if g['title'] == '팔'), None)
    if _arm is not None:
        _groups.remove(_arm)
    _i = next(i for i, g in enumerate(_groups) if g['title'] == '무늬') + 1
    _mg = _groups[_i - 1]
    _base = dict(_mg, options=[], cond=None, note='', multi=False, role='', weave='', nooverlay=False, noswap=True)
    _new = [dict(_base, title='무늬 모양', label='아가일 모양', ui='grid', note='', cond={'t': '무늬', 'in': ['아가일']},
                 options=[dict(_O(sh, _s['baseIcon'], '', '', f"ag|{_s['name']}|{sh}"), new=False) for sh in _shapes]),
            dict(_base, title='아가일 색', ui='swg', note='· 마름모 색 · 안 고르면 옷 색에 맞춰요', cond={'t': '무늬', 'in': ['아가일']},
                 options=[_O(c) for c in ARGYLE_COLORS])]
    if _arm is not None:
        _arms = [sh for sh in _shapes if sh != '세로 띠']   # 세로 띠는 앞판에만 있어서 팔 칸이 없다
        _new.append(dict(_arm, cond={'t': '무늬 모양', 'in': _arms}, inDetails=_mg['inDetails'], note='· 아가일을 팔에도 넣을까요?',
                         options=[dict(o, label=ARM_LABEL.get(o['v'], o['v'])) for o in _arm['options']]))
    _mg['note'] = '· 체크 · 스트라이프 · 아가일은 고르면 모양 보기가 나와요'
    _groups[_i:_i] = _new
    print(f"아가일: {_s['name']}({_s['slot']}) 모양 {len(_shapes)} · 팔 {'있음' if _arm else '없음'}")
# 아가일을 무늬로 옮긴 종류(니트 kn · 카디건 cd)의 짜임 아가일 결과 '몸통만'(…|무지) 결은 이제 안 쓴다.
WEAVES = {k: v for k, v in WEAVES.items() if not re.match(r'(kn|cd)\|(아가일\||[^|]+\|무지)', k)}
# 하프넥 고치기 · 하프집업 목(11/27 은재 님 "하이넥인데 지퍼 가슴까지만 내려오는 디자인", "목 모양 고르는 데에는 다 넣어 주세요",
# "핵심은 카라와는 다르게 지퍼가 열려서 자연스럽게 퍼진 거", "하프넥 넥이 밑으로 꺼져 있음").
# 그림은 sleeves/halfzip_build.py: 하프넥은 같은 id를 고친 그림으로 덮고, 하프집업은 하프넥 그림 id + 'z'.
# 목 모양 칸마다 '하프집업'을 하프넥 다음에 넣는다.
# - 반소매티 · 긴소매티 · 니트: 하프집업 그림, 조합(하프넥|크롭 …)도 같이.
# - 맨투맨: 목 모양 칩이 그림을 안 바꾸는 칸이지만 하프집업만 그림을 바꾼다(기장 기본 · 크롭 조합).
# - 셔츠 · 블라우스 · 카디건 · 원피스 · 점프수트: 다른 목 모양처럼 칩만(그림은 그대로).
_HZ = J('halfzip_b.json') if os.path.exists(os.path.join(SRC, 'halfzip_b.json')) else {'neck': {}, 'zip': {}}
ICONS.update(_HZ['neck'])
HALFZIP = _HZ['zip']
ICONS.update(HALFZIP)
HALFZIP_GRAFT = {'맨투맨': {'기본': 'i95z', '크롭': 'i96z'}}
for _s in SPECS:
    for _g in _s['groups']:
        if _g['title'] not in ('목 모양', '목 모양 · 카라') or any(o['v'] == '하프집업' for o in _g['options']):
            continue
        _opts = _g['options']
        _half = next((o for o in _opts if o['v'] == '하프넥'), None)
        _icon = ''
        if _half is not None and _half['icon'] and _half['icon'] + 'z' in HALFZIP:
            _icon = _half['icon'] + 'z'
        elif _s['name'] in HALFZIP_GRAFT:
            _icon = HALFZIP_GRAFT[_s['name']]['기본']
        _new = dict(_O('하프집업', _icon), new=False)
        _opts.insert(_opts.index(_half) + 1 if _half is not None else len(_opts), _new)
        for _c in _s.get('combos', []):
            if _g['title'] not in _c['keys'] or _c['keys'][0] != _g['title']:
                continue
            for _k, _v in list(_c['map'].items()):
                if _k.startswith('하프넥|') and _v + 'z' in HALFZIP:
                    _c['map']['하프집업|' + _k.split('|', 1)[1]] = _v + 'z'
        if _s['name'] in HALFZIP_GRAFT:
            _s.setdefault('combos', []).append({'keys': [_g['title'], '기장'],
                                                'map': {f'하프집업|{k}': v for k, v in HALFZIP_GRAFT[_s['name']].items()}})
        print(f"하프집업: {_s['name']}({_s['slot']}) {_g['title']} {'그림 ' + _icon if _icon else '칩만'}")
# 크롭 그림(11/27 은재 님 "후드집업 크롭 있어야죠", "여기 전부 크롭이 있어야 돼요",
# "크롭 같은 건 안에 들어가서 설정하고 디자인이 바뀌어서 저장되어야 하는 것"). 기장 '크롭'이 칩만 있던 상의도 그림이 바뀐다.
# 그림은 sleeves/crop_build.py가 만든 source/crop_b.json(원래 그림 id + 'c', 핏별 'i100c@슬림' …).
# - 후드 · 트레이닝 상의 · 카디건 · 후드집업: 기장 '크롭' 보기에 크롭 그림.
# - 베스트: 기장 칸이 없어서 후드의 기장 칸(기본 · 크롭)을 핏 다음에 넣는다(서버 '기장'은 종류 상관없이 받음).
# - 셔츠 · 블라우스: '크롭' 보기(카라 안 고름) + 카라 × 기장 × 디테일 조합(카라 7개 × 허리 끈 있음/없음).
# - 슬리브리스: 어깨 × 기장 조합에 '민소매|크롭'(끈 · 끈 없음 크롭은 원래 있음).
CROP = J('crop_b.json') if os.path.exists(os.path.join(SRC, 'crop_b.json')) else {}
ICONS.update(CROP)
if CROP:
    # 그림을 달기 전에 복사해 둔다(후드 칸에 후드 크롭 그림을 단 뒤 복사하면 베스트 크롭이 후드 그림이 됨)
    _len = json.loads(json.dumps(next(g for g in next(s for s in SPECS if s['name'] == '후드')['groups'] if g['title'] == '기장')))
    for _s in SPECS:
        _gs = {g['title']: g for g in _s['groups']}
        if _s['name'] == '베스트' and '기장' not in _gs and _s['baseIcon'] + 'c' in CROP:
            _g = json.loads(json.dumps(_len))
            _s['groups'].insert(_s['groups'].index(_gs['핏']) + 1 if '핏' in _gs else len(_s['groups']), _g)
            _gs['기장'] = _g
        _crop = next((o for o in _gs.get('기장', {'options': []})['options'] if o['v'] == '크롭'), None)
        if _crop is None:
            continue
        _made = []
        if not _crop['icon'] and _s['baseIcon'] + 'c' in CROP:
            _crop['icon'] = _s['baseIcon'] + 'c'
            _crop['new'] = False
            _made.append(_crop['icon'])
        for _c in list(_s.get('combos', [])):
            if '기장' in _c['keys'] and len(_c['keys']) == 2:
                _other = _c['keys'][1 - _c['keys'].index('기장')]
                for _o in _gs.get(_other, {'options': []})['options']:
                    _k = f"{_o['v']}|크롭" if _c['keys'][0] == _other else f"크롭|{_o['v']}"
                    if _o['icon'] and _k not in _c['map'] and _o['icon'] + 'c' in CROP:
                        _c['map'][_k] = _o['icon'] + 'c'
                        _made.append(_k)
            elif _c['keys'] == ['카라', '디테일']:
                _m = {}
                for _k, _v in _c['map'].items():
                    _a, _b = _k.split('|', 1)
                    if _v + 'c' in CROP:
                        _m[f'{_a}|크롭|{_b}'] = _v + 'c'
                if _m:
                    _s['combos'].append({'keys': ['카라', '기장', '디테일'], 'map': _m})
                    _made.append(f'카라 × 크롭 {len(_m)}')
        if _made:
            print(f"크롭: {_s['name']}({_s['slot']}) {' · '.join(_made)}")
# 모자·벨트: 시안에 화면이 없어서 니트 화면의 색 · 소재 · 무늬 · 계절 칸을 빌려 만든다(처음 값은 비움). 그림 id는 x_ + 종류.
_knit = next(s for s in SPECS if s['name'] == '니트')


def _borrow(title, note=None):
    g = json.loads(json.dumps(next(x for x in _knit['groups'] if x['title'] == title)))
    for o in g['options']:
        o['on'] = o['def'] if title == '무늬' else False
    if title == '무늬':   # 모자 · 벨트의 아가일은 모양 보기가 없다(니트 화면 안내는 아가일 모양까지 말함)
        g['note'] = '· 체크 · 스트라이프는 고르면 모양 보기가 나와요'
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

# 11/27 은재 님: 신발·가방 소재는 옷 기준 문구가 안 맞는다.
# - '면'은 신발·가방에서 '천'으로 보이게(저장 값은 '면' 그대로 — 서버·판정 값은 안 바뀜).
# - 신발·가방은 소재를 골라도 그림이 안 바뀌어서 '데님 · 니트 · 퍼는 그림이 바뀌어요' 안내를 뺀다.
# - 누르면 나오는 소재 설명도 부위용으로('신발|면'처럼 부위를 앞에 붙인 열쇠, 앱이 먼저 찾고 없으면 공통 설명).
SLOT_MDESC = {
    '신발': {
        '가죽': '매끈한 가죽 신발 · 인조 가죽 포함',
        '스웨이드': '겉이 보들보들한 무광 가죽 · 어그 · 스웨이드 로퍼',
        '면': '캔버스 운동화처럼 천으로 된 신발',
        '퍼': '털이 달리거나 안에 털이 든 신발 · 털 슬리퍼',
    },
    '가방': {
        '가죽': '매끈한 가죽 가방 · 인조 가죽 포함',
        '스웨이드': '겉이 보들보들한 무광 가죽 가방',
        '면': '에코백처럼 천(캔버스)으로 된 가방',
        '니트': '실로 짜거나 뜨개질한 가방',
        '퍼': '털로 덮인 가방 · 퍼 백',
    },
}
for s in SPECS:
    if s['slot'] not in SLOT_MDESC:
        continue
    for g in s['groups']:
        if g['title'] != '소재':
            continue
        g['note'] = ''
        for o in g['options']:
            if o['v'] == '면':
                o['label'] = '천'
for slot, notes in SLOT_MDESC.items():
    MDESC.update({f'{slot}|{k}': v for k, v in notes.items()})

# 11/27: 계절을 안 고르면 '사계절'이 아니라 옷 종류 기온표로 판단한다(코디 탭 '추울 수도·더울 수도'). 안내를 실제 동작에 맞춘다.
for s in SPECS:
    for g in s['groups']:
        if g['title'] == '계절':
            g['note'] = '여러 개 골라도 돼요 · 안 고르면 옷 종류에 맞춰 골라요'

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
    a, b = bbox(ORIG_ICONS[mock['baseIcon']]), bbox(V12[v])
    return (b[3] - b[1]) / (a[3] - a[1])


# 옷 크기 맞추기(11/27 은재 님 "베스트만 너무 큰 거 같은데 옷 크기 전부 맞춰 주겠어?"): v12 그림 높이를 따르다 보니
# 소매 없는 베스트는 몸판이 다른 상의보다 10%쯤 컸다. 종류마다 칸 가운데(CENTER)를 기준으로 줄이는 배율 —
# 시안 그림(place) · 첫 화면 그림(icons_v13) · 핏별 그림(v12:종류@핏)에 같이 씌운다.
# 분홍 기준선(반소매티 위 · 아래, 11/27 시트 size_cmp)에 맞춘 값. 롱코트 · 롱패딩 · 트렌치처럼 원래 긴 옷은 그대로.
SIZE_FIX = {'베스트': 0.89, '민소매': 0.92, '트레이닝상의': 0.94, '후드집업': 0.95,
            '점퍼': 0.92, '레더재킷': 0.94, '무스탕': 0.94, '퍼자켓': 0.92}


def fix_t(t, f):
    """그림 transform [x, y, 배율]에 칸 가운데 기준 f배를 더 씌운 것."""
    t = t or [0, 0, 1]
    return [r(CENTER[0] * (1 - f) + f * t[0]), r(CENTER[1] * (1 - f) + f * t[1]), r(f * t[2])]


def place_for(kind, base_id):
    """그 종류 그림 전체에 씌울 [x 이동, y 이동, 배율]: 기본 그림을 배율만큼 키우고 칸 가운데로."""
    if base_id.startswith('x_'):
        return [0, 0, 1]   # 모자·벨트는 처음부터 v12 크기로 그렸다
    s = scale_for(kind)
    a = bbox(ORIG_ICONS[base_id])
    cx, cy = (a[0] + a[2]) / 2, (a[1] + a[3]) / 2
    p = [r(CENTER[0] - cx * s), r(CENTER[1] - cy * s), r(s)]
    return fix_t(p, SIZE_FIX[kind]) if kind in SIZE_FIX else p


# ── 경로 표: 같은 선을 한 번만 적는다(그림 399개의 선 11,623개 중 서로 다른 건 2천여 개) ──
paths, pidx = [], {}


def P(d):
    if d not in pidx:
        pidx[d] = len(paths)
        paths.append(d)
    return pidx[d]


LAYERS = ('shapes', 'shade', 'details', 'seams', 'tops', 'inner', 'lining', 'metals', 'tex', 'plain', 'straps', 'chains', 'weave', 'ribs', 'zips')
# B안 핏별 그림 중 지금 앱 기본 그림(v12)의 슬림·오버사이즈: 첫 화면 묶음(kindIcons.ts)이 커지지 않게 여기(wardrobeArt)에
# 'v12:종류@핏'으로 넣는다(wardrobeLook.ts lookFor가 핏을 보고 고른다).
FITS_B = os.path.join(ROOT, 'design/kind-icons/fits_b.json')
V12_BASE_B = {}   # 기본 그림(레귤러)까지 바뀐 v12 종류(11/23 반소매티: 세모 소매 → 긴팔 같은 팔) → icons_v13에서 바꿔 넣는다
if os.path.exists(FITS_B):
    for _kind, _fits in json.load(open(FITS_B, encoding='utf-8')).items():
        for _fit, _ic in _fits.items():
            if _fit == '기본':
                V12_BASE_B[_kind] = _ic
                continue
            if _kind in SIZE_FIX:
                _ic = dict(_ic, transform=fix_t(_ic.get('transform'), SIZE_FIX[_kind]))
            ICONS[f'v12:{_kind}@{_fit}'] = _ic
used = set()
for s in SPECS:
    used.add(s['baseIcon'])
    if s['name'] in DRESS_B:
        used.add(DRESS_B[s['name']]['base'])
    for g in s['groups']:
        used |= {o['icon'] for o in g['options'] if o['icon']}
    for c in s.get('combos', []):
        used |= set(c['map'].values())
FIT_NAMES = ('슬림', '오버사이즈')
fit_ids = [f'{i}@{f}' for i in sorted(used) for f in FIT_NAMES if f'{i}@{f}' in ICONS] + sorted(k for k in ICONS if k.startswith('v12:'))
icons_out = {}
for iid in sorted(used, key=lambda x: (x.startswith('x_'), int(x[1:]) if x[1:].isdigit() else 0, x)) + fit_ids:
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
argyles_out = {k: dict({'f': [P(d) for d in v['f']], 'l': [P(d) for d in v['l']]}, **({'s': 1} if v.get('s') else {}))
               for k, v in ARGYLE.items()}


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
    if o.get('iconPr'):
        x['pr'] = o['iconPr']
    if o.get('iconAg'):
        x['ag'] = o['iconAg']
    if o.get('hide'):
        x['hide'] = True
    return x['v'] if list(x) == ['v'] else x


# 니트는 실 종류가 아니라 천을 뜨는 방식이다(11/27 은재 님 "니트에 니트랑 울 캐시미어가 맞나").
# - 니트·카디건: 소재 칸에서 '니트' 칩을 숨기고(늘 켜져 있어 저장할 때 알아서 들어감 — 날씨의 따뜻한 소재 판단 그대로)
#   실 종류(울 · 캐시미어 · 면 …)만 고르게 한다.
# - 다른 종류(니트 원피스 · 니트 스커트 등): '니트(뜨개)'로 보여 줘서 실이 아니라 짜는 방식임을 알린다.
KNIT_KINDS = ('니트', '카디건')
for _s in SPECS:
    for _g in _s['groups']:
        if _g['title'] != '소재':
            continue
        for _o in _g['options']:
            if _o['v'] != '니트':
                continue
            if _s['name'] in KNIT_KINDS and _o['def']:
                _o['hide'] = True
            else:
                _o['label'] = '니트(뜨개)'
        if _s['name'] in KNIT_KINDS:
            _g['note'] = '· 실 종류를 골라요 · 안 고르면 그냥 니트'
MDESC = dict(MDESC, 니트='실을 떠서 만든 잘 늘어나는 천(짜는 방식) — 스웨터 · 카디건 · 니트 원피스. 실 종류(울 · 캐시미어 · 면)랑 같이 골라도 돼요')


# 시안을 검토할 때 붙인 설명(만든 사람용)은 앱 화면에서 뺀다.
DEV_NOTES = {'천이 아니라 꾸밈이라 소재에서 여기로 옮겼어요', '그림은 니트와 같은 방식', '그림은 하나로', '상의와 같은 보기',
             '조거팬츠는 여기 "조거"로', '핏 대신 길이', '핏 대신 두께', '크롭이면 "브라탑"으로 보여 줘요'}


def clean_note(note):
    parts = [p.strip() for p in note.split('·') if p.strip()]
    return ' · '.join(p for p in parts if p not in DEV_NOTES)


def group(g):
    x = {'title': g['title'], 'ui': g['ui']}
    if g.get('label'):
        x['label'] = g['label']
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
    if g.get('print'):
        x['print'] = g['print']
    if g.get('tint'):
        x['tint'] = True
    x['options'] = [opt(o) for o in g['options']]
    return x


specs_out = []
for s in SPECS:
    kind = SERVER_KIND.get(s['name'], s['name'])
    # 배율(place)은 원래 기본 그림으로 계산하고, 그리는 기본 그림만 새 것으로(원피스)
    x = {'slot': s['slot'], 'kind': kind, 'name': s['name'], 'base': DRESS_B.get(s['name'], {}).get('base', s['baseIcon']),
         'place': place_for(kind, s['baseIcon']), 'groups': [group(g) for g in s['groups']]}
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
      '// 옷 추가 시안(11/15) 그림 399개·짜임 결 19개·아가일(니트·카디건·베스트)·종류 61개의 고르는 칸. 크기가 커서 옷 추가 ②·옷장에 들어갈 때만 불러온다',
      '// (data/wardrobeLook.ts의 loadWardrobeArt). 그림의 선은 paths 표의 번호로 적었다.',
      "import type { PackedArt } from './wardrobeLook';", '',
      'export const ART: PackedArt = {',
      f'  paths: {D(paths)},',
      f'  icons: {D(icons_out)},',
      f'  weaves: {D(weaves_out)},',
      f'  argyles: {D(argyles_out)},',
      f'  specs: {D(specs_out)},',
      f'  materialNotes: {D(MDESC)},',
      '};', '']
out = os.path.join(ROOT, 'mobile/src/data/wardrobeArt.ts')
open(out, 'w', encoding='utf-8').write('\n'.join(ts))

# ── 옷 종류 그림 v13: v12 48종 + 새 종류 기본 그림(크기 맞춤) ──
v13 = dict(V12)
v13.update(V12_BASE_B)
for kind, f in SIZE_FIX.items():
    if kind in v13 and kind not in NEW_LIKE:
        v13[kind] = dict(v13[kind], transform=fix_t(v13[kind].get('transform'), f))
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
