const $ = (selector) => document.querySelector(selector);
const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 });

function escape(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function pct(value) { return value === null ? "확인 불가" : `${number.format(value)}%`; }
function count(value) { return number.format(value ?? 0); }
function money(value) { return value === null ? "확인 불가" : usd.format(value); }
function card(label, value, detail) {
  return `<article class="panel metric-card"><div class="metric-label">${escape(label)}</div><div class="metric-value">${escape(value)}</div><div class="metric-detail">${escape(detail)}</div></article>`;
}
function empty(message = "선택 기간에 데이터가 없습니다.") { return `<div class="empty">${escape(message)}</div>`; }
function table(headers, rows) {
  if (rows.length === 0) return empty();
  return `<table><thead><tr>${headers.map((header) => `<th>${escape(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function kstDate(date) {
  const local = new Date(date.getTime() + 9 * 60 * 60 * 1_000);
  return local.toISOString().slice(0, 10);
}
function setPreset(days) {
  const now = new Date();
  const end = new Date(now.getTime() + 9 * 60 * 60 * 1_000);
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() + 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  $("#from").value = start.toISOString().slice(0, 10);
  $("#to").value = end.toISOString().slice(0, 10);
}
function toIso(dateValue) { return new Date(`${dateValue}T00:00:00+09:00`).toISOString(); }

function renderProduct(product) {
  $("#product-cards").innerHTML = [
    card("활성 사용자", `${count(product.active_users)}명`, "선택 기간 user_id 중복 제거"),
    card("신규 사용자", `${count(product.new_users)}명`, "최초 login_success 기준"),
    card("옷장 / 활성 사용자", product.wardrobe.average_items_per_active_user === null ? "확인 불가" : `${product.wardrobe.average_items_per_active_user}벌`, `분모 ${count(product.wardrobe.users_in_denominator)}명`),
    card("튜토리얼 완료율", pct(product.tutorial.completion_rate_pct), `${count(product.tutorial.completed_users)} / ${count(product.tutorial.started_users)}명`),
  ].join("");
  const activation = product.wardrobe.new_user_five_item_rate_pct;
  $("#activation").innerHTML = `<div class="progress"><i style="width:${Math.min(100, activation ?? 0)}%"></i></div><div class="progress-copy"><span>${count(product.wardrobe.new_users_with_five_items)} / ${count(product.new_users)}명</span><strong>${pct(activation)}</strong></div>`;
  const maxDau = Math.max(1, ...product.dau.map((entry) => entry.users));
  $("#dau").innerHTML = product.dau.length === 0 ? empty() : product.dau.map((entry) => `<div class="bar-row"><span>${escape(entry.period)}</span><div class="bar-track"><i style="width:${(entry.users / maxDau) * 100}%"></i></div><strong>${count(entry.users)}</strong></div>`).join("");
  const maxFunnel = Math.max(1, ...product.funnel.map((step) => step.users));
  $("#funnel").innerHTML = product.funnel.map((step) => `<div class="funnel-row"><strong>${escape(step.label)}</strong><div class="bar-track"><i style="width:${(step.users / maxFunnel) * 100}%"></i></div><div class="funnel-copy">${count(step.users)}명 · 이탈 ${pct(step.dropoff_from_previous_pct)}</div></div>`).join("");
  $("#activity").innerHTML = [
    ["사진 저장", `${count(product.activity.photo_saves)}회`], ["코디 비교", `${count(product.activity.comparisons)}회`],
    ["쇼핑 클릭", `${count(product.activity.shopping_link_clicks)}회 · 사용자 CTR ${pct(product.activity.shopping_click_user_rate_pct)}`],
    ["챗봇", `${count(product.activity.chat_messages)}회 · 이용률 ${pct(product.activity.chatbot_user_rate_pct)}`],
  ].map(([label, value]) => `<div class="metric-row"><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`).join("");
  $("#screens").innerHTML = table(["화면", "표본", "평균", "p95"], product.screen_duration.map((row) => [row.screen, count(row.samples), `${row.average_seconds}s`, `${row.p95_seconds}s`]));
  $("#features").innerHTML = table(["기능", "이벤트", "사용자", "이용률"], product.feature_usage.map((row) => [row.label, count(row.events), count(row.users), pct(row.user_rate_pct)]));
  $("#unavailable").innerHTML = product.unavailable.map((gap) => `<div class="gap"><strong>${escape(gap.metric)}</strong><p>${escape(gap.reason)}</p><small>필요: ${escape(gap.required_events.join(", "))}</small></div>`).join("");
}

function renderLlmOps(llmops) {
  const summary = llmops.summary;
  $("#llm-cards").innerHTML = [
    card("AI 호출", `${count(summary.llm_calls)}회`, `전체 운영 ${count(summary.operations)}건`),
    card("호출 성공률", pct(summary.success_rate_pct), `실패 ${pct(summary.failure_rate_pct)}`),
    card("예상 비용", money(summary.estimated_cost_usd), "선택 기간 누적"),
    card("응답 지연", `${count(summary.average_latency_ms)}ms`, `p95 ${count(summary.p95_latency_ms)}ms`),
  ].join("");
  $("#llm-features").innerHTML = table(["기능", "운영", "AI 호출", "성공률", "fallback"], llmops.by_feature.map((row) => [row.feature, count(row.operations), count(row.llm_calls), pct(row.success_rate_pct), pct(row.fallback_rate_pct)]));
  $("#llm-daily").innerHTML = table(["날짜", "호출", "비용", "평균", "p95"], llmops.daily.map((row) => [row.day, count(row.llm_calls), money(row.estimated_cost_usd), `${count(row.average_latency_ms)}ms`, `${count(row.p95_latency_ms)}ms`]));
  $("#llm-models").innerHTML = table(["모델", "호출", "입력 토큰", "출력 토큰", "비용"], llmops.by_model.map((row) => [row.model, count(row.llm_calls), count(row.input_tokens), count(row.output_tokens), money(row.estimated_cost_usd)]));
  $("#llm-quality").innerHTML = `<div class="quality-grid"><div class="quality"><span>fallback 비율</span><strong>${pct(summary.fallback_rate_pct)}</strong></div><div class="quality"><span>grounded 응답 비율</span><strong>${pct(summary.grounded_chat_rate_pct)}</strong></div></div>${llmops.errors.length === 0 ? empty("오류 기록이 없습니다.") : `<div class="metric-list" style="margin-top:12px">${llmops.errors.map((row) => `<div class="metric-row"><span>${escape(row.error_type)}</span><strong>${count(row.count)}건</strong></div>`).join("")}</div>`}`;
  $("#llm-releases").innerHTML = table(["프롬프트 · SHA", "운영", "성공률", "비용"], llmops.by_prompt_release.map((row) => [row.prompt_release, count(row.operations), pct(row.success_rate_pct), money(row.estimated_cost_usd)]));
  const featureLabels = { wardrobe_photo_tagging: "사진 기반 옷 등록", image_enhancement: "이미지 보정" };
  $("#future-cost").innerHTML = llmops.future_feature_unit_costs.map((row) => `<div class="metric-row"><span>${escape(featureLabels[row.feature] ?? row.feature)} · 표본 ${count(row.samples)}</span><strong>${row.status === "available" ? `${money(row.average_cost_usd)} / 건` : "확인 불가"}</strong></div>`).join("");
}

async function refresh() {
  const button = $("#refresh");
  const notice = $("#notice");
  button.disabled = true;
  notice.className = "notice";
  notice.textContent = "로컬 Supabase에서 집계 중입니다.";
  try {
    const query = new URLSearchParams({ from: toIso($("#from").value), to: toIso($("#to").value) });
    const response = await fetch(`/api/dashboard?${query}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "지표 조회 실패");
    renderProduct(payload.product);
    renderLlmOps(payload.llmops);
    notice.textContent = `로컬 데이터 · KST · 테스트 이벤트 ${count(payload.product.excluded_test_event_count)}건 제외 · ${new Date(payload.generated_at).toLocaleString("ko-KR")}`;
  } catch (error) {
    notice.className = "notice error";
    notice.textContent = error instanceof Error ? error.message : "지표 조회 실패";
  } finally { button.disabled = false; }
}

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab, .tab-panel").forEach((node) => node.classList.remove("active"));
  tab.classList.add("active");
  $(`#${tab.dataset.tab}`).classList.add("active");
}));
document.querySelectorAll("[data-days]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-days]").forEach((node) => node.classList.remove("active"));
  button.classList.add("active");
  setPreset(Number(button.dataset.days));
  refresh();
}));
$("#refresh").addEventListener("click", refresh);
setPreset(7);
refresh();
