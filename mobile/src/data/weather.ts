// 추천 탭 날씨: 지역, 날씨 받아 오기, 기온별 옷차림 표.
// 국내 날씨는 기상청(11/20 결정). 서버 GET /weather가 서비스 키(Supabase Secrets)로 단기·중기예보를 받아
// 아래 WeatherResponse 모양으로 바꿔 준다(서버: src/fulljoin/weather.ts). 받지 못하면 '날씨를 불러오지 못했어요'.
import { useSyncExternalStore } from 'react';

import { ApiError, getWeatherData } from './api';
import { KINDS_BY_SLOT, type Kind, type Slot } from './catalog';
import type { Season, WardrobeItem } from './types';
import { SIDO_LIST, type Sido, type Sigungu } from './regions';

// ── 지역 ────────────────────────────────────────────

export type Region = { name: string; lat: number; lon: number; current?: boolean };

// 11/24 팀 결정 10번: 처음엔 현재 위치(폰·브라우저 위치 허용)로 날씨를 보고, 지역 버튼을 다시 누르면 목록에서 직접 고른다.
// 11/25: 현재 위치도 버튼에는 '수원시 영통구'처럼 이름으로 보인다(currentRegionName). 이름을 못 찾을 때만 '현재 위치'.
export const CURRENT_REGION_NAME = '현재 위치';

// 지역 고르기(11/24): 시·도 → 시·군·구(data/regions.ts). 이름은 '경기 수원시 영통구'처럼 시·도를 앞에 붙인다.
// 세종은 '세종시' 하나, 광주·전남(2026.7 통합)은 광주 구는 '광주 동구', 전남 시·군은 '전남 여수시'.
export function regionFor(sido: Sido, item: Sigungu): Region {
  let name: string;
  if (sido.name === '세종') name = item.name;
  else if (sido.name === '광주·전남') name = item.name.startsWith('광주 ') ? item.name : `전남 ${item.name}`;
  else name = `${sido.name} ${item.name}`;
  return { name, lat: item.lat, lon: item.lon };
}

// 지역 고르기 단계(11/25: 도 → 시 → 구 한 단계씩). 광역시·특별시는 바로 구·군, 도는 시·군을 고르고
// 구가 있는 시(수원시 등)는 그 안에서 구를 한 번 더 고른다. 광주·전남은 '광주'를 맨 앞에 두고 그 안에 광주 구.
export type RegionChoice = { name: string; region?: Region; children?: RegionChoice[] };
export const METRO_SIDO: ReadonlySet<string> = new Set(['서울', '부산', '대구', '인천', '대전', '울산', '세종']);

export function choicesOf(sido: Sido): RegionChoice[] {
  const out: RegionChoice[] = [];
  const groups = new Map<string, RegionChoice>();
  for (const item of sido.list) {
    const region = regionFor(sido, item);
    const space = item.name.indexOf(' ');
    if (space < 0) {
      out.push({ name: item.name, region });
      continue;
    }
    const parent = item.name.slice(0, space);
    let group = groups.get(parent);
    if (group === undefined) {
      group = { name: parent, children: [] };
      groups.set(parent, group);
      out.push(group);
    }
    group.children!.push({ name: item.name.slice(space + 1), region });
  }
  return out.sort((x, y) => Number(y.name === '광주') - Number(x.name === '광주') || x.name.localeCompare(y.name, 'ko'));
}

// 현재 위치 → 가장 가까운 시·군·구(경계 가운데 좌표 기준, 11/25). 주소 찾기 서비스(역지오코딩) 없이 목록 안에서 고른다 —
// 경계 근처에서는 옆 구로 나올 수 있다.
export function nearestRegion(lat: number, lon: number): Region | null {
  let best: Region | null = null;
  let bestDistance = Infinity;
  const lonScale = Math.cos((lat * Math.PI) / 180);
  for (const sido of SIDO_LIST) {
    for (const item of sido.list) {
      const distance = (item.lat - lat) ** 2 + ((item.lon - lon) * lonScale) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = regionFor(sido, item);
      }
    }
  }
  return best;
}

