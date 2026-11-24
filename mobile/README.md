# 오딧(odit.) 앱 — 실행 방법

Expo(React Native) 앱이다. 서버는 배포된 Supabase Edge Function `api`를 기본으로 부르므로, 앱만 켜면 실제 데이터로 동작한다.
서버 API는 [`../docs/API_MVP.md`](../docs/API_MVP.md), 옷 종류 그림은 [`../design/kind-icons/README.md`](../design/kind-icons/README.md)를 본다.

## 준비

1. Node.js 22.18 이상
2. 휴대폰으로 볼 때: App Store·Play 스토어에서 **Expo Go** 설치 (Expo SDK 58)
3. 아이폰 시뮬레이터로 볼 때: Xcode

## 실행

FULL-JOIN 폴더에서:

```bash
cd mobile
npm install        # 처음 한 번, 또는 package.json이 바뀌었을 때
npx expo start
```

터미널에 QR 코드와 메뉴가 나오면 하나를 고른다.

| 보는 곳 | 방법 |
|---|---|
| 맥 브라우저 | `w` |
| 아이폰 시뮬레이터 | `i` |
| 내 휴대폰 | 아이폰은 카메라, 안드로이드는 Expo Go로 QR 코드를 찍는다 (컴퓨터와 같은 와이파이) |

- 코드를 고치면 바로 반영된다. 예전 화면이 계속 보이면 `npx expo start -c`로 캐시를 지우고 다시 켠다.
- 끌 때는 `Ctrl + C`.

## 설정 (선택)

`mobile/.env`에 넣으면 기본값 대신 쓴다. `EXPO_PUBLIC_`으로 시작하는 값은 앱에 그대로 들어가므로 **비밀 키는 절대 넣지 않는다**
(service_role·OpenAI·관리자 토큰은 Supabase Secrets에만).

| 이름 | 기본값 | 뜻 |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | 배포 서버 주소 | 로컬 서버(`http://127.0.0.1:54321/functions/v1/api`)로 바꿀 때 |
| `EXPO_PUBLIC_DEMO_USER_ID` | `eunjae-demo` | 앱(시뮬레이터·Expo Go)의 시연용 사용자. 넣은 채로 웹을 만들면 웹도 로그인 없이 모두 이 사용자 하나를 같이 쓴다 |
| `EXPO_PUBLIC_CHAT_HISTORY_ENABLED` | `false` | Auth access token 공급자가 연결된 staging/출시 빌드에서만 `true`. 사진별 대화 복원·삭제 UI를 켠다 |
| `EXPO_PUBLIC_SUPABASE_URL` | 없음 | 계정 로그인용. `https://<project-ref>.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | 없음 | 계정 로그인용 Supabase 공개 키(anon). service_role 키 아님 |
| `EXPO_PUBLIC_AUTH_PROVIDERS` | 없음 | 쓸 로그인 방법. 예: `email,kakao,google` (애플까지면 `,apple`) |

### 계정 로그인 켜기 (이메일 회원가입 + 카카오·구글·애플)

위 세 값(`SUPABASE_URL`·`SUPABASE_ANON_KEY`·`AUTH_PROVIDERS`)이 **모두** 있어야 켜진다. 하나라도 없으면 예전 로그인(닉네임 + 숫자 4자리) 그대로다.
값은 `mobile/.env.local`에 넣는다(깃에 안 올라감). 예시는 `mobile/.env.example`.

켜지면 이렇게 바뀐다.

- 웹·앱 모두 로그인 화면이 뜬다: 위에 이메일 + 비밀번호 로그인과 '회원가입', 아래에 '또는 간편 로그인' 카카오 → 구글 → 애플.
- 회원가입(`/onboarding/signup`): 이메일 · 비밀번호(영문 + 숫자 8자 이상) · 비밀번호 확인 · 닉네임. 가입하면 바로 취향 고르기.
- 카카오·구글·애플로 처음 들어오면 닉네임을 정하고(`/onboarding/nickname`), 그다음 취향 고르기.
- 사용자 ID는 Supabase가 확인한 ID만 쓴다. 모든 요청에 출입증(`Authorization: Bearer …`)이 붙는다(`src/data/auth.ts` 공급자).
- 웹은 카카오·구글·애플 페이지에 갔다가 `/auth/callback`으로 돌아온다. 앱은 브라우저 창 → 앱 주소(`…/auth/callback`)로 돌아온다. 아이폰의 애플 로그인은 아이폰 기본 창.
- 서버가 출입증을 거절하면(401) 로그아웃하고 로그인 화면에 "로그인이 풀렸어요"를 보여 준다.
- 마이 탭: 로그아웃(이 기기의 출입증까지 지움), 회원 탈퇴(`DELETE /account` → 서버가 계정과 데이터 삭제).
- 주소의 `?user=`와 시연용 사용자는 쓰지 않는다.

Supabase 대시보드에서 할 것(실서버·연습 서버 둘 다)

- Authentication → Providers: Email 켜기 + **Confirm email 끄기**(아래 메일 이야기), 비밀번호 최소 8자. Kakao(REST API 키·Client Secret, "Allow users without an email" 켜기), Google(클라이언트 ID·보안 비밀번호), Apple(나중에)
- 메일: Supabase 기본 메일은 프로젝트 팀원 주소로만 간다. 일반 사용자에게 가입 확인·비밀번호 찾기 메일을 보내려면 Authentication → Emails에서 메일 발송(SMTP, 예: Resend·Brevo)을 붙인 뒤 Confirm email을 켠다. 그전에는 꺼 둔다(켜 두면 가입한 사람에게 메일이 안 가서 로그인을 못 함)
- Authentication → URL Configuration → Redirect URLs: `https://odit.expo.app/**`, `http://localhost:8081/**`, `exp://**`, `mobile://**`
- 카카오·구글 콘솔의 돌아올 주소: `https://<project-ref>.supabase.co/auth/v1/callback`

