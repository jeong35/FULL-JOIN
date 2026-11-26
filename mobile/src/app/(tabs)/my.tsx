import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { GlassView } from '@/components/GlassView';
import { TimeField } from '@/components/TimeField';
import { useTabScrollBottom } from '@/components/tabBarSpace';
import { TabScreen } from '@/components/TabScreen';
import { SmallWhiteButton } from '@/components/ui';
import { track } from '@/data/events';
import { saveNotificationSettings, useNotificationSettings } from '@/data/notificationSettings';
import { useRecommendationChoices } from '@/data/recommendChoices';
import { clockLabel, NOTIFY_PLATFORM, scheduleFailText, SETTINGS_LOOK_ID, timeOf, todayAt, trackScheduleResult } from '@/data/reminder';
import { LOGIN_ENABLED, logout, useSession } from '@/data/session';
import { resetUserData } from '@/data/store';
import { cancelRecommendationNotification, scheduleRecommendationNotification } from '@/data/webNotifications';
import { colors, fonts, layout } from '@/theme';

// 마이: 내 계정(닉네임), 내 추구미 다시 고르기, 튜토리얼 다시 보기, 로그아웃.
// 저장한 사진은 저장 탭(11/24)에서 본다.

export default function MyScreen() {
  const session = useSession();
  const taste = session?.styles ?? [];
  const scrollBottom = useTabScrollBottom();

  function onLogout() {
    track('logout_click');
    resetUserData();
    logout(); // 탭 화면이 로그인 전 상태를 보고 튜토리얼로 보낸다.
  }

  return (
    <TabScreen title="마이">
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: scrollBottom }]}>
        <GlassView radius={16} style={styles.card}>
          <Text style={styles.name}>{session?.nickname || '내 계정'}</Text>
          <Text style={styles.caption}>
            {LOGIN_ENABLED
              ? '다른 폰이나 브라우저에서도 같은 닉네임과 숫자 4자리로 들어오면 내 옷장이 그대로 열려요.'
              : '시연용 계정으로 들어와 있어요.'}
          </Text>
        </GlassView>

        <GlassView radius={16} style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>내 추구미</Text>
            <SmallWhiteButton
              label="다시 고르기"
              onPress={() => {
                track('taste_edit_start', { selected_count: taste.length });
                router.push('/onboarding/taste?replay=1');
              }}
            />
          </View>
          {taste.length > 0 ? (
            <View style={styles.chips}>
              {taste.map((style) => (
                <View key={style} style={styles.chip}>
                  <Text style={styles.chipText}>{style}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.caption}>아직 안 골랐어요. 고르면 그 스타일 사진부터 피드에 보여 드려요.</Text>
          )}
        </GlassView>

        <ReminderCard userId={session?.userId ?? 'guest'} />

        <GlassView radius={16} style={styles.list}>
          <Pressable
            onPress={() => {
              track('tutorial_replay_start');
              router.push('/onboarding?replay=1');
            }}
            accessibilityRole="button"
            style={styles.listItem}>
            <Text style={styles.listText}>튜토리얼 다시 보기</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          {LOGIN_ENABLED && (
            <>
              <View style={styles.divider} />
              <Pressable onPress={onLogout} accessibilityRole="button" style={styles.listItem}>
                <Text style={styles.listText}>로그아웃</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            </>
          )}
        </GlassView>

        <Text style={styles.soon}>저장한 사진은 아래 &apos;저장&apos; 탭에서 볼 수 있어요</Text>
      </ScrollView>
    </TabScreen>
  );
}

