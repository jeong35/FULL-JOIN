// 옷 종류 그림. 옷장 타일·옷 추가 카드·결과 화면에서 같은 그림을 쓴다.
// color를 주면 그 옷 색으로 칠하고(멀티는 4색 줄무늬, 기타·null은 옅은 회보라),
// color를 안 주면(옷 추가 ① 처럼 아직 색을 모를 때) 연보라 브랜드 색으로 칠한다.
// fit을 주면 바지는 스키니·일자·와이드·부츠컷, 조거팬츠는 일자·와이드, 스커트는 A라인·H라인·플레어 모양으로 바뀐다.
// 그리는 느낌(11/9 v7): 심플한 실루엣 + 둥근 모서리 + 진한 먹색 테두리 + 꼭 필요한 안쪽 선 한 줄 + 차분한 색 + 옅은 그림자.
// 가방 손잡이처럼 뚫린 곳은 옷 면(shapes) 안의 구멍으로 들어 있어서 evenodd로 칠한다.
// 그림 데이터와 층 설명은 data/kindIcons.ts(design/kind-icons/icons_v13.json → gen_ts.py로 생성).
// 11/19: 옷 추가 시안의 모양별 그림(layers + place), 무늬(pattern), 짜임·털 결(overlay)도 그린다(data/wardrobeLook.ts).
import { useId } from 'react';
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

import { COLOR_HEX, MULTI_SWATCH, type Color, type Kind, type VisualFit } from '../data/catalog';
import { KIND_ICONS } from '../data/kindIcons';
import { toLab } from '../data/photoColor';
import type { ArtIcon, Argyle, Overlay, Print } from '../data/wardrobeLook';
import { ClothPattern } from './ClothPattern';

// 테두리 기본 먹색. 옷 색을 조금 섞어서 쓴다.
const INK = '#2E292F';
// 선 굵기(64칸 기준). 이 크기보다 작게 그리면 선이 흐려 보이지 않게 그만큼 굵게 긋는다(옷 추가 34px·결과 40px).
const OUTLINE_WIDTH = 1.1;
const TOP_WIDTH = 0.95;
const DETAIL_WIDTH = 0.8;
const LINING_WIDTH = 0.85;
const SEAM_WIDTH = 1;
const CRISP_SIZE = 56;
// 오른쪽 아래로 비낀 옅은 그림자.
const SHADOW = 'rgba(46,36,58,0.13)';
const SHADOW_OFFSET = 'translate(0.9 1.3)';
// 힐 안쪽 같은 안감은 옷 색과 상관없이 밝은 베이지.
const LINING = '#EADBC6';
// 체인 끈·지퍼 고리·클러치 테 같은 금속: 진한 테두리 + 밝은 색. 차가운 색 가방은 은색, 나머지는 금색.
const GOLD = { dark: '#8A6D2B', light: '#E3C770' };
const SILVER = { dark: '#6F737D', light: '#DCDEE4' };
const SILVER_COLORS: ReadonlySet<Color> = new Set<Color>([
  '실버', '그레이', '화이트', '차콜', '네이비', '블루', '스카이블루', '민트', '라벤더', '퍼플', '연청', '중청', '진청', '흑청',
]);
const BRAND_FILL = '#CEC0F0';
const NEUTRAL_FILL = '#D9D3E3';
// 멀티(4색 줄무늬)일 때만 쓰는 중립 색.
const MULTI_TONES = {
  dark: false,
  outline: INK,
  top: INK,
  detail: 'rgba(46,41,47,0.68)',
  inner: 'rgba(46,41,47,0.28)',
  shade: INK,
  shadeOpacity: 0.12,
};
// 이보다 어두운 옷은 안쪽 선을 밝은 같은 색으로, 밝은 옷은 진한 같은 색으로 긋는다.
const DARK_LUMINANCE = 0.3;
// 아가일(11/27): 마름모 색을 안 고르면 어두운 옷은 아이보리 쪽, 밝은 옷은 진한 같은 색. 점선 사선은 옷 색 · 마름모 색
// 둘 다와 가장 다른 색(빨강 · 아이보리 · 먹색 · 겨자). 사선은 가늘게(11/27 은재 님 "빨간 선이 너무 굵어요" → 0.2).
const ARGYLE_LIGHT = '#EFE9DF';
const ARGYLE_ACCENTS = ['#B5443F', '#EFE9DF', '#3A3A40', '#D9A93B'];
const ARGYLE_DASH_WIDTH = 0.2;
// 하프집업 지퍼 이빨(11/27 "너무 지퍼가 눈에 띄는 것만 아니면"): 은색 대신 안쪽 선 색의 가는 점선.
const ZIP_WIDTH = 0.5;
const ARGYLE_LINE_WIDTH = 0.55;

