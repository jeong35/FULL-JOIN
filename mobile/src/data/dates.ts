// 날짜 글자(YYYY-MM-DD, 기기 시간 기준)와 한국어 표시.
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(now = new Date()): string {
  return dateKey(now);
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, days: number): string {
  const date = parseKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

export function nextDays(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(from, i));
}

export function weekday(key: string): (typeof WEEKDAYS)[number] {
  return WEEKDAYS[parseKey(key).getDay()];
}

export function dayOfMonth(key: string): number {
  return parseKey(key).getDate();
}

// '11월 18일 수요일'
export function longDateLabel(key: string): string {
  const date = parseKey(key);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekday(key)}요일`;
}

// '지금 오전 8시'
export function nowLabel(now = new Date()): string {
  const h = now.getHours();
  return `지금 ${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}시`;
}

// 코디 정하기 버튼에 쓰는 날 이름(11/27): 오늘 · 내일 · 금요일 → '오늘 코디로 정하기'.
export function codiDayLabel(key: string, today = todayKey()): string {
  if (key === today) return '오늘';
  if (key === addDays(today, 1)) return '내일';
  return `${weekday(key)}요일`;
}
