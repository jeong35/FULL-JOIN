const $ = (selector) => document.querySelector(selector);
const fromInput = $('#from');
const toInput = $('#to');
const excludedUsersInput = $('#excluded-users');
const tokenInput = $('#token');
const refreshButton = $('#refresh');
const notice = $('#notice');
const dialog = $('#journey-dialog');

const API_URL = 'https://gctbcanltqgcymdlplyr.supabase.co/functions/v1/api';
excludedUsersInput.value = sessionStorage.getItem('odit-analytics-excluded-users') || '';
tokenInput.value = sessionStorage.getItem('odit-analytics-token') || '';

const today = new Date();
const weekAgo = new Date(today);
weekAgo.setDate(today.getDate() - 6);
const localDate = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
fromInput.value = localDate(weekAgo);
toInput.value = localDate(today);

const stageLabels = {
  app_open: '앱 사용', wardrobe_started: '옷 등록 시작', wardrobe_5: '옷 5벌 이상',
  photo_save_done: '사진 저장', result_view: '비교 결과 확인',
};
const screenLabels = {
  unknown: '기타', onboarding_intro: '온보딩 소개', onboarding_login: '로그인', onboarding_taste: '취향 선택',
  onboarding_ready: '온보딩 완료', home: '홈', closet: '옷장', recommend: '추천', chat: '챗봇', my: '마이',
  add_item_kind: '옷 종류 선택', add_item_color_fit: '색·핏 선택', style_detail: '사진 상세', comparison_result: '비교 결과',
};
const eventLabels = {
  app_open: '앱 열기', screen_view: '화면 진입', screen_leave: '화면 나감', app_background: '앱 백그라운드',
  tab_click: '탭 선택', back_click: '뒤로가기', error_shown: '오류 표시',
  intro_view: '튜토리얼 장 보기', intro_next: '튜토리얼 다음', intro_prev: '튜토리얼 이전', intro_skip: '튜토리얼 건너뛰기', intro_done: '튜토리얼 완료',
  login_nickname_start: '닉네임 입력 시작', login_pin_start: 'PIN 입력 시작', login_submit: '로그인 제출', login_validation_failed: '로그인 형식 오류', login_failed: '로그인 실패', login_success: '로그인 성공',
  taste_select: '추구미 선택', taste_deselect: '추구미 해제', taste_limit_reached: '추구미 한도 도달', taste_done: '추구미 완료', taste_later: '추구미 나중에', taste_save_failed: '추구미 저장 실패', ready_choice: '준비 화면 선택',
  wardrobe_add_start: '옷 등록 시작', wardrobe_slot_select: '부위 선택', wardrobe_kind_select: '종류 선택', wardrobe_color_select: '색 선택', wardrobe_fit_select: '핏 선택', wardrobe_add_submit: '옷 저장 시도', wardrobe_add_done: '옷 등록 완료', wardrobe_add_failed: '옷 등록 실패', wardrobe_milestone: '옷장 마일스톤',
  wardrobe_edit_start: '옷장 편집 시작', wardrobe_delete_select: '삭제할 옷 선택', wardrobe_delete_done: '옷 삭제 완료', wardrobe_delete_failed: '옷 삭제 실패',
  feed_load_done: '피드 로딩 완료', feed_load_failed: '피드 로딩 실패', feed_scroll: '피드 스크롤', feed_card_impression: '피드 카드 노출', photo_open: '사진 상세 열기', photo_save: '사진 저장 시도', photo_save_done: '사진 저장 완료', photo_save_failed: '사진 저장 실패',
  archive_image_open: '저장 사진 열기', archive_filter_apply: '아카이브 필터 적용', archive_filter_clear: '아카이브 필터 해제', archive_zero_result: '아카이브 결과 없음', style_detail_item_view: '상세 아이템 노출',
  compare_open: '비교 시작', comparison_done: '비교 완료', comparison_failed: '비교 실패', comparison_reopened: '비교 다시 열기', comparison_empty_wardrobe: '빈 옷장 비교',
  result_view: '비교 결과 확인', result_scroll: '결과 스크롤', gap_item_impression: '판정 카드 노출', item_choice: '활용·구매 선택', outfit_section_view: '코디 영역 노출', outfit_view: '코디 노출', shop_link_click: '상품 링크 열기', wardrobe_return_click: '옷장 보완 이동',
  hint_view: '힌트 노출', hint_click: '힌트 선택', hint_close: '힌트 닫기',
  chat_no_saved: '챗봇 저장 사진 없음', chat_go_feed_click: '챗봇에서 피드 이동', chat_picker_open: '챗봇 사진 선택 열기', chat_image_select: '챗봇 사진 선택', chat_input_start: '챗봇 입력 시작', chat_send: '챗봇 질문 전송', chat_response_done: '챗봇 응답 완료', chat_response_failed: '챗봇 응답 실패',
  taste_edit_start: '추구미 수정 시작', tutorial_replay_start: '튜토리얼 다시 보기', logout_click: '로그아웃',
};

