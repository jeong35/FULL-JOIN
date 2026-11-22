// 옷 추가 시안(11/15)의 '고른 대로 그림 바꾸기'를 앱으로 옮긴 것.
// - 시안 그림·짜임 결·종류별 고르는 칸은 data/wardrobeArt.ts(자동 생성, 800KB)에 있고, 옷 추가 ②·옷장에 들어갈 때만 불러온다.
// - 고른 값(색·핏·목 모양·기장·소재·무늬 …)에서 그림 하나를 고르는 규칙은 시안의 pickIcon · curOv · effPat과 같다.
// - 11/19 A안: 아무 모양도 안 고른 옷은 지금 앱 그림(kindIcons.ts v12)으로, 모양을 고르면 시안 그림으로 그린다.
//   시안 그림은 종류마다 v12 높이에 맞춘 배율(place)을 씌운다. BASE_FROM_V12를 false로 두면 전부 시안 그림으로 그린다.
import { useEffect, useState } from 'react';

import { KIND_ICONS, type KindIconLayers } from './kindIcons';
import { PATTERN_SHAPES, type Color, type Kind, type Material, type Pattern, type Slot, type VisualFit, type WardrobeDetails } from './catalog';
import type { Season, WardrobeItem } from './types';

export const BASE_FROM_V12 = true;

// ── 생성 파일 모양 ──────────────────────────────────

export type AddItemOption = {
  v: string;
  label?: string;
  icon?: string;
  def?: true;
  on?: true;
  new?: true;
  ov?: string;
};

export type AddItemGroup = {
  title: string;
  note?: string;
  /** swg 색 칩 · seg 핏 글자 칸 · grid 그림 칸 · chips 글자 칩 */
  ui: 'swg' | 'seg' | 'grid' | 'chips';
  role?: 'color' | 'fit' | 'mat';
  multi?: true;
  /** 바꿀 수 없는 칸(데님팬츠 소재 = 데님 등) */
  fixed?: true;
  /** 골라도 옷장 그림을 안 바꾸는 칸 */
  noswap?: true;
  /** 그림 칸에 짜임 결을 안 덮는 칸(짜임 칸 자신) */
  nooverlay?: true;
  /** 짜임 칸이면 결 이름 앞부분(kn 니트 · cd 카디건) */
  weave?: string;
  /** '더 자세히'에 들어가는 칸 */
  more?: true;
  /** 다른 칸 값이 not이 아닐 때만 보인다(짜임이 민자가 아닐 때 '팔') */
  cond?: { t: string; not: string };
  options: (string | AddItemOption)[];
};

export type AddItemSpec = {
  slot: Slot;
  kind: Kind;
  /** 시안 화면 이름(반소매티 · 트레이닝 하의 …) */
  name: string;
  base: string;
  /** 이 종류의 시안 그림 전체에 씌우는 [x 이동, y 이동, 배율] — v12 크기에 맞춤 */
  place: [number, number, number];
  groups: AddItemGroup[];
  combos?: { keys: string[]; map: Record<string, string> }[];
  /** 소재 '퍼'일 때 덮는 털 결. t가 있으면 그 칸 값으로 map에서 고른다. */
  furov?: { key?: string; t?: string; map?: Record<string, string> };
};

type LayerName = 'shapes' | 'shade' | 'details' | 'seams' | 'tops' | 'inner' | 'lining' | 'metals' | 'tex' | 'plain' | 'straps' | 'chains';
type PackedIcon = Partial<Record<LayerName, number[]>> & {
  dots?: [number, number, number][];
  transform?: [number, number, number];
  sheer?: number | boolean;
};

export type PackedArt = {
  paths: string[];
  icons: Record<string, PackedIcon>;
  weaves: Record<string, number[] | { t: number[] }>;
  specs: AddItemSpec[];
  materialNotes: Record<string, string>;
};

// ── 풀어 놓은 그림 ─────────────────────────────────

export type ArtIcon = KindIconLayers & {
  /** 천 결(코듀로이 골 · 트위드 등): 옅은 안쪽 선 */
  tex?: string[];
  /** 비치는 천: 옷 면을 이만큼만 칠한다 */
  sheer?: number;
};