function labGap(a: string, b: string): number {
  const [p, q] = [toLab(a), toLab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mix(hex: string, target: string, amount: number): string {
  const a = hex.replace('#', '');
  const b = target.replace('#', '');
  return (
    '#' +
    [0, 2, 4]
      .map((i) => {
        const v = Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - amount) + parseInt(b.slice(i, i + 2), 16) * amount);
        return v.toString(16).padStart(2, '0');
      })
      .join('')
  );
}

// 테두리·안쪽 선·옷 안쪽·그림자 색을 옷 색에서 뽑는다(같은 색 계열로 맞춰야 탁해 보이지 않는다).
function tonesFor(base: string, isMulti: boolean) {
  if (isMulti) return MULTI_TONES;
  const dark = luminance(base) < DARK_LUMINANCE;
  return {
    dark,
    outline: mix(base, INK, 0.82),
    // 라펠·칼라·주머니 덮개 테두리: 바깥 테두리보다 연하게. 어두운 옷은 밝은 같은 색으로.
    top: dark ? mix(base, '#FFFFFF', 0.42) : mix(base, INK, 0.7),
    detail: dark ? mix(base, '#FFFFFF', 0.46) : mix(base, INK, 0.64),
    inner: dark ? mix(base, '#000000', 0.4) : mix(base, INK, 0.24),
    shade: mix(base, INK, 0.6),
    shadeOpacity: 0.17,
  };
}

type Props = {
  kind: Kind;
  /** 옷 색. 안 주면 브랜드 연보라, null이면 색을 모르는 옷(옅은 회보라). */
  color?: Color | null;
  /** 핏. 바지·스커트만 모양이 바뀌고 나머지는 무시한다. */
  fit?: VisualFit | null;
  size?: number;
  /** 시안 모양별 그림(목 모양·기장 등을 고른 옷). 주면 kind·fit 그림 대신 이걸 그린다. */
  layers?: ArtIcon;
  /** layers에 씌우는 [x 이동, y 이동, 배율](종류마다 v12 크기에 맞춤) */
  place?: readonly [number, number, number];
  /** 옷 면을 채울 무늬(깅엄 · 도트 · 호피 …). 멀티 색이면 무시. */
  pattern?: string | null;
  /** 짜임·털 결(니트 골지·꽈배기, 퍼). layers와 같은 좌표다. */
  overlay?: Overlay | null;
  /** v12 니트·카디건의 꽈배기를 빼고 그린다(짜임 '민자'를 직접 고른 옷). */
  noWeave?: boolean;
  /** 옷 색 대신 칠할 색(#RRGGBB) — 사진이 있는 옷은 사진 색감으로(data/photoColor.ts photoTint). 멀티면 무시. */
  tint?: string | null;
  /** 옷에 찍힌 프린팅(레터링 · 작은 로고). layers와 같은 좌표. 색을 안 고르면 안쪽 선 색. */
  print?: Print | null;
  /** 짜임 결 선 색(노르딕 색). 안 주면 안쪽 선 색. */
  overlayColor?: Color | null;
  /** 무늬 아가일(니트·카디건·베스트). layers와 같은 좌표. 멀티 색이면 무시. */
  argyle?: Argyle | null;
};