function range() {
  const from = new Date(`${fromInput.value}T00:00:00+09:00`).toISOString();
  const end = new Date(Date.parse(`${toInput.value}T00:00:00+09:00`) + 24 * 60 * 60 * 1000);
  return { from, to: end.toISOString() };
}

function queryParameters() {
  const query = new URLSearchParams(range());
  const excluded = excludedUsersInput.value.split(',').map((value) => value.trim()).filter(Boolean);
  if (excluded.length > 0) query.set('exclude_user_ids', excluded.join(','));
  return query;
}

async function api(path) {
  const token = tokenInput.value.trim();
  if (!token) throw new Error('관리자 토큰을 입력해 주세요.');
  const response = await fetch(`${API_URL}${path}`, { headers: { 'x-admin-token': token } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || `요청 실패 (${response.status})`);
  return body;
}

const pct = (value) => `${Number(value || 0).toFixed(1)}%`;
const seconds = (ms) => ms == null ? '—' : `${(ms / 1000).toFixed(2)}초`;
const dateTime = (iso) => iso ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—';
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

function renderCards(cards) {
  const values = [
    ['기간 사용자', `${cards.users}명`, '한 번 이상 이벤트를 보낸 사용자'],
    ['활성화율', pct(cards.activation_rate), `${cards.activated_users}명 · 옷장 5벌 이상`],
    ['비교 도달률', pct(cards.comparison_rate), `${cards.compared_users}명 · 결과 화면 확인`],
    ['재방문율', pct(cards.return_rate), `${cards.returning_users}명 · 서로 다른 2일 이상`],
    ['비교 평균', seconds(cards.comparison_average_ms), '요청부터 응답까지'],
    ['비교 p95', seconds(cards.comparison_p95_ms), '느린 상위 5% 경계'],
  ];
  $('#cards').innerHTML = values.map(([label, value, detail]) => `<article class="metric panel"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-detail">${detail}</div></article>`).join('');
}

function renderFunnel(funnel) {
  const max = Math.max(1, funnel[0]?.users || 0);
  $('#funnel').className = 'funnel';
  $('#funnel').innerHTML = funnel.map((row) => `<div class="funnel-row"><span>${escapeHtml(row.label)}</span><div class="track"><div class="fill" style="width:${(row.users / max) * 100}%"></div></div><strong>${row.users}</strong></div>`).join('');
}

function renderDaily(rows) {
  if (!rows.length) { $('#daily').className = 'chart empty'; $('#daily').textContent = '데이터가 없습니다.'; return; }
  const width = 560, height = 180, pad = 28;
  const max = Math.max(1, ...rows.map((row) => row.users));
  const point = (row, index) => {
    const x = rows.length === 1 ? width / 2 : pad + index * ((width - pad * 2) / (rows.length - 1));
    const y = height - pad - (row.users / max) * (height - pad * 2);
    return [x, y];
  };
  const points = rows.map(point);
  $('#daily').className = 'chart';
  $('#daily').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="일별 사용자 수">
    <line x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}" stroke="#e7e1ec" />
    <polyline points="${points.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#7351a6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    ${points.map(([x,y], i) => `<circle cx="${x}" cy="${y}" r="4" fill="#7351a6"><title>${rows[i].date}: ${rows[i].users}명</title></circle><text class="chart-label" x="${x}" y="${height-8}" text-anchor="middle">${rows[i].date.slice(5)}</text>`).join('')}
  </svg>`;
}

function renderScreens(rows) {
  const shown = rows.slice(0, 8);
  if (!shown.length) { $('#screens').className = 'bars empty'; $('#screens').textContent = '화면 이탈 이벤트가 아직 없습니다.'; return; }
  const max = Math.max(...shown.map((row) => row.average_duration_ms), 1);
  $('#screens').className = 'bars';
  $('#screens').innerHTML = shown.map((row) => `<div class="bar-row"><span>${escapeHtml(screenLabels[row.screen_name] || row.screen_name)}</span><div class="bar"><i style="width:${row.average_duration_ms / max * 100}%"></i></div><strong>${seconds(row.average_duration_ms)}</strong></div>`).join('');
}

function renderGoals(cards) {
  const goals = [
    ['활성화율 60% 이상', cards.users === 0 ? null : cards.activation_rate >= 60, pct(cards.activation_rate)],
    ['비교 도달률 70% 이상', cards.users === 0 ? null : cards.comparison_rate >= 70, pct(cards.comparison_rate)],
    ['재방문율 30% 이상', cards.users === 0 ? null : cards.return_rate >= 30, pct(cards.return_rate)],
    ['평균 응답 5초 이내', cards.comparison_average_ms == null ? null : cards.comparison_average_ms <= 5000, seconds(cards.comparison_average_ms)],
    ['p95 응답 10초 이내', cards.comparison_p95_ms == null ? null : cards.comparison_p95_ms <= 10000, seconds(cards.comparison_p95_ms)],
  ];
  $('#goals').className = 'goals';
  $('#goals').innerHTML = goals.map(([label, pass, value]) => `<div class="goal"><strong>${label}</strong><span class="badge ${pass == null ? 'wait' : pass ? 'pass' : 'fail'}">${pass == null ? '대기' : pass ? '달성' : '미달'}</span><small>현재 ${value}</small></div>`).join('');
}

function renderUsers(users) {
  $('#users').innerHTML = users.length ? users.map((user) => `<tr data-user="${escapeHtml(user.user_id)}"><td><strong>${escapeHtml(user.user_id)}</strong></td><td>${user.wardrobe_count}벌</td><td>${user.active_days}일</td><td>${user.event_count}</td><td class="stage">${stageLabels[user.last_stage] || user.last_stage}</td><td>${dateTime(user.last_seen_at)}</td></tr>`).join('') : '<tr><td colspan="6" class="empty-cell">데이터가 없습니다.</td></tr>';
  document.querySelectorAll('tr[data-user]').forEach((row) => row.addEventListener('click', () => loadJourney(row.dataset.user)));
}

async function loadJourney(userId) {
  const query = new URLSearchParams(range());
  $('#journey-title').textContent = `${userId}의 여정`;
  $('#journey').innerHTML = '<div class="empty">불러오는 중…</div>';
  dialog.showModal();
  try {
    const data = await api(`/analytics/users/${encodeURIComponent(userId)}?${query}`);
    $('#journey').innerHTML = data.events.length ? data.events.map((event) => `<div class="timeline-item"><time class="timeline-time">${dateTime(event.occurred_at)}</time><div class="timeline-mark"></div><div><div class="timeline-name">${escapeHtml(eventLabels[event.event_name] || event.event_name)} · ${escapeHtml(screenLabels[event.screen_name] || event.screen_name)}</div><div class="timeline-meta">${event.duration_ms == null ? '' : `체류 ${seconds(event.duration_ms)} · `}${escapeHtml(JSON.stringify(event.properties || {}))}</div></div></div>`).join('') : '<div class="empty">이벤트가 없습니다.</div>';
  } catch (error) { $('#journey').innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`; }
}