/** 짜임·털 결. soft면 털처럼 가늘고 옅게 긋는다. */
export type Overlay = { lines: string[]; soft: boolean };

export type WardrobeArt = {
  icons: Record<string, ArtIcon>;
  weaves: Record<string, Overlay>;
  specs: readonly AddItemSpec[];
  materialNotes: Record<string, string>;
};

function unpack(packed: PackedArt): WardrobeArt {
  const P = (ids: number[] | undefined) => (ids ?? []).map((i) => packed.paths[i]);
  const icons: Record<string, ArtIcon> = {};
  for (const [id, ic] of Object.entries(packed.icons)) {
    icons[id] = {
      shapes: P(ic.shapes),
      details: P(ic.details),
      shade: P(ic.shade),
      inner: P(ic.inner),
      tops: P(ic.tops),
      dots: ic.dots ?? [],
      straps: P(ic.straps),
      plain: P(ic.plain),
      lining: P(ic.lining),
      seams: P(ic.seams),
      chains: P(ic.chains),
      metals: P(ic.metals),
      tex: P(ic.tex),
      transform: ic.transform,
      sheer: ic.sheer === undefined || ic.sheer === false ? undefined : ic.sheer === true ? 0.8 : ic.sheer,
    };
  }
  const weaves: Record<string, Overlay> = {};
  for (const [key, w] of Object.entries(packed.weaves)) {
    weaves[key] = Array.isArray(w) ? { lines: P(w), soft: false } : { lines: P(w.t), soft: true };
  }
  return { icons, weaves, specs: packed.specs, materialNotes: packed.materialNotes };
}

let cache: WardrobeArt | null = null;
let pending: Promise<WardrobeArt> | null = null;

export function loadWardrobeArt(): Promise<WardrobeArt> {
  if (cache) return Promise.resolve(cache);
  pending ??= import('./wardrobeArt').then(({ ART }) => {
    cache = unpack(ART);
    return cache;
  });
  return pending;
}

