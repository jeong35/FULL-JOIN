import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

// design/DESIGN.md 6절 아이콘 SVG를 그대로 옮김. 24×24, 선 1.8.
export type TabIconName = 'home' | 'recommend' | 'chat' | 'closet' | 'my';

type Props = {
  name: TabIconName;
  color: ColorValue;
  size?: number;
};

export function TabIcon({ name, color, size = 24 }: Props) {
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
      {renderPaths(name)}
    </Svg>
  );
}

function renderPaths(name: TabIconName) {
  switch (name) {
    case 'home':
      return (
        <>
          <Path d="M3 10.5L12 3l9 7.5" />
          <Path d="M5 9.5V21h14V9.5" />
        </>
      );
    case 'recommend':
      return <Path d="M12 3l2.4 5.6L20 9.3l-4.3 3.9 1.2 5.8L12 16.1 7.1 19l1.2-5.8L4 9.3l5.6-.7z" />;
    case 'chat':
      return <Path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />;
    case 'closet':
      return (
        <>
          <Path d="M12 6.5a2 2 0 1 1 2 2c-1 .4-2 1-2 2v1" />
          <Path d="M12 11.5L3.5 17.6c-.7.5-.3 1.4.5 1.4h16c.8 0 1.2-.9.5-1.4L12 11.5z" />
        </>
      );
    case 'my':
      return (
        <>
          <Circle cx="12" cy="8" r="4" />
          <Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </>
      );
  }
}
