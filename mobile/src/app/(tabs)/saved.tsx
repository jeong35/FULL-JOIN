import { PhotoBoardScreen } from './index';

// 저장 탭(11/24 팀 결정 3·4번): 홈 위 '모든 저장'을 따로 탭으로 뺐다. 화면은 홈과 같은 PhotoBoardScreen을 쓴다.
export default function SavedScreen() {
  return <PhotoBoardScreen mode="모든 저장" />;
}
