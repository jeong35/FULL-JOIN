// Supabase Auth 또는 외부 포털 연동 모듈이 access token 공급자를 등록하는 경계.
// 로그인 방식이 확정되기 전에는 토큰을 만들거나 저장하지 않는다.
type AccessTokenProvider = () => Promise<string | null>;

let accessTokenProvider: AccessTokenProvider = async () => null;

export function registerAccessTokenProvider(provider: AccessTokenProvider): () => void {
  accessTokenProvider = provider;
  return () => {
    if (accessTokenProvider === provider) accessTokenProvider = async () => null;
  };
}

export async function getAccessToken(): Promise<string | null> {
  const token = await accessTokenProvider();
  return typeof token === 'string' && token.trim() !== '' ? token : null;
}
