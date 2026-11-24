import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlassView } from '@/components/GlassView';
import { TabScreen } from '@/components/TabScreen';
import { SmallWhiteButton } from '@/components/ui';
import { errorMessage } from '@/data/api';
import { ACCOUNT_LOGIN_ENABLED } from '@/data/authConfig';
import { track } from '@/data/events';
import { LOGIN_ENABLED, logout, useSession } from '@/data/session';
import { currentProviderLabel, deleteMyAccount, signOutSocial } from '@/data/socialAuth';
import { resetUserData } from '@/data/store';
import { colors, fonts, layout } from '@/theme';

// 마이: 내 계정(닉네임), 내 추구미 다시 고르기, 튜토리얼 다시 보기, 로그아웃.
// 카카오·구글·애플 로그인이 켜져 있으면 회원 탈퇴도 있다(서버 DELETE /account).
// 저장한 사진은 홈의 '모든 저장'·'계절' 탭에서 본다.

const DELETE_TITLE = '정말 탈퇴할까요?';
const DELETE_BODY = '옷장·옷 사진·저장한 사진·챗봇 기록·추구미가 모두 지워지고 되돌릴 수 없어요.';

function confirmDelete(onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${DELETE_TITLE}\n${DELETE_BODY}`)) onConfirm();
    return;
  }
  Alert.alert(DELETE_TITLE, DELETE_BODY, [
    { text: '취소', style: 'cancel' },
    { text: '탈퇴하기', style: 'destructive', onPress: onConfirm },
  ]);
}

export default function MyScreen() {
  const session = useSession();
  const taste = session?.styles ?? [];
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const providerLabel = ACCOUNT_LOGIN_ENABLED ? currentProviderLabel() : null;

  function onLogout() {
    track('logout_click');
    if (ACCOUNT_LOGIN_ENABLED) {
      // 이 기기의 출입증까지 지운다. 탭 화면이 로그인 전 상태를 보고 로그인 화면으로 보낸다.
      void signOutSocial();
      return;
    }
    resetUserData();
    logout(); // 탭 화면이 로그인 전 상태를 보고 튜토리얼로 보낸다.
  }

  function onDelete() {
    if (deleting) return;
    confirmDelete(() => {
      setDeleting(true);
      setDeleteError(null);
      deleteMyAccount()
        .catch((error: unknown) => {
          track('error_shown', { screen: 'my', error_code: 'account_delete_failed' });
          setDeleteError(errorMessage(error));
        })
        .finally(() => setDeleting(false));
    });
  }

  return (
    <TabScreen title="마이">
      <ScrollView contentContainerStyle={styles.content}>
        <GlassView radius={16} style={styles.card}>
          <Text style={styles.name}>{session?.nickname || '내 계정'}</Text>
          <Text style={styles.caption}>
            {ACCOUNT_LOGIN_ENABLED
              ? `${providerLabel ?? 'SNS 계정'}으로 로그인했어요. 다른 폰에서도 같은 계정으로 들어오면 내 옷장이 그대로 열려요.`
              : LOGIN_ENABLED
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
          {ACCOUNT_LOGIN_ENABLED && (
            <>
              <View style={styles.divider} />
              <Pressable onPress={onDelete} disabled={deleting} accessibilityRole="button" style={styles.listItem}>
                <Text style={[styles.listText, styles.dangerText]}>{deleting ? '탈퇴하는 중…' : '회원 탈퇴'}</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            </>
          )}
        </GlassView>
        {deleteError !== null && <Text style={styles.deleteError}>{deleteError}</Text>}

        <Text style={styles.soon}>저장한 사진은 홈의 &apos;모든 저장&apos;에서 볼 수 있어요</Text>
      </ScrollView>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: 32,
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
  dangerText: {
    color: colors.danger,
  },
  deleteError: {
    textAlign: 'center',
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.danger,
  },
  soon: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
