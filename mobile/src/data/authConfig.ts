// 계정 로그인(Supabase Auth) 설정: 이메일 회원가입·로그인 + 카카오·구글·애플.
// 세 값이 다 있어야 켜진다. 하나라도 없으면 지금 로그인(닉네임 + 숫자 4자리)이 그대로 돈다.
// - EXPO_PUBLIC_SUPABASE_URL: https://<project-ref>.supabase.co (공개 주소)
// - EXPO_PUBLIC_SUPABASE_ANON_KEY: Supabase 공개 키(anon). 앱에 들어가도 되는 키다. service_role 키는 절대 넣지 않는다.
// - EXPO_PUBLIC_AUTH_PROVIDERS: 쓸 로그인 방법, 쉼표로. 예: email,kakao,google (애플까지면 ,apple)
//   Supabase 대시보드에서 켠 것만 넣는다(켜지 않은 걸 넣으면 누를 때 오류).

export type SocialProvider = 'kakao' | 'google' | 'apple';
export type AuthMethod = 'email' | SocialProvider;

const KNOWN: readonly AuthMethod[] = ['email', 'kakao', 'google', 'apple'];

function parseMethods(raw: string | undefined): AuthMethod[] {
  const wanted = new Set((raw ?? '').split(',').map((value) => value.trim().toLowerCase()));
  // 화면 순서는 늘 이메일 → 카카오 → 구글 → 애플.
  return KNOWN.filter((method) => wanted.has(method));
}

export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
const AUTH_METHODS: readonly AuthMethod[] = parseMethods(process.env.EXPO_PUBLIC_AUTH_PROVIDERS);

export const ACCOUNT_LOGIN_ENABLED = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '' && AUTH_METHODS.length > 0;
export const EMAIL_LOGIN_ENABLED = ACCOUNT_LOGIN_ENABLED && AUTH_METHODS.includes('email');
export const SOCIAL_PROVIDERS: readonly SocialProvider[] = ACCOUNT_LOGIN_ENABLED
  ? AUTH_METHODS.filter((method): method is SocialProvider => method !== 'email')
  : [];

// 이메일 가입 규칙. Supabase 대시보드의 비밀번호 최소 길이도 같은 값(8)으로 맞춘다.
export const PASSWORD_MIN = 8;

export const PROVIDER_LABELS: Record<AuthMethod, string> = {
  email: '이메일',
  kakao: '카카오',
  google: '구글',
  apple: '애플',
};