export function KindIcon({
  kind,
  color,
  fit,
  size = 64,
  layers: artLayers,
  place,
  pattern,
  overlay,
  noWeave,
  tint,
  print,
  overlayColor,
  argyle,
}: Props) {
  // 한 화면에 그림이 여러 개라 그라데이션·자르기 id가 겹치지 않게 그림마다 따로 만든다.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const icon = artLayers ?? KIND_ICONS[kind];
  if (!icon) return null;

  const multiId = `kind-multi-${uid}`;
  const clipId = `kind-clip-${uid}`;
  const shadeId = `kind-shade-${uid}`;
  const patternId = `kind-pattern-${uid}`;
  const isMulti = color === '멀티';
  const base =
    tint && !isMulti
      ? tint
      : color === undefined
        ? BRAND_FILL
        : color === null || color === '멀티' || color === '기타'
          ? NEUTRAL_FILL
          : COLOR_HEX[color];
  const usePattern = Boolean(pattern) && !isMulti;
  const fill = isMulti ? `url(#${multiId})` : usePattern ? `url(#${patternId})` : base;
  const tone = tonesFor(base, isMulti);
  const metal = color === undefined || (color != null && SILVER_COLORS.has(color)) ? SILVER : GOLD;
  // 프린팅 · 노르딕 선 색: 고른 색. 안 골랐거나 멀티·기타거나 옷과 같은 색이면(안 보이니) 안쪽 선 색.
  const pickStroke = (c: Color | null | undefined) => {
    const hex = c && c !== '멀티' && c !== '기타' ? COLOR_HEX[c] : null;
    return hex === null || hex.toLowerCase() === base.toLowerCase() ? tone.detail : hex;
  };
  const printStroke = pickStroke(print?.color);
  const overlayStroke = overlay?.soft ? tone.detail : pickStroke(overlayColor);
  const shown = argyle != null && !isMulti ? argyle : null;
  const argyleChosen = shown?.color && shown.color !== '멀티' && shown.color !== '기타' ? COLOR_HEX[shown.color] : null;
  const argyleFill = shown
    ? argyleChosen !== null && argyleChosen.toLowerCase() !== base.toLowerCase()
      ? argyleChosen
      : tone.dark
        ? mix(ARGYLE_LIGHT, base, 0.12)
        : mix(base, INK, 0.55)
    : base;
  const argyleLine = shown && !shown.solid
    ? ARGYLE_ACCENTS.reduce((best, c) => (Math.min(labGap(c, base), labGap(c, argyleFill)) > Math.min(labGap(best, base), labGap(best, argyleFill)) ? c : best))
    : argyleFill;
  const k = Math.max(1, CRISP_SIZE / size);

  // 핏 그림은 층을 다 갖고 있어서 통째로 바꿔 그린다(기본 그림의 층이 섞이지 않게).
  const variant = !artLayers && fit && 'variants' in icon ? icon.variants?.[fit] : undefined;
  const layers: ArtIcon = variant ?? icon;
  const { shapes, details, shade, inner, tops } = layers;
  const t = layers.transform;
  const chains = layers.chains ?? [];
  const weave = noWeave ? [] : (layers.weave ?? []);
  // 비치는 천(시스루 등)은 옷 면을 덜 칠한다.
  const faceOpacity = layers.sheer ?? 1;

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <Defs>
        {isMulti && (
          <LinearGradient id={multiId} x1="0" y1="0" x2="1" y2="1">
            {MULTI_SWATCH.flatMap((c, i) => [
              <Stop key={`${i}a`} offset={i / MULTI_SWATCH.length} stopColor={c} />,
              <Stop key={`${i}b`} offset={(i + 1) / MULTI_SWATCH.length} stopColor={c} />,
            ])}
          </LinearGradient>
        )}
        <LinearGradient id={shadeId} x1="0" y1="0" x2="1" y2="0">
          <Stop offset={0} stopColor={tone.shade} stopOpacity={0} />
          <Stop offset={0.5} stopColor={tone.shade} stopOpacity={tone.shadeOpacity} />
        </LinearGradient>
        {usePattern && pattern && <ClothPattern id={patternId} kind={pattern} base={base} />}
        {/* 그림자·솔기 선이 옷 밖으로 삐져나오지 않게 옷 모양으로 자른다. */}
        <ClipPath id={clipId}>
          {[...shapes, ...tops].map((d, i) => (
            <Path key={i} d={d} clipRule="evenodd" />
          ))}
        </ClipPath>
      </Defs>
      <G transform={place ? `translate(${place[0]} ${place[1]}) scale(${place[2]})` : undefined}>
      <G transform={t ? `translate(${t[0]} ${t[1]}) scale(${t[2]})` : undefined}>
        <G transform={SHADOW_OFFSET}>
          {[...layers.straps, ...chains].map((d, i) => (
            <Path key={`ws${i}`} d={d} fill="none" stroke={SHADOW} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {shapes.map((d, i) => (
            <Path key={`wp${i}`} d={d} fill={SHADOW} fillRule="evenodd" />
          ))}
        </G>
        {chains.map((d, i) => (
          <G key={`ch${i}`}>
            <Path d={d} fill="none" stroke={metal.dark} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            <Path d={d} fill="none" stroke={metal.light} strokeWidth={1.2} strokeDasharray="1.2 0.8" strokeLinecap="round" />
          </G>
        ))}
        {layers.straps.map((d, i) => (
          <G key={`s${i}`}>
            <Path d={d} fill="none" stroke={tone.outline} strokeWidth={3.8} strokeLinecap="round" strokeLinejoin="round" />
            <Path d={d} fill="none" stroke={fill} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </G>
        ))}
        {shapes.map((d, i) => (
          <Path
            key={`p${i}`}
            d={d}
            fill={fill}
            fillOpacity={faceOpacity}
            fillRule="evenodd"
            stroke={tone.outline}
            strokeWidth={OUTLINE_WIDTH * k}
            strokeLinejoin="round"
          />
        ))}
        <G clipPath={`url(#${clipId})`}>
          {/* 아가일: 마름모를 칠하고 사선(점선) 또는 테두리 · 지그재그(실선)를 긋는다. 그림자 · 목 시보리 · 안쪽 면 아래에 깔린다. */}
          {shown?.fills.map((d, i) => <Path key={`af${i}`} d={d} fill={argyleFill} />)}
          {shown?.lines.map((d, i) => (
            <Path
              key={`al${i}`}
              d={d}
              fill="none"
              stroke={argyleLine}
              strokeWidth={shown.solid ? ARGYLE_LINE_WIDTH * k : ARGYLE_DASH_WIDTH}
              strokeDasharray={shown.solid ? undefined : '0.7 0.7'}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {shade.map((d, i) => (
            <Path key={`h${i}`} d={d} fill={`url(#${shadeId})`} />
          ))}
          {/* 짜임 결(니트 꽈배기·시보리 골): 안쪽 선 색으로, 목 시보리·칼라 아래에 깔린다. */}
          {weave.map((d, i) => (
            <Path
              key={`w${i}`}
              d={d}
              fill="none"
              stroke={tone.detail}
              strokeWidth={DETAIL_WIDTH * k}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {/* 고른 짜임·털 결: 털은 가늘고 옅게 */}
          {(overlay?.lines ?? []).map((d, i) => (
            <Path
              key={`o${i}`}
              d={d}
              fill="none"
              stroke={overlayStroke}
              strokeWidth={(overlay?.soft ? 0.6 : DETAIL_WIDTH) * k}
              strokeOpacity={overlay?.soft ? 0.72 : 1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </G>
        {/* 프린팅(레터링 · 작은 로고): 천 위에 찍힌 거라 목 시보리·안쪽 면 아래에 깔린다. */}
        {print && print.lines.length > 0 && (
          <G clipPath={`url(#${clipId})`}>
            {print.lines.map((d, i) => (
              <Path
                key={`pr${i}`}
                d={d}
                fill="none"
                stroke={printStroke}
                strokeWidth={DETAIL_WIDTH * k}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </G>
        )}
        {/* 목 시보리처럼 결 없이 옷 색만 칠하는 면(무늬는 안 넣는다) */}
        {(layers.plain ?? []).map((d, i) => (
          <Path key={`pl${i}`} d={d} fill={usePattern ? base : fill} />
        ))}
        {inner.map((d, i) => (
          <Path key={`n${i}`} d={d} fill={tone.inner} />
        ))}
        {(layers.lining ?? []).map((d, i) => (
          <Path key={`l${i}`} d={d} fill={LINING} stroke={tone.top} strokeWidth={LINING_WIDTH * k} strokeLinejoin="round" />
        ))}
        {tops.map((d, i) => (
          <Path key={`t${i}`} d={d} fill={fill} stroke={tone.top} strokeWidth={TOP_WIDTH * k} strokeLinejoin="round" />
        ))}
        <G clipPath={`url(#${clipId})`}>
          {/* 천 결(코듀로이 골 등): 옅은 안쪽 선 */}
          {(layers.tex ?? []).map((d, i) => (
            <Path
              key={`x${i}`}
              d={d}
              fill="none"
              stroke={tone.detail}
              strokeWidth={0.6 * k}
              strokeOpacity={0.72}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {details.map((d, i) => (
            <Path
              key={`d${i}`}
              d={d}
              fill="none"
              stroke={tone.detail}
              strokeWidth={DETAIL_WIDTH * k}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {(layers.zips ?? []).map((d, i) => (
            <Path key={`z${i}`} d={d} fill="none" stroke={tone.detail} strokeWidth={ZIP_WIDTH} strokeDasharray="0.32 0.3" strokeLinecap="round" />
          ))}
        </G>
        {/* 소매 구분선: 팔과 몸판이 갈려 보이게 안쪽 선보다 진하고 굵게 */}
        <G clipPath={`url(#${clipId})`}>
          {(layers.seams ?? []).map((d, i) => (
            <Path
              key={`sm${i}`}
              d={d}
              fill="none"
              stroke={tone.top}
              strokeWidth={SEAM_WIDTH * k}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </G>
        {(layers.metals ?? []).map((d, i) => (
          <G key={`m${i}`}>
            <Path d={d} fill="none" stroke={metal.dark} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
            <Path d={d} fill="none" stroke={metal.light} strokeWidth={0.95} strokeLinecap="round" strokeLinejoin="round" />
          </G>
        ))}
        {layers.dots.map(([cx, cy, r], i) => (
          <Circle key={`c${i}`} cx={cx} cy={cy} r={r} fill={tone.detail} />
        ))}
      </G>
      </G>
    </Svg>
  );
}
