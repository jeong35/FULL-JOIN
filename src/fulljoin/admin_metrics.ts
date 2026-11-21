export type AnalyticsEventRow = {
  received_at: string;
  client_ts: string | null;
  device_id: string;
  session_id: string;
  platform: string | null;
  user_id: string | null;
  name: string;
  props: Record<string, unknown>;
};

export type WardrobeCountRow = { user_id: string };

export type LlmMetricRow = {
  feature: string;
  response_mode: "llm" | "grounded" | "fallback";
  llm_called: boolean;
  model: string | null;
  prompt_version: string;
  release_git_sha: string | null;
  status: "success" | "failure" | "fallback" | "grounded";
  error_type: string | null;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number | null;
  latency_ms: number;
  fallback_used: boolean;
  fallback_reason: string | null;
  created_at: string;
};

export type MetricsRange = { from: string; to: string };

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const TEST_USER_PATTERN = /^(?:eval|test|smoke)-/u;

function timestamp(event: AnalyticsEventRow): number {
  return Date.parse(event.client_ts ?? event.received_at);
}

function inRange(value: string | number, range: MetricsRange): boolean {
  const point = typeof value === "number" ? value : Date.parse(value);
  return point >= Date.parse(range.from) && point < Date.parse(range.to);
}

function kstDateParts(value: string | number): { year: number; month: number; day: number } {
  const point = (typeof value === "number" ? value : Date.parse(value)) + KST_OFFSET_MS;
  const date = new Date(point);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function kstDayKey(value: string | number): string {
  const { year, month, day } = kstDateParts(value);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function kstWeekKey(value: string | number): string {
  const { year, month, day } = kstDateParts(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function isTruthyTestFlag(value: unknown): boolean {
  return value === true || value === "true" || value === "test" || value === "smoke";
}

export function isTestEvent(event: AnalyticsEventRow): boolean {
  return (event.user_id !== null && TEST_USER_PATTERN.test(event.user_id)) ||
    isTruthyTestFlag(event.props.is_test) || isTruthyTestFlag(event.props.smoke_test) ||
    isTruthyTestFlag(event.props.environment);
}

function uniqueUsers(events: readonly AnalyticsEventRow[]): Set<string> {
  return new Set(events.flatMap((event) => event.user_id === null ? [] : [event.user_id]));
}

function percent(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Number(((numerator / denominator) * 100).toFixed(1));
}

function percentile(values: readonly number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))] ?? null;
}

function eventCount(events: readonly AnalyticsEventRow[], name: string): number {
  return events.filter((event) => event.name === name).length;
}

function eventUsers(events: readonly AnalyticsEventRow[], names: readonly string[]): Set<string> {
  const allowed = new Set(names);
  return uniqueUsers(events.filter((event) => allowed.has(event.name)));
}

function groupDistinctUsers(events: readonly AnalyticsEventRow[], keyFor: (value: number) => string) {
  const grouped = new Map<string, Set<string>>();
  for (const event of events) {
    if (event.user_id === null) continue;
    const key = keyFor(timestamp(event));
    const users = grouped.get(key) ?? new Set<string>();
    users.add(event.user_id);
    grouped.set(key, users);
  }
  return [...grouped].sort(([left], [right]) => left.localeCompare(right))
    .map(([period, users]) => ({ period, users: users.size }));
}

const FUNNEL_STEPS = [
  { key: "login", label: "로그인", events: ["login_success"] },
  { key: "taste", label: "추구미 설정", events: ["taste_done", "taste_later"] },
  { key: "wardrobe", label: "옷장 등록", events: ["wardrobe_add_done"] },
  { key: "saved", label: "사진 저장", events: ["photo_save_done"] },
  { key: "compared", label: "비교 결과", events: ["result_view"] },
  { key: "decided", label: "선택/쇼핑", events: ["item_choice", "shop_link_click"] },
] as const;

function buildFunnel(events: readonly AnalyticsEventRow[]) {
  const byUser = new Map<string, Set<string>>();
  for (const event of events) {
    if (event.user_id === null) continue;
    const names = byUser.get(event.user_id) ?? new Set<string>();
    names.add(event.name);
    byUser.set(event.user_id, names);
  }
  let eligible = new Set(byUser.keys());
  return FUNNEL_STEPS.map((step, index) => {
    const users = new Set([...eligible].filter((userId) => step.events.some((name) => byUser.get(userId)?.has(name))));
    const previous = index === 0 ? byUser.size : eligible.size;
    eligible = users;
    return {
      key: step.key,
      label: step.label,
      users: users.size,
      conversion_from_previous_pct: percent(users.size, previous),
      dropoff_from_previous_pct: previous === 0 ? null : Number((100 - (percent(users.size, previous) ?? 0)).toFixed(1)),
    };
  });
}

function currentWardrobeCounts(rows: readonly WardrobeCountRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  return counts;
}

export function summarizeProductAnalytics(
  allEvents: readonly AnalyticsEventRow[],
  wardrobeRows: readonly WardrobeCountRow[],
  range: MetricsRange,
) {
  const eligibleEvents = allEvents.filter((event) => !isTestEvent(event));
  const events = eligibleEvents.filter((event) => inRange(timestamp(event), range));
  const excludedEvents = allEvents.filter(isTestEvent).filter((event) => inRange(timestamp(event), range)).length;
  const activeUsers = uniqueUsers(events);
  const firstLoginByUser = new Map<string, number>();
  for (const event of eligibleEvents.filter((candidate) => candidate.name === "login_success" && candidate.user_id !== null)) {
    const point = timestamp(event);
    const existing = firstLoginByUser.get(event.user_id!);
    if (existing === undefined || point < existing) firstLoginByUser.set(event.user_id!, point);
  }
  const newUsers = new Set([...firstLoginByUser].filter(([, point]) => inRange(point, range)).map(([userId]) => userId));
  const wardrobeCounts = currentWardrobeCounts(wardrobeRows.filter((row) => !TEST_USER_PATTERN.test(row.user_id)));
  const usersWithFive = [...newUsers].filter((userId) => (wardrobeCounts.get(userId) ?? 0) >= 5).length;
  const wardrobeUsers = [...activeUsers].map((userId) => wardrobeCounts.get(userId) ?? 0);
  const introUsers = eventUsers(events, ["intro_view"]);
  const introDoneUsers = eventUsers(events, ["intro_done"]);
  const resultUsers = eventUsers(events, ["result_view"]);
  const shopUsers = eventUsers(events, ["shop_link_click"]);
  const chatUsers = eventUsers(events, ["chat_send"]);

  const screenDurations = new Map<string, number[]>();
  for (const event of events.filter((candidate) => candidate.name === "screen_leave")) {
    const screen = typeof event.props.screen === "string" ? event.props.screen : "unknown";
    const duration = typeof event.props.duration_ms === "number" && event.props.duration_ms >= 0
      ? event.props.duration_ms : null;
    if (duration === null) continue;
    const values = screenDurations.get(screen) ?? [];
    values.push(duration);
    screenDurations.set(screen, values);
  }

  const featureEvents = [
    ["archive_filter_apply", "아카이브 필터"],
    ["comparison_reopened", "재비교"],
    ["item_choice", "비슷함 선택"],
    ["tutorial_replay_start", "튜토리얼 다시 보기"],
  ] as const;

  return {
    range,
    timezone: "Asia/Seoul",
    excluded_test_event_count: excludedEvents,
    active_users: activeUsers.size,
    new_users: newUsers.size,
    dau: groupDistinctUsers(events, kstDayKey),
    wau: groupDistinctUsers(events, kstWeekKey),
    wardrobe: {
      users_in_denominator: activeUsers.size,
      average_items_per_active_user: wardrobeUsers.length === 0
        ? null : Number((wardrobeUsers.reduce((sum, count) => sum + count, 0) / wardrobeUsers.length).toFixed(1)),
      new_users_with_five_items: usersWithFive,
      new_user_five_item_rate_pct: percent(usersWithFive, newUsers.size),
      target_pct: 60,
    },
    tutorial: {
      started_users: introUsers.size,
      completed_users: [...introDoneUsers].filter((userId) => introUsers.has(userId)).length,
      completion_rate_pct: percent([...introDoneUsers].filter((userId) => introUsers.has(userId)).length, introUsers.size),
    },
    funnel: buildFunnel(events),
    activity: {
      photo_saves: eventCount(events, "photo_save_done"),
      comparisons: eventCount(events, "result_view"),
      shopping_link_clicks: eventCount(events, "shop_link_click"),
      shopping_click_user_rate_pct: percent([...shopUsers].filter((userId) => resultUsers.has(userId)).length, resultUsers.size),
      chat_messages: eventCount(events, "chat_send"),
      chatbot_user_rate_pct: percent(chatUsers.size, activeUsers.size),
    },
    screen_duration: [...screenDurations].map(([screen, values]) => ({
      screen,
      samples: values.length,
      average_seconds: Number((values.reduce((sum, value) => sum + value, 0) / values.length / 1_000).toFixed(1)),
      p95_seconds: Number(((percentile(values, 95) ?? 0) / 1_000).toFixed(1)),
    })).sort((left, right) => right.average_seconds - left.average_seconds),
    feature_usage: featureEvents.map(([name, label]) => ({
      name,
      label,
      events: eventCount(events, name),
      users: eventUsers(events, [name]).size,
      user_rate_pct: percent(eventUsers(events, [name]).size, activeUsers.size),
    })),
    unavailable: [
      {
        metric: "추천 탭 이용률 및 특정 아이템 기반 추천 전환",
        reason: "현재 EVENTS.md에 추천 탭/추천 노출·클릭 이벤트가 정의되어 있지 않음",
        required_events: ["recommendation_view", "recommendation_item_impression", "recommendation_item_click"],
      },
      {
        metric: "사진 기반 옷장 등록 전환율",
        reason: "사진 등록 서버 흐름과 전용 이벤트가 아직 연결되지 않음",
        required_events: ["wardrobe_photo_start", "wardrobe_photo_analysis_done", "wardrobe_photo_add_done"],
      },
    ],
  };
}

function groupRecords<T>(records: readonly T[], keyFor: (record: T) => string) {
  const groups = new Map<string, T[]>();
  for (const record of records) {
    const key = keyFor(record);
    const values = groups.get(key) ?? [];
    values.push(record);
    groups.set(key, values);
  }
  return groups;
}

function llmRollup(records: readonly LlmMetricRow[]) {
  const llmCalls = records.filter((record) => record.llm_called);
  const successful = llmCalls.filter((record) => record.status === "success").length;
  const failures = llmCalls.length - successful;
  const latencies = records.map((record) => record.latency_ms);
  const chatRecords = records.filter((record) => record.feature === "chat");
  return {
    operations: records.length,
    llm_calls: llmCalls.length,
    successful_calls: successful,
    failed_calls: failures,
    success_rate_pct: percent(successful, llmCalls.length),
    failure_rate_pct: percent(failures, llmCalls.length),
    input_tokens: records.reduce((sum, record) => sum + record.input_tokens, 0),
    output_tokens: records.reduce((sum, record) => sum + record.output_tokens, 0),
    estimated_cost_usd: Number(records.reduce((sum, record) => sum + (record.estimated_cost_usd ?? 0), 0).toFixed(8)),
    average_latency_ms: records.length === 0 ? null : Math.round(latencies.reduce((sum, value) => sum + value, 0) / records.length),
    p95_latency_ms: percentile(latencies, 95),
    fallback_count: records.filter((record) => record.fallback_used).length,
    fallback_rate_pct: percent(records.filter((record) => record.fallback_used).length, records.length),
    grounded_chat_count: chatRecords.filter((record) => record.response_mode === "grounded").length,
    grounded_chat_rate_pct: percent(chatRecords.filter((record) => record.response_mode === "grounded").length, chatRecords.length),
  };
}

export function summarizeLlmOps(records: readonly LlmMetricRow[], range: MetricsRange) {
  const selected = records.filter((record) => inRange(record.created_at, range));
  const byFeature = groupRecords(selected, (record) => record.feature);
  const byModel = groupRecords(selected, (record) => record.model ?? "AI 미호출");
  const byPromptRelease = groupRecords(
    selected,
    (record) => `${record.prompt_version} · ${record.release_git_sha ?? "SHA 없음"}`,
  );
  const byDay = groupRecords(selected, (record) => kstDayKey(record.created_at));
  const byError = groupRecords(
    selected.filter((record) => record.error_type !== null),
    (record) => record.error_type ?? "unknown",
  );
  const featuresWithCost = ["wardrobe_photo_tagging", "image_enhancement"];
  return {
    range,
    timezone: "Asia/Seoul",
    summary: llmRollup(selected),
    by_feature: [...byFeature].sort(([left], [right]) => left.localeCompare(right))
      .map(([feature, values]) => ({ feature, ...llmRollup(values) })),
    by_model: [...byModel].sort(([left], [right]) => left.localeCompare(right))
      .map(([model, values]) => ({ model, ...llmRollup(values) })),
    by_prompt_release: [...byPromptRelease].sort(([left], [right]) => left.localeCompare(right))
      .map(([prompt_release, values]) => ({ prompt_release, ...llmRollup(values) })),
    daily: [...byDay].sort(([left], [right]) => left.localeCompare(right))
      .map(([day, values]) => ({ day, ...llmRollup(values) })),
    errors: [...byError].sort(([, left], [, right]) => right.length - left.length)
      .map(([error_type, values]) => ({ error_type, count: values.length })),
    future_feature_unit_costs: featuresWithCost.map((feature) => {
      const values = selected.filter((record) => record.feature === feature && record.estimated_cost_usd !== null);
      return {
        feature,
        status: values.length === 0 ? "unavailable" : "available",
        samples: values.length,
        average_cost_usd: values.length === 0 ? null : Number((values.reduce(
          (sum, record) => sum + (record.estimated_cost_usd ?? 0),
          0,
        ) / values.length).toFixed(8)),
      };
    }),
  };
}
