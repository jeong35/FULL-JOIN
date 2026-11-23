// 추천 탭 날씨: 지역, 날씨 받아 오기, 기온별 옷차림 표.
// 국내 날씨는 기상청(11/20 결정). 서버 GET /weather가 서비스 키(Supabase Secrets)로 단기·중기예보를 받아
// 아래 WeatherResponse 모양으로 바꿔 준다(서버: src/fulljoin/weather.ts). 받지 못하면 '날씨를 불러오지 못했어요'.
import { useSyncExternalStore } from 'react';

import { API_URL } from './api';
import { getAccessToken } from './auth';
import type { Kind, Slot } from './catalog';

// ── 지역 ────────────────────────────────────────────

export type Region = { name: string; lat: number; lon: number };

// 위치 권한 없이 고르는 지역 목록(시·구 중심 좌표).
export const REGIONS: readonly Region[] = [
  { name: '수원 영통구', lat: 37.2596, lon: 127.0465 },
  { name: '서울 강남구', lat: 37.5172, lon: 127.0473 },
  { name: '서울 마포구', lat: 37.5663, lon: 126.9019 },
  { name: '서울 성동구', lat: 37.5634, lon: 127.0369 },
  { name: '서울 종로구', lat: 37.5735, lon: 126.979 },
  { name: '성남 분당구', lat: 37.3827, lon: 127.1189 },
  { name: '용인 수지구', lat: 37.3221, lon: 127.0975 },
  { name: '인천 연수구', lat: 37.4103, lon: 126.6788 },
  { name: '대전 유성구', lat: 36.3622, lon: 127.3563 },
  { name: '대구 중구', lat: 35.8694, lon: 128.6062 },
  { name: '광주 동구', lat: 35.1462, lon: 126.9231 },
  { name: '부산 해운대구', lat: 35.1631, lon: 129.1636 },
  { name: '제주 제주시', lat: 33.4996, lon: 126.5312 },
];

const REGION_KEY = 'odit-region-v1';
let region: Region = readRegion();
const regionListeners = new Set<() => void>();

function readRegion(): Region {
  try {
    const name = globalThis.localStorage?.getItem(REGION_KEY);
    return REGIONS.find((item) => item.name === name) ?? REGIONS[0];
  } catch {
    return REGIONS[0];
  }
}

export function useRegion(): Region {
  return useSyncExternalStore(
    (listener) => {
      regionListeners.add(listener);
      return () => {
        regionListeners.delete(listener);
      };
    },
    () => region,
    () => region,
  );
}

export function setRegion(next: Region) {
  region = next;
  try {
    globalThis.localStorage?.setItem(REGION_KEY, next.name);
  } catch {
    // 저장이 막힌 브라우저는 이번 방문 동안만 기억한다.
  }
  for (const listener of regionListeners) listener();
}

// ── 날씨 ────────────────────────────────────────────

export type Sky = '맑음' | '구름 조금' | '구름 많음' | '흐림' | '비' | '비/눈' | '눈' | '소나기';

export type HourWeather = { time: string; temp: number; sky: Sky; pop: number };

export type DayWeather = {
  date: string; // YYYY-MM-DD (한국 시간)
  min: number; // 아침 최저
  max: number; // 낮 최고
  sky: Sky; // 그날 대표 하늘
  pop: number; // 비 올 확률 최고값(%)
  feels_like?: number; // 아침 체감(받을 수 있을 때만)
  hourly: HourWeather[]; // 받을 수 있는 날만(단기예보 범위). 없으면 []
};

export type WeatherResponse = { days: DayWeather[]; issued_at: string; source?: string };

