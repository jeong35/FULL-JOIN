// 추천 탭 날씨(기상청). 서버가 서비스 키로 단기예보(오늘~4일 뒤, 3시간마다 발표)와
// 중기예보(4~10일 뒤, 06·18시 발표)를 받아 앱이 쓰는 하루 단위 모양(WeatherResponse)으로 바꾼다.
// 받아 오기(fetch)는 supabase/functions/api/index.ts가 하고, 이 파일은 계산만 한다(시험: scripts/check-weather.mjs).
// 앱 쪽 모양은 mobile/src/data/weather.ts와 같아야 한다.
import { z } from "zod";

export const SKIES = ["맑음", "구름 조금", "구름 많음", "흐림", "비", "비/눈", "눈", "소나기"] as const;
export type Sky = (typeof SKIES)[number];

export type HourWeather = { time: string; temp: number; sky: Sky; pop: number };
export type DayWeather = {
  date: string; // YYYY-MM-DD (한국 시간)
  min: number; // 아침 최저
  max: number; // 낮 최고
  sky: Sky; // 그날 대표 하늘(낮 06~21시 기준)
  pop: number; // 비 올 확률 최고값(%)
  feels_like?: number; // 아침 체감(단기예보 범위만)
  hourly: HourWeather[]; // 08~20시 2시간 간격(단기예보 범위만). 없으면 []
};
export type WeatherResponse = { days: DayWeather[]; issued_at: string; source: "기상청" };

// 한국 땅 안쪽 좌표만 받는다(기상청 격자는 한반도만 다룬다).
export const weatherQuerySchema = z.object({
  lat: z.coerce.number().min(32.5).max(39),
  lon: z.coerce.number().min(124).max(132),
  days: z.coerce.number().int().min(1).max(10).default(7),
});
export type WeatherQuery = z.infer<typeof weatherQuerySchema>;

// ── 시간(한국 시간) ─────────────────────────────────

const KST_MS = 9 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");

type KstParts = { y: number; m: number; d: number; h: number; min: number };
function kst(now: Date): KstParts {
  const t = new Date(now.getTime() + KST_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), min: t.getUTCMinutes() };
}

