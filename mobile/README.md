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
