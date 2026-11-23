import { Platform } from 'react-native';

// design/DESIGN.md 2절(색)·3절(글꼴) 값. 화면에서 색·글꼴은 여기서만 가져다 쓴다.

export const colors = {
  background: '#F6F5FA',
  text: '#1F1C26',
  textSecondary: '#605C6B',
  // 11/22 '결 맞춘 보라': 바탕(아주 살짝 푸른 연회색)과 같은 쪽 보라로 맞춤(전: #6A3FC4·#8E6AD8·#D6CCF1·#2E1A5C·#4A2D99·#EBE5F7).
  textPurple: '#6450C0',
  purpleStrong: '#8C7DD8',
  purpleFill: '#D9D3F3',
  // 아주 옅은 보라: 누르지 않는 딱지·안내 상자 바탕(버튼과 헷갈리지 않게 테두리 없이).
  purpleTint: '#EEEBFA',
  // 고른 칩 테두리(11/22 '배경만 바꾼 안'): 고른 칩은 흰 바탕 + 이 테두리 + 보라 글자. 진한 연보라 바탕은 큰 버튼에만.
  purpleLine: '#B9AFEB',
  onPurpleFill: '#2B2263',
  tagText: '#4C3CA0',
  danger: '#B33A4A',
  line: '#E6E4ED',
  photoPlaceholder: '#ECE9F8',
  progressTrack: '#E4E1EC',
  white: '#FFFFFF',
} as const;

// design/DESIGN.md 5절 글라스 효과. 그림자는 CSS 원본 문자열을 boxShadow로 그대로 쓴다.
export const glass = {
  background: 'rgba(255,255,255,0.8)',
  border: '#EFEDF4',
  shadow: '0 1px 2px rgba(30,20,50,0.05), 0 6px 20px rgba(30,20,50,0.07)',
  selectedInnerShadow: '0 1px 4px rgba(30,20,50,0.13)',
  selectedCardShadow: '0 6px 20px rgba(30,20,50,0.12)',
  blurIntensity: 35,
} as const;

// React Native는 fontWeight만으로 굵기별 글꼴 파일을 고르지 못하므로 굵기마다 fontFamily를 따로 쓴다.
// 웹은 글꼴을 다 받기 전에 화면을 먼저 그리므로(_layout.tsx), 그동안 보일 기기 기본 글꼴을 뒤에 붙인다.
const WEB_FALLBACK = Platform.OS === 'web' ? ", -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif" : '';

export const fonts = {
  regular: `NotoSansKR_400Regular${WEB_FALLBACK}`,
  medium: `NotoSansKR_500Medium${WEB_FALLBACK}`,
  bold: `NotoSansKR_700Bold${WEB_FALLBACK}`,
  extraBold: `NotoSansKR_800ExtraBold${WEB_FALLBACK}`,
} as const;

export const layout = {
  screenPaddingX: 16,
  tabBarHeight: 76,
} as const;