// 마이 › 코디 알림(11/24 팀 결정 17번, 11/25 친구분 알림 서버와 연결). 코디 탭 결정 창에서 '내일 알려 주세요'를 누르면 켜져 있다.
// 끄기: 서버 예약을 취소한 뒤에만 끈다(실패하면 켜진 채로 다시 시도 안내).
// 켜기·시간 바꾸기: 그 시간으로 다시 예약한다(서버가 이전 예약을 바꿔 끼움). 내일 그 시간부터 매일.
function ReminderCard({ userId }: { userId: string }) {
  const settings = useNotificationSettings(userId);
  const choices = useRecommendationChoices(userId);
  const saved = timeOf(settings);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // 서버 예약에는 룩 id가 필요하다 — 가장 최근에 고른 룩, 없으면 자리값.
  const latestLook = Object.values(choices).sort((x, y) => y.chosenAt.localeCompare(x.chosenAt))[0]?.lookId ?? SETTINGS_LOOK_ID;

  async function schedule(time: string) {
    setBusy(true);
    setMessage(null);
    const result = await scheduleRecommendationNotification(userId, latestLook, todayAt(time));
    trackScheduleResult(result);
    setBusy(false);
    if (!result.ok) setMessage(scheduleFailText(result));
  }

  async function turnOff() {
    setBusy(true);
    setMessage(null);
    const ok = settings.reservation === undefined || await cancelRecommendationNotification(userId, settings.reservation);
    setBusy(false);
    if (!ok) {
      setMessage('알림을 끄지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      return;
    }
    saveNotificationSettings(userId, { enabled: false, hour: settings.hour, minute: settings.minute });
    track('notification_cancel', { platform: NOTIFY_PLATFORM });
  }

  return (
    <GlassView radius={16} style={styles.card}>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <Text style={styles.sectionTitle}>코디 알림</Text>
          <Text style={styles.caption}>매일 정한 시간에 코디하러 오라고 알려 드려요</Text>
        </View>
        <Switch
          value={settings.enabled}
          disabled={busy}
          onValueChange={(on) => void (on ? schedule(saved) : turnOff())}
          trackColor={{ false: colors.line, true: colors.purpleStrong }}
          thumbColor={colors.white}
          // 웹(react-native-web)은 켜졌을 때 동그라미 색을 따로 받는다.
          {...({ activeThumbColor: colors.white } as object)}
          accessibilityLabel="코디 알림 켜기"
        />
      </View>
      {settings.enabled && (
        <>
          <TimeEditor key={saved} saved={saved} busy={busy} onSave={(time) => void schedule(time)} />
          <Text style={styles.caption}>매일 {clockLabel(saved)}에 알려 드릴게요</Text>
        </>
      )}
      {busy && <Text style={styles.caption}>잠시만요…</Text>}
      {message !== null && <Text style={styles.error}>{message}</Text>}
    </GlassView>
  );
}

// 시간은 직접 입력하고 '시간 저장'을 눌러야 서버 예약이 바뀐다(입력할 때마다 예약하지 않게).
function TimeEditor({ saved, busy, onSave }: { saved: string; busy: boolean; onSave: (time: string) => void }) {
  const [draft, setDraft] = useState(saved);
  return (
    <View style={styles.timeEditor}>
      <TimeField value={draft} onChange={setDraft} />
      {draft !== saved && (
        <Pressable onPress={() => onSave(draft)} disabled={busy} accessibilityRole="button" style={styles.saveTime}>
          <Text style={styles.saveTimeText}>{clockLabel(draft)}로 시간 저장</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingHorizontal: layout.screenPaddingX,
    // 챗봇 버튼에 가리지 않게(11/25).
    paddingBottom: 96,
  },
  card: {
    padding: 16,
    gap: 8,
  },
  name: {
    fontFamily: fonts.extraBold,
    fontSize: 20,
    color: colors.text,
  },
  caption: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  error: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 20,
    color: colors.danger,
  },
  timeEditor: {
    gap: 8,
  },
  saveTime: {
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.purpleFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveTimeText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.onPurpleFill,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 7,
    backgroundColor: colors.purpleTint,
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textPurple,
  },
  flex: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingRight: 12,
  },
  list: {
    paddingHorizontal: 16,
  },
  listItem: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.text,
  },
  chevron: {
    fontFamily: fonts.medium,
    fontSize: 20,
    color: colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
  },
  soon: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
