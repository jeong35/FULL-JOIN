import { ComingSoon } from '@/components/ComingSoon';
import { TabScreen } from '@/components/TabScreen';

export default function RecommendScreen() {
  return (
    <TabScreen title="추천">
      <ComingSoon description="오늘 날씨와 저장한 사진으로 입기 좋은 룩을 골라 드려요" />
    </TabScreen>
  );
}