// 현재 위치를 지역 버튼에 보여 줄 이름(11/25): 도는 빼고 '수원시 영통구', 특별시·광역시는 '서울 강남구'처럼 그대로.
export function currentRegionName(lat: number, lon: number): string {
  const name = nearestRegion(lat, lon)?.name;
  if (name === undefined) return CURRENT_REGION_NAME;
  const space = name.indexOf(' ');
  if (space < 0) return name;
  const head = name.slice(0, space);
  return METRO_SIDO.has(head) || head === '광주' ? name : name.slice(space + 1);
}

// 지금 지역이 어느 시·도인지(시·도 칸에 표시할 때).
export function sidoOfRegion(at: Region): string | null {
  if (at.current) return null;
  if (at.name.startsWith('광주 ') || at.name.startsWith('전남 ')) return '광주·전남';
  if (at.name === '세종시') return '세종';
  return SIDO_LIST.find((sido) => at.name.startsWith(`${sido.name} `))?.name ?? null;
}

const DEFAULT_REGION: Region = (() => {
  const gyeonggi = SIDO_LIST.find((sido) => sido.name === '경기');
  const item = gyeonggi?.list.find((entry) => entry.name === '수원시 영통구');
  return gyeonggi !== undefined && item !== undefined ? regionFor(gyeonggi, item) : { name: '경기 수원시 영통구', lat: 37.2749, lon: 127.0567 };
})();

// 여행 화면(trip/)이 쓰던 옛 지역 목록(시·구 중심 좌표). 코디 탭은 위 regionFor를 쓴다.
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
// 이번 방문에서 위치를 이미 물어봤는지(거절한 사람에게 화면마다 다시 묻지 않게).
let askedThisVisit = false;

// 이름과 좌표를 JSON으로 저장한다. 예전에 이름만 저장한 지역(옛 목록)도 읽는다.
function readRegion(): Region {
  try {
    const raw = globalThis.localStorage?.getItem(REGION_KEY) ?? null;
    if (raw !== null && raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as Partial<Region>;
      if (typeof parsed.lat === 'number' && typeof parsed.lon === 'number') {
        if (parsed.current === true || typeof parsed.name !== 'string') {
          // 예전에 '현재 위치'로만 저장한 것도 좌표로 이름을 다시 찾는다.
          const name = typeof parsed.name === 'string' && parsed.name !== CURRENT_REGION_NAME ? parsed.name : currentRegionName(parsed.lat, parsed.lon);
          return { name, lat: parsed.lat, lon: parsed.lon, current: true };
        }
        return { name: parsed.name, lat: parsed.lat, lon: parsed.lon };
      }
    }
    return REGIONS.find((item) => item.name === raw) ?? DEFAULT_REGION;
  } catch {
    return DEFAULT_REGION;
  }
}

// 지역을 한 번이라도 정했는지(현재 위치든 목록이든). 안 정했으면 추천 탭이 처음 열릴 때 현재 위치를 물어본다.
export function hasPickedRegion(): boolean {
  if (askedThisVisit) return true;
  try {
    return Boolean(globalThis.localStorage?.getItem(REGION_KEY));
  } catch {
    return false;
  }
}

type GeoPosition = { coords: { latitude: number; longitude: number } };
type Geolocation = {
  getCurrentPosition: (ok: (position: GeoPosition) => void, fail: () => void, options?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number }) => void;
};

// 브라우저(웹)는 navigator.geolocation으로 받는다. 앱(iOS·안드로이드)은 expo-location을 설치한 뒤에 연결한다 — 그 전에는 false.
function geolocation(): Geolocation | null {
  const nav = (globalThis as { navigator?: { geolocation?: Geolocation } }).navigator;
  return typeof nav?.geolocation?.getCurrentPosition === 'function' ? nav.geolocation : null;
}

export function canLocate(): boolean {
  return geolocation() !== null;
}