/** 시안 그림을 불러온다. 불러오기 전에는 null(그동안은 v12 그림으로 그린다). */
export function useWardrobeArt(): WardrobeArt | null {
  const [art, setArt] = useState<WardrobeArt | null>(cache);
  useEffect(() => {
    if (art) return;
    let alive = true;
    loadWardrobeArt().then(
      (loaded) => {
        if (alive) setArt(loaded);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [art]);
  return art;
}

// ── 고른 값 ─────────────────────────────────────────

/** 칸 제목 → 고른 값들. 색·핏도 같은 모양으로 담는다. 체크·스트라이프 세부 모양은 '무늬 모양' 칸. */
export type Selection = Readonly<Record<string, readonly string[]>>;

export const PATTERN_SHAPE_GROUP = '무늬 모양';

export function option(o: string | AddItemOption): AddItemOption {
  return typeof o === 'string' ? { v: o } : o;
}

export function specFor(art: WardrobeArt, slot: Slot, kind: Kind): AddItemSpec | undefined {
  return art.specs.find((s) => s.slot === slot && s.kind === kind) ?? art.specs.find((s) => s.kind === kind);
}

/** 서버 칸 이름. '목 모양 · 카라'는 목 모양 칸에 넣는다. */
export function detailKey(title: string): string {
  return title === '목 모양 · 카라' ? '목 모양' : title;
}

/** 서버의 visual_fit으로 가는 칸('핏'). 레깅스·부츠의 '길이', 스타킹의 '두께'는 details로 간다. */
export function isFitGroup(g: AddItemGroup): boolean {
  return g.role === 'fit' && g.title === '핏';
}

export function initialSelection(spec: AddItemSpec): Record<string, string[]> {
  const sel: Record<string, string[]> = {};
  for (const g of spec.groups) {
    const on = g.options.map(option).filter((o) => o.on).map((o) => o.v);
    if (on.length) sel[g.title] = on;
  }
  return sel;
}

/** 저장된 옷에서 고른 값을 되살린다. 서버에 없는 칸은 시안의 처음 값(안 고르면 라운드 등)으로 둔다. */
export function selectionFromItem(spec: AddItemSpec, item: WardrobeItem): Selection {
  const sel = initialSelection(spec);
  const details = (item.details ?? {}) as Record<string, string | string[] | undefined>;
  for (const g of spec.groups) {
    if (g.role === 'color') sel[g.title] = [item.color];
    else if (isFitGroup(g)) sel[g.title] = item.visual_fit ? [item.visual_fit] : [];
    else if (g.title === '소재') {
      if (item.material) sel[g.title] = [...item.material];
    } else if (g.title === '무늬') {
      if (item.pattern) sel[g.title] = [item.pattern];
    } else if (g.title === '계절') {
      if (item.seasons) sel[g.title] = [...item.seasons];
    } else {
      const v = details[detailKey(g.title)];
      if (v !== undefined) sel[g.title] = Array.isArray(v) ? v : [v];
    }
  }
  const shape = details[PATTERN_SHAPE_GROUP];
  if (typeof shape === 'string') sel[PATTERN_SHAPE_GROUP] = [shape];
  return sel;
}

/** 고른 값 → 서버에 보낼 칸들(material · pattern · seasons · details). touched에 든 칸과 처음 값과 다른 칸만 details에 담는다. */
export function wardrobeFields(
  spec: AddItemSpec,
  sel: Selection,
  touched: ReadonlySet<string>,
): { material: Material[]; pattern: Pattern | null; seasons: Season[]; details: WardrobeDetails } {
  const initial = initialSelection(spec);
  const details: Record<string, string | string[]> = {};
  let material: Material[] = [];
  let pattern: Pattern | null = null;
  let seasons: Season[] = [];
  for (const g of spec.groups) {
    const v = sel[g.title] ?? [];
    if (g.role === 'color' || isFitGroup(g)) continue;
    if (g.title === '소재') material = v as Material[];
    else if (g.title === '무늬') pattern = (v[0] as Pattern | undefined) ?? null;
    else if (g.title === '계절') seasons = v as Season[];
    else {
      if (!visible(g, sel)) continue;
      // '모르겠어요'(스타킹 두께 등)는 안 고른 것과 같다 — 서버에 보내지 않는다.
      if (v.includes('모르겠어요')) continue;
      const changed = (initial[g.title] ?? []).join('+') !== v.join('+');
      if (!v.length || !(changed || touched.has(g.title))) continue;
      details[detailKey(g.title)] = g.multi ? [...v] : v[0];
    }
  }
  if (pattern && pattern in PATTERN_SHAPES) {
    const shape = sel[PATTERN_SHAPE_GROUP]?.[0] ?? PATTERN_SHAPES[pattern as keyof typeof PATTERN_SHAPES][0];
    details[PATTERN_SHAPE_GROUP] = shape;
  }
  if (pattern === '무지') pattern = null;
  return { material, pattern, seasons, details: details as WardrobeDetails };
}

/** 조건이 있는 칸(짜임이 민자가 아닐 때 '팔')이 지금 보이는지. */
export function visible(g: AddItemGroup, sel: Selection): boolean {
  if (!g.cond) return true;
  const v = (sel[g.cond.t] ?? []).join('+');
  return v !== '' && v !== g.cond.not;
}

const joined = (sel: Selection, title: string) => (sel[title] ?? []).join('+');

function fitTitle(spec: AddItemSpec): string | undefined {
  return spec.groups.find((g) => g.role === 'fit')?.title;
}

/** 시안 pickIcon: 처음 그림에서, 직접 바꾼 모양(핏 · 목 모양 · 기장 …)이 있으면 마지막 것으로. 조합 그림이 있으면 그걸로. */
export function pickIcon(spec: AddItemSpec, sel: Selection): string {
  let id = spec.base;
  for (const g of spec.groups) {
    if (g.noswap) continue;
    const chosen = sel[g.title] ?? [];
    for (const o of g.options.map(option)) {
      if (o.def || !o.icon) continue;
      if (chosen.includes(o.v)) id = o.icon;
    }
  }
  const fit = fitTitle(spec);
  const cands = (t: string): string[] => {
    const on = [...(t === 'fit' ? (fit ? (sel[fit] ?? []).slice(0, 1) : []) : (sel[t] ?? []))];
    if (!on.length) return [''];
    return on.length > 1 ? [on.join('+'), ...on] : on;
  };
  for (const c of spec.combos ?? []) {
    let keys = [''];
    c.keys.forEach((k, i) => {
      const list = cands(k);
      keys = keys.flatMap((p) => list.map((v) => (i ? `${p}|${v}` : v)));
    });
    const hit = keys.find((k) => c.map[k]);
    if (hit) id = c.map[hit];
  }
  return id;
}

/** 시안 curOv: 짜임(골지·꽈배기·아가일) 결, 또는 소재 '퍼'일 때 털 결의 이름. 없으면 ''. */
export function overlayKey(spec: AddItemSpec, sel: Selection): string {
  const wg = spec.groups.find((g) => g.weave);
  if (wg) {
    const w = joined(sel, wg.title);
    if (w && w !== '민자') return `${wg.weave}|${w}|${joined(sel, '팔') || '같이'}`;
  }
  if (spec.furov && (sel['소재'] ?? []).includes('퍼')) {
    const f = spec.furov;
    return f.t ? (f.map?.[joined(sel, f.t)] ?? '') : (f.key ?? '');
  }
  return '';
}

/** 시안 effPat: 옷 면을 칠할 무늬 이름(체크·스트라이프는 세부 모양). 무지·기타는 null. */
export function patternFill(sel: Selection): string | null {
  const p = sel['무늬']?.[0] ?? '무지';
  if (p in PATTERN_SHAPES) return sel[PATTERN_SHAPE_GROUP]?.[0] ?? PATTERN_SHAPES[p as keyof typeof PATTERN_SHAPES][0];
  return p === '무지' || p === '기타' ? null : p;
}

/** 무늬 이름(목록 글자용): '체크(깅엄)'. 무지는 ''. */
export function patternLabel(sel: Selection): string {
  const p = sel['무늬']?.[0] ?? '무지';
  if (p === '무지') return '';
  const shape = sel[PATTERN_SHAPE_GROUP]?.[0];
  return p in PATTERN_SHAPES && shape ? `${p}(${shape})` : p;
}

// ── 그림 하나로 ─────────────────────────────────────

/** 그릴 그림. v12면 KindIcon이 종류·핏으로 지금 앱 그림을 그린다. */
export type Look =
  | { v12: true; pattern: string | null; plainKnit: boolean }
  | { v12: false; layers: ArtIcon; place: [number, number, number]; overlay: Overlay | null; pattern: string | null };

export function lookFor(art: WardrobeArt, spec: AddItemSpec, sel: Selection, kind: Kind, fit: VisualFit | null): Look {
  const pattern = patternFill(sel);
  const ovKey = overlayKey(spec, sel);
  const fitG = fitTitle(spec);
  const withoutFit = fitG ? { ...sel, [fitG]: [] } : sel;
  const id = pickIcon(spec, sel);
  const shapeChanged = pickIcon(spec, withoutFit) !== spec.base;
  const v12 = KIND_ICONS[kind];
  const v12Fits = !fit || id === spec.base || v12?.variants?.[fit] !== undefined;
  // 짜임 칸이 있는 종류(니트·카디건)에서 '민자'를 직접 골랐으면 v12의 꽈배기를 빼고 그린다.
  const weaveGroup = spec.groups.find((g) => g.weave);
  const plainKnit = weaveGroup !== undefined && joined(sel, weaveGroup.title) === '민자';
  if (BASE_FROM_V12 && v12 && !shapeChanged && v12Fits && !ovKey) return { v12: true, pattern, plainKnit };
  const layers = art.icons[id] ?? art.icons[spec.base];
  return { v12: false, layers, place: spec.place, overlay: ovKey ? (art.weaves[ovKey] ?? null) : null, pattern };
}

/** 저장된 옷의 그림. 시안에 없는 종류(플리스·코트·모자·벨트)는 v12. */
export function lookForItem(art: WardrobeArt, item: WardrobeItem): Look {
  const spec = specFor(art, item.slot, item.kind);
  if (!spec) return { v12: true, pattern: null, plainKnit: false };
  const sel = selectionFromItem(spec, item);
  // 짜임을 안 고른(서버에 짜임이 없는) 옷은 v12 그대로(꽈배기 포함).
  const plainSel = item.details?.짜임 === undefined ? { ...sel, 짜임: [] } : sel;
  return lookFor(art, spec, plainSel, item.kind, item.visual_fit);
}

export type { Color };
