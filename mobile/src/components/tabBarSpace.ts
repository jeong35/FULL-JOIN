// 떠 있는 유리 탭바(11/26) 자리 계산. 탭바가 화면 위에 떠 있어서(뒤로 내용이 지나감) 탭 화면마다 맨 아래 여백을 이걸로 맞춘다.
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 11/27: 토스 탭바 실측(아이폰 393×852pt 화면)에 맞춤 — 높이 62, 바닥에서 21, 양옆 21, 선택 알약은 안쪽 4.
export const TAB_BAR_HEIGHT = 62;
export const TAB_BAR_SIDE = 21;
// 탭바와 화면 아래 끝, 탭바와 챗봇 버튼 사이 간격.
export const TAB_BAR_GAP = 12;
export const CHAT_BUTTON_SIZE = 56;

// 탭바 아래 끝이 화면 아래에서 떨어진 거리.
// 11/27: 12는 아이폰 홈 막대 위에 붙어 보여서, 토스처럼 바닥에서 21 띄운다.
// 홈 막대 자리(앱에서 34)가 잡혀도 토스처럼 막대와 살짝 겹쳐 21(34 - 13). 안드로이드 버튼 막대처럼 더 높으면 그 위로.
export const TAB_BAR_LIFT = 21;
export function useTabBarBottom(): number {
  return Math.max(useSafeAreaInsets().bottom - 13, TAB_BAR_LIFT);
}

// 탭 화면 스크롤 맨 아래 여백: 마지막 내용이 탭바와 그 위 챗봇 버튼에 가리지 않게.
export function useTabScrollBottom(): number {
  return useTabBarBottom() + TAB_BAR_HEIGHT + TAB_BAR_GAP + CHAT_BUTTON_SIZE + 16;
}
