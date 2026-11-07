import { ComingSoon } from '@/components/ComingSoon';
import { TabScreen } from '@/components/TabScreen';

export default function ChatScreen() {
  return (
    <TabScreen title="챗봇">
      <ComingSoon description="가진 옷과 저장한 룩을 보고 코디를 같이 고민해요" />
    </TabScreen>
  );
}