// 현재 위치를 받아 날씨 지역으로 정한다. 좌표는 소수 둘째 자리(약 1km)까지만 쓴다. 받으면 true.
export function locateCurrentRegion(): Promise<boolean> {
  askedThisVisit = true;
  const geo = geolocation();
  if (geo === null) return Promise.resolve(false);
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (position) => {
        const round = (value: number) => Math.round(value * 100) / 100;
        const lat = round(position.coords.latitude);
        const lon = round(position.coords.longitude);
        setRegion({ name: currentRegionName(lat, lon), lat, lon, current: true });
        resolve(true);
      },
      () => resolve(false),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 30 * 60 * 1000 },
    );
  });
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
  askedThisVisit = true;
  try {
    globalThis.localStorage?.setItem(REGION_KEY, JSON.stringify({ name: next.name, lat: next.lat, lon: next.lon, current: next.current === true }));
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
  try {
    return await getWeatherData<WeatherResponse>(at.lat, at.lon, days);
  } catch (error) {
    const diagnostic = error instanceof ApiError
      ? {
          stage: error.status === 401
            ? 'authentication'
            : error.code === 'weather_not_configured'
              ? 'configuration'
              : error.code === 'weather_unavailable'
                ? 'provider'
                : 'api',
          status: error.status,
          code: error.code,
        }
      : { stage: 'client', status: 0, code: 'weather_request_failed' };
    // 좌표, 토큰, 기상청 키는 로그에 남기지 않는다.
    console.warn('[weather] request failed', diagnostic);
    throw error;
  }
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
  // 긴 바지는 겨울에도 입는다(11/25) — 추위 쪽 제한 없이, 더위 쪽만.
  코튼팬츠: [-20, 30],
  카고팬츠: [-20, 28],
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
  // 겉옷은 아침(최저) 기온 기준(11/27, dayTempFor). 흔히 쓰는 기온별 옷차림 표(은재 님이 준 참고 3장)에 맞춘 4단계 —
  // 9~11° 트렌치·야상·자켓·바람막이 / 5~8° 코트·가죽자켓·플리스(뽀글이)·경량패딩 / 4° 이하 패딩·두꺼운 코트.
  // 같은 단계 안에서는 길수록 더 추운 날까지. 앞뒤 2°는 tempGap의 여유로 봐준다.
  // 가벼운 겉옷(아침 11° 이상)
  데님재킷: [11, 18],
  // 9~11°
  재킷: [9, 16],
  트위드자켓: [9, 15],
  점퍼: [8, 15],
  트렌치코트: [8, 14],
  야상: [8, 14],
  // 5~8°. 뽀글이는 소재 '플리스'로 고른다(아래 OUTER_FLEECE) — 코트와 같은 날부터, 참고 표대로 14°쯤까지.
  레더재킷: [5, 10],
  경량패딩: [3, 10],
  플리스: [3, 12],
  숏코트: [2, 9],
  하프코트: [0, 8],
  코트: [0, 8],
  // 4° 이하. 롱코트는 '두꺼운 코트'라 5~8°와 4° 이하 둘 다.
  롱코트: [-6, 8],
  퍼자켓: [-10, 5],
  무스탕: [-15, 5],
  숏패딩: [-15, 4],
  퍼코트: [-20, 4],
  롱패딩: [-20, 4],
  부츠: [-20, 15],
  스타킹: [-20, 18],
  샌들: [23, 45],
  슬리퍼: [24, 45],
};

// 기온별 옷차림 표는 하루 평균 기온 기준이다. 아침이 쌀쌀한지는 needsOuter()로 따로 본다.
// 11/27: 겉옷만은 아침(최저) 기온으로 본다 — 아침에 입고 나가니까. 평균으로 보면 7~16°(평균 12°) 날에
// 롱코트가 '더울 수도'로 빠지고, 겨울로 고른 롱패딩이 맞는 옷으로 남았다.
export function dayTempFor(slot: Slot, day: Pick<DayWeather, 'min' | 'max'>): number {
  if (slot === '아우터') return day.min;
  return Math.round((day.min + day.max) / 2);
}

// 겉옷으로만 입는 종류(카디건·후드집업·베스트처럼 상의로도 입는 것은 빼고).
const TOPS: readonly string[] = KINDS_BY_SLOT.상의;
const OUTER_ONLY: ReadonlySet<string> = new Set(KINDS_BY_SLOT.아우터.filter((kind) => !TOPS.includes(kind)));
function tempSlotOf(item: TempItem): Slot {
  return OUTER_ONLY.has(item.kind) ? '아우터' : '상의';
}

