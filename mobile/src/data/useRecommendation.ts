// 추천 탭·룩 자세히 화면이 같이 쓰는 훅: 고른 날짜의 날씨·약속과 저장한 사진·옷장으로 룩을 고른다.
import { useEffect, useMemo } from 'react';

import { plansOn, usePlans, type Plan } from './plans';
import { ensureHearts, recommend, type Recommendation } from './recommend';
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
  const wardrobe = useWardrobeState();
  const archive = useArchiveState();
  const hearts = useHearts();
  const plans = usePlans();
  const region = useRegion();
  const weather = useWeather(region);
  const day = weather.days.find((item) => item.date === date);
  const plan = plansOn(plans, date)[0];

  // 옷장과 저장 목록을 다 받은 뒤, 최근 저장 사진의 옷장 대조 결과가 없으면 받아 온다.
  useEffect(() => {
    if (wardrobe.status !== 'ready' || archive.status !== 'ready' || wardrobe.data.length === 0) return;
    void ensureHearts(archive.data, hearts);
  }, [wardrobe.status, wardrobe.data, archive.status, archive.data, hearts]);

  const result = useMemo(
    () => recommend({ archive: archive.data, hearts, wardrobe: wardrobe.data, day, plan, tasteStyles: session?.styles }),
    [archive.data, hearts, wardrobe.data, day, plan, session?.styles],
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
