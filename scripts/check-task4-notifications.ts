import assert from 'node:assert/strict';
import test from 'node:test';

import { EVENT_NAMES } from '../src/fulljoin/events.ts';
import { analyzeJourneys } from '../src/fulljoin/journey_metrics.ts';
import { cancelWithAdapter, nextDaySameLocalTime, notificationSupportMessage, scheduleWithAdapter } from '../mobile/src/data/notificationCore.ts';
import { readRecommendationChoices, saveRecommendationChoice } from '../mobile/src/data/recommendChoices.ts';

test('다음 날 같은 현지 시각을 계산한다', () => {
  const now = new Date(2026, 10, 25, 14, 37, 12);
  const next = nextDaySameLocalTime(now);
  assert.equal(next.getDate(), 26);
  assert.equal(next.getHours(), 14);
  assert.equal(next.getMinutes(), 37);
});

test('권한을 지원하지 않는 플랫폼은 성공으로 설명하지 않는다', () => {
  assert.match(notificationSupportMessage({ supported: false, reason: 'browser_unsupported' }), /지원하지 않아요/);
  assert.match(notificationSupportMessage({ supported: false, reason: 'ios_home_screen_required' }), /홈 화면/);
});

test('명시적 동의 뒤 권한 거절은 예약 성공이 아니다', async () => {
  const result = await scheduleWithAdapter({ support: { supported: true }, requestPermission: async () => 'denied', subscribe: async () => { throw new Error('not called'); }, schedule: async () => { throw new Error('not called'); } });
  assert.deepEqual(result, { ok: false, reason: 'permission_denied' });
});

test('구독 식별자를 사용해 다음 날 일회성 예약을 만든다', async () => {
  const result = await scheduleWithAdapter({
    support: { supported: true }, requestPermission: async () => 'granted',
    subscribe: async () => ({ subscriptionId: 'sub-a', accessToken: 'token-a' }),
    schedule: async (_identity, scheduledFor) => ({ scheduleId: 'schedule-a', scheduledFor }),
  }, new Date('2026-11-25T05:00:00.000Z'));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.scheduleId, 'schedule-a');
  assert.equal(result.value.scheduledFor, '2026-11-26T05:00:00.000Z');
});

test('서버 실패는 코디 선택을 막지 않는 실패 결과로 반환한다', async () => {
  const result = await scheduleWithAdapter({ support: { supported: true }, requestPermission: async () => 'granted', subscribe: async () => { throw new Error('network'); }, schedule: async () => { throw new Error('not called'); } });
  assert.deepEqual(result, { ok: false, reason: 'request_failed', stage: 'subscribe', error: 'network' });
});

test('알림 취소 성공과 실패를 구분한다', async () => {
  assert.equal(await cancelWithAdapter(async () => {}), true);
  assert.equal(await cancelWithAdapter(async () => { throw new Error('offline'); }), false);
});

test('코디 선택은 계정과 날짜별로 분리해 복원한다', () => {
  saveRecommendationChoice('task4-a', { date: '2026-11-25', lookId: 'look-a', chosenAt: '2026-11-25T01:00:00.000Z', notificationScheduled: false });
  saveRecommendationChoice('task4-b', { date: '2026-11-25', lookId: 'look-b', chosenAt: '2026-11-25T01:00:00.000Z', notificationScheduled: true });
  assert.equal(readRecommendationChoices('task4-a')['2026-11-25']?.lookId, 'look-a');
  assert.equal(readRecommendationChoices('task4-b')['2026-11-25']?.lookId, 'look-b');
});

test('알림 퍼널은 예정 시각이 지난 예약만 재방문 분모로 쓴다', () => {
  const event = (name: string, user: string, at: string, props: Record<string, unknown> = {}) => ({
    received_at: at, client_ts: at, device_id: `device-${user}`, session_id: `session-${user}`,
    platform: 'web', user_id: user, name, props,
  });
  const events = [
    event('recommendation_choice', 'u-a', '2026-11-24T00:00:00.000Z'),
    event('notification_prompt_view', 'u-a', '2026-11-24T00:00:01.000Z'),
    event('notification_consent', 'u-a', '2026-11-24T00:00:02.000Z'),
    event('notification_permission', 'u-a', '2026-11-24T00:00:03.000Z', { result: 'granted' }),
    event('notification_schedule_done', 'u-a', '2026-11-24T00:00:04.000Z', { scheduled_for: '2020-11-25T00:00:04.000Z' }),
    event('notification_open', 'u-a', '2026-11-25T00:01:00.000Z'),
    event('notification_recommendation_reselect', 'u-a', '2026-11-25T00:02:00.000Z'),
    event('notification_schedule_done', 'u-b', '2026-11-25T00:00:04.000Z', { scheduled_for: '2099-11-26T00:00:04.000Z' }),
  ];
  const result = analyzeJourneys(events as never, [], { from: '2026-11-23T15:00:00.000Z', to: '2026-11-26T15:00:00.000Z' }, {
    unit: 'user', startKey: null, depth: 5, minimumCount: 1, includeTests: true,
    platform: null, appVersion: null, analyticsVersion: null, cohort: 'all',
  });
  assert.equal(result.notification_metrics.matured_schedule_users, 1);
  assert.equal(result.notification_metrics.notification_revisit_rate_pct, 100);
  assert.equal(result.notification_metrics.reselect_rate_pct, 100);
});

test('클라이언트와 서버 이벤트 계약에 추천·알림 이벤트가 포함된다', () => {
  for (const name of ['recommendation_choice', 'notification_schedule_done', 'notification_open', 'notification_recommendation_reselect']) {
    assert.ok((EVENT_NAMES as readonly string[]).includes(name));
  }
});
