import { ComingSoon } from '@/components/ComingSoon';
import { TabScreen } from '@/components/TabScreen';

export default function MyScreen() {
  return (
    <TabScreen title="마이">
      <ComingSoon description="내 스타일과 저장 기록을 모아 볼 수 있어요" />
    </TabScreen>
  );
}
