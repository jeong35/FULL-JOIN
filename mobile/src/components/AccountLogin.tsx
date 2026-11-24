// 계정 로그인 화면 (ACCOUNT_LOGIN_ENABLED일 때 /onboarding/login 에서 보임).
// 위: 이메일 + 비밀번호 로그인, 그 밑에 '회원가입'. 아래: '또는' 줄 뒤에 카카오·구글·애플.
// 버튼 색·글자는 각 회사 로그인 버튼 안내(카카오 노랑 #FEE500, 구글 흰 바탕 + 회색 테두리, 애플 검정)를 따른다.
// ⚠ 로고(말풍선·G·사과)는 직접 그리지 않는다. 출시 전에 각 회사가 주는 공식 버튼 이미지·로고 파일을 받아
//   assets/images/login/ 에 넣고 SocialButton에 넣는다. 아이폰 애플 버튼은 기본 제공 버튼을 쓴다.
import * as AppleAuthentication from 'expo-apple-authentication';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassView } from '@/components/GlassView';
import { DetailHeader, PrimaryButton } from '@/components/ui';
import { EMAIL_LOGIN_ENABLED, PROVIDER_LABELS, SOCIAL_PROVIDERS, type SocialProvider } from '@/data/authConfig';
import { track } from '@/data/events';
import { getAuthNotice, setAuthNotice, useSession } from '@/data/session';
import { authErrorMessage, nextRouteFor, signInWith, signInWithEmail } from '@/data/socialAuth';
import { colors, fonts, layout } from '@/theme';

// 로그인에 걸린 시간(이벤트용). 화면 함수 밖에 둬서 그리기와 섞이지 않게 한다.
function clock(): number {
  return Date.now();
}

export function emailProblem(raw: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim()) ? null : '이메일 주소를 다시 확인해 주세요';
}

