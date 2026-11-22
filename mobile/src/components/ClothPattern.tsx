// 옷 면을 채우는 무늬(SVG pattern). 옷 추가 시안(11/15)의 patDef를 그대로 옮겼다.
// 무늬 색은 옷 색에서 뽑는다: 어두운 옷은 밝은 같은 색, 밝은 옷은 진한 같은 색.
// 체크 6가지(깅엄·타탄·버팔로·윈도페인·글렌·하운드투스) · 스트라이프 5가지(단가라·굵은줄·멀티줄·세로줄·핀스트라이프)
// · 도트 · 호피 · 아가일 · 플라워 · 트위드.
import type { ReactElement } from 'react';
import { Circle, Ellipse, G, Path, Pattern, Rect } from 'react-native-svg';

const INK = '#2E292F';

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function mixHex(hex: string, target: string, amount: number): string {
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

// 트위드 결: 시안과 같은 씨앗(11)으로 만든 짧은 가로·세로 실 16개. 매번 같은 모양이라 한 번만 만든다.
const TWEED_STROKES: readonly { d: string; isLight: boolean }[] = (() => {
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const out: { d: string; isLight: boolean }[] = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      const x = c * 1.5 + 0.75;
      const y = r * 1.5 + 0.75;
      const len = 0.9 + rnd() * 0.4;
      const isLight = rnd() < 0.5;
      const d = (r + c) % 2 === 0 ? `M${x - len / 2},${y} L${x + len / 2},${y}` : `M${x},${y - len / 2} L${x},${y + len / 2}`;
      out.push({ d, isLight });
    }
  return out;
})();

type Props = {
  id: string;
  /** 무늬 이름(깅엄 · 도트 · 호피 …) */
  kind: string;
  /** 옷 색(#RRGGBB) */
  base: string;
};