export async function fetchWeather(at: Region, days = 7): Promise<WeatherResponse> {
  const query = `lat=${at.lat}&lon=${at.lon}&days=${days}`;
  const accessToken = await getAccessToken();
  const response = await fetch(`${API_URL}/weather?${query}`, {
    headers: accessToken === null ? undefined : { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('weather_unavailable');
  return (await response.json()) as WeatherResponse;
}

// 지역마다 받아 둔 날씨. 추천 탭과 룩 자세히 화면이 같이 쓴다. 30분이 지나면 새로 받는다.
export type WeatherState = { status: 'idle' | 'loading' | 'ready' | 'error'; days: readonly DayWeather[]; loadedAt: number; source?: string };
const IDLE: WeatherState = { status: 'idle', days: [], loadedAt: 0 };
const WEATHER_MAX_AGE_MS = 30 * 60 * 1000;
let weatherByRegion: Readonly<Record<string, WeatherState>> = {};
const weatherListeners = new Set<() => void>();

function setWeather(name: string, next: WeatherState) {
  weatherByRegion = { ...weatherByRegion, [name]: next };
  for (const listener of weatherListeners) listener();
}

export function useWeather(at: Region): WeatherState {
  return useSyncExternalStore(
    (listener) => {
      weatherListeners.add(listener);
      return () => {
        weatherListeners.delete(listener);
      };
    },
    () => weatherByRegion[at.name] ?? IDLE,
    () => weatherByRegion[at.name] ?? IDLE,
  );
}

export async function loadWeather(at: Region, { force = false }: { force?: boolean } = {}): Promise<void> {
  const current = weatherByRegion[at.name] ?? IDLE;
  if (current.status === 'loading') return;
  if (!force && current.status === 'ready' && Date.now() - current.loadedAt < WEATHER_MAX_AGE_MS) return;
  setWeather(at.name, { ...current, status: 'loading' });
  try {
    // 추천 탭은 7일만 쓰지만, 여행 화면이 열흘 뒤까지 보도록 10일을 받아 둔다(서버 호출 수는 같다).
    const { days, source } = await fetchWeather(at, 10);
    setWeather(at.name, { status: 'ready', days, loadedAt: Date.now(), ...(source === undefined ? {} : { source }) });
  } catch {
    setWeather(at.name, { ...current, status: 'error' });
  }
}

// ── 기온별 옷차림 표 ─────────────────────────────────
// 종류마다 입기 좋은 기온 범위(°C, 하루 평균 (최저+최고)/2 기준).
// 흔히 쓰는 기온별 옷차림 표(28°↑ 민소매 … 4°↓ 패딩)를 종류별로 옮긴 것이다. 신발·가방은 기온과 상관없다.
const KIND_TEMP: Partial<Record<Kind, readonly [number, number]>> = {
  민소매: [26, 45],
  반소매티셔츠: [21, 45],
  긴소매티셔츠: [14, 24],
  셔츠: [14, 26],
  블라우스: [14, 26],
  니트: [-20, 18],
  맨투맨: [8, 21],
  트레이닝상의: [8, 22],
  후드: [5, 21],
  카디건: [11, 22],
  후드집업: [9, 21],
  베스트: [9, 22],
  데님팬츠: [-20, 27],
  슬랙스: [-20, 28],
  코튼팬츠: [9, 30],
  카고팬츠: [-5, 28],
  조거팬츠: [-20, 27],
  숏팬츠: [22, 45],
  레깅스: [-20, 27],
  미니스커트: [11, 45],
  미디스커트: [-20, 30],
  롱스커트: [-20, 30],
  점프수트: [14, 30],
  미니원피스: [19, 45],
  미디원피스: [14, 45],
  롱원피스: [14, 45],
  재킷: [9, 19],
  트위드자켓: [8, 17],
  레더재킷: [5, 16],
  데님재킷: [11, 20],
  점퍼: [4, 16],
  야상: [4, 15],
  플리스: [-2, 12],
  트렌치코트: [8, 17],
  코트: [-6, 11],
  숏코트: [-3, 12],
  하프코트: [-5, 11],
  롱코트: [-10, 8],
  퍼자켓: [-10, 8],
  퍼코트: [-20, 5],
  무스탕: [-15, 6],
  숏패딩: [-20, 6],
  롱패딩: [-20, 4],
  경량패딩: [-1, 10],
  부츠: [-20, 15],
  스타킹: [-20, 18],
  샌들: [23, 45],
  슬리퍼: [24, 45],
};

// 기온별 옷차림 표는 하루 평균 기온 기준이다. 아침이 쌀쌀한지는 needsOuter()로 따로 본다.
export function dayTempFor(_slot: Slot, day: Pick<DayWeather, 'min' | 'max'>): number {
  return Math.round((day.min + day.max) / 2);
}

export function fitsTemp(kind: Kind, slot: Slot, day: Pick<DayWeather, 'min' | 'max'>, tolerance = 2): boolean {
  const range = KIND_TEMP[kind];
  if (range === undefined) return true;
  const t = dayTempFor(slot, day);
  return t >= range[0] - tolerance && t <= range[1] + tolerance;
}

// 기온표보다 덥거나 추운 옷인지(옷 고르기 목록의 안내 글). 신발·가방처럼 표에 없으면 null.
export function tempGap(kind: Kind, day: Pick<DayWeather, 'min' | 'max'>, tolerance = 2): '추움' | '더움' | null {
  const range = KIND_TEMP[kind];
  if (range === undefined) return null;
  const t = dayTempFor('상의', day);
  if (t < range[0] - tolerance) return '추움';
  if (t > range[1] + tolerance) return '더움';
  return null;
}

// 겉옷이 있어야 하는 날(아침이 쌀쌀함).
export function needsOuter(day: Pick<DayWeather, 'min'>): boolean {
  return day.min <= 14;
}

// 오늘 기온에 맞는 옷 범위 글(예: '3~14° 기준').
export function tempRangeLabel(day: Pick<DayWeather, 'min' | 'max'>): string {
  return `${day.min}~${day.max}° 기준`;
}

// ── 오늘의 날씨 한 줄 ────────────────────────────────

export type WeatherTip = { title: string; body: string };

export function weatherTip(day: DayWeather): WeatherTip {
  const gap = day.max - day.min;
  if (day.sky === '비' || day.sky === '소나기' || day.sky === '비/눈' || day.pop >= 60) {
    return { title: `비 소식 · ${day.pop}%`, body: '우산을 챙기고, 젖어도 괜찮은 신발로 골랐어요.' };
  }
  if (day.sky === '눈') return { title: '눈 소식', body: '미끄럽지 않은 신발과 따뜻한 겉옷으로 골랐어요.' };
  if (gap >= 10) {
    return { title: `일교차 ${gap}°`, body: '아침엔 쌀쌀하고 낮엔 따뜻해요. 벗기 쉬운 겉옷으로 골랐어요.' };
  }
  if (day.max <= 4) return { title: '많이 추워요', body: '두꺼운 겉옷과 따뜻한 옷으로 골랐어요.' };
  if (day.min >= 25) return { title: '더워요', body: '얇고 시원한 옷으로 골랐어요.' };
  return { title: `${day.sky} · 입기 좋은 날`, body: '오늘 기온에 맞는 옷으로 골랐어요.' };
}