출시 전에 남은 것

- 각 회사 공식 로고·버튼 이미지 넣기(지금은 색 + 글자만, `src/components/SocialLogin.tsx`)
- 앱 주소 이름(`app.json`의 `scheme`, 지금 `mobile`)과 아이폰 앱 고유 ID 정하기 → 애플 로그인
- 서버 `DELETE /account` (없으면 탈퇴 버튼이 "탈퇴 기능은 곧 열려요"라고 알려 줌)
- 이용약관·개인정보 처리방침 링크와 가입할 때 동의 칸
- 비밀번호 찾기(메일 발송을 붙인 뒤)

## 웹 링크로 나눠 주기 (동료평가)

설치 없이 아이폰 사파리·노트북 브라우저에서 바로 열리는 주소를 만든다. Expo 무료 계정이 필요하다.

```bash
cd mobile
npx expo export --platform web      # dist/ 에 웹 파일을 만든다 (앱을 고칠 때마다 다시)
npx eas-cli@latest login            # 처음 한 번
npx eas-cli@latest deploy --prod    # 처음엔 프로젝트 만들기·주소 이름을 물어본다 → https://<이름>.expo.app
```

- 웹에서 처음 열면 튜토리얼(소개 3장) → 로그인(닉네임 + 숫자 4자리) → 추구미 고르기(스타일 카드 11개 중 1~3개) → 옷장 안내 순서로 나온다.
  같은 닉네임·숫자면 어느 기기에서든 같은 옷장이 열린다(`src/data/session.ts`). 서버는 user_id를 그대로 믿으므로 진짜 계정 보안은 아니다.
  소개 3장은 브라우저마다 한 번만 나온다(로그아웃하면 로그인 화면부터). 저장한 사진이나 옷장 옷이 이미 있는 계정으로 로그인하면 추구미 고르기를 건너뛰고 바로 홈으로 간다.
- 옷장·저장한 사진은 서버에 남아서 새로고침하거나 다른 기기로 들어와도 그대로다. 고른 추구미만 기기(브라우저)에 저장한다.
- 홈 피드는 추구미 → 이웃 스타일 → 나머지 순서로 보여 준다(`src/data/feedOrder.ts`, SPEC AC15).
- 주소 끝에 `?user=eunjae-demo`를 붙이면 로그인 없이 시연용 사용자로 들어간다(웹으로 시연할 때).
- 앱(시뮬레이터·Expo Go)은 로그인 없이 시연용 사용자 `eunjae-demo`로 바로 들어간다. 튜토리얼은 마이 탭에서 다시 볼 수 있다.
- `mobile/.env`에 `EXPO_PUBLIC_DEMO_USER_ID`를 넣은 채로 export하면 모든 사람이 그 사용자 하나를 같이 쓰게 되니 주의한다.
- `EXPO_PUBLIC_CHAT_HISTORY_ENABLED=true`만으로 인증이 생기지는 않는다. 로그인 모듈이 `registerAccessTokenProvider`로 갱신 가능한 Supabase access token을 제공하고 `loginWithAuthSession`으로 `Session.userId`를 JWT subject와 일치시킨 뒤 켠다. 토큰은 Expo 환경변수나 저장소에 넣지 않는다.
- 피드에는 허락받지 않은 쇼핑몰 사진이 있으니 링크는 수업 안에서만 공유한다.

## 검사

```bash
npm run typecheck
npm run lint
```

## 자주 생기는 일

- **버튼을 눌렀는데 Expo 개발자 메뉴(Reload · Go home …)가 뜬다:** 화면에 떠 있는 Expo 도구 버튼이 앱 버튼 위에 겹친 것이다.
  메뉴 맨 아래 **Tools button**을 끄거나, 도구 버튼을 길게 눌러 다른 구석으로 옮긴다. 메뉴는 폰을 흔들거나(시뮬레이터는 `Cmd + D`), 터미널에서 `m`으로 다시 연다.
- **피드가 비어 있다:** 서버에서 검수 후 공개(`published`)한 사진만 피드에 나온다.
- **첫 화면이 몇 초 걸린다:** 서버가 깨어나는 시간이다.
- **"Tried to register two views with the same name …" 오류가 쌓인다:** 오래 켜 둔 채 여러 번 다시 불러오다 꼬인 것이다.
  expo 터미널에서 `r`로 다시 불러오고, 그래도 뜨면 `npx expo start -c`로 새로 켠다.
