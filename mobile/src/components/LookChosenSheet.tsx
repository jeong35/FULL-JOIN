// '이 룩으로 입을래요'를 누르면 아래에서 올라오는 창(11/25 팀 결정). 오늘 룩을 정했다고 알려 주고 "내일도 알림 보내 드릴까요?"를 묻는다.
// '내일 알려 주세요' → 브라우저 알림 권한을 묻고 서버에 예약(내일 그 시간부터 매일, 친구분 webNotifications.ts).
// 서버 예약이 성공해야 "보내 드릴게요"를 보여 주고, 미지원·권한 거절·실패는 그 이유를 보여 준다.
// 끄기·시간 바꾸기는 마이 › 코디 알림. 이미 켜져 있으면 묻지 않고 언제 가는지만 알려 준다.
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/ui';
import { track } from '@/data/events';
import { useNotificationSettings } from '@/data/notificationSettings';
import { readRecommendationChoices, saveRecommendationChoice } from '@/data/recommendChoices';
import { clockLabel, NOTIFY_PLATFORM, scheduleFailText, suggestTime, timeOf, todayAt, trackScheduleResult } from '@/data/reminder';
import { useSession } from '@/data/session';
import { scheduleRecommendationNotification } from '@/data/webNotifications';
import { colors, fonts, layout } from '@/theme';

const OFF_NOTE = '알림 끄기·시간 바꾸기는 마이 › 코디 알림에서';
type Phase = { kind: 'ask' } | { kind: 'saving' } | { kind: 'done' } | { kind: 'failed'; text: string; retry: boolean };

export function LookChosenSheet({ visible, date, lookId, onClose }: { visible: boolean; date: string; lookId: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const userId = useSession()?.userId ?? 'guest';
  const settings = useNotificationSettings(userId);
  const [phase, setPhase] = useState<Phase>({ kind: 'ask' });
  const time = suggestTime(settings);
  const asking = visible && !settings.enabled && phase.kind === 'ask';

  // 알림 제안을 본 것(알림 퍼널 두 번째 칸).
  useEffect(() => {
    if (asking) track('notification_prompt_view', { platform: NOTIFY_PLATFORM });
  }, [asking]);

  const close = () => {
    setPhase({ kind: 'ask' });
    onClose();
  };

  // 권한 요청이 사용자가 누른 그 순간에 일어나야 해서(사파리), 누른 뒤 다른 기다림 없이 바로 예약을 시작한다.
  async function accept() {
    if (lookId === null) return;
    track('notification_consent', { platform: NOTIFY_PLATFORM });
    setPhase({ kind: 'saving' });
    const result = await scheduleRecommendationNotification(userId, lookId, todayAt(time));
    trackScheduleResult(result);
    if (result.ok) {
      const choice = readRecommendationChoices(userId)[date];
      if (choice !== undefined) {
        saveRecommendationChoice(userId, { ...choice, notificationScheduled: true, scheduleId: result.value.scheduleId, scheduledFor: result.value.scheduledFor });
      }
      setPhase({ kind: 'done' });
    } else {
      setPhase({ kind: 'failed', text: scheduleFailText(result), retry: result.reason === 'request_failed' });
    }
  }

  let body;
  if (phase.kind === 'failed') {
    body = (
      <>
        <Text style={styles.text}>{phase.text}</Text>
        {phase.retry ? <PrimaryButton label="다시 시도" onPress={() => void accept()} /> : <PrimaryButton label="확인" onPress={close} />}
        {phase.retry && (
          <Pressable onPress={close} accessibilityRole="button" hitSlop={8} style={styles.skip}>
            <Text style={styles.skipText}>닫기</Text>
          </Pressable>
        )}
      </>
    );
  } else if (settings.enabled && phase.kind !== 'saving') {
    body = (
      <>
        <Text style={styles.text}>
          {phase.kind === 'done'
            ? `내일부터 매일 ${clockLabel(timeOf(settings))}에 코디 알림을 보내 드릴게요.`
            : `내일도 ${clockLabel(timeOf(settings))}에 코디 알림이 갈 거예요.`}
        </Text>
        <PrimaryButton label="확인" onPress={close} />
        <Text style={styles.note}>{OFF_NOTE}</Text>
      </>
    );
  } else {
    const saving = phase.kind === 'saving';
    body = (
      <>
        <Text style={styles.text}>내일도 {clockLabel(time)}에 코디 알림을 보내 드릴까요?</Text>
        <PrimaryButton label={saving ? '알림 예약하는 중…' : '내일 알려 주세요'} disabled={saving || lookId === null} onPress={() => void accept()} />
        <Pressable
          onPress={() => {
            track('notification_decline', { platform: NOTIFY_PLATFORM });
            close();
          }}
          disabled={saving}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.skip}>
          <Text style={styles.skipText}>괜찮아요</Text>
        </Pressable>
        <Text style={styles.note}>{OFF_NOTE}</Text>
      </>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={phase.kind === 'saving' ? undefined : close} accessibilityLabel="닫기" />
      <View style={[styles.sheet, { paddingBottom: Math.max(24, insets.bottom + 12) }]}>
        <Text style={styles.title}>오늘은 이 룩으로 결정!</Text>
        {body}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(30,20,50,0.3)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 12, paddingTop: 22, paddingHorizontal: layout.screenPaddingX, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.background },
  title: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.text },
  text: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.text },
  skip: { alignSelf: 'center', paddingVertical: 4 },
  skipText: { fontFamily: fonts.medium, fontSize: 14, color: colors.textSecondary },
  note: { textAlign: 'center', fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
});
