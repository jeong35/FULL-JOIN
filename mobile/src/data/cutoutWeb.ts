// 브라우저에서 옷 사진 배경 지우기(누끼, 11/22). 서버 누끼가 생기기 전에도 웹에서는 바로 지워지게 한다.
// - 모델: u2netp(U²-Net 작은 판, 4.4MB, Apache-2.0 https://github.com/xuebinqin/U-2-Net). public/models/u2netp.onnx.
//   rembg의 u2netp와 같은 앞뒤 처리(320×320, 가장 밝은 값으로 나눈 뒤 평균·표준편차 보정, 결과를 0~1로 늘림)를 따른다.
// - 실행기: onnxruntime-web(WASM). 처음 한 번 CDN에서 받고 그다음은 브라우저가 기억한다. 사진은 기기 밖으로 나가지 않는다.
// - 결과: 옷 테두리에 맞춰 자르고 정사각 가운데에 여백 8%씩 둔 투명 배경 사진 + 옷 색(서버 누끼와 같은 규칙).
import { Platform } from 'react-native';

const ORT_VERSION = '1.30.0';
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const MODEL_URL = '/models/u2netp.onnx';
const SIZE = 320;
const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;
// 저장하는 사진 크기(이 브라우저 저장 공간을 아끼려고 작게).
const OUT_SIZE = 480;

type OrtTensor = { data: Float32Array };
type OrtSession = {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
};
type Ort = {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  InferenceSession: { create(model: string, options?: object): Promise<OrtSession> };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown;
};

export const canCutoutInBrowser = Platform.OS === 'web' && typeof document !== 'undefined';

function ortGlobal(): Ort | undefined {
  return (globalThis as unknown as { ort?: Ort }).ort;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('cutout_runtime_load_failed'));
    document.head.appendChild(script);
  });
}

let sessionPromise: Promise<OrtSession> | null = null;

function getSession(): Promise<OrtSession> {
  if (sessionPromise === null) {
    sessionPromise = (async () => {
      if (ortGlobal() === undefined) await loadScript(`${ORT_BASE}ort.wasm.min.js`);
      const ort = ortGlobal();
      if (ort === undefined) throw new Error('cutout_runtime_load_failed');
      ort.env.wasm.wasmPaths = ORT_BASE;
      // 여러 스레드는 사이트 격리 설정이 필요해서 하나만 쓴다.
      ort.env.wasm.numThreads = 1;
      return ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] });
    })().catch((error: unknown) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

// 네모를 맞추는 동안 미리 받아 둔다(처음 한 번만 몇 초 걸린다).
export function warmUpCutout() {
  if (canCutoutInBrowser) getSession().catch(() => undefined);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('cutout_image_load_failed'));
    img.src = src;
  });
}

function canvas2d(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx === null) throw new Error('cutout_canvas_unavailable');
  return [canvas, ctx];
}

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? 0;
}

// 옷 부분만 보고, 어두운 15%(그림자)와 밝은 10%(반사)는 빼고 가운데 값(서버 누끼와 같은 규칙).
function garmentColor(data: Uint8ClampedArray): string | null {
  const solid: number[] = [];
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200) solid.push(i);
  if (solid.length === 0) return null;
  const step = Math.max(1, Math.floor(solid.length / 40000));
  const samples = solid.filter((_, k) => k % step === 0);
  const lum = samples.map((i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  const sorted = [...lum].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.15)];
  const hi = sorted[Math.floor(sorted.length * 0.9)];
  const kept = samples.filter((_, k) => lum[k] >= lo && lum[k] <= hi);
  const pick = kept.length > 0 ? kept : samples;
  const hex = [0, 1, 2].map((c) => Math.round(median(pick.map((i) => data[i + c]))).toString(16).padStart(2, '0'));
  return `#${hex.join('').toUpperCase()}`;
}

function encode(canvas: HTMLCanvasElement): string {
  // 되는 브라우저는 WebP(투명 배경 유지, PNG보다 작다), 안 되면 PNG.
  const webp = canvas.toDataURL('image/webp', 0.9);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
}

/** 네모로 자른 사진(data:image/jpeg) → 배경 지운 정사각 사진과 옷 색. 옷을 거의 못 찾으면 오류. */
export async function cutoutInBrowser(dataUrl: string): Promise<{ image: string; color: string | null }> {
  const [session, img] = await Promise.all([getSession(), loadImage(dataUrl)]);
  const ort = ortGlobal();
  if (ort === undefined) throw new Error('cutout_runtime_load_failed');
  const width = img.naturalWidth;
  const height = img.naturalHeight;

  // 1) 320×320으로 줄여 모델에 넣는다.
  const [, smallCtx] = canvas2d(SIZE, SIZE);
  smallCtx.drawImage(img, 0, 0, SIZE, SIZE);
  const px = smallCtx.getImageData(0, 0, SIZE, SIZE).data;
  let brightest = 1;
  for (let i = 0; i < px.length; i += 4) brightest = Math.max(brightest, px[i], px[i + 1], px[i + 2]);
  const area = SIZE * SIZE;
  const input = new Float32Array(3 * area);
  for (let i = 0; i < area; i += 1) {
    for (let c = 0; c < 3; c += 1) input[c * area + i] = (px[i * 4 + c] / brightest - MEAN[c]) / STD[c];
  }
  const outputs = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) });
  const pred = outputs[session.outputNames[0]].data;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < area; i += 1) {
    lo = Math.min(lo, pred[i]);
    hi = Math.max(hi, pred[i]);
  }
  const range = hi - lo || 1;

  // 2) 가려낸 모양(마스크)을 원래 크기로 늘린다.
  const [maskSmall, maskSmallCtx] = canvas2d(SIZE, SIZE);
  const maskData = maskSmallCtx.createImageData(SIZE, SIZE);
  for (let i = 0; i < area; i += 1) {
    const v = Math.round(((pred[i] - lo) / range) * 255);
    maskData.data[i * 4] = v;
    maskData.data[i * 4 + 1] = v;
    maskData.data[i * 4 + 2] = v;
    maskData.data[i * 4 + 3] = 255;
  }
  maskSmallCtx.putImageData(maskData, 0, 0);
  const [, maskCtx] = canvas2d(width, height);
  maskCtx.imageSmoothingQuality = 'high';
  maskCtx.drawImage(maskSmall, 0, 0, width, height);
  const mask = maskCtx.getImageData(0, 0, width, height).data;

  // 3) 마스크를 투명도로 써서 배경을 지운다.
  const [full, fullCtx] = canvas2d(width, height);
  fullCtx.drawImage(img, 0, 0);
  const cut = fullCtx.getImageData(0, 0, width, height);
  let solid = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const alpha = mask[i];
      cut.data[i + 3] = alpha;
      if (alpha > 200) solid += 1;
      if (alpha > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (solid / (width * height) < 0.02 || maxX < 0) throw new Error('no_garment');
  fullCtx.putImageData(cut, 0, 0);
  const color = garmentColor(cut.data);

  // 4) 정돈: 옷 테두리에 맞춰 자르고, 정사각 가운데에 여백 8%씩 둔다.
  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const side = Math.round(Math.max(boxW, boxH) * 1.16);
  const scale = OUT_SIZE / side;
  const [out, outCtx] = canvas2d(OUT_SIZE, OUT_SIZE);
  outCtx.imageSmoothingQuality = 'high';
  outCtx.drawImage(
    full,
    minX,
    minY,
    boxW,
    boxH,
    ((side - boxW) / 2) * scale,
    ((side - boxH) / 2) * scale,
    boxW * scale,
    boxH * scale,
  );
  return { image: encode(out), color };
}
