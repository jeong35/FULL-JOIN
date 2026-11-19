import { Platform } from 'react-native';

// design/DESIGN.md 2절(색)·3절(글꼴) 값. 화면에서 색·글꼴은 여기서만 가져다 쓴다.

export const colors = {
  background: '#F6F5FA',
  text: '#1F1C26',
  textSecondary: '#605C6B',
  textPurple: '#6A3FC4',
  purpleStrong: '#8E6AD8',
  purpleFill: '#D6CCF1',
  onPurpleFill: '#2E1A5C',
  tagText: '#4A2D99',
  danger: '#B33A4A',
  line: '#E6E4ED',
  photoPlaceholder: '#EBE5F7',
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
