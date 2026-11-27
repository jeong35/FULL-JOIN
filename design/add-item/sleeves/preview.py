"""그림 미리보기: KindIcon.tsx와 같은 순서·굵기로 SVG를 만들고, 표(HTML)를 PNG로 찍는다(작업용)."""
import html
import itertools
import os

INK = '#2E292F'
OUTLINE_WIDTH, TOP_WIDTH, DETAIL_WIDTH, LINING_WIDTH, SEAM_WIDTH = 1.1, 0.95, 0.8, 0.85, 1
SHADOW = 'rgba(46,36,58,0.13)'
LINING = '#EADBC6'
GOLD = ('#8A6D2B', '#E3C770')
_uid = itertools.count()


def lum(h):
    h = h.lstrip('#')
    r, g, b = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def mix(a, b, t):
    a, b = a.lstrip('#'), b.lstrip('#')
    return '#' + ''.join('%02x' % round(int(a[i:i + 2], 16) * (1 - t) + int(b[i:i + 2], 16) * t) for i in (0, 2, 4))


def tones(base):
    dark = lum(base) < 0.3
    return dict(outline=mix(base, INK, 0.82), top=mix(base, '#FFFFFF', 0.42) if dark else mix(base, INK, 0.7),
                detail=mix(base, '#FFFFFF', 0.46) if dark else mix(base, INK, 0.64),
                inner=mix(base, '#000000', 0.4) if dark else mix(base, INK, 0.24), shade=mix(base, INK, 0.6))


def svg(ic, place=None, color='#D7C5AA', overlay=None, size=160, guide=None):
    """ic: 층 사전(shapes·shade·details·seams·tops·inner·lining·metals·tex·plain·dots·weave·transform).
    place: 종류 배율 [x, y, s]. overlay: 짜임 결 선 목록. guide: 그림 위에 덧그릴 빨간 선(점 목록) 목록(v12 좌표)."""
    u = next(_uid)
    t = tones(color)
    g = lambda k: ic.get(k) or []
    P = lambda d, a: f'<path d="{d}" {a}/>'
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 64 64">',
         f'<defs><linearGradient id="s{u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{t["shade"]}" stop-opacity="0"/>'
         f'<stop offset="0.5" stop-color="{t["shade"]}" stop-opacity="0.17"/></linearGradient>'
         f'<clipPath id="c{u}">' + ''.join(P(d, 'clip-rule="evenodd"') for d in g('shapes') + g('tops')) + '</clipPath></defs>']
    if place:
        o.append(f'<g transform="translate({place[0]} {place[1]}) scale({place[2]})">')
    tr = ic.get('transform')
    o.append(f'<g transform="translate({tr[0]} {tr[1]}) scale({tr[2]})">' if tr else '<g>')
    o.append('<g transform="translate(0.9 1.3)">' + ''.join(P(d, f'fill="{SHADOW}" fill-rule="evenodd"') for d in g('shapes')) + '</g>')
    o += [P(d, f'fill="{color}" fill-rule="evenodd" stroke="{t["outline"]}" stroke-width="{OUTLINE_WIDTH}" stroke-linejoin="round"') for d in g('shapes')]
    ln = lambda c, w, op=1: f'fill="none" stroke="{c}" stroke-width="{w}" stroke-opacity="{op}" stroke-linecap="round" stroke-linejoin="round"'
    o.append(f'<g clip-path="url(#c{u})">' + ''.join(P(d, f'fill="url(#s{u})"') for d in g('shade'))
             + ''.join(P(d, ln(t['detail'], DETAIL_WIDTH)) for d in g('weave'))
             + ''.join(P(d, ln(t['detail'], DETAIL_WIDTH)) for d in (overlay or [])) + '</g>')
    o += [P(d, f'fill="{color}"') for d in g('plain')]
    o += [P(d, f'fill="{t["inner"]}"') for d in g('inner')]
    o += [P(d, f'fill="{LINING}" stroke="{t["top"]}" stroke-width="{LINING_WIDTH}" stroke-linejoin="round"') for d in g('lining')]
    o += [P(d, f'fill="{color}" stroke="{t["top"]}" stroke-width="{TOP_WIDTH}" stroke-linejoin="round"') for d in g('tops')]
    o.append(f'<g clip-path="url(#c{u})">' + ''.join(P(d, ln(t['detail'], 0.6, 0.72)) for d in g('tex'))
             + ''.join(P(d, ln(t['detail'], DETAIL_WIDTH)) for d in g('details'))
             + ''.join(P(d, f'fill="none" stroke="{t["detail"]}" stroke-width="0.5" stroke-dasharray="0.32 0.3" stroke-linecap="round"') for d in g('zips'))
             + '</g>')
    o.append(f'<g clip-path="url(#c{u})">' + ''.join(P(d, ln(t['top'], SEAM_WIDTH)) for d in g('seams')) + '</g>')
    for d in g('metals'):
        o += [P(d, ln(GOLD[0], 1.9)), P(d, ln(GOLD[1], 0.95))]
    o += [f'<circle cx="{x}" cy="{y}" r="{r}" fill="{t["detail"]}"/>' for x, y, r in g('dots')]
    o.append('</g>')
    if place:
        o.append('</g>')
    for pts in guide or []:
        o.append('<polyline points="' + ' '.join(f'{x:.2f},{y:.2f}' for x, y in pts) + '" fill="none" stroke="#E0457B" stroke-width="0.35" stroke-opacity="0.85"/>')
    o.append('</svg>')
    return ''.join(o)


def sheet(title, rows, path_html, cols_title=None, size=160):
    """rows: [(줄 이름, [(칸 이름, svg문자열), ...]), ...] → HTML."""
    css = ('body{margin:0;padding:24px;background:#fff;font-family:"Noto Sans KR",sans-serif;color:#1F1C26}'
           'h1{font-size:20px;margin:0 0 6px}p.sub{margin:0 0 18px;color:#605C6B;font-size:13px}'
           '.row{display:flex;gap:10px;align-items:flex-start;margin-bottom:14px}.rn{width:120px;font-size:13px;font-weight:700;padding-top:8px}'
           '.cell{background:#F6F5FA;border-radius:10px;padding:6px;text-align:center;font-size:11px;color:#605C6B}'
           '.cell div{margin-top:2px;max-width:%dpx}' % size)
    body = [f'<h1>{html.escape(title)}</h1>']
    if cols_title:
        body.append(f'<p class="sub">{html.escape(cols_title)}</p>')
    for rn, cells in rows:
        body.append(f'<div class="row"><div class="rn">{html.escape(rn)}</div>' + ''.join(
            f'<div class="cell">{s}<div>{html.escape(cn)}</div></div>' for cn, s in cells) + '</div>')
    open(path_html, 'w', encoding='utf-8').write(f'<!doctype html><meta charset="utf-8"><style>{css}</style>' + ''.join(body))


def shoot(path_html, path_png, width=1400, scale=1):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': width, 'height': 800}, device_scale_factor=scale)
        pg.goto('file://' + os.path.abspath(path_html))
        pg.wait_for_timeout(300)
        pg.screenshot(path=path_png, full_page=True)
        b.close()
