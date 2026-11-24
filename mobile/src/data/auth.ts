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

// 서버가 출입증을 거절했을 때(401) 로그인 모듈이 할 일(로그인 풀기 → 로그인 화면)을 등록하는 자리.
// 출입증을 보낸 요청에서만 부른다(예전 닉네임·숫자 로그인에는 영향 없음).
type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler = () => {};

export function registerUnauthorizedHandler(handler: UnauthorizedHandler): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = () => {};
  };
}

export function notifyUnauthorized(): void {
  unauthorizedHandler();
}
