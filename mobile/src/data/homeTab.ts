// 홈 하단 탭을 이미 보고 있는 상태에서 다시 눌렀을 때 홈 화면에 알려 준다.
// '피드'에서는 새로고침하고, '모든 저장'에서는 피드로 돌아가는 데 쓴다.
const listeners = new Set<() => void>();

export function emitHomeTabReselect() {
  for (const listener of listeners) listener();
}

export function onHomeTabReselect(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