// ── 옷 하나가 그날 입기 좋은지(11/25 팀 결정) ──
// 1순위: 사람이 고른 계절(옷 추가 '더 자세히'의 계절). 겨울로 고른 미니스커트·니트 미니원피스도 겨울에 추천한다.
// 2순위: 계절이 없거나 처음 값 그대로면, 종류(미니·미디·롱 같은 기장 포함) 기온표 + 소재(니트·기모 등)·두께(기모 스타킹) 보정.
const SEASON_TEMP: Record<Season, readonly [number, number]> = {
  여름: [21, 45],
  봄: [9, 23],
  가을: [7, 22],
  겨울: [-20, 11],
};
// 옷 추가 화면이 처음부터 골라 두는 계절(data/wardrobeArt.ts의 계절 칸 처음 값). 이 값 그대로면 사람이 고른 게 아니라고 보고
// 종류 기온표를 쓴다 — 예: 롱패딩(처음 값 가을·겨울)을 가을 기온에 추천하지 않게.
const DEFAULT_SEASONS: Partial<Record<Kind, readonly Season[]>> = {
  반소매티셔츠: ['봄', '여름'], 민소매: ['봄', '여름'], 숏팬츠: ['봄', '여름'], 샌들: ['봄', '여름'], 슬리퍼: ['봄', '여름'],
  니트: ['가을', '겨울'], 맨투맨: ['가을', '겨울'], 후드: ['가을', '겨울'], 카디건: ['가을', '겨울'],
  퍼코트: ['가을', '겨울'], 무스탕: ['가을', '겨울'], 숏코트: ['가을', '겨울'], 하프코트: ['가을', '겨울'], 롱코트: ['가을', '겨울'],
  숏패딩: ['가을', '겨울'], 롱패딩: ['가을', '겨울'], 경량패딩: ['가을', '겨울'], 부츠: ['가을', '겨울'],
  스타킹: ['가을', '겨울'], 모자: ['가을', '겨울'], 벨트: ['가을', '겨울'],
};
const WARM_MATERIALS: ReadonlySet<string> = new Set(['니트', '울', '캐시미어', '기모', '플리스', '퍼', '코듀로이']);
const DRESS_OR_SKIRT: ReadonlySet<string> = new Set(['미니원피스', '미디원피스', '롱원피스', '미니스커트', '미디스커트', '롱스커트']);
// 뽀글이(소재 플리스) 겉옷: 코트와 같은 날(5~8°)부터 참고 표의 14°쯤까지.
const OUTER_FLEECE: readonly [number, number] = [3, 12];

export type TempItem = Pick<WardrobeItem, 'kind'> & Partial<Pick<WardrobeItem, 'seasons' | 'material' | 'details'>>;

function chosenSeasons(item: TempItem): readonly Season[] {
  const seasons = item.seasons ?? [];
  const defaults = DEFAULT_SEASONS[item.kind] ?? [];
  const same = seasons.length === defaults.length && seasons.every((season) => defaults.includes(season));
  return same ? [] : seasons;
}

