// 사진 색 다루기(11/23).
// - 사진 픽셀 → 옷 색(#RRGGBB): 그림자(어두운 15%)·반사(밝은 10%)를 빼고 가운데 값. 서버 누끼(누끼서버_설명.md)와 같은 규칙.
//   앱(Expo Go·설치 앱)은 서버 누끼가 생기기 전까지 배경을 못 지워서, 네모 가운데만 작게 잘라 JPEG를 풀어 본다(jpeg-js, 순수 JS).
// - 옷 그림 칠할 색: 사진 색의 색감은 살리고 밝기는 고른 색 이름 쪽으로 맞춘다(조명 탓에 사진이 어둡거나 밝게 나와서).
import { decode as decodeJpeg } from 'jpeg-js';

import { COLOR_HEX, type Color } from './catalog';

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function toLab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

export function fromLab(l: number, a: number, b: number): string {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const [x, y, z] = [inv(fx) * 0.95047, inv(fy), inv(fz) * 1.08883];
  const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  const rgb = [
    3.2406 * x - 1.5372 * y - 0.4986 * z,
    -0.9689 * x + 1.8758 * y + 0.0415 * z,
    0.0557 * x - 0.204 * y + 1.057 * z,
  ].map((c) => Math.round(Math.min(1, Math.max(0, gamma(c))) * 255));
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** RGBA 픽셀에서 옷 색. 투명한 곳(알파 200 이하)은 뺀다. 픽셀이 거의 없으면 null. */
export function medianColor(rgba: ArrayLike<number>): string | null {
  const px: [number, number, number, number][] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] <= 200) continue;
    const [r, g, b] = [rgba[i], rgba[i + 1], rgba[i + 2]];
    px.push([r, g, b, 0.299 * r + 0.587 * g + 0.114 * b]);
  }
  if (px.length < 16) return null;
  const lums = px.map((p) => p[3]).sort((p, q) => p - q);
  const lo = lums[Math.floor(lums.length * 0.15)];
  const hi = lums[Math.min(lums.length - 1, Math.floor(lums.length * 0.9))];
  const keep = px.filter((p) => p[3] >= lo && p[3] <= hi);
  const use = keep.length ? keep : px;
  const mid = (k: 0 | 1 | 2) => {
    const v = use.map((p) => p[k]).sort((p, q) => p - q);
    return v[Math.floor(v.length / 2)];
  };
  return '#' + [mid(0), mid(1), mid(2)].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** data:image/jpeg;base64,… 사진의 옷 색. 못 풀면 null. */
export function jpegColor(dataUrl: string): string | null {
  try {
    const bin = globalThis.atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const image = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 1 });
    return medianColor(image.data);
  } catch {
    return null;
  }
}

// 고른 색 이름과 사진 색감이 이만큼 넘게 다르면(사람이 다른 색을 골랐으면) 사진 색을 안 쓴다.
const MAX_HUE_GAP = 28;
const MAX_LIGHT_GAP = 45;

/** 옷 그림을 칠할 색. 사진 색이 없거나 고른 색 이름과 너무 다르면 null(색 이름 색으로 칠한다). */
export function photoTint(photoHex: string | null | undefined, color: Color | null | undefined): string | null {
  if (!photoHex || !HEX.test(photoHex) || !color || color === '멀티' || color === '기타') return null;
  const [pl, pa, pb] = toLab(photoHex);
  const [cl, ca, cb] = toLab(COLOR_HEX[color]);
  if (Math.hypot(pa - ca, pb - cb) > MAX_HUE_GAP || Math.abs(pl - cl) > MAX_LIGHT_GAP) return null;
  // 밝기는 색 이름 쪽 70%, 색감은 사진 쪽 75%
  return fromLab(cl * 0.7 + pl * 0.3, ca * 0.25 + pa * 0.75, cb * 0.25 + pb * 0.75);
}
