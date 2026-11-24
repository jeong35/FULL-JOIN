import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AuthField, AuthScreenFrame, OrDivider, SocialButtons, authStyles, emailProblem } from '@/components/AccountLogin';
import { PrimaryButton } from '@/components/ui';
import { EMAIL_LOGIN_ENABLED, PASSWORD_MIN, SOCIAL_PROVIDERS } from '@/data/authConfig';
import { track } from '@/data/events';
import { NICKNAME_MAX, nicknameProblem, useSession } from '@/data/session';
import { authErrorMessage, nextRouteFor, signUpWithEmail } from '@/data/socialAuth';
import { colors, fonts } from '@/theme';

// 이메일 회원가입: 이메일 · 비밀번호 · 비밀번호 확인 · 닉네임.
// 닉네임을 여기서 받으니 가입 뒤 닉네임 화면은 건너뛰고 취향 고르기로 간다.
// Supabase에서 '메일 확인'을 켜 두었으면 가입 뒤 "메일함을 확인해 주세요" 안내를 보여 준다.
// 이메일 중복: [가입하기]를 누르면 Supabase가 확인한다. 이미 있으면 이메일 칸 밑에 "이미 가입한 이메일이에요"와
// "이 이메일로 로그인하기"를 보여 준다. 누르기 전에 따로 묻는 '중복확인' 버튼은 두지 않는다
// (아무나 남의 이메일이 가입돼 있는지 알아볼 수 있게 되기 때문. 확인하려면 서버 함수 + 횟수 제한이 필요).

function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `비밀번호는 ${PASSWORD_MIN}자 이상이에요`;
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return '영문과 숫자를 섞어 주세요';
  return null;
}

export default function SignupScreen() {
  if (!EMAIL_LOGIN_ENABLED) return <Redirect href="/onboarding/login" />;
  return <SignupForm />;
}

function SignupForm() {
  const session = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [nickname, setNickname] = useState('');
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  // 이미 가입된 것으로 확인된 이메일. 이메일을 고치면 안내가 사라진다.
  const [takenEmail, setTakenEmail] = useState<string | null>(null);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const confirmRef = useRef<ComponentRef<typeof TextInput>>(null);
  const nicknameRef = useRef<ComponentRef<typeof TextInput>>(null);

  const emailTaken = takenEmail !== null && takenEmail === email.trim().toLowerCase();
  const emailError = emailProblem(email);
  const passwordError = passwordProblem(password);
  const confirmError = confirm === password ? null : '비밀번호가 서로 달라요';
  const nicknameError = nicknameProblem(nickname);
  const valid = emailError === null && passwordError === null && confirmError === null && nicknameError === null;

  // 가입하자마자 로그인되면(메일 확인 꺼 둔 경우) 취향 고르기로.
  useEffect(() => {
    if (session !== null) router.replace(nextRouteFor(session));
  }, [session]);

  async function submit() {
    setTried(true);
    track('login_submit', { valid, provider: 'email', mode: 'signup' });
    if (!valid) {
      const field = emailError !== null ? 'email' : passwordError !== null ? 'password' : confirmError !== null ? 'password_confirm' : 'nickname';
      track('login_validation_failed', { error_field: field, mode: 'signup' });
      return;
    }
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await signUpWithEmail(email, password, nickname);
      track('login_success', { provider: 'email', mode: 'signup', returning: false });
      if (result === 'confirm_email') setSentTo(email.trim());
    } catch (caught) {
      const code = String((caught as { code?: unknown } | null)?.code ?? 'signup_failed');
      track('login_failed', { error_code: code, provider: 'email', mode: 'signup' });
      track('error_shown', { screen: 'signup', error_code: code });
      if (code === 'user_already_exists') setTakenEmail(email.trim().toLowerCase());
      else setError(authErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  if (sentTo !== null) {
    return (
      <AuthScreenFrame title="회원가입">
        <Text style={authStyles.title}>메일함을 확인해 주세요</Text>
        <Text style={authStyles.lead}>
          {sentTo}로 확인 메일을 보냈어요. 메일 속 링크를 누르면 가입이 끝나고 오딧이 열려요.
        </Text>
        <View style={styles.primary}>
          <PrimaryButton label="로그인 화면으로" onPress={() => router.replace('/onboarding/login')} />
        </View>
      </AuthScreenFrame>
    );
  }

  return (
    <AuthScreenFrame title="회원가입">
      <Text style={authStyles.title}>오딧 계정 만들기</Text>
      <Text style={authStyles.lead}>이메일로 가입하면 다른 폰에서도 같은 옷장을 쓸 수 있어요.</Text>

      <AuthField
        label="이메일"
        value={email}
        onChangeText={setEmail}
        placeholder="name@example.com"
        keyboardType="email-address"
        inputMode="email"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={tried && emailError !== null ? emailError : emailTaken ? '이미 가입한 이메일이에요' : null}
      />
      {emailTaken && (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.replace({ pathname: '/onboarding/login', params: { email: email.trim() } })}
          style={styles.takenLink}>
          <Text style={styles.takenLinkText}>이 이메일로 로그인하기 ›</Text>
        </Pressable>
      )}
      <AuthField
        label="비밀번호"
        inputRef={passwordRef}
        value={password}
        onChangeText={setPassword}
        placeholder={`영문 + 숫자 ${PASSWORD_MIN}자 이상`}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
        error={tried ? passwordError : null}
      />
      <AuthField
        label="비밀번호 확인"
        inputRef={confirmRef}
        value={confirm}
        onChangeText={setConfirm}
        placeholder="한 번 더 넣어 주세요"
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => nicknameRef.current?.focus()}
        error={tried ? confirmError : null}
      />
      <AuthField
        label="닉네임"
        inputRef={nicknameRef}
        value={nickname}
        onChangeText={setNickname}
        placeholder={`마이 탭에 보이는 이름 (2~${NICKNAME_MAX}글자)`}
        maxLength={NICKNAME_MAX + 4}
        returnKeyType="done"
        onSubmitEditing={submit}
        error={tried ? nicknameError : null}
      />

      {error !== null && <Text style={authStyles.formError}>{error}</Text>}
      <View style={styles.primary}>
        <PrimaryButton label={saving ? '가입하는 중…' : '가입하기'} onPress={submit} disabled={saving} />
      </View>

      {SOCIAL_PROVIDERS.length > 0 && (
        <>
          <OrDivider label="또는 간편 가입" />
          <SocialButtons onError={setError} />
        </>
      )}
      <Text style={styles.note}>카카오·구글로 가입하면 비밀번호 없이 들어올 수 있어요.</Text>
    </AuthScreenFrame>
  );
}

const styles = StyleSheet.create({
  primary: {
    marginTop: 20,
  },
  takenLink: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingVertical: 4,
  },
  takenLinkText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textPurple,
  },
  note: {
    marginTop: 14,
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
