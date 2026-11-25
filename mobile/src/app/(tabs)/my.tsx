import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { GlassView } from '@/components/GlassView';
import { TimeField } from '@/components/TimeField';
import { TabScreen } from '@/components/TabScreen';
import { SmallWhiteButton } from '@/components/ui';
import { track } from '@/data/events';
import { clockLabel, setReminder, useReminder } from '@/data/reminder';
import { LOGIN_ENABLED, logout, useSession } from '@/data/session';
import { resetUserData } from '@/data/store';
import { colors, fonts, layout } from '@/theme';

// 마이: 내 계정(닉네임), 내 추구미 다시 고르기, 튜토리얼 다시 보기, 로그아웃.
// 저장한 사진은 저장 탭(11/24)에서 본다.

export default function MyScreen() {
  const session = useSession();
  const taste = session?.styles ?? [];
  const reminder = useReminder();

  function onLogout() {
    track('logout_click');
    resetUserData();
    logout(); // 탭 화면이 로그인 전 상태를 보고 튜토리얼로 보낸다.
  }

  return (
    <TabScreen title="마이">
      <ScrollView contentContainerStyle={styles.content}>
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

        {/* 11/24 팀 결정 17번 → 11/25: 코디 탭 '이 룩으로 입을래요' 뒤 '내일 알려 주세요'를 누르면 여기가 켜진다.
            끄기·시간 바꾸기는 여기서. 알림 보내기(18번)는 이 값을 읽어 따로 연결한다(data/reminder.ts). */}
        <GlassView radius={16} style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={styles.sectionTitle}>코디 알림</Text>
              <Text style={styles.caption}>매일 정한 시간에 &quot;내일 뭐 입지?&quot; 코디하러 오라고 알려 드려요</Text>
            </View>
            <Switch
              value={reminder.enabled}
              onValueChange={(enabled) => setReminder({ enabled })}
              trackColor={{ false: colors.line, true: colors.purpleStrong }}
              thumbColor={colors.white}
              // 웹(react-native-web)은 켜졌을 때 동그라미 색을 따로 받는다.
              {...({ activeThumbColor: colors.white } as object)}
              accessibilityLabel="코디 알림 켜기"
            />
          </View>
          {reminder.enabled && (
            <>
              <TimeField value={reminder.time} onChange={(time) => setReminder({ time })} />
              <Text style={styles.caption}>매일 {clockLabel(reminder.time)}에 알려 드릴게요</Text>
            </>
          )}
        </GlassView>

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
  timeChip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  timeChipOn: {
    borderColor: colors.purpleLine,
    borderWidth: 1.5,
  },
  timeChipText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.text,
  },
  timeChipTextOn: {
    fontFamily: fonts.bold,
    color: colors.textPurple,
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
