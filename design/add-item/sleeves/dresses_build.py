"""원피스·점프수트 앱 그림 만들기(11/23 오후 시안 5 "이대로 ㄱㄱ").

사용(이 폴더에서, sleeves_b.py를 돌린 다음에):  python3 dresses_build.py
그 다음: cd .. && python3 gen_add_item.py → cd ../kind-icons && python3 gen_ts.py icons_v13.json ../../mobile/src/data/kindIcons.ts

만드는 것
- source/icons_b.json에 원피스 그림을 더한다(시안 좌표, 앱이 종류 배율 place를 씌움):
    'dr_<종류>_<소매>[_<목>][_tie]' (레귤러) + '@슬림' · '@오버사이즈'
    종류 mini·midi·long·jump, 소매 st(끈)·nl(민소매)·ss(반팔)·ls(긴팔), 목 rd·v·sq·off·sc(셔츠 카라)·rc(라운드 카라).
    끈은 목 모양이 없어 목 코드를 안 붙인다.
- design/kind-icons/fits_b.json에 종류마다 '기본'(아무것도 안 고른 그림, 앱 첫 화면 kindIcons) · 슬림 · 오버사이즈(v12 좌표).
- source/dress_b.json: 고르는 칸 → 그림(gen_add_item.py가 specs에 넣는다)
    base   아무것도 안 골랐을 때 그림 id
    combos [{keys: ['소매', '목 모양 · 카라', '디테일'], map: {'반팔|V넥|허리 끈': id, …}}] — 안 고른 칸은 ''
    icons  소매 그림 칸에 보이는 그림(그 종류 기본 목 모양)
    on     처음에 골라져 있는 보기(목 모양: 미니·미디 라운드, 롱·점프수트 V넥 — 지금 그림의 목)
아무것도 안 고른 칸은 그 종류 지금 그림의 모양(dresses.DEFAULT_SLEEVE·DEFAULT_NECK)."""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
import dresses as D  # noqa: E402
import sleeves_b as SB  # noqa: E402

CODE_K = {'미니원피스': 'mini', '미디원피스': 'midi', '롱원피스': 'long', '점프수트': 'jump'}
CODE_S = {'끈': 'st', '민소매': 'nl', '반팔': 'ss', '긴팔': 'ls'}
CODE_N = {'라운드': 'rd', 'V넥': 'v', '스퀘어넥': 'sq', '오프숄더': 'off', '셔츠 카라': 'sc', '라운드 카라': 'rc'}
TIE = '허리 끈'
KEYS = ['소매', '목 모양 · 카라', '디테일']
OUT_DRESS = os.path.join(SB.SRC, 'dress_b.json')


def icon_id(kind, sleeve, neck, tie):
    n = '' if sleeve == '끈' else '_' + CODE_N[neck]
    return f'dr_{CODE_K[kind]}_{CODE_S[sleeve]}{n}' + ('_tie' if tie else '')


def to_mock(v, kind):
    """v12 좌표 그림 → 시안 좌표(앱이 spec.place를 씌우면 v12 자리로)."""
    back = SB.affine(v, SB.inv(D.PL[kind], None))
    back.pop('transform', None)
    return back


def main():
    t0 = time.time()
    icons = json.load(open(SB.OUT_ICONS, encoding='utf-8'))
    fits = json.load(open(SB.OUT_V12FITS, encoding='utf-8'))
    dress = {}
    n = 0
    for kind in D.KINDS:
        for sleeve in D.SLEEVES:
            for neck in (D.NECKS if sleeve != '끈' else (D.DEFAULT_NECK[kind],)):
                for tie in (False, True):
                    iid = icon_id(kind, sleeve, neck, tie)
                    for fit in (None,) + SB.FITS:
                        icons[SB.fit_key(iid, fit)] = to_mock(D.dress_icon(kind, sleeve, neck, fit, tie), kind)
                        n += 1
        fits[kind] = {'기본': D.dress_icon(kind)}
        for fit in SB.FITS:
            fits[kind][fit] = D.dress_icon(kind, fit=fit)
        ds, dn = D.DEFAULT_SLEEVE[kind], D.DEFAULT_NECK[kind]
        cmap = {}
        for s in ('',) + D.SLEEVES:
            for nk in ('',) + D.NECKS:
                for t in ('', TIE):
                    cmap[f'{s}|{nk}|{t}'] = icon_id(kind, s or ds, nk or dn, t == TIE)
        dress[kind] = {'base': icon_id(kind, ds, dn, False),
                       'combos': [{'keys': KEYS, 'map': cmap}],
                       'icons': {'소매': {s: icon_id(kind, s, dn, False) for s in D.SLEEVES}},
                       # 처음에 골라져 있는 목 모양 = 그 종류 지금 그림의 목(롱·점프수트는 V넥, 시안은 다 라운드였음)
                       'on': {'목 모양 · 카라': dn}}
        print(f'{kind}: 그림 {n}개까지 · {time.time() - t0:.0f}초', flush=True)
    json.dump(icons, open(SB.OUT_ICONS, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(fits, open(SB.OUT_V12FITS, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(dress, open(OUT_DRESS, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'원피스 그림 {n}개 · fits_b {len(fits)}종 · {OUT_DRESS}')


if __name__ == '__main__':
    main()
