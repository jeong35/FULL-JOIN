const $ = (selector) => document.querySelector(selector);
const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 });
let payload = null;
let zoom = 1;

function escape(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
function pct(value) { return value === null || value === undefined ? "N/A" : `${number.format(value)}%`; }
function count(value) { return number.format(value ?? 0); }
function money(value) { return value === null ? "N/A" : usd.format(value); }
function duration(value) {
  if (value === null || value === undefined) return "N/A";
  if (value < 1_000) return `${number.format(value)}ms`;
  if (value < 60_000) return `${number.format(value / 1_000)}초`;
  return `${number.format(value / 60_000)}분`;
}
function card(label, value, detail) { return `<article class="panel metric-card"><div class="metric-label">${escape(label)}</div><div class="metric-value">${escape(value)}</div><div class="metric-detail">${escape(detail)}</div></article>`; }
function empty(message = "선택 기간에 데이터가 없습니다.") { return `<div class="empty">${escape(message)}</div>`; }
function table(headers, rows) {
  if (rows.length === 0) return empty();
  return `<table><thead><tr>${headers.map((header) => `<th>${escape(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function setPreset(days) {
  const now = new Date();
  const end = new Date(now.getTime() + 9 * 60 * 60 * 1_000);
  end.setUTCHours(0, 0, 0, 0); end.setUTCDate(end.getUTCDate() + 1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - days);
  $("#from").value = start.toISOString().slice(0, 10); $("#to").value = end.toISOString().slice(0, 10);
}
function toIso(dateValue) { return new Date(`${dateValue}T00:00:00+09:00`).toISOString(); }

function syncSelect(selector, values, placeholder) {
  const select = $(selector); const current = select.value;
  select.innerHTML = `<option value="">${escape(placeholder)}</option>${values.map((value) => `<option value="${escape(value)}">${escape(value)}</option>`).join("")}`;
  if (values.includes(current)) select.value = current;
}

function renderOverview(data) {
  const overview = data.journeys.overview;
  $("#overview-cards").innerHTML = [
    card("활성 사용자", `${count(overview.active_users)}명`, "선택 필터의 가명 user_id"),
    card("세션", `${count(overview.sessions)}회`, "30분 inactivity 분할"),
    card("신규 / 재방문", `${count(overview.new_users)} / ${count(overview.returning_users)}`, "최초 관측 시각 기준"),
    card("옷장 등록 사용자", `${count(overview.wardrobe_users)}명`, "wardrobe_add_done"),
    card("사진 저장 사용자", `${count(overview.photo_save_users)}명`, "photo_save_done"),
  ].join("");
  $("#activation").innerHTML = `<div class="dual-metrics"><div><span>Core Value</span><strong>${pct(overview.core_value_rate_pct)}</strong><small>${count(overview.core_value_users)}명 · result_view</small></div><div><span>Activation</span><strong>${pct(overview.activation_rate_pct)}</strong><small>${count(overview.activation_users)}명 · 5벌+저장+결과</small></div></div>`;
  const maxDau = Math.max(1, ...data.journeys.daily_active_users.map((entry) => entry.users));
  $("#dau").innerHTML = data.journeys.daily_active_users.length === 0 ? empty() : data.journeys.daily_active_users.map((entry) => `<div class="bar-row"><span>${escape(entry.period)}</span><div class="bar-track"><i style="width:${(entry.users / maxDau) * 100}%"></i></div><strong>${count(entry.users)}</strong></div>`).join("");
  const maxFunnel = Math.max(1, ...data.journeys.boolean_funnel.map((step) => step.users));
  $("#boolean-funnel").innerHTML = data.journeys.boolean_funnel.map((step) => `<div class="funnel-row"><strong>${escape(step.label)}</strong><div class="bar-track"><i style="width:${(step.users / maxFunnel) * 100}%"></i></div><div class="funnel-copy">${count(step.users)}명 · 이탈 ${pct(step.dropoff_from_previous_pct)}</div></div>`).join("");
  const ordering = data.journeys.ordering;
  $("#ordering").innerHTML = [["시각", ordering.timestamp_rule], ["동일 시각", ordering.tie_breaker], ["세션", ordering.session_rule], ["중복", ordering.duplicate_rule], ["보정된 client_ts", `${count(ordering.invalid_client_clock_events)}건`]].map(([label, value]) => `<div class="metric-row"><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`).join("");
}

function nodeTooltip(node) {
  return `<strong>${escape(node.label)}</strong><span>사용자 ${count(node.users)} · 세션 ${count(node.sessions)} · 발생 ${count(node.occurrences)}</span><span>이전 행동 중앙 ${duration(node.median_from_previous_ms)} · 평균 ${duration(node.average_from_previous_ms)}</span>`;
}
function linkTooltip(link) {
  return `<strong>${escape(link.source_label)} → ${escape(link.target_label)}</strong><span>${payload.journeys.options.unit === "user" ? "사용자" : "세션"} ${count(link.value)} · 전환 ${pct(link.conversion_from_source_pct)}</span><span>중앙 ${duration(link.median_elapsed_ms)} · 평균 ${duration(link.average_elapsed_ms)}</span>`;
}
function showTooltip(event, html) {
  const tip = $("#tooltip"); tip.innerHTML = html; tip.hidden = false;
  tip.style.left = `${Math.min(window.innerWidth - 300, event.clientX + 14)}px`; tip.style.top = `${Math.min(window.innerHeight - 110, event.clientY + 14)}px`;
}
function hideTooltip() { $("#tooltip").hidden = true; }

function renderNodeDetail(node) {
  const detail = node.detail;
  const distribution = (items) => items.length === 0 ? "N/A" : items.map((item) => `${item.label} ${count(item.count)}`).join(" · ");
  $("#journey-detail").innerHTML = `<div class="detail-head"><p class="eyebrow">NODE DETAIL</p><h3>${escape(node.label)}</h3><span>depth ${node.depth}</span></div><div class="detail-stats"><div><span>사용자</span><strong>${count(node.users)}</strong></div><div><span>세션</span><strong>${count(node.sessions)}</strong></div><div><span>발생</span><strong>${count(node.occurrences)}</strong></div></div><dl><dt>이전 행동</dt><dd>${escape(distribution(detail.previous))}</dd><dt>다음 행동</dt><dd>${escape(distribution(detail.next))}</dd><dt>관련 이벤트</dt><dd>${escape(detail.related_events.join(", ") || "N/A")}</dd><dt>오류 이벤트</dt><dd>${count(detail.errors)}건</dd></dl><h4>시간대별 발생</h4><div class="mini-bars">${detail.hourly.length === 0 ? "N/A" : detail.hourly.map((row) => `<span style="height:${Math.max(8, row.events * 10)}px" data-label="${row.hour}시 ${row.events}건"></span>`).join("")}</div><h4>가명 사용자 타임라인</h4><div class="timelines">${detail.timelines.length === 0 ? empty("식별 사용자 표본이 없습니다.") : detail.timelines.map((timeline) => `<details><summary>${escape(timeline.user)} · ${count(timeline.events.length)}건</summary><ol>${timeline.events.map((item) => `<li><time>${escape(new Date(item.at).toLocaleString("ko-KR"))}</time>${escape(item.key)}</li>`).join("")}</ol></details>`).join("")}</div><h4>관련 property 분포</h4>${table(["property", "value", "events"], detail.properties.map((row) => [row.property, row.value, count(row.events)]))}`;
}
function renderLinkDetail(link) {
  $("#journey-detail").innerHTML = `<div class="detail-head"><p class="eyebrow">LINK DETAIL</p><h3>${escape(link.source_label)} → ${escape(link.target_label)}</h3></div><div class="detail-stats"><div><span>사용자</span><strong>${count(link.users)}</strong></div><div><span>세션</span><strong>${count(link.sessions)}</strong></div><div><span>전환</span><strong>${count(link.transitions)}</strong></div></div><dl><dt>출발 기준 전환율</dt><dd>${pct(link.conversion_from_source_pct)}</dd><dt>중앙 경과 시간</dt><dd>${duration(link.median_elapsed_ms)}</dd><dt>평균 경과 시간</dt><dd>${duration(link.average_elapsed_ms)}</dd></dl>`;
}
function highlightSankey(id, isLink) {
  document.querySelectorAll("#sankey .node, #sankey .link").forEach((element) => element.classList.add("dimmed"));
  if (isLink) {
    const link = payload.journeys.journey.links.find((item) => item.id === id);
    if (!link) return;
    document.querySelector(`[data-link-id="${CSS.escape(id)}"]`)?.classList.remove("dimmed");
    document.querySelector(`[data-node-id="${CSS.escape(link.source)}"]`)?.classList.remove("dimmed");
    document.querySelector(`[data-node-id="${CSS.escape(link.target)}"]`)?.classList.remove("dimmed");
  } else {
    document.querySelector(`[data-node-id="${CSS.escape(id)}"]`)?.classList.remove("dimmed");
    payload.journeys.journey.links.filter((link) => link.source === id || link.target === id).forEach((link) => document.querySelector(`[data-link-id="${CSS.escape(link.id)}"]`)?.classList.remove("dimmed"));
  }
}
function clearHighlight() { document.querySelectorAll("#sankey .dimmed").forEach((element) => element.classList.remove("dimmed")); }

function applyZoom() {
  const svg = $("#sankey");
  const baseWidth = Number(svg.dataset.baseWidth ?? 1000); const baseHeight = Number(svg.dataset.baseHeight ?? 480);
  svg.style.width = `${baseWidth * zoom}px`; svg.style.height = `${baseHeight * zoom}px`; $("#zoom-reset").textContent = `${Math.round(zoom * 100)}%`;
}

function renderSankey(journey) {
  const svg = $("#sankey"); const emptyNode = $("#sankey-empty");
  if (journey.nodes.length === 0) { svg.innerHTML = ""; svg.hidden = true; emptyNode.hidden = false; emptyNode.textContent = "선택 조건에 경로 데이터가 없습니다."; return; }
  svg.hidden = false; emptyNode.hidden = true;
  const maxDepth = Math.max(...journey.nodes.map((node) => node.depth));
  const byDepth = new Map(); journey.nodes.forEach((node) => { const values = byDepth.get(node.depth) ?? []; values.push(node); byDepth.set(node.depth, values); });
  const maxRows = Math.max(...[...byDepth.values()].map((values) => values.length));
  const width = Math.max(1000, (maxDepth + 1) * 220); const height = Math.max(480, maxRows * 82 + 80);
  const maxValue = Math.max(1, ...journey.nodes.map((node) => node.unit_count)); const positions = new Map();
  for (const [depth, values] of byDepth) {
    const gap = height / (values.length + 1);
    values.forEach((node, index) => { const nodeHeight = Math.max(26, Math.min(96, 24 + (node.unit_count / maxValue) * 72)); positions.set(node.id, { x: 50 + depth * ((width - 140) / Math.max(1, maxDepth)), y: gap * (index + 1) - nodeHeight / 2, h: nodeHeight }); });
  }
  const links = journey.links.map((link) => { const source = positions.get(link.source); const target = positions.get(link.target); if (!source || !target) return ""; const x1 = source.x + 22; const y1 = source.y + source.h / 2; const x2 = target.x; const y2 = target.y + target.h / 2; const curve = Math.max(50, (x2 - x1) * .48); const stroke = Math.max(3, Math.min(34, 2 + (link.value / maxValue) * 32)); return `<path class="link" data-link-id="${escape(link.id)}" d="M${x1},${y1} C${x1 + curve},${y1} ${x2 - curve},${y2} ${x2},${y2}" stroke-width="${stroke}" tabindex="0" role="button" aria-label="${escape(link.source_label)}에서 ${escape(link.target_label)}로 ${link.value}" />`; }).join("");
  const nodes = journey.nodes.map((node) => { const position = positions.get(node.id); return `<g class="node" data-node-id="${escape(node.id)}" transform="translate(${position.x},${position.y})" tabindex="0" role="button" aria-label="${escape(node.label)} ${node.unit_count}"><rect width="22" height="${position.h}" rx="7"></rect><text x="31" y="${Math.max(15, position.h / 2 - 3)}">${escape(node.label)}</text><text class="node-count" x="31" y="${Math.max(29, position.h / 2 + 14)}">${count(node.unit_count)} ${payload.journeys.options.unit === "user" ? "사용자" : "세션"}</text></g>`; }).join("");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`); svg.dataset.baseWidth = String(width); svg.dataset.baseHeight = String(height); svg.innerHTML = `<g>${links}${nodes}</g>`; zoom = 1; applyZoom();
  svg.querySelectorAll(".node").forEach((element) => { const node = journey.nodes.find((item) => item.id === element.dataset.nodeId); element.addEventListener("mouseenter", (event) => { highlightSankey(node.id, false); showTooltip(event, nodeTooltip(node)); }); element.addEventListener("mouseleave", () => { clearHighlight(); hideTooltip(); }); element.addEventListener("click", () => renderNodeDetail(node)); element.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") renderNodeDetail(node); }); });
  svg.querySelectorAll(".link").forEach((element) => { const link = journey.links.find((item) => item.id === element.dataset.linkId); element.addEventListener("mouseenter", (event) => { highlightSankey(link.id, true); showTooltip(event, linkTooltip(link)); }); element.addEventListener("mouseleave", () => { clearHighlight(); hideTooltip(); }); element.addEventListener("click", () => renderLinkDetail(link)); element.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") renderLinkDetail(link); }); });
}

function renderFunnels(funnels) {
  const select = $("#funnel-select"); const current = select.value;
  select.innerHTML = funnels.map((funnel) => `<option value="${escape(funnel.key)}">${escape(funnel.label)}</option>`).join("");
  if (funnels.some((funnel) => funnel.key === current)) select.value = current;
  const funnel = funnels.find((item) => item.key === select.value) ?? funnels[0];
  if (!funnel) { $("#sequential-funnel").innerHTML = empty(); return; }
  const max = Math.max(1, ...funnel.stages.map((stage) => stage.users));
  $("#sequential-funnel").innerHTML = funnel.stages.map((stage, index) => `<div class="funnel-stage"><div class="stage-meta"><span>${index + 1}. ${escape(stage.label)}</span><strong>${count(stage.users)}명</strong></div><div class="stage-bar"><i style="width:${(stage.users / max) * 100}%"></i></div><div class="stage-rates"><span>이전 대비 ${pct(stage.conversion_from_previous_pct)}</span><span>누적 ${pct(stage.cumulative_conversion_pct)}</span><span>미도달 ${count(stage.not_reached_from_previous)}명</span><span>중앙 ${duration(stage.median_elapsed_ms)}</span></div></div>`).join("");
}

function renderActions(actions) {
  $("#action-table").innerHTML = actions.length === 0 ? empty() : `<table><thead><tr><th>행동</th><th>발생</th><th>사용자</th><th>세션</th></tr></thead><tbody>${actions.map((row, index) => `<tr><td><button class="table-action" data-action-index="${index}">${escape(row.name)}</button></td><td>${count(row.events)}</td><td>${count(row.users)}</td><td>${count(row.sessions)}</td></tr>`).join("")}</tbody></table>`;
  const renderHourly = (row) => { $("#action-hour-title").textContent = `${row.name} 시간대별 추이`; const max = Math.max(1, ...row.hourly.map((item) => item.events)); $("#action-hourly").innerHTML = row.hourly.filter((item) => item.events > 0).map((item) => `<div class="bar-row"><span>${item.hour}시</span><div class="bar-track"><i style="width:${(item.events / max) * 100}%"></i></div><strong>${count(item.events)}</strong></div>`).join("") || empty(); };
  document.querySelectorAll("[data-action-index]").forEach((button) => button.addEventListener("click", () => renderHourly(actions[Number(button.dataset.actionIndex)])));
  if (actions[0]) renderHourly(actions[0]); else $("#action-hourly").innerHTML = empty();
}

function renderRetention(retention) {
  $("#retention-cards").innerHTML = [card("D1 Retention", pct(retention.d1.rate_pct), `${count(retention.d1.retained_users)} / ${count(retention.d1.eligible_users)}명`), card("D7 Retention", pct(retention.d7.rate_pct), `${count(retention.d7.retained_users)} / ${count(retention.d7.eligible_users)}명`), card("재방문 사용자", `${count(payload.journeys.overview.returning_users)}명`, "선택 기간 이전 관측 이력 있음")].join("");
  $("#retention-note").textContent = `${retention.definition}. 예정일이 아직 지나지 않은 사용자는 분모에서 제외하며, 이벤트 누락을 비재방문으로 단정하지 않습니다.`;
}

function renderNotifications(metrics) {
  $("#notification-cards").innerHTML = [
    card("추천 선택", `${count(metrics.choice_users)}명`, `알림 제안 ${count(metrics.prompt_users)}명`),
    card("알림 동의율", pct(metrics.consent_rate_pct), `${count(metrics.consent_users)}명 동의`),
    card("권한 허용률", pct(metrics.permission_granted_rate_pct), `${count(metrics.permission_granted_users)}명 허용`),
    card("예약 성공률", pct(metrics.schedule_success_rate_pct), `${count(metrics.schedule_success_users)}명 예약`),
    card("알림 진입 재방문", pct(metrics.notification_revisit_rate_pct), `${count(metrics.notification_open_users)} / ${count(metrics.matured_schedule_users)}명`),
    card("진입 후 재선택", pct(metrics.reselect_rate_pct), `${count(metrics.reselect_users)}명`),
    card("동의 코호트 재방문", pct(metrics.consent_cohort_revisit.rate_pct), `${count(metrics.consent_cohort_revisit.returned_users)} / ${count(metrics.consent_cohort_revisit.eligible_users)}명`),
    card("거절 코호트 재방문", pct(metrics.decline_cohort_revisit.rate_pct), `${count(metrics.decline_cohort_revisit.returned_users)} / ${count(metrics.decline_cohort_revisit.eligible_users)}명`),
  ].join("");
  $("#notification-note").textContent = metrics.delivery_note;
}

function renderRecovery(recovery) {
  $("#recovery-cards").innerHTML = [card("미분류 식별자", `${count(recovery.identified_actors)}명`, recovery.source), card("옷장 잔존 기록", `${count(recovery.wardrobe_rows)}행`, `${count(recovery.wardrobe_users)}명`), card("사진 저장 잔존 기록", `${count(recovery.heart_rows)}행`, `${count(recovery.heart_users)}명`), card("두 행동 모두", `${count(recovery.both_users)}명`, recovery.period)].join("");
  const milestones = recovery.wardrobe_milestones; $("#recovery-milestones").innerHTML = [["1벌 이상", milestones.one], ["3벌 이상", milestones.three], ["5벌 이상", milestones.five], ["10벌 이상", milestones.ten], ["첫→5번째 중앙", `${number.format(recovery.first_to_fifth_median_seconds / 60)}분`]].map(([label, value]) => `<div class="metric-row"><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`).join("");
  $("#recovery-limitations").innerHTML = recovery.limitations.map((item) => `<div class="gap"><p>${escape(item)}</p></div>`).join("");
}

function renderLlmOps(llmops) {
  const summary = llmops.summary;
  $("#llm-cards").innerHTML = [card("AI 호출", `${count(summary.llm_calls)}회`, `전체 운영 ${count(summary.operations)}건`), card("호출 성공률", pct(summary.success_rate_pct), `실패 ${pct(summary.failure_rate_pct)}`), card("예상 비용", money(summary.estimated_cost_usd), "선택 기간 누적"), card("응답 지연", `${count(summary.average_latency_ms)}ms`, `p95 ${count(summary.p95_latency_ms)}ms`)].join("");
  $("#llm-features").innerHTML = table(["기능", "운영", "AI 호출", "성공률", "fallback"], llmops.by_feature.map((row) => [row.feature, count(row.operations), count(row.llm_calls), pct(row.success_rate_pct), pct(row.fallback_rate_pct)]));
  $("#llm-daily").innerHTML = table(["날짜", "호출", "비용", "평균", "p95"], llmops.daily.map((row) => [row.day, count(row.llm_calls), money(row.estimated_cost_usd), `${count(row.average_latency_ms)}ms`, `${count(row.p95_latency_ms)}ms`]));
  $("#llm-models").innerHTML = table(["모델", "호출", "입력", "출력", "비용"], llmops.by_model.map((row) => [row.model, count(row.llm_calls), count(row.input_tokens), count(row.output_tokens), money(row.estimated_cost_usd)]));
  $("#llm-quality").innerHTML = `<div class="quality-grid"><div class="quality"><span>fallback 비율</span><strong>${pct(summary.fallback_rate_pct)}</strong></div><div class="quality"><span>grounded 응답 비율</span><strong>${pct(summary.grounded_chat_rate_pct)}</strong></div></div>${llmops.errors.length === 0 ? empty("오류 기록이 없습니다.") : `<div class="metric-list quality-errors">${llmops.errors.map((row) => `<div class="metric-row"><span>${escape(row.error_type)}</span><strong>${count(row.count)}건</strong></div>`).join("")}</div>`}`;
  $("#llm-releases").innerHTML = table(["프롬프트 · SHA", "운영", "성공률", "비용"], llmops.by_prompt_release.map((row) => [row.prompt_release, count(row.operations), pct(row.success_rate_pct), money(row.estimated_cost_usd)]));
  const labels = { wardrobe_photo_tagging: "사진 기반 옷 등록", image_enhancement: "이미지 보정" }; $("#future-cost").innerHTML = llmops.future_feature_unit_costs.map((row) => `<div class="metric-row"><span>${escape(labels[row.feature] ?? row.feature)} · 표본 ${count(row.samples)}</span><strong>${row.status === "available" ? `${money(row.average_cost_usd)} / 건` : "N/A"}</strong></div>`).join("");
}
function renderAlerts(alerts) { $("#llm-alerts").innerHTML = alerts.length === 0 ? empty("선택 기간에 경고 기준을 넘은 지표가 없습니다.") : alerts.map((alert) => `<div class="alert ${escape(alert.severity)}"><div><strong>${escape(alert.code)}</strong><p>${escape(alert.message)}</p></div><span>${count(alert.value)} / 기준 ${count(alert.threshold)}</span></div>`).join(""); }

function render(data) {
  payload = data; syncSelect("#app-version", data.journeys.filters.app_versions, "전체"); syncSelect("#analytics-version", data.journeys.filters.analytics_versions, "전체");
  const start = $("#journey-start"); const currentStart = start.value; start.innerHTML = `<option value="__session_start__">세션 첫 행동</option>${data.journeys.filters.available_start_keys.map((key) => `<option value="${escape(key)}">${escape(key)}</option>`).join("")}`; if ([...start.options].some((option) => option.value === currentStart)) start.value = currentStart;
  renderOverview(data); renderSankey(data.journeys.journey); renderFunnels(data.journeys.sequential_funnels); renderActions(data.journeys.actions); renderRetention(data.journeys.retention); renderNotifications(data.journeys.notification_metrics); renderRecovery(data.historical_recovery); renderLlmOps(data.llmops); renderAlerts(data.alerts ?? []);
}

async function refresh() {
  const button = $("#refresh"); const notice = $("#notice"); button.disabled = true; notice.className = "notice"; notice.textContent = "Supabase에서 시간순 경로를 집계하고 있습니다.";
  try {
    const query = new URLSearchParams({ from: toIso($("#from").value), to: toIso($("#to").value), cohort: $("#cohort").value, platform: $("#platform").value, app_version: $("#app-version").value, analytics_version: $("#analytics-version").value, include_tests: String($("#include-tests").checked), start: $("#journey-start").value, unit: $("#journey-unit").value, depth: $("#journey-depth").value, minimum_count: $("#minimum-count").value });
    const token = $("#admin-token").value.trim(); const response = await fetch(`/api/dashboard?${query}`, { headers: token === "" ? {} : { authorization: `Bearer ${token}` } }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "지표 조회 실패"); render(data);
    notice.textContent = `${data.data_source} · KST · 이벤트 ${count(data.journeys.selected_event_count)}건 · 테스트 ${count(data.journeys.excluded_test_event_count)}건 제외 · ${new Date(data.generated_at).toLocaleString("ko-KR")}`;
  } catch (error) { notice.className = "notice error"; notice.textContent = error instanceof Error ? error.message : "지표 조회 실패"; } finally { button.disabled = false; }
}

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => { document.querySelectorAll(".tab, .tab-panel").forEach((node) => node.classList.remove("active")); tab.classList.add("active"); $(`#${tab.dataset.tab}`).classList.add("active"); }));
document.querySelectorAll("[data-days]").forEach((button) => button.addEventListener("click", () => { document.querySelectorAll("[data-days]").forEach((node) => node.classList.remove("active")); button.classList.add("active"); setPreset(Number(button.dataset.days)); refresh(); }));
$("#refresh").addEventListener("click", refresh); $("#funnel-select").addEventListener("change", () => payload && renderFunnels(payload.journeys.sequential_funnels));
["#journey-start", "#journey-unit", "#journey-depth", "#minimum-count"].forEach((selector) => $(selector).addEventListener("change", refresh));
$("#zoom-in").addEventListener("click", () => { zoom = Math.min(1.8, zoom + .2); applyZoom(); }); $("#zoom-out").addEventListener("click", () => { zoom = Math.max(.6, zoom - .2); applyZoom(); }); $("#zoom-reset").addEventListener("click", () => { zoom = 1; applyZoom(); });
setPreset(7); refresh();