// 'YYYYMMDD'에 n일을 더한다.
export function addDaysCompact(yyyymmdd: string, n: number): string {
  const t = new Date(Date.UTC(Number(yyyymmdd.slice(0, 4)), Number(yyyymmdd.slice(4, 6)) - 1, Number(yyyymmdd.slice(6, 8)) + n));
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}`;
}

export function kstDateCompact(now: Date): string {
  const p = kst(now);
  return `${p.y}${pad(p.m)}${pad(p.d)}`;
}

const dashed = (yyyymmdd: string) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

// ── 격자(위경도 → 기상청 nx, ny) ─────────────────────
// 기상청 동네예보 격자(람베르트 정각원추도법, 5km)의 공식 변환식.

export function toGrid(lat: number, lon: number): { nx: number; ny: number } {
  const RE = 6371.00877 / 5.0;
  const DEGRAD = Math.PI / 180;
  const slat1 = 30 * DEGRAD;
  const slat2 = 60 * DEGRAD;
  const olon = 126 * DEGRAD;
  const olat = 38 * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  const ro = (RE * sf) / Math.pow(Math.tan(Math.PI * 0.25 + olat * 0.5), sn);
  const ra = (RE * sf) / Math.pow(Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5), sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  return { nx: Math.floor(ra * Math.sin(theta) + 43 + 0.5), ny: Math.floor(ro - ra * Math.cos(theta) + 136 + 0.5) };
}

// ── 발표 시각 고르기 ─────────────────────────────────
// 단기예보는 02·05·08·11·14·17·20·23시에 발표하고 10분쯤 뒤부터 받을 수 있다.
const SHORT_BASES = [2, 5, 8, 11, 14, 17, 20, 23] as const;
const READY_AFTER_MIN = 10;

export type ShortBase = { date: string; time: string };

export function latestShortBase(now: Date): ShortBase {
  const p = kst(now);
  const minutes = p.h * 60 + p.min;
  const today = `${p.y}${pad(p.m)}${pad(p.d)}`;
  const ready = SHORT_BASES.filter((h) => h * 60 + READY_AFTER_MIN <= minutes);
  const last = ready.at(-1);
  if (last === undefined) return { date: addDaysCompact(today, -1), time: "2300" };
  return { date: today, time: `${pad(last)}00` };
}

// 오늘 새벽(03시~)부터의 시간별 값과 최저기온은 오늘 02시 발표에만 남아 있다.
// 최신 발표가 그보다 늦으면 02시 발표도 같이 받아 앞부분을 채운다.
export function earlyShortBase(now: Date): ShortBase | null {
  const latest = latestShortBase(now);
  if (latest.date !== kstDateCompact(now) || latest.time === "0200") return null;
  return { date: latest.date, time: "0200" };
}

// 중기예보는 06·18시 발표. 받지 못하면(아직 안 올라옴) 한 번 앞 발표로 다시 받는다.
export function midTmFcCandidates(now: Date): [string, string] {
  const p = kst(now);
  const minutes = p.h * 60 + p.min;
  const today = `${p.y}${pad(p.m)}${pad(p.d)}`;
  const yesterday = addDaysCompact(today, -1);
  if (minutes >= 18 * 60 + READY_AFTER_MIN) return [`${today}1800`, `${today}0600`];
  if (minutes >= 6 * 60 + READY_AFTER_MIN) return [`${today}0600`, `${yesterday}1800`];
  return [`${yesterday}1800`, `${yesterday}0600`];
}

// ── 중기예보 구역 ────────────────────────────────────
// 기온은 대표 도시(taRegId), 하늘·비는 도 단위 육상 구역(landRegId). 가장 가까운 대표 도시를 쓴다.
export type MidRegion = { name: string; lat: number; lon: number; landRegId: string; taRegId: string };
export const MID_REGIONS: readonly MidRegion[] = [
  { name: "서울", lat: 37.5665, lon: 126.978, landRegId: "11B00000", taRegId: "11B10101" },
  { name: "인천", lat: 37.4563, lon: 126.7052, landRegId: "11B00000", taRegId: "11B20201" },
  { name: "수원", lat: 37.2636, lon: 127.0286, landRegId: "11B00000", taRegId: "11B20601" },
  { name: "파주", lat: 37.7599, lon: 126.78, landRegId: "11B00000", taRegId: "11B20305" },
  { name: "춘천", lat: 37.8813, lon: 127.73, landRegId: "11D10000", taRegId: "11D10301" },
  { name: "원주", lat: 37.3422, lon: 127.9202, landRegId: "11D10000", taRegId: "11D10401" },
  { name: "강릉", lat: 37.7519, lon: 128.8761, landRegId: "11D20000", taRegId: "11D20501" },
  { name: "청주", lat: 36.6424, lon: 127.489, landRegId: "11C10000", taRegId: "11C10301" },
  { name: "대전", lat: 36.3504, lon: 127.3845, landRegId: "11C20000", taRegId: "11C20401" },
  { name: "세종", lat: 36.48, lon: 127.289, landRegId: "11C20000", taRegId: "11C20404" },
  { name: "서산", lat: 36.7848, lon: 126.4503, landRegId: "11C20000", taRegId: "11C20101" },
  { name: "전주", lat: 35.8242, lon: 127.148, landRegId: "11F10000", taRegId: "11F10201" },
  { name: "군산", lat: 35.9676, lon: 126.7366, landRegId: "11F10000", taRegId: "21F10501" },
  { name: "광주", lat: 35.1595, lon: 126.8526, landRegId: "11F20000", taRegId: "11F20501" },
  { name: "목포", lat: 34.8118, lon: 126.3922, landRegId: "11F20000", taRegId: "21F20801" },
  { name: "여수", lat: 34.7604, lon: 127.6622, landRegId: "11F20000", taRegId: "11F20401" },
  { name: "대구", lat: 35.8714, lon: 128.6014, landRegId: "11H10000", taRegId: "11H10701" },
  { name: "안동", lat: 36.5684, lon: 128.7294, landRegId: "11H10000", taRegId: "11H10501" },
  { name: "포항", lat: 36.019, lon: 129.3435, landRegId: "11H10000", taRegId: "11H10201" },
  { name: "부산", lat: 35.1796, lon: 129.0756, landRegId: "11H20000", taRegId: "11H20201" },
  { name: "울산", lat: 35.5384, lon: 129.3114, landRegId: "11H20000", taRegId: "11H20101" },
  { name: "창원", lat: 35.228, lon: 128.6811, landRegId: "11H20000", taRegId: "11H20301" },
  { name: "제주", lat: 33.4996, lon: 126.5312, landRegId: "11G00000", taRegId: "11G00201" },
  { name: "서귀포", lat: 33.2541, lon: 126.5601, landRegId: "11G00000", taRegId: "11G00401" },
];

export function nearestMidRegion(lat: number, lon: number): MidRegion {
  const cos = Math.cos((lat * Math.PI) / 180);
  let best = MID_REGIONS[0] as MidRegion;
  let bestDist = Infinity;
  for (const region of MID_REGIONS) {
    const dist = (region.lat - lat) ** 2 + ((region.lon - lon) * cos) ** 2;
    if (dist < bestDist) {
      best = region;
      bestDist = dist;
    }
  }
  return best;
}

// ── 기상청 응답 봉투 ─────────────────────────────────
// { response: { header: { resultCode, resultMsg }, body: { items: { item: [...] } } } }
// 결과 없음(03)은 빈 목록, 그 밖의 코드는 실패로 본다. 키 오류 등은 JSON이 아니라 XML로 오기도 한다.
const envelopeSchema = z.object({
  response: z.object({
    header: z.object({ resultCode: z.string(), resultMsg: z.string().optional() }),
    body: z.object({ items: z.union([z.object({ item: z.array(z.unknown()) }), z.literal("")]).optional() }).optional(),
  }),
});

export type KmaItems = { ok: true; items: unknown[] } | { ok: false; code: string };

export function kmaItemsFrom(text: string): KmaItems {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    const code = /<returnReasonCode>(\d+)<\/returnReasonCode>/.exec(text)?.[1];
    return { ok: false, code: code === undefined ? "not_json" : `gateway_${code}` };
  }
  const parsed = envelopeSchema.safeParse(value);
  if (!parsed.success) return { ok: false, code: "bad_shape" };
  const { header, body } = parsed.data.response;
  if (header.resultCode === "03") return { ok: true, items: [] };
  if (header.resultCode !== "00") return { ok: false, code: header.resultCode };
  const items = body?.items;
  return { ok: true, items: items === undefined || items === "" ? [] : items.item };
}

// ── 단기예보 ────────────────────────────────────────

const shortItemSchema = z.object({
  category: z.string(),
  fcstDate: z.string().regex(/^\d{8}$/),
  fcstTime: z.string().regex(/^\d{4}$/),
  fcstValue: z.union([z.string(), z.number()]),
});

type HourValues = Record<string, string>;
// 날짜(YYYYMMDD) → 시각(HHMM) → 항목 → 값. 뒤에 넣은 발표가 앞의 값을 덮는다.
export type ShortGrid = Map<string, Map<string, HourValues>>;

export function shortGrid(...issuances: readonly unknown[][]): ShortGrid {
  const grid: ShortGrid = new Map();
  for (const items of issuances) {
    for (const raw of items) {
      const item = shortItemSchema.safeParse(raw);
      if (!item.success) continue;
      const { category, fcstDate, fcstTime, fcstValue } = item.data;
      let day = grid.get(fcstDate);
      if (day === undefined) grid.set(fcstDate, (day = new Map()));
      let hour = day.get(fcstTime);
      if (hour === undefined) day.set(fcstTime, (hour = {}));
      hour[category] = String(fcstValue);
    }
  }
  return grid;
}

const num = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
};

// 하늘(SKY 1 맑음·3 구름많음·4 흐림)과 강수 형태(PTY 0 없음·1 비·2 비/눈·3 눈·4 소나기)를 앱 하늘로.
export function skyOf(sky: string | undefined, pty: string | undefined): Sky {
  switch (pty) {
    case "1":
    case "5":
      return "비";
    case "2":
    case "6":
      return "비/눈";
    case "3":
    case "7":
      return "눈";
    case "4":
      return "소나기";
  }
  if (sky === "4") return "흐림";
  if (sky === "3") return "구름 많음";
  return "맑음";
}

// 비·눈이 가장 신경 쓰이는 순서(같은 시간 수일 때 앞의 것을 대표로).
const WET_ORDER: readonly Sky[] = ["눈", "비/눈", "비", "소나기"];
const DRY_ORDER: readonly Sky[] = ["흐림", "구름 많음", "구름 조금", "맑음"];

function representative(skies: readonly Sky[]): Sky {
  const wet = skies.filter((sky) => WET_ORDER.includes(sky));
  const pool = wet.length > 0 ? wet : skies;
  const order = wet.length > 0 ? WET_ORDER : DRY_ORDER;
  let best: Sky = pool[0] ?? "맑음";
  let bestCount = 0;
  for (const sky of order) {
    const count = pool.filter((item) => item === sky).length;
    if (count > bestCount) {
      best = sky;
      bestCount = count;
    }
  }
  return best;
}

// 체감온도(기상청 겨울철 식). 10°C 이하이고 바람이 4.8km/h 이상일 때만 기온보다 낮게 본다.
export function windChill(temp: number, windMs: number): number {
  const v = windMs * 3.6;
  if (temp > 10 || v < 4.8) return temp;
  const p = Math.pow(v, 0.16);
  return 13.12 + 0.6215 * temp - 11.37 * p + 0.3965 * p * temp;
}

const HOURLY_TIMES = ["0800", "1000", "1200", "1400", "1600", "1800", "2000"] as const;
const MIN_HOURS_FOR_DAY = 8; // 이보다 적게 남은 날은 단기예보로 하루를 만들지 않는다(중기예보로 채운다).

export function shortDay(grid: ShortGrid, yyyymmdd: string): DayWeather | null {
  const hours = grid.get(yyyymmdd);
  if (hours === undefined) return null;
  const times = [...hours.keys()].filter((time) => num(hours.get(time)?.TMP) !== undefined).sort();
  if (times.length < MIN_HOURS_FOR_DAY) return null;
  const at = (time: string) => hours.get(time) ?? {};
  const temps = times.map((time) => num(at(time).TMP) as number);
  const tmn = times.map((time) => num(at(time).TMN)).find((v) => v !== undefined);
  const tmx = times.map((time) => num(at(time).TMX)).find((v) => v !== undefined);
  const min = Math.round(tmn ?? Math.min(...temps));
  const max = Math.round(tmx ?? Math.max(...temps));
  const daytime = times.filter((time) => time >= "0600" && time <= "2100");
  const skies = (daytime.length > 0 ? daytime : times).map((time) => skyOf(at(time).SKY, at(time).PTY));
  const pop = Math.max(0, ...times.map((time) => num(at(time).POP) ?? 0));
  const hourly: HourWeather[] = HOURLY_TIMES.filter((time) => num(at(time).TMP) !== undefined).map((time) => ({
    time: `${time.slice(0, 2)}:${time.slice(2)}`,
    temp: Math.round(num(at(time).TMP) as number),
    sky: skyOf(at(time).SKY, at(time).PTY),
    pop: num(at(time).POP) ?? 0,
  }));
  const day: DayWeather = { date: dashed(yyyymmdd), min: Math.min(min, max), max: Math.max(min, max), sky: representative(skies), pop, hourly };
  // 아침 체감: 06시(없으면 03~09시 중 가장 가까운 시각)의 기온과 바람.
  const morning = ["0600", "0500", "0700", "0400", "0800", "0300", "0900"].find((time) => num(at(time).TMP) !== undefined && num(at(time).WSD) !== undefined);
  if (morning !== undefined) {
    day.feels_like = Math.round(windChill(num(at(morning).TMP) as number, num(at(morning).WSD) as number));
  }
  return day;
}

// ── 중기예보 ────────────────────────────────────────
// 육상(wf·rnSt)은 4~7일 뒤 오전·오후(wf4Am, rnSt4Pm …), 8~10일 뒤 하루(wf8, rnSt8),
// 기온(taMin4, taMax4 …)은 날마다 하나. 발표일 기준 n일 뒤다(예전 발표는 3일 뒤부터 있었다).
const midItemSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()]));

export function wfToSky(wf: string | undefined): Sky | undefined {
  if (wf === undefined || wf.trim() === "") return undefined;
  if (wf.includes("비/눈") || wf.includes("눈/비")) return "비/눈";
  if (wf.includes("소나기")) return "소나기";
  if (wf.includes("눈")) return "눈";
  if (wf.includes("비")) return "비";
  if (wf.includes("흐")) return "흐림";
  if (wf.includes("구름")) return "구름 많음";
  if (wf.includes("맑")) return "맑음";
  return undefined;
}

function firstRecord(items: readonly unknown[]): Record<string, string | number | null> | null {
  for (const item of items) {
    const parsed = midItemSchema.safeParse(item);
    if (parsed.success) return parsed.data;
  }
  return null;
}

export function midDays(tmFc: string, landItems: readonly unknown[], taItems: readonly unknown[]): DayWeather[] {
  const land = firstRecord(landItems) ?? {};
  const ta = firstRecord(taItems);
  if (ta === null) return [];
  const str = (key: string) => {
    const value = land[key];
    return value === null || value === undefined ? undefined : String(value);
  };
  const base = tmFc.slice(0, 8);
  const days: DayWeather[] = [];
  for (let n = 3; n <= 10; n += 1) {
    const min = num(ta[`taMin${n}`] === null || ta[`taMin${n}`] === undefined ? undefined : String(ta[`taMin${n}`]));
    const max = num(ta[`taMax${n}`] === null || ta[`taMax${n}`] === undefined ? undefined : String(ta[`taMax${n}`]));
    if (min === undefined || max === undefined) continue;
    const skies = [wfToSky(str(`wf${n}Am`)), wfToSky(str(`wf${n}Pm`)), wfToSky(str(`wf${n}`))].filter((sky): sky is Sky => sky !== undefined);
    const wet = skies.find((sky) => WET_ORDER.includes(sky));
    const sky = wet ?? skies.at(-1) ?? "맑음";
    const pops = [str(`rnSt${n}Am`), str(`rnSt${n}Pm`), str(`rnSt${n}`)].map(num).filter((v): v is number => v !== undefined);
    days.push({
      date: dashed(addDaysCompact(base, n)),
      min: Math.round(Math.min(min, max)),
      max: Math.round(Math.max(min, max)),
      sky,
      pop: Math.max(0, ...pops),
      hourly: [],
    });
  }
  return days;
}

// ── 합치기 ──────────────────────────────────────────
// 오늘부터 days일. 단기예보가 있는 날은 단기예보, 없으면 중기예보. 중간에 빈 날이 생기면 거기서 멈춘다.
export function buildWeather(input: {
  now: Date;
  days: number;
  short: ShortGrid;
  mid: readonly DayWeather[];
  issuedBase: ShortBase;
}): WeatherResponse {
  const today = kstDateCompact(input.now);
  const midByDate = new Map(input.mid.map((day) => [day.date, day]));
  const days: DayWeather[] = [];
  for (let i = 0; i < input.days; i += 1) {
    const key = addDaysCompact(today, i);
    const day = shortDay(input.short, key) ?? midByDate.get(dashed(key));
    if (day === undefined) break;
    days.push(day);
  }
  const { date, time } = input.issuedBase;
  return {
    days,
    issued_at: `${dashed(date)}T${time.slice(0, 2)}:${time.slice(2)}:00+09:00`,
    source: "기상청",
  };
}