// 이 옷을 입기 좋은 하루 평균 기온 범위. 신발·가방처럼 기온과 상관없으면 undefined.
export function tempRangeOf(item: TempItem): readonly [number, number] | undefined {
  const seasons = chosenSeasons(item);
  if (seasons.length > 0) {
    const ranges = seasons.map((season) => SEASON_TEMP[season]);
    const low = Math.min(...ranges.map((r) => r[0]));
    const high = Math.max(...ranges.map((r) => r[1]));
    // 겉옷의 따뜻함은 종류가 정한다(11/27): 겨울로 고른 롱패딩도 11°까지 맞는 옷이 되지 않게, 더운 쪽은 종류 기온표를 넘지 않게.
    // 추운 쪽은 고른 계절대로 넓혀 준다(얇은 겉옷을 겨울에 겹쳐 입는 사람도 있으니).
    const kindRange = KIND_TEMP[item.kind];
    if (kindRange !== undefined && OUTER_ONLY.has(item.kind)) return [Math.min(low, kindRange[0]), Math.min(high, kindRange[1])];
    return [low, high];
  }
  // 스타킹 두께(옷 추가에서 고른 것, details.두께): 기모는 한겨울까지, 비침은 늦봄·초가을까지.
  if (item.kind === '스타킹' && item.details?.두께 === '기모') return [-20, 12];
  if (item.kind === '스타킹' && item.details?.두께 === '비침') return [5, 24];
  const range = KIND_TEMP[item.kind];
  if (range === undefined) return undefined;
  const materials = item.material ?? [];
  if (OUTER_ONLY.has(item.kind)) {
    // 뽀글이(플리스) 겉옷은 종류와 상관없이 코트만큼 — 더 따뜻한 종류(무스탕 등)면 그대로.
    if (materials.includes('플리스')) return [Math.min(range[0], OUTER_FLEECE[0]), Math.min(range[1], OUTER_FLEECE[1])];
    // 울·기모 같은 소재 겉옷은 추운 쪽만 4° 넓힌다(코트 표는 이미 울 코트 기준이라 크게 넓히지 않음).
    if (materials.some((material) => WARM_MATERIALS.has(material))) return [Math.max(-20, range[0] - 4), range[1]];
    return range;
  }
  // 니트·기모 같은 따뜻한 소재면 더 추운 날까지(8° 아래로), 대신 아주 더운 날은 빼고.
  // 11/27: 니트·울·기모 원피스·스커트(니트 미니원피스 등)는 스타킹과 한겨울에도 입는다 → 추운 쪽은 끝까지.
  if (materials.some((material) => WARM_MATERIALS.has(material)) && DRESS_OR_SKIRT.has(item.kind)) {
    return [-20, Math.min(range[1], 24)];
  }
  if (materials.some((material) => WARM_MATERIALS.has(material))) {
    return [Math.max(-20, range[0] - 8), Math.min(range[1], 24)];
  }
  return range;
}

export function fitsTemp(item: TempItem, day: Pick<DayWeather, 'min' | 'max'>, tolerance = 2): boolean {
  return tempGap(item, day, tolerance) === null;
}

// 기온표보다 덥거나 추운 옷인지(옷 고르기 목록의 안내 글). 신발·가방처럼 표에 없으면 null.
export function tempGap(item: TempItem, day: Pick<DayWeather, 'min' | 'max'>, tolerance = 2): '추움' | '더움' | null {
  const range = tempRangeOf(item);
  if (range === undefined) return null;
  const t = dayTempFor(tempSlotOf(item), day);
  if (t < range[0] - tolerance) return '추움';
  if (t > range[1] + tolerance) return '더움';
  return null;
}

// 기온표에서 몇 도 벗어났는지(맞으면 0). 딱 맞는 옷이 없을 때 가장 가까운 옷을 고르는 데 쓴다.
export function tempDistance(item: TempItem, day: Pick<DayWeather, 'min' | 'max'>): number {
  const range = tempRangeOf(item);
  if (range === undefined) return 0;
  const t = dayTempFor(tempSlotOf(item), day);
  return t < range[0] ? range[0] - t : t > range[1] ? t - range[1] : 0;
}

// ── 계절을 고른 옷의 순서(11/27) ──
// 사계절로 고른 옷도 늘 맞는 옷으로 보이지만, 그날에 딱 맞는 계절로 고른 옷(지금은 가을·겨울)을 먼저 쓴다.
// 그날의 계절 = 하루 평균 기온이 그 계절 범위(앞뒤 2°)에 드는 계절. 예: 7~16°(평균 12°) → 봄·가을·겨울.
export function seasonsFor(day: Pick<DayWeather, 'min' | 'max'>, tolerance = 2): Season[] {
  const t = dayTempFor('상의', day);
  return (Object.keys(SEASON_TEMP) as Season[]).filter((season) => t >= SEASON_TEMP[season][0] - tolerance && t <= SEASON_TEMP[season][1] + tolerance);
}

// 사람이 고른 계절 중 그날과 안 맞는 계절 수. 0이면 그날에 딱 맞게 고른 옷, 사계절 옷은 여름(또는 겨울) 몫만큼 뒤로.
// 계절을 안 고른 옷은 종류 기온표로 이미 그날에 맞춰 골랐으니 0.
export function seasonMismatch(item: TempItem, day: Pick<DayWeather, 'min' | 'max'>): number {
  const chosen = chosenSeasons(item);
  if (chosen.length === 0) return 0;
  const today = seasonsFor(day);
  return chosen.filter((season) => !today.includes(season)).length;
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
