import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// 웹에서만 쓰는 HTML 틀. 홈 화면에 추가했을 때 이름(오딧)과 아이콘이 나오도록 머리 정보를 넣는다.
// 나머지는 expo-router 기본 틀(@expo/router-server/build/static/html.js)과 같다.
// 아이콘·manifest 파일은 mobile/public/에 있다.
export default function Root({ children }: PropsWithChildren) {
  const { bodyAttributes, bodyNodes, htmlAttributes, headNodes } = useServerDocumentContext();
  return (
    <html lang="ko" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>오딧</title>
        <meta name="application-name" content="오딧" />
        <meta name="apple-mobile-web-app-title" content="오딧" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#F4EFFC" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <ScrollViewStyleReset />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
