import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';

// design/DESIGN.md 6절 아이콘. 크기·선 굵기는 각 시안 HTML 기준.

type IconProps = { color: ColorValue; size?: number };

// 뒤로: 18×18, 선 2.2.
export function BackIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round">
      <Path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

// 검색: 홈 피드 22×22, 선 1.8.
export function SearchIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round">
      <Circle cx="11" cy="11" r="7" />
      <Path d="M20 20l-3.5-3.5" />
    </Svg>
  );
}

// 저장(북마크): 저장됨이면 #6A3FC4로 채움.
export function BookmarkIcon({ color, size = 16, filled }: IconProps & { filled: boolean }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? colors.textPurple : 'none'}
      stroke={filled ? colors.textPurple : color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round">
      <Path d="M6 3h12v18l-6-4.5L6 21z" />
    </Svg>
  );
}

// 체크 표시: 채움 네모(모서리 8) + 선 2.4. 기본은 연보라 채움, 색 칩 위에서는 흰 채움.
export function CheckMark({ size = 24, fill = colors.purpleFill }: { size?: number; fill?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 26 26">
      <Rect width={26} height={26} rx={8} fill={fill} />
      <Path
        d="M8 13.5l3.3 3.2L18 10"
        fill="none"
        stroke={colors.onPurpleFill}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
