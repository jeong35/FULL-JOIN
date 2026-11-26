import {
  isTestEvent,
  kstDayKey,
  type AnalyticsEventRow,
  type MetricsRange,
  type WardrobeCountRow,
} from "./admin_metrics.ts";

export type JourneyUnit = "user" | "session";
export type JourneyCohort = "all" | "new" | "returning";

export type JourneyOptions = {
  unit: JourneyUnit;
  startKey: string | null;
  depth: number;
  minimumCount: number;
  includeTests: boolean;
  platform: string | null;
  appVersion: string | null;
  analyticsVersion: string | null;
  cohort: JourneyCohort;
};

type NormalizedEvent = AnalyticsEventRow & {
  effective_at: number;
  clock_source: "client_ts" | "received_at";
  key: string;
  source_index: number;
  analysis_session_id: string;
};

type FunnelDefinition = {
  key: string;
  label: string;
  stages: Array<{ key: string; label: string; matches: readonly string[] }>;
};

const SESSION_TIMEOUT_MS = 30 * 60 * 1_000;
const CLIENT_CLOCK_TOLERANCE_MS = 24 * 60 * 60 * 1_000;
const MAX_TIMELINES_PER_NODE = 12;
const DETAIL_PROPERTY_KEYS = new Set([
  "screen", "place", "via", "recommendation_type", "action", "error_code",
  "platform", "app_version", "analytics_version", "returning", "logged_in",
  "step", "source", "batch", "photo_count", "item_count", "success_count",
  "failure_count", "cutout_count", "tagged_count", "duration_ms", "retry",
]);

const FUNNELS: readonly FunnelDefinition[] = [
  {
    key: "core",
    label: "핵심 가치",
    stages: [
      { key: "login", label: "로그인", matches: ["login_success"] },
      { key: "taste", label: "추구미 설정", matches: ["taste_done", "taste_later"] },
      { key: "wardrobe", label: "옷장 등록", matches: ["wardrobe_add_done"] },
      { key: "saved", label: "사진 저장", matches: ["photo_save_done"] },
      { key: "result", label: "비교 결과", matches: ["result_view"] },
      { key: "decision", label: "활용/구매 결정", matches: ["item_choice", "shop_link_click"] },
    ],
  },
  {
    key: "onboarding",
    label: "온보딩",
    stages: [
      { key: "intro", label: "튜토리얼 시작", matches: ["intro_view"] },
      { key: "intro_done", label: "튜토리얼 완료", matches: ["intro_done"] },
      { key: "login", label: "로그인", matches: ["login_success"] },
      { key: "taste", label: "추구미 설정", matches: ["taste_done", "taste_later"] },
      { key: "ready", label: "시작 경로 선택", matches: ["ready_choice"] },
    ],
  },
  {
    key: "wardrobe",
    label: "옷장 등록",
    stages: [
      { key: "start", label: "등록 시작", matches: ["wardrobe_add_start"] },
      { key: "slot", label: "부위 선택", matches: ["wardrobe_slot_select"] },
      { key: "kind", label: "종류 선택", matches: ["wardrobe_kind_select"] },
      { key: "color", label: "색상 선택", matches: ["wardrobe_color_select"] },
      { key: "submit", label: "등록 요청", matches: ["wardrobe_add_submit"] },
      { key: "done", label: "등록 완료", matches: ["wardrobe_add_done"] },
    ],
  },
  {
    key: "save_compare",
    label: "사진 저장·비교",
    stages: [
      { key: "open", label: "사진 상세", matches: ["photo_open"] },
      { key: "saved", label: "사진 저장", matches: ["photo_save_done"] },
      { key: "compare", label: "비교 시작", matches: ["compare_open"] },
      { key: "result", label: "비교 결과", matches: ["result_view"] },
      { key: "decision", label: "활용/구매 결정", matches: ["item_choice", "shop_link_click"] },
    ],
  },
  {
    key: "chat",
    label: "챗봇 목표 행동",
    stages: [
      { key: "send", label: "질문 전송", matches: ["chat_message_sent", "chat_send"] },
      { key: "intent", label: "의도 분류", matches: ["chat_intent_classified"] },
      { key: "response", label: "응답 성공", matches: ["chat_response_received", "chat_response_done"] },
      { key: "offer", label: "Action 제안", matches: ["chat_action_impression"] },
      { key: "click", label: "CTA 클릭", matches: ["chat_action_clicked"] },
      { key: "navigation", label: "화면 이동", matches: ["chat_action_navigation_success"] },
      { key: "complete", label: "목표 행동 완료", matches: ["chat_action_completed"] },
    ],
  },
  {
    key: "recommendation",
    label: "추천·코디 선택",
    stages: [
      { key: "view", label: "추천 진입", matches: ["recommendation_view"] },
      { key: "click", label: "추천 선택", matches: ["recommendation_item_click"] },
      { key: "combo", label: "코디 상세", matches: ["recommendation_combo_view"] },
      { key: "choice", label: "코디 확정", matches: ["recommendation_choice"] },
    ],
  },
  {
    key: "notification",
    label: "알림·재방문",
    stages: [
      { key: "choice", label: "코디 선택", matches: ["recommendation_choice"] },
      { key: "prompt", label: "알림 제안", matches: ["notification_prompt_view"] },
      { key: "consent", label: "알림 동의", matches: ["notification_consent"] },
      { key: "scheduled", label: "예약 성공", matches: ["notification_schedule_done"] },
      { key: "open", label: "알림 진입", matches: ["notification_open"] },
      { key: "reselect", label: "코디 재선택", matches: ["notification_recommendation_reselect"] },
    ],
  },
];

