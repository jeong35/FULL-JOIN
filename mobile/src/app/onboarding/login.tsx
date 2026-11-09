import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassView } from '@/components/GlassView';
import { DetailHeader, PrimaryButton } from '@/components/ui';
import { accountHasData } from '@/data/api';
import { NICKNAME_MAX, login, nicknameProblem, pinProblem, userIdFor } from '@/data/session';
import { colors, fonts, layout } from '@/theme';

// 튜토리얼 ②: 로그인. 닉네임 + 숫자 4자리.
// 처음이면 새 옷장이 생기고 취향 고르기로 간다. 이미 저장한 사진이나 옷장 옷이 있는 계정이면(다른 기기·로그아웃 뒤)
// 취향 고르기를 건너뛰고 바로 홈으로 간다.

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [nickname, setNickname] = useState('');
  const [pin, setPin] = useState('');
  const [tried, setTried] = useState(false);
  const [checking, setChecking] = useState(false);
  const pinRef = useRef<ComponentRef<typeof TextInput>>(null);

  const nicknameError = nicknameProblem(nickname);
  const pinError = pinProblem(pin);
  const valid = nicknameError === null && pinError === null;

  async function submit() {
    setTried(true);
    if (!valid || checking) return;
    setChecking(true);
    let returning = false;
    try {
      returning = await accountHasData(userIdFor(nickname, pin));
    } catch {
      // 확인을 못 하면 새 사람처럼 취향 고르기로 간다.
    }
    login(nickname, pin, returning);
    router.replace(returning ? '/' : '/onboarding/taste');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <DetailHeader title="오딧 시작하기" onBack={() => (router.canGoBack() ? router.back() : router.replace('/onboarding'))} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.lead}>닉네임과 숫자 4자리를 정해 주세요.</Text>

          <Text style={styles.label}>닉네임</Text>
          <GlassView radius={14} style={styles.inputBox}>
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              placeholder={`예: 존재 (2~${NICKNAME_MAX}글자)`}
              placeholderTextColor={colors.textSecondary}
              maxLength={NICKNAME_MAX + 4}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => pinRef.current?.focus()}
              style={styles.input}
              accessibilityLabel="닉네임"
            />
          </GlassView>
          {tried && nicknameError !== null && <Text style={styles.error}>{nicknameError}</Text>}

          <Text style={styles.label}>숫자 4자리</Text>
          <GlassView radius={14} style={styles.inputBox}>
            <TextInput
              ref={pinRef}
              value={pin}
              onChangeText={(text) => setPin(text.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="0000"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              inputMode="numeric"
              secureTextEntry
              maxLength={4}
              returnKeyType="done"
              onSubmitEditing={submit}
              style={[styles.input, styles.pinInput]}
              accessibilityLabel="숫자 4자리"
            />
          </GlassView>
          {tried && pinError !== null && <Text style={styles.error}>{pinError}</Text>}

          <View style={styles.notes}>
            <Text style={styles.note}>· 처음이면 새 옷장이 만들어져요.</Text>
            <Text style={styles.note}>· 다른 폰이나 브라우저에서도 같은 닉네임과 숫자로 들어오면 내 옷장이 그대로 열려요.</Text>
            <Text style={styles.note}>· 숫자를 잊으면 옷장을 다시 찾을 수 없어요. 다른 곳에서 쓰는 비밀번호는 넣지 마세요.</Text>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(24, insets.bottom) }]}>
          <PrimaryButton label={checking ? '확인하는 중…' : '시작하기'} onPress={submit} disabled={checking || (tried && !valid)} />
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
  scrollContent: {
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: 20,
  },
  lead: {
    marginTop: 14,
    marginBottom: 8,
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 23,
    color: colors.text,
  },
  label: {
    marginTop: 18,
    marginBottom: 8,
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.text,
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
    // 웹에서 입력칸을 눌렀을 때 검은 테두리(포커스 표시)가 생기지 않게.
    outlineWidth: 0,
    outlineStyle: 'solid',
  },
  pinInput: {
    letterSpacing: 6,
  },
  error: {
    marginTop: 6,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: '#B4475A',
  },
  notes: {
    marginTop: 22,
    gap: 6,
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  footer: {
    paddingTop: 12,
    paddingHorizontal: layout.screenPaddingX,
  },
});