// ── 입력칸: 지금 로그인 화면과 같은 모양(높이 52, 흰 유리 상자) ──
export function AuthField({
  label,
  inputRef,
  error,
  ...input
}: {
  label: string;
  inputRef?: React.Ref<ComponentRef<typeof TextInput>>;
  error?: string | null;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <GlassView radius={14} style={styles.inputBox}>
        <TextInput
          ref={inputRef}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          accessibilityLabel={label}
          {...input}
        />
      </GlassView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const BUTTON: Record<SocialProvider, { label: string; background: string; text: string; border?: string }> = {
  kakao: { label: '카카오로 시작하기', background: '#FEE500', text: 'rgba(0,0,0,0.85)' },
  google: { label: 'Google로 시작하기', background: '#FFFFFF', text: '#1F1F1F', border: '#747775' },
  apple: { label: 'Apple로 시작하기', background: '#000000', text: '#FFFFFF' },
};

function SocialButton({
  provider,
  busy,
  disabled,
  onPress,
}: {
  provider: SocialProvider;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const style = BUTTON[provider];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={style.label}
      accessibilityState={{ disabled, busy }}
      style={({ pressed }) => [
        styles.socialButton,
        { backgroundColor: style.background },
        style.border !== undefined && { borderWidth: 1, borderColor: style.border },
        (pressed || busy) && styles.pressed,
        disabled && !busy && styles.disabled,
      ]}>
      <Text style={[styles.socialText, { color: style.text }]}>{busy ? '여는 중…' : style.label}</Text>
    </Pressable>
  );
}

// 카카오·구글·애플 버튼 묶음. 회원가입 화면에서도 쓴다.
export function SocialButtons({ onError }: { onError: (message: string | null) => void }) {
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [nativeApple, setNativeApple] = useState(false);

  // 아이폰이면 애플 기본 로그인 버튼을 쓴다.
  useEffect(() => {
    if (Platform.OS !== 'ios' || !SOCIAL_PROVIDERS.includes('apple')) return;
    let alive = true;
    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (alive) setNativeApple(available);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function start(provider: SocialProvider) {
    if (busy !== null) return;
    setBusy(provider);
    onError(null);
    const startedAt = clock();
    track('login_submit', { valid: true, provider });
    try {
      const result = await signInWith(provider);
      if (result === 'cancelled') track('login_failed', { error_code: 'cancelled', provider, latency_ms: clock() - startedAt });
      // 'redirected'(웹)는 페이지가 넘어가고, 'signed_in'(앱)은 세션이 생기면 로그인 화면이 다음 화면으로 보낸다.
      if (result === 'signed_in') track('login_success', { provider, returning: false });
    } catch {
      track('login_failed', { error_code: 'oauth_failed', provider, latency_ms: clock() - startedAt });
      track('error_shown', { screen: 'login', error_code: 'oauth_failed' });
      onError(`${PROVIDER_LABELS[provider]} 로그인을 끝내지 못했어요. 잠시 후 다시 시도해 주세요`);
    } finally {
      setBusy(null);
    }
  }

  if (SOCIAL_PROVIDERS.length === 0) return null;
  return (
    <View style={styles.socialList}>
      {SOCIAL_PROVIDERS.map((provider) =>
        provider === 'apple' && nativeApple ? (
          <AppleAuthentication.AppleAuthenticationButton
            key={provider}
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={14}
            style={styles.appleNative}
            onPress={() => void start('apple')}
          />
        ) : (
          <SocialButton
            key={provider}
            provider={provider}
            busy={busy === provider}
            disabled={busy !== null}
            onPress={() => void start(provider)}
          />
        ),
      )}
    </View>
  );
}

export function OrDivider({ label }: { label: string }) {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>{label}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

export function AuthScreenFrame({ title, children }: { title: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <DetailHeader title={title} onBack={() => (router.canGoBack() ? router.back() : router.replace('/onboarding'))} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(24, insets.bottom) }]}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AccountLoginScreen() {
  const session = useSession();
  // 회원가입에서 "이미 가입한 이메일"이라 넘어왔으면 그 이메일을 미리 넣어 둔다.
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(() => (typeof params.email === 'string' ? params.email : ''));
  const [password, setPassword] = useState('');
  const [tried, setTried] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice] = useState(getAuthNotice);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);

  const emailError = emailProblem(email);
  const passwordError = password.length > 0 ? null : '비밀번호를 넣어 주세요';

  // 안내(로그인이 풀렸어요)는 한 번만 보여 준다.
  useEffect(() => {
    if (notice !== null) setAuthNotice(null);
  }, [notice]);

  // 로그인이 끝나 세션이 생기면 다음 화면으로(닉네임 → 취향 고르기 → 홈).
  useEffect(() => {
    if (session !== null) router.replace(nextRouteFor(session));
  }, [session]);

  async function submit() {
    setTried(true);
    const valid = emailError === null && passwordError === null;
    track('login_submit', { valid, provider: 'email' });
    if (!valid) {
      track('login_validation_failed', { error_field: emailError !== null ? 'email' : 'password' });
      return;
    }
    if (checking) return;
    setChecking(true);
    setError(null);
    const startedAt = clock();
    try {
      await signInWithEmail(email, password);
      track('login_success', { provider: 'email', latency_ms: clock() - startedAt });
    } catch (caught) {
      const code = String((caught as { code?: unknown } | null)?.code ?? 'email_login_failed');
      track('login_failed', { error_code: code, provider: 'email', latency_ms: clock() - startedAt });
      track('error_shown', { screen: 'login', error_code: code });
      setError(authErrorMessage(caught));
    } finally {
      setChecking(false);
    }
  }

  return (
    <AuthScreenFrame title="오딧 시작하기">
      <Text style={styles.title}>로그인</Text>
      <Text style={styles.lead}>다른 폰에서도 같은 계정으로 들어오면 내 옷장이 그대로 열려요.</Text>

      {notice === 'expired' && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>로그인이 풀렸어요. 다시 로그인해 주세요.</Text>
        </View>
      )}

      {EMAIL_LOGIN_ENABLED && (
        <>
          <View style={styles.form}>
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
              error={tried ? emailError : null}
            />
            <AuthField
              label="비밀번호"
              inputRef={passwordRef}
              value={password}
              onChangeText={setPassword}
              placeholder="비밀번호"
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={submit}
              error={tried ? passwordError : null}
            />
          </View>
          {error !== null && <Text style={styles.formError}>{error}</Text>}
          <View style={styles.primary}>
            <PrimaryButton label={checking ? '확인하는 중…' : '로그인'} onPress={submit} disabled={checking} />
          </View>
          <View style={styles.signupRow}>
            <Text style={styles.signupHint}>처음이세요?</Text>
            <Link href="/onboarding/signup" style={styles.signupLink}>
              회원가입
            </Link>
          </View>
        </>
      )}

      {SOCIAL_PROVIDERS.length > 0 && (
        <>
          {EMAIL_LOGIN_ENABLED && <OrDivider label="또는 간편 로그인" />}
          <SocialButtons onError={setError} />
          {!EMAIL_LOGIN_ENABLED && error !== null && <Text style={styles.formError}>{error}</Text>}
        </>
      )}
    </AuthScreenFrame>
  );
}

export const authStyles = StyleSheet.create({
  title: {
    marginTop: 20,
    fontFamily: fonts.extraBold,
    fontSize: 24,
    color: colors.text,
  },
  lead: {
    marginTop: 6,
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  formError: {
    marginTop: 12,
    fontFamily: fonts.medium,
    fontSize: 12.5,
    lineHeight: 19,
    color: colors.danger,
  },
});

const styles = StyleSheet.create({
  ...authStyles,
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenPaddingX,
  },
  notice: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.purpleTint,
  },
  noticeText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.tagText,
  },
  form: {
    marginTop: 8,
  },
  label: {
    marginTop: 16,
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
  error: {
    marginTop: 6,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.danger,
  },
  primary: {
    marginTop: 20,
  },
  signupRow: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  signupHint: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    color: colors.textSecondary,
  },
  signupLink: {
    fontFamily: fonts.bold,
    fontSize: 13.5,
    color: colors.textPurple,
    textDecorationLine: 'underline',
  },
  divider: {
    marginTop: 28,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.line,
  },
  dividerText: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  socialList: {
    gap: 10,
  },
  socialButton: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
  socialText: {
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  appleNative: {
    height: 50,
    width: '100%',
  },
});