function parseTimestamp(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function effectiveTimestamp(event: AnalyticsEventRow): { point: number; source: "client_ts" | "received_at" } | null {
  const received = parseTimestamp(event.received_at);
  if (received === null) return null;
  const client = parseTimestamp(event.client_ts);
  if (client !== null && Math.abs(client - received) <= CLIENT_CLOCK_TOLERANCE_MS) {
    return { point: client, source: "client_ts" };
  }
  return { point: received, source: "received_at" };
}

function eventKey(event: AnalyticsEventRow): string {
  if (event.name === "screen_view" && typeof event.props.screen === "string" && event.props.screen.length > 0) {
    return `screen:${event.props.screen}`;
  }
  return event.name;
}

function displayLabel(key: string): string {
  if (key === "__end__") return "후속 행동 없음";
  if (key === "__other__") return "기타 경로";
  if (key.startsWith("screen:")) return `화면 · ${key.slice(7)}`;
  return key;
}

function stringProp(event: AnalyticsEventRow, key: string): string | null {
  const value = event.props[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function deduplicate(events: readonly AnalyticsEventRow[]): AnalyticsEventRow[] {
  const seenClientIds = new Set<string>();
  const seenFallback = new Set<string>();
  const output: AnalyticsEventRow[] = [];
  for (const event of events) {
    const clientId = stringProp(event, "client_event_id");
    if (clientId !== null) {
      if (seenClientIds.has(clientId)) continue;
      seenClientIds.add(clientId);
    } else {
      const fallback = [event.device_id, event.session_id, event.user_id ?? "", event.name,
        event.client_ts ?? "", event.received_at, JSON.stringify(event.props)].join("\u0000");
      if (seenFallback.has(fallback)) continue;
      seenFallback.add(fallback);
    }
    output.push(event);
  }
  return output;
}

function normalize(events: readonly AnalyticsEventRow[]): NormalizedEvent[] {
  const normalized = deduplicate(events).flatMap((event, sourceIndex) => {
    const effective = effectiveTimestamp(event);
    if (effective === null) return [];
    return [{
      ...event,
      effective_at: effective.point,
      clock_source: effective.source,
      key: eventKey(event),
      source_index: sourceIndex,
      analysis_session_id: "",
    }];
  }).sort((left, right) => left.effective_at - right.effective_at ||
    Date.parse(left.received_at) - Date.parse(right.received_at) ||
    left.name.localeCompare(right.name) || left.source_index - right.source_index);

  const lastByRawSession = new Map<string, { point: number; segment: number }>();
  for (const event of normalized) {
    const raw = event.session_id || `device:${event.device_id}`;
    const state = lastByRawSession.get(raw);
    const segment = state === undefined || event.effective_at - state.point >= SESSION_TIMEOUT_MS
      ? (state?.segment ?? -1) + 1
      : state.segment;
    event.analysis_session_id = `${raw}:${segment}`;
    lastByRawSession.set(raw, { point: event.effective_at, segment });
  }
  return normalized;
}

function percentage(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Number(((numerator / denominator) * 100).toFixed(1));
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle] ?? null
    : (((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

function stableAlias(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `user-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function dayNumber(value: number): number {
  const key = kstDayKey(value);
  return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10))) / 86_400_000;
}

function matchesStage(event: NormalizedEvent, matches: readonly string[]): boolean {
  return matches.includes(event.key) || matches.includes(event.name);
}

function buildSequentialFunnels(events: readonly NormalizedEvent[]) {
  const byUser = new Map<string, NormalizedEvent[]>();
  for (const event of events) {
    if (event.user_id === null) continue;
    const values = byUser.get(event.user_id) ?? [];
    values.push(event);
    byUser.set(event.user_id, values);
  }
  return FUNNELS.map((definition) => {
    const reached = definition.stages.map(() => new Map<string, number>());
    for (const [userId, values] of byUser) {
      let cursor = 0;
      let lastPoint = Number.NEGATIVE_INFINITY;
      for (let stageIndex = 0; stageIndex < definition.stages.length; stageIndex += 1) {
        const stage = definition.stages[stageIndex]!;
        let found = -1;
        for (let index = cursor; index < values.length; index += 1) {
          const candidate = values[index]!;
          if (candidate.effective_at >= lastPoint && matchesStage(candidate, stage.matches)) {
            found = index;
            break;
          }
        }
        if (found < 0) break;
        const point = values[found]!.effective_at;
        reached[stageIndex]!.set(userId, point);
        lastPoint = point;
        cursor = found + 1;
      }
    }
    const first = reached[0]?.size ?? 0;
    return {
      key: definition.key,
      label: definition.label,
      order_rule: "각 사용자에서 effective timestamp가 이전 단계 이상인 최초 이벤트",
      stages: definition.stages.map((stage, index) => {
        const current = reached[index]!;
        const previous = index === 0 ? current : reached[index - 1]!;
        const elapsed = index === 0 ? [] : [...current].flatMap(([userId, point]) => {
          const previousPoint = previous.get(userId);
          return previousPoint === undefined ? [] : [Math.max(0, point - previousPoint)];
        });
        return {
          key: stage.key,
          label: stage.label,
          users: current.size,
          previous_users: previous.size,
          conversion_from_previous_pct: index === 0 ? null : percentage(current.size, previous.size),
          cumulative_conversion_pct: percentage(current.size, first),
          not_reached_from_previous: index === 0 ? 0 : Math.max(0, previous.size - current.size),
          dropoff_from_previous_pct: index === 0 || previous.size === 0
            ? null : Number((100 - (percentage(current.size, previous.size) ?? 0)).toFixed(1)),
          median_elapsed_ms: median(elapsed),
        };
      }),
    };
  });
}

function filterEvents(
  normalized: readonly NormalizedEvent[],
  range: MetricsRange,
  options: JourneyOptions,
): { allEligible: NormalizedEvent[]; selected: NormalizedEvent[] } {
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);
  const base = normalized.filter((event) => options.includeTests || !isTestEvent(event));
  const firstByUser = new Map<string, number>();
  for (const event of base) {
    if (event.user_id === null) continue;
    const existing = firstByUser.get(event.user_id);
    if (existing === undefined || event.effective_at < existing) firstByUser.set(event.user_id, event.effective_at);
  }
  const selected = base.filter((event) => {
    if (event.effective_at < from || event.effective_at >= to) return false;
    if (options.platform !== null && event.platform !== options.platform) return false;
    if (options.appVersion !== null && stringProp(event, "app_version") !== options.appVersion) return false;
    if (options.analyticsVersion !== null && stringProp(event, "analytics_version") !== options.analyticsVersion) return false;
    if (options.cohort === "all") return true;
    if (event.user_id === null) return false;
    const first = firstByUser.get(event.user_id);
    return options.cohort === "new" ? first !== undefined && first >= from : first !== undefined && first < from;
  });
  return { allEligible: base, selected };
}

function buildRetention(allEvents: readonly NormalizedEvent[], range: MetricsRange) {
  const byUser = new Map<string, NormalizedEvent[]>();
  for (const event of allEvents) {
    if (event.user_id === null) continue;
    const values = byUser.get(event.user_id) ?? [];
    values.push(event);
    byUser.set(event.user_id, values);
  }
  const from = Date.parse(range.from);
  const toDay = dayNumber(Date.parse(range.to) - 1);
  const cohorts = [...byUser].flatMap(([userId, values]) => {
    const first = values[0];
    if (first === undefined || first.effective_at < from || first.effective_at >= Date.parse(range.to)) return [];
    return [{ userId, firstDay: dayNumber(first.effective_at), activeDays: new Set(values.map((event) => dayNumber(event.effective_at))) }];
  });
  const metric = (days: number) => {
    const eligible = cohorts.filter((cohort) => cohort.firstDay + days <= toDay);
    const retained = eligible.filter((cohort) => cohort.activeDays.has(cohort.firstDay + days)).length;
    return { eligible_users: eligible.length, retained_users: retained, rate_pct: percentage(retained, eligible.length) };
  };
  return { d1: metric(1), d7: metric(7), definition: "첫 관측 KST 날짜 이후 정확히 D1/D7에 이벤트가 있는 신규 사용자" };
}

function buildDailyActiveUsers(events: readonly NormalizedEvent[]) {
  const grouped = new Map<string, Set<string>>();
  for (const event of events) {
    if (event.user_id === null) continue;
    const period = kstDayKey(event.effective_at);
    const users = grouped.get(period) ?? new Set<string>();
    users.add(event.user_id);
    grouped.set(period, users);
  }
  return [...grouped].sort(([left], [right]) => left.localeCompare(right))
    .map(([period, users]) => ({ period, users: users.size }));
}

function buildBooleanFunnel(events: readonly NormalizedEvent[]) {
  const definition = FUNNELS[0]!;
  const byUser = new Map<string, Set<string>>();
  for (const event of events) {
    if (event.user_id === null) continue;
    const keys = byUser.get(event.user_id) ?? new Set<string>();
    keys.add(event.key);
    keys.add(event.name);
    byUser.set(event.user_id, keys);
  }
  let eligible = new Set(byUser.keys());
  return definition.stages.map((stage, index) => {
    const users = new Set([...eligible].filter((userId) => stage.matches.some((name) => byUser.get(userId)?.has(name))));
    const previous = index === 0 ? byUser.size : eligible.size;
    eligible = users;
    return {
      key: stage.key,
      label: stage.label,
      users: users.size,
      conversion_from_previous_pct: percentage(users.size, previous),
      dropoff_from_previous_pct: previous === 0
        ? null : Number((100 - (percentage(users.size, previous) ?? 0)).toFixed(1)),
    };
  });
}

function propertyDistribution(events: readonly NormalizedEvent[]) {
  const result: Array<{ property: string; value: string; events: number }> = [];
  for (const key of DETAIL_PROPERTY_KEYS) {
    const counts = new Map<string, number>();
    for (const event of events) {
      const value = key === "platform" ? event.platform : event.props[key];
      if (!["string", "number", "boolean"].includes(typeof value)) continue;
      const safe = String(value).slice(0, 80);
      counts.set(safe, (counts.get(safe) ?? 0) + 1);
    }
    for (const [value, eventCount] of [...counts].sort(([, left], [, right]) => right - left).slice(0, 8)) {
      result.push({ property: key, value, events: eventCount });
    }
  }
  return result;
}

function buildJourney(events: readonly NormalizedEvent[], options: JourneyOptions) {
  const bySession = new Map<string, NormalizedEvent[]>();
  for (const event of events) {
    if (options.unit === "user" && event.user_id === null) continue;
    const values = bySession.get(event.analysis_session_id) ?? [];
    values.push(event);
    bySession.set(event.analysis_session_id, values);
  }

  type NodeAccumulator = {
    id: string; depth: number; key: string; label: string; users: Set<string>; sessions: Set<string>;
    occurrences: number; elapsed: number[]; events: NormalizedEvent[];
  };
  type LinkAccumulator = {
    id: string; source: string; target: string; users: Set<string>; sessions: Set<string>;
    transitions: number; elapsed: number[];
  };
  const nodes = new Map<string, NodeAccumulator>();
  const links = new Map<string, LinkAccumulator>();

  const addNode = (depth: number, key: string, event: NormalizedEvent | null, elapsed: number | null) => {
    const id = `${depth}:${key}`;
    const node = nodes.get(id) ?? {
      id, depth, key, label: displayLabel(key), users: new Set<string>(), sessions: new Set<string>(),
      occurrences: 0, elapsed: [], events: [],
    };
    if (event !== null) {
      if (event.user_id !== null) node.users.add(event.user_id);
      node.sessions.add(event.analysis_session_id);
      node.events.push(event);
    }
    node.occurrences += 1;
    if (elapsed !== null) node.elapsed.push(elapsed);
    nodes.set(id, node);
    return id;
  };

  for (const [sessionId, values] of bySession) {
    const startIndex = options.startKey === null ? 0 : values.findIndex((event) => event.key === options.startKey || event.name === options.startKey);
    if (startIndex < 0) continue;
    const path = values.slice(startIndex, startIndex + options.depth + 1);
    if (path.length === 0) continue;
    const entityUser = path[0]!.user_id;
    let sourceId = addNode(0, path[0]!.key, path[0]!, null);
    for (let depth = 1; depth <= options.depth; depth += 1) {
      const previous = path[depth - 1]!;
      const next = path[depth] ?? null;
      const elapsed = next === null ? null : Math.max(0, next.effective_at - previous.effective_at);
      const targetKey = next?.key ?? "__end__";
      const targetId = addNode(depth, targetKey, next, elapsed);
      const linkId = `${sourceId}->${targetId}`;
      const link = links.get(linkId) ?? {
        id: linkId, source: sourceId, target: targetId, users: new Set<string>(), sessions: new Set<string>(),
        transitions: 0, elapsed: [],
      };
      if (entityUser !== null) link.users.add(entityUser);
      link.sessions.add(sessionId);
      link.transitions += 1;
      if (elapsed !== null) link.elapsed.push(elapsed);
      links.set(linkId, link);
      sourceId = targetId;
      if (next === null) break;
    }
  }

  const unitCount = (users: ReadonlySet<string>, sessions: ReadonlySet<string>) => options.unit === "user" ? users.size : sessions.size;
  const lowTargets = new Set<string>();
  for (const link of links.values()) {
    if (unitCount(link.users, link.sessions) < options.minimumCount && !link.target.endsWith(":__end__")) lowTargets.add(link.target);
  }
  if (lowTargets.size > 0) {
    const nextLinks = new Map<string, LinkAccumulator>();
    for (const link of links.values()) {
      const target = lowTargets.has(link.target) ? `${link.target.split(":", 1)[0]}:__other__` : link.target;
      const id = `${link.source}->${target}`;
      const merged = nextLinks.get(id) ?? { ...link, id, target, users: new Set<string>(), sessions: new Set<string>(), transitions: 0, elapsed: [] };
      link.users.forEach((value) => merged.users.add(value));
      link.sessions.forEach((value) => merged.sessions.add(value));
      merged.transitions += link.transitions;
      merged.elapsed.push(...link.elapsed);
      nextLinks.set(id, merged);
      if (!nodes.has(target)) {
        const depth = Number(target.slice(0, target.indexOf(":")));
        nodes.set(target, { id: target, depth, key: "__other__", label: displayLabel("__other__"), users: new Set(), sessions: new Set(), occurrences: 0, elapsed: [], events: [] });
      }
      const other = nodes.get(target)!;
      link.users.forEach((value) => other.users.add(value));
      link.sessions.forEach((value) => other.sessions.add(value));
      other.occurrences += link.transitions;
      other.elapsed.push(...link.elapsed);
    }
    links.clear();
    nextLinks.forEach((value, key) => links.set(key, value));
    for (const target of lowTargets) nodes.delete(target);
  }

  const serializedNodes = [...nodes.values()].sort((left, right) => left.depth - right.depth || left.label.localeCompare(right.label)).map((node) => {
    const incoming = [...links.values()].filter((link) => link.target === node.id);
    const outgoing = [...links.values()].filter((link) => link.source === node.id);
    const hourly = new Map<number, number>();
    for (const event of node.events) {
      const hour = new Date(event.effective_at + 9 * 60 * 60 * 1_000).getUTCHours();
      hourly.set(hour, (hourly.get(hour) ?? 0) + 1);
    }
    const timelines = new Map<string, NormalizedEvent[]>();
    for (const event of node.events) {
      if (event.user_id === null) continue;
      const values = timelines.get(event.user_id) ?? [];
      values.push(event);
      timelines.set(event.user_id, values);
    }
    return {
      id: node.id,
      depth: node.depth,
      key: node.key,
      label: node.label,
      users: node.users.size,
      sessions: node.sessions.size,
      occurrences: node.occurrences,
      unit_count: unitCount(node.users, node.sessions),
      median_from_previous_ms: median(node.elapsed),
      average_from_previous_ms: node.elapsed.length === 0 ? null : Math.round(node.elapsed.reduce((sum, value) => sum + value, 0) / node.elapsed.length),
      has_next: outgoing.length > 0,
      detail: {
        previous: incoming.map((link) => ({ key: nodes.get(link.source)?.key ?? link.source, label: nodes.get(link.source)?.label ?? link.source, count: unitCount(link.users, link.sessions) })).sort((a, b) => b.count - a.count),
        next: outgoing.map((link) => ({ key: nodes.get(link.target)?.key ?? link.target, label: nodes.get(link.target)?.label ?? link.target, count: unitCount(link.users, link.sessions) })).sort((a, b) => b.count - a.count),
        related_events: [...new Set(node.events.map((event) => event.name))].sort(),
        hourly: [...hourly].sort(([left], [right]) => left - right).map(([hour, eventCount]) => ({ hour, events: eventCount })),
        timelines: [...timelines].slice(0, MAX_TIMELINES_PER_NODE).map(([userId, values]) => ({
          user: stableAlias(userId),
          events: values.slice(0, 20).map((event) => ({ at: new Date(event.effective_at).toISOString(), key: event.key })),
        })),
        errors: node.events.filter((event) => event.name.endsWith("_failed") || event.name === "error_shown").length,
        properties: propertyDistribution(node.events),
      },
    };
  });
  const nodeById = new Map(serializedNodes.map((node) => [node.id, node]));
  const serializedLinks = [...links.values()].map((link) => {
    const source = nodeById.get(link.source);
    const target = nodeById.get(link.target);
    const value = unitCount(link.users, link.sessions);
    return {
      id: link.id,
      source: link.source,
      target: link.target,
      source_label: source?.label ?? link.source,
      target_label: target?.label ?? link.target,
      users: link.users.size,
      sessions: link.sessions.size,
      transitions: link.transitions,
      value,
      conversion_from_source_pct: percentage(value, source?.unit_count ?? 0),
      median_elapsed_ms: median(link.elapsed),
      average_elapsed_ms: link.elapsed.length === 0 ? null : Math.round(link.elapsed.reduce((sum, item) => sum + item, 0) / link.elapsed.length),
    };
  }).sort((left, right) => right.value - left.value || left.id.localeCompare(right.id));

  return { nodes: serializedNodes, links: serializedLinks };
}

function buildOverview(
  selected: readonly NormalizedEvent[],
  allEligible: readonly NormalizedEvent[],
  wardrobeRows: readonly WardrobeCountRow[],
  range: MetricsRange,
) {
  const activeUsers = new Set(selected.flatMap((event) => event.user_id === null ? [] : [event.user_id]));
  const sessions = new Set(selected.map((event) => event.analysis_session_id));
  const firstByUser = new Map<string, number>();
  for (const event of allEligible) {
    if (event.user_id === null) continue;
    const existing = firstByUser.get(event.user_id);
    if (existing === undefined || event.effective_at < existing) firstByUser.set(event.user_id, event.effective_at);
  }
  const from = Date.parse(range.from);
  const newUsers = new Set([...activeUsers].filter((userId) => (firstByUser.get(userId) ?? Number.NEGATIVE_INFINITY) >= from));
  const returningUsers = new Set([...activeUsers].filter((userId) => (firstByUser.get(userId) ?? Number.POSITIVE_INFINITY) < from));
  const usersFor = (names: readonly string[]) => new Set(selected.filter((event) => names.includes(event.name) && event.user_id !== null).map((event) => event.user_id!));
  const wardrobeUsers = usersFor(["wardrobe_add_done"]);
  const savedUsers = usersFor(["photo_save_done"]);
  const resultUsers = usersFor(["result_view"]);
  const wardrobeCounts = new Map<string, number>();
  for (const row of wardrobeRows) wardrobeCounts.set(row.user_id, (wardrobeCounts.get(row.user_id) ?? 0) + 1);
  const activated = [...activeUsers].filter((userId) => (wardrobeCounts.get(userId) ?? 0) >= 5 && savedUsers.has(userId) && resultUsers.has(userId)).length;
  return {
    active_users: activeUsers.size,
    sessions: sessions.size,
    new_users: newUsers.size,
    returning_users: returningUsers.size,
    wardrobe_users: wardrobeUsers.size,
    photo_save_users: savedUsers.size,
    core_value_users: resultUsers.size,
    core_value_rate_pct: percentage(resultUsers.size, activeUsers.size),
    activation_users: activated,
    activation_rate_pct: percentage(activated, activeUsers.size),
  };
}

function buildActions(events: readonly NormalizedEvent[]) {
  const byName = new Map<string, NormalizedEvent[]>();
  for (const event of events) {
    const values = byName.get(event.name) ?? [];
    values.push(event);
    byName.set(event.name, values);
  }
  return [...byName].map(([name, values]) => ({
    name,
    events: values.length,
    users: new Set(values.flatMap((event) => event.user_id === null ? [] : [event.user_id])).size,
    sessions: new Set(values.map((event) => event.analysis_session_id)).size,
    hourly: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      events: values.filter((event) => new Date(event.effective_at + 9 * 60 * 60 * 1_000).getUTCHours() === hour).length,
    })),
  })).sort((left, right) => right.events - left.events || left.name.localeCompare(right.name));
}

function buildChatActionMetrics(events: readonly NormalizedEvent[]) {
  const count = (name: string) => events.filter((event) => event.name === name).length;
  const sent = count("chat_message_sent") || count("chat_send");
  const classified = count("chat_intent_classified");
  const responses = count("chat_response_received") || count("chat_response_done");
  const impressions = count("chat_action_impression");
  const clicks = count("chat_action_clicked");
  const navigations = count("chat_action_navigation_success");
  const completions = count("chat_action_completed");
  const failures = count("chat_action_failed");
  const grouped = (name: string, property: string) => {
    const values = new Map<string, number>();
    for (const event of events.filter((entry) => entry.name === name)) {
      const value = stringProp(event, property) ?? "unknown";
      values.set(value, (values.get(value) ?? 0) + 1);
    }
    return [...values].map(([key, value]) => ({ key, count: value })).sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
  };
  return {
    questions: sent,
    classified,
    responses,
    action_impressions: impressions,
    action_clicks: clicks,
    navigation_successes: navigations,
    completions,
    failures,
    response_success_rate_pct: percentage(responses, sent),
    action_offer_rate_pct: percentage(impressions, responses),
    action_click_rate_pct: percentage(clicks, impressions),
    navigation_success_rate_pct: percentage(navigations, clicks),
    completion_rate_pct: percentage(completions, clicks),
    by_intent: grouped("chat_intent_classified", "intent"),
    by_action: grouped("chat_action_clicked", "action_type"),
  };
}

function buildNotificationMetrics(events: readonly NormalizedEvent[], range: MetricsRange) {
  const usersFor = (name: string, predicate: (event: NormalizedEvent) => boolean = () => true) =>
    new Set(events.filter((event) => event.name === name && event.user_id !== null && predicate(event)).map((event) => event.user_id!));
  const choices = usersFor("recommendation_choice");
  const prompts = usersFor("notification_prompt_view");
  const consents = usersFor("notification_consent");
  const permissionGranted = usersFor("notification_permission", (event) => stringProp(event, "result") === "granted");
  const scheduled = usersFor("notification_schedule_done");
  const maturityPoint = Math.min(Date.now(), Date.parse(range.to));
  const matured = usersFor("notification_schedule_done", (event) => {
    const scheduledFor = Date.parse(stringProp(event, "scheduled_for") ?? "");
    return Number.isFinite(scheduledFor) && scheduledFor <= maturityPoint;
  });
  const opens = usersFor("notification_open");
  const reselects = usersFor("notification_recommendation_reselect");
  const cohortReturn = (decisionName: "notification_consent" | "notification_decline") => {
    const decisions = new Map<string, number>();
    for (const event of events) {
      if (event.name === decisionName && event.user_id !== null && !decisions.has(event.user_id)) decisions.set(event.user_id, event.effective_at);
    }
    const eligible = [...decisions].filter(([, at]) => dayNumber(at) < dayNumber(maturityPoint));
    const returned = eligible.filter(([userId, at]) => events.some((event) =>
      event.user_id === userId && event.name === "app_open" && dayNumber(event.effective_at) > dayNumber(at))).length;
    return { eligible_users: eligible.length, returned_users: returned, rate_pct: percentage(returned, eligible.length) };
  };
  return {
    choice_users: choices.size,
    prompt_users: prompts.size,
    consent_users: consents.size,
    consent_rate_pct: percentage(consents.size, prompts.size),
    permission_granted_users: permissionGranted.size,
    permission_granted_rate_pct: percentage(permissionGranted.size, consents.size),
    schedule_success_users: scheduled.size,
    schedule_success_rate_pct: percentage(scheduled.size, consents.size),
    matured_schedule_users: matured.size,
    notification_open_users: new Set([...opens].filter((userId) => matured.has(userId))).size,
    notification_revisit_rate_pct: percentage(new Set([...opens].filter((userId) => matured.has(userId))).size, matured.size),
    reselect_users: reselects.size,
    reselect_rate_pct: percentage(new Set([...reselects].filter((userId) => opens.has(userId))).size, opens.size),
    consent_cohort_revisit: cohortReturn("notification_consent"),
    decline_cohort_revisit: cohortReturn("notification_decline"),
    delivery_observable: false,
    delivery_note: "예약 성공은 브라우저 구독·서버 예약 성공이며 실제 기기 전달 성공을 뜻하지 않음",
  };
}

export function analyzeJourneys(
  allEvents: readonly AnalyticsEventRow[],
  wardrobeRows: readonly WardrobeCountRow[],
  range: MetricsRange,
  options: JourneyOptions,
) {
  const normalized = normalize(allEvents);
  const { allEligible, selected } = filterEvents(normalized, range, options);
  const availableKeys = [...new Set(selected.map((event) => event.key))].sort();
  const appVersions = [...new Set(normalized.flatMap((event) => stringProp(event, "app_version") ?? []))].sort();
  const analyticsVersions = [...new Set(normalized.flatMap((event) => stringProp(event, "analytics_version") ?? []))].sort();
  const invalidClientClockEvents = normalized.filter((event) => event.client_ts !== null && event.clock_source === "received_at").length;
  const retentionEvents = allEligible.filter((event) =>
    event.effective_at < Date.parse(range.to) &&
    (options.platform === null || event.platform === options.platform) &&
    (options.appVersion === null || stringProp(event, "app_version") === options.appVersion) &&
    (options.analyticsVersion === null || stringProp(event, "analytics_version") === options.analyticsVersion));
  return {
    range,
    timezone: "Asia/Seoul",
    options,
    ordering: {
      timestamp_rule: "유효하고 received_at과 24시간 이내인 client_ts 우선, 그 외 received_at",
      tie_breaker: "effective timestamp → received_at → event name → input order",
      session_rule: "원래 session_id를 사용하되 30분 inactivity마다 분석 세션을 분할",
      duplicate_rule: "props.client_event_id 우선, 없으면 동일 식별자·시각·이름·props signature 중복 제거",
      invalid_client_clock_events: invalidClientClockEvents,
    },
    filters: { available_start_keys: availableKeys, app_versions: appVersions, analytics_versions: analyticsVersions },
    overview: buildOverview(selected, allEligible, wardrobeRows, range),
    daily_active_users: buildDailyActiveUsers(selected),
    boolean_funnel: buildBooleanFunnel(selected),
    journey: buildJourney(selected, options),
    sequential_funnels: buildSequentialFunnels(selected),
    actions: buildActions(selected),
    chat_action_metrics: buildChatActionMetrics(selected),
    retention: buildRetention(retentionEvents, range),
    notification_metrics: buildNotificationMetrics(selected, range),
    selected_event_count: selected.length,
    selected_user_count: new Set(selected.flatMap((event) => event.user_id === null ? [] : [event.user_id])).size,
    selected_session_count: new Set(selected.map((event) => event.analysis_session_id)).size,
    excluded_test_event_count: normalized.filter((event) => isTestEvent(event) && event.effective_at >= Date.parse(range.from) && event.effective_at < Date.parse(range.to)).length,
  };
}
