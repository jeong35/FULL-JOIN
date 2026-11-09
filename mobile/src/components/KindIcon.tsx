// 옷 종류 그림. 옷장 타일·옷 추가 카드·결과 화면에서 같은 그림을 쓴다.
// color를 주면 그 옷 색으로 칠하고(멀티는 4색 줄무늬, 기타·null은 옅은 회보라),
// color를 안 주면(옷 추가 ① 처럼 아직 색을 모를 때) 연보라 브랜드 색으로 칠한다.
// fit을 주면 바지는 스키니·일자·와이드·부츠컷, 스커트는 A라인·H라인·플레어 모양으로 바뀐다.
// 그림 데이터와 층 설명은 data/kindIcons.ts(design/kind-icons/gen_icons_v3.py에서 생성).
import { useId } from 'react';
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

import { COLOR_HEX, MULTI_SWATCH, type Color, type Kind, type VisualFit } from '../data/catalog';
import { KIND_ICONS } from '../data/kindIcons';

const OUTLINE = 'rgba(43,34,56,0.9)';
const OUTLINE_WIDTH = 1.35;
const DETAIL_WIDTH = 0.85;
const BRAND_FILL = '#CDB8F4';
const NEUTRAL_FILL = '#D9D2E6';
// 멀티(4색 줄무늬)일 때만 쓰는 중립 색.
const MULTI_TONES = { detail: 'rgba(43,34,56,0.42)', inner: 'rgba(43,34,56,0.26)', shade: '#2B2238', shadeOpacity: 0.13 };
// 이보다 어두운 옷은 선을 밝은 같은 색으로, 밝은 옷은 진한 같은 색으로 긋는다.
const DARK_LUMINANCE = 0.3;

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

// 선·옷 안쪽·그림자 색을 옷 색에서 뽑는다. 회보라 같은 다른 색이 끼면 탁해 보여서 같은 색 계열로 맞춘다.
function tonesFor(base: string, isMulti: boolean) {
  if (isMulti) return { ...MULTI_TONES, dark: false };
  const dark = luminance(base) < DARK_LUMINANCE;
  return {
    dark,
    detail: dark ? mix(base, '#FFFFFF', 0.34) : mix(base, '#1E1428', 0.36),
    inner: dark ? mix(base, '#000000', 0.42) : mix(base, '#1E1428', 0.26),
    shade: mix(base, '#1E1428', 0.55),
    shadeOpacity: 0.22,
  };
}

type Props = {
  kind: Kind;
  /** 옷 색. 안 주면 브랜드 연보라, null이면 색을 모르는 옷(옅은 회보라). */
  color?: Color | null;
  /** 핏. 바지·스커트만 모양이 바뀌고 나머지는 무시한다. */
  fit?: VisualFit | null;
  size?: number;
};

export function KindIcon({ kind, color, fit, size = 64 }: Props) {
  // 한 화면에 그림이 여러 개라 그라데이션·자르기 id가 겹치지 않게 그림마다 따로 만든다.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const icon = KIND_ICONS[kind];
  if (!icon) return null;

  const multiId = `kind-multi-${uid}`;
  const clipId = `kind-clip-${uid}`;
  const shadeId = `kind-shade-${uid}`;
  const isMulti = color === '멀티';
  const base =
    color === undefined
      ? BRAND_FILL
      : color === null || color === '멀티' || color === '기타'
        ? NEUTRAL_FILL
        : COLOR_HEX[color];
  const fill = isMulti ? `url(#${multiId})` : base;
  const tone = tonesFor(base, isMulti);
  const detail = tone.detail;
  // 어두운 옷의 라펠·칼라는 밝은 같은 색 선으로 둘러야 보인다.
  const topLine = tone.dark ? tone.detail : OUTLINE;
  const topWidth = tone.dark ? 1.1 : OUTLINE_WIDTH;
  const t = icon.transform;

  const variant = fit ? icon.variants?.[fit] : undefined;
  const shapes = variant?.shapes ?? icon.shapes;
  const details = variant?.details ?? icon.details;
  const shade = variant?.shade ?? icon.shade;
  const inner = variant?.inner ?? icon.inner;
  const tops = variant?.tops ?? icon.tops;

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
          <Stop offset={0.45} stopColor={tone.shade} stopOpacity={tone.shadeOpacity} />
        </LinearGradient>
        {/* 그림자·솔기 선이 옷 밖으로 삐져나오지 않게 옷 모양으로 자른다. */}
        <ClipPath id={clipId}>
          {[...shapes, ...tops].map((d, i) => (
            <Path key={i} d={d} />
          ))}
        </ClipPath>
      </Defs>
      <G transform={t ? `translate(${t[0]} ${t[1]}) scale(${t[2]})` : undefined}>
        {icon.straps.map((d, i) => (
          <G key={`s${i}`}>
            <Path d={d} fill="none" stroke={OUTLINE} strokeWidth={4.2} strokeLinecap="round" strokeLinejoin="round" />
            <Path d={d} fill="none" stroke={fill} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          </G>
        ))}
        {shapes.map((d, i) => (
          <Path key={`p${i}`} d={d} fill={fill} stroke={OUTLINE} strokeWidth={OUTLINE_WIDTH} strokeLinejoin="round" />
        ))}
        <G clipPath={`url(#${clipId})`}>
          {shade.map((d, i) => (
            <Path key={`h${i}`} d={d} fill={`url(#${shadeId})`} />
          ))}
        </G>
        {inner.map((d, i) => (
          <Path key={`n${i}`} d={d} fill={tone.inner} />
        ))}
        {tops.map((d, i) => (
          <Path key={`t${i}`} d={d} fill={fill} stroke={topLine} strokeWidth={topWidth} strokeLinejoin="round" />
        ))}
        <G clipPath={`url(#${clipId})`}>
          {details.map((d, i) => (
            <Path
              key={`d${i}`}
              d={d}
              fill="none"
              stroke={detail}
              strokeWidth={DETAIL_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </G>
        {icon.dots.map(([cx, cy, r], i) => (
          <Circle key={`c${i}`} cx={cx} cy={cy} r={r} fill={detail} />
        ))}
      </G>
    </Svg>
  );
}
