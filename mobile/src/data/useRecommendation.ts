// 추천(코디) 탭·룩 자세히 화면이 같이 쓰는 훅: 고른 날짜의 날씨와 저장한 사진·옷장으로 룩을 고른다.
import { useEffect, useMemo } from 'react';

import type { Plan } from './plans';
import { ensureHearts, recommend, type Recommendation } from './recommend';
import { useRecommendationChoices } from './recommendChoices';
import { useSession } from './session';
import { useArchiveState, useHearts, useWardrobeState, type LoadStatus } from './store';
import type { WardrobeItem } from './types';
import { useRegion, useWeather, type DayWeather, type Region, type WeatherState } from './weather';

export type RecommendationView = Recommendation & {
  day: DayWeather | undefined;
  plan: Plan | undefined;
  region: Region;
  weather: WeatherState;
  wardrobe: readonly WardrobeItem[];
  wardrobeStatus: LoadStatus;
  archiveStatus: LoadStatus;
  archiveCount: number;
};

export function useRecommendation(date: string): RecommendationView {
  const session = useSession();
  const choices = useRecommendationChoices(session?.userId ?? 'guest');
  const wardrobe = useWardrobeState();
  const archive = useArchiveState();
  const hearts = useHearts();
  const region = useRegion();
  const weather = useWeather(region);
  const day = weather.days.find((item) => item.date === date);
  // 11/24 팀 결정 6번: 약속·여행 기능을 빼서 약속 무드는 쓰지 않는다(약속 데이터·화면 파일은 남겨 둠).
  const plan: Plan | undefined = undefined;

  // 옷장과 저장 목록을 다 받은 뒤, 최근 저장 사진의 옷장 대조 결과가 없으면 받아 온다.
  useEffect(() => {
    if (wardrobe.status !== 'ready' || archive.status !== 'ready' || wardrobe.data.length === 0) return;
    void ensureHearts(archive.data, hearts);
  }, [wardrobe.status, wardrobe.data, archive.status, archive.data, hearts]);

  const result = useMemo(
    () => recommend({ archive: archive.data, hearts, wardrobe: wardrobe.data, day, plan, tasteStyles: session?.styles, choices, date }),
    [archive.data, hearts, wardrobe.data, day, plan, session?.styles, choices, date],
  );

  return {
    ...result,
    day,
    plan,
    region,
    weather,
    wardrobe: wardrobe.data,
    wardrobeStatus: wardrobe.status,
    archiveStatus: archive.status,
    archiveCount: archive.data.length,
  };
}