async function loadDashboard() {
  refreshButton.disabled = true;
  notice.className = 'notice';
  notice.textContent = '데이터를 불러오는 중입니다…';
  sessionStorage.setItem('odit-analytics-excluded-users', excludedUsersInput.value.trim());
  sessionStorage.setItem('odit-analytics-token', tokenInput.value.trim());
  try {
    const query = queryParameters();
    const data = await api(`/analytics/summary?${query}`);
    renderCards(data.cards); renderFunnel(data.funnel); renderDaily(data.daily); renderScreens(data.screens); renderGoals(data.cards); renderUsers(data.users);
    const automaticCount = data.automatic_excluded_user_ids.length;
    const manualCount = data.manual_excluded_user_ids.length;
    const excludedText = ` · 11/11 이전 ${automaticCount}개 자동 제외${manualCount > 0 ? ` · 추가 ${manualCount}개 제외` : ''}`;
    notice.textContent = `${fromInput.value} ~ ${toInput.value}${excludedText} · ${data.truncated ? '이벤트 10,000건까지만 표시됨' : '전체 데이터 반영'}`;
  } catch (error) {
    notice.className = 'notice error'; notice.textContent = error.message;
  } finally { refreshButton.disabled = false; }
}

refreshButton.addEventListener('click', loadDashboard);
$('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
