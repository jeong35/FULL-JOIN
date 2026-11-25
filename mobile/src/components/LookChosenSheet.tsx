// '이 룩으로 입을래요'를 누르면 뜨는 창(11/25 팀 결정). 오늘 룩을 정했다고 알려 주고 "내일도 알림 보내 드릴까요?"를 묻는다.
// '내일 알려 주세요'를 누르면 그 시간으로 매일 코디 알림을 켠다(친구분 제안: 고르면 매일 그 시간에 푸시).
// 끄기·시간 바꾸기는 마이 › 코디 알림. 이미 켜져 있으면 묻지 않고 언제 가는지만 알려 준다.
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/ui';
import { clockLabel, setReminder, suggestTime, useReminder } from '@/data/reminder';
import { colors, fonts, layout } from '@/theme';

const OFF_NOTE = '알림 끄기·시간 바꾸기는 마이 › 코디 알림에서';

export function LookChosenSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const reminder = useReminder();
  const [justSet, setJustSet] = useState(false);
  const time = suggestTime(new Date(), reminder);
  const close = () => {
    setJustSet(false);
    onClose();
  };

  let body;
  if (reminder.enabled) {
    body = (
      <>
        <Text style={styles.text}>
          {justSet
            ? <>내일부터 매일 {clockLabel(reminder.time)}에 &quot;내일 뭐 입지?&quot; 알림을 보내 드릴게요.</>
            : <>내일도 {clockLabel(reminder.time)}에 코디 알림이 갈 거예요.</>}
        </Text>
        <PrimaryButton label="확인" onPress={close} />
        <Text style={styles.note}>{OFF_NOTE}</Text>
      </>
    );
  } else {
    body = (
      <>
        <Text style={styles.text}>내일도 {clockLabel(time)}에 &quot;내일 뭐 입지?&quot; 알림을 보내 드릴까요?</Text>
        <PrimaryButton
          label="내일 알려 주세요"
          onPress={() => {
            setReminder({ enabled: true, time });
            setJustSet(true);
          }}
        />
        <Pressable onPress={close} accessibilityRole="button" hitSlop={8} style={styles.skip}>
          <Text style={styles.skipText}>괜찮아요</Text>
        </Pressable>
        <Text style={styles.note}>{OFF_NOTE}</Text>
      </>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="닫기" />
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
