import { Redirect } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassView } from '@/components/GlassView';
import { PrimaryButton } from '@/components/ui';
import { ACCOUNT_LOGIN_ENABLED } from '@/data/authConfig';
import { track } from '@/data/events';
import { NICKNAME_MAX, nicknameProblem, useSession } from '@/data/session';
import { nextRouteFor, nicknameSuggestion, saveNickname } from '@/data/socialAuth';
import { colors, fonts, layout } from '@/theme';

// 카카오·구글·애플로 처음 로그인한 사람: 오딧에서 쓸 닉네임 정하기.
// 칸에는 카카오 닉네임·구글 이름·애플 이름을 미리 넣어 두고, 고치거나 그대로 쓸 수 있다.
// 닉네임은 Supabase 사용자 정보(user_metadata.odit_nickname)에 저장돼서 다른 기기에서도 그대로 보인다.

export default function NicknameScreen() {
  const session = useSession();
  if (!ACCOUNT_LOGIN_ENABLED) return <Redirect href="/onboarding/login" />;
  if (session === null) return <Redirect href="/onboarding/login" />;
  return <NicknameForm />;
}

function NicknameForm() {
  const insets = useSafeAreaInsets();
  const [nickname, setNickname] = useState(nicknameSuggestion);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const problem = nicknameProblem(nickname);

  async function submit() {
    setTried(true);
    if (problem !== null || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveNickname(nickname);
    } catch {
      track('error_shown', { screen: 'nickname', error_code: 'nickname_save_failed' });
      setError('닉네임을 저장하지 못했어요. 잠시 후 다시 시도해 주세요');
      setSaving(false);
    }
  }

  // 저장되면 세션의 닉네임이 바뀌고, 다음 화면으로 간다.
  const session = useSession();
  if (session !== null && session.nickname !== '') return <Redirect href={nextRouteFor(session)} />;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>오딧에서 쓸{'\n'}닉네임을 정해 주세요</Text>
          <Text style={styles.lead}>마이 탭에 보이는 이름이에요.</Text>

          <GlassView radius={14} style={styles.inputBox}>
            <TextInput
              value={nickname}
              onChangeText={(text) => {
                if (!started.current && text.length > 0) {
                  started.current = true;
                  track('login_nickname_start');
                }
                setNickname(text);
              }}
              placeholder={`예: 존재 (2~${NICKNAME_MAX}글자)`}
              placeholderTextColor={colors.textSecondary}
              maxLength={NICKNAME_MAX + 4}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={submit}
              style={styles.input}
              accessibilityLabel="닉네임"
            />
          </GlassView>
          {tried && problem !== null && <Text style={styles.error}>{problem}</Text>}
          {error !== null && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(24, insets.bottom) }]}>
          <PrimaryButton label={saving ? '저장하는 중…' : '다음'} onPress={submit} disabled={saving || (tried && problem !== null)} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: 20,
  },
  title: {
    marginTop: 40,
    fontFamily: fonts.extraBold,
    fontSize: 24,
    lineHeight: 34,
    color: colors.text,
  },
  lead: {
    marginTop: 8,
    marginBottom: 24,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.textSecondary,
  },
  inputBox: {
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  input: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.text,
    outlineWidth: 0,
    outlineStyle: 'solid',
  },
  error: {
    marginTop: 6,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.danger,
  },
  footer: {
    paddingTop: 12,
    paddingHorizontal: layout.screenPaddingX,
  },
});
