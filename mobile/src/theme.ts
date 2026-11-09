// design/DESIGN.md 2절(색)·3절(글꼴) 값. 화면에서 색·글꼴은 여기서만 가져다 쓴다.

export const colors = {
  background: '#F4EFFC',
  text: '#241B33',
  textSecondary: '#645A73',
  textPurple: '#6A3FC4',
  purpleStrong: '#9B7BE0',
  purpleFill: '#CDB8F4',
  onPurpleFill: '#2E1A5C',
  tagText: '#4A2D99',
  line: '#E7DFF5',
  photoPlaceholder: '#EDE6F8',
  progressTrack: '#E3D9F3',
  white: '#FFFFFF',
} as const;

// design/DESIGN.md 5절 글라스 효과. 그림자는 CSS 원본 문자열을 boxShadow로 그대로 쓴다.
export const glass = {
  background: 'rgba(255,255,255,0.55)',
  border: 'rgba(255,255,255,0.9)',
  shadow: '0 1px 2px rgba(46,26,92,0.05), 0 6px 20px rgba(46,26,92,0.07)',
  selectedInnerShadow: '0 1px 4px rgba(46,26,92,0.14)',
  selectedCardShadow: '0 6px 20px rgba(46,26,92,0.12)',
  blurIntensity: 35,
} as const;

// React Native는 fontWeight만으로 굵기별 글꼴 파일을 고르지 못하므로 굵기마다 fontFamily를 따로 쓴다.
export const fonts = {
  regular: 'NotoSansKR_400Regular',
  medium: 'NotoSansKR_500Medium',
  bold: 'NotoSansKR_700Bold',
  extraBold: 'NotoSansKR_800ExtraBold',
} as const;

export const layout = {
  screenPaddingX: 16,
  tabBarHeight: 76,
} as const;