export function ClothPattern({ id, kind, base }: Props) {
  const dark = luminance(base) < 0.45;
  const a = dark ? mixHex(base, '#FFFFFF', 0.72) : mixHex(base, INK, 0.62);
  const second = dark ? mixHex(base, '#FFFFFF', 0.85) : mixHex(a, '#FFFFFF', 0.35);
  let w = 4;
  let h = 4;
  const parts: ReactElement[] = [];
  let n = 0;
  const R = (x: number, y: number, rw: number, rh: number, fill: string, opacity?: number) => {
    parts.push(<Rect key={n++} x={x} y={y} width={rw} height={rh} fill={fill} opacity={opacity} />);
  };

  if (kind === '깅엄') {
    R(0, 0, 2, 4, a, 0.45);
    R(0, 0, 4, 2, a, 0.45);
  } else if (kind === '타탄') {
    w = h = 8;
    R(0, 0, 3, 8, a, 0.5);
    R(0, 0, 8, 3, a, 0.5);
    R(5, 0, 0.9, 8, a, 0.3);
    R(0, 5, 8, 0.9, a, 0.3);
    R(6.6, 0, 0.32, 8, second, 0.9);
    R(0, 6.6, 8, 0.32, second, 0.9);
    R(1.35, 0, 0.28, 8, second, 0.7);
    R(0, 1.35, 8, 0.28, second, 0.7);
  } else if (kind === '버팔로') {
    w = h = 6;
    const d = mixHex(base, '#1E1A1F', 0.86);
    R(0, 0, 3, 6, d, 0.55);
    R(0, 0, 6, 3, d, 0.55);
  } else if (kind === '윈도페인') {
    w = h = 7;
    R(0, 0, 0.42, 7, a);
    R(0, 0, 7, 0.42, a);
  } else if (kind === '글렌') {
    w = h = 8;
    for (let i = 0; i < 5; i++) {
      R(0.2 + i * 0.75, 0, 0.3, 4, a, 0.55);
      R(4, 4.2 + i * 0.75, 4, 0.3, a, 0.55);
    }
    R(4, 0, 4, 4, a, 0.18);
    R(0, 4, 4, 4, a, 0.18);
    R(7.55, 0, 0.3, 8, second, 0.85);
    R(0, 7.55, 8, 0.3, second, 0.85);
  } else if (kind === '하운드투스') {
    const px = 0.5;
    const cells: [number, number][] = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) cells.push([r, c]);
    cells.push([3, 4], [2, 5], [1, 6], [0, 7], [7, 0], [6, 1], [5, 2], [4, 3]);
    cells.forEach(([r, c]) => R(c * px, r * px, px + 0.01, px + 0.01, a));
  } else if (kind === '단가라') {
    h = 3.4;
    R(0, 0, 4, 1.25, a);
  } else if (kind === '굵은줄') {
    h = 5.2;
    R(0, 0, 4, 2.5, a);
  } else if (kind === '멀티줄') {
    h = 6;
    R(0, 0, 4, 1.3, a);
    R(0, 2.6, 4, 0.55, second);
    R(0, 3.7, 4, 0.55, a, 0.55);
  } else if (kind === '세로줄') {
    w = 2.6;
    R(0, 0, 0.9, 4, a);
  } else if (kind === '핀스트라이프') {
    w = 2;
    R(0, 0, 0.24, 4, a);
  } else if (kind === '도트') {
    parts.push(<Circle key={n++} cx={1} cy={1} r={0.62} fill={a} />, <Circle key={n++} cx={3} cy={3} r={0.62} fill={a} />);
  } else if (kind === '호피') {
    w = h = 9;
    const rim = mixHex(base, INK, 0.82);
    const mid = mixHex(base, '#6B4A2E', 0.55);
    (
      [
        [2, 2.2, 0],
        [6.6, 3.4, 40],
        [3.6, 6.8, 110],
        [7.8, 7.8, 200],
      ] as const
    ).forEach(([x, y, rot]) => {
      parts.push(
        <G key={n++} transform={`translate(${x} ${y}) rotate(${rot})`}>
          <Ellipse rx={1.15} ry={0.85} fill={mid} />
          <Path
            d="M-1.5,-0.3 C-1.4,-1.3 -0.2,-1.5 0.6,-1.2 M1.4,-0.4 C1.7,0.4 1.2,1.2 0.3,1.3 M-0.6,1.25 C-1.2,1.1 -1.5,0.6 -1.6,0.3"
            fill="none"
            stroke={rim}
            strokeWidth={0.6}
            strokeLinecap="round"
          />
        </G>,
      );
    });
  } else if (kind === '아가일') {
    w = 6;
    h = 8;
    parts.push(
      <Path key={n++} d="M3,0 L6,4 L3,8 L0,4 Z" fill={mixHex(base, a, 0.45)} />,
      <Path key={n++} d="M0,0 L6,8 M6,0 L0,8" stroke={dark ? a : second} strokeWidth={0.3} strokeDasharray="0.8 0.6" />,
    );
  } else if (kind === '플라워') {
    w = h = 6;
    const petal = dark
      ? mixHex(base, '#FFFFFF', 0.7)
      : luminance(base) > 0.75
        ? mixHex('#E58FA0', base, 0.25)
        : mixHex(base, '#FFFFFF', 0.75);
    const center = mixHex(base, '#EBD27C', 0.6);
    (
      [
        [1.6, 1.6],
        [4.6, 4.6],
      ] as const
    ).forEach(([cx, cy]) => {
      for (let k = 0; k < 5; k++) {
        const g = ((k * 72 - 90) * Math.PI) / 180;
        parts.push(<Circle key={n++} cx={cx + 0.62 * Math.cos(g)} cy={cy + 0.62 * Math.sin(g)} r={0.5} fill={petal} />);
      }
      parts.push(<Circle key={n++} cx={cx} cy={cy} r={0.38} fill={center} />);
    });
  } else if (kind === '트위드') {
    w = h = 6;
    const light = dark ? mixHex(base, '#FFFFFF', 0.42) : mixHex(base, '#FFFFFF', 0.62);
    const deep = dark ? mixHex(base, '#FFFFFF', 0.2) : mixHex(base, INK, 0.5);
    TWEED_STROKES.forEach(({ d, isLight }) => {
      parts.push(<Path key={n++} d={d} stroke={isLight ? light : deep} strokeWidth={0.5} strokeLinecap="round" opacity={0.9} />);
    });
  }

  return (
    <Pattern id={id} patternUnits="userSpaceOnUse" width={w} height={h}>
      <Rect width={w} height={h} fill={base} />
      {parts}
    </Pattern>
  );
}
