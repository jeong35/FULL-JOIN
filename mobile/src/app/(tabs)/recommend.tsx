// 코디 탭(전 추천 탭, 11/24 멘토 피드백 후 팀 결정으로 정리).
// 위에 붙은 날짜 줄 + 날씨(누르면 시간별, 스크롤을 내리면 한 줄로 접힘) →
// 오늘의 룩(저장한 사진으로 다 갖춰지는 룩, 없으면 옷장 옷만으로 기온에 맞게) → 내 옷으로 조합 만들기 → 하나만 더하면 완성.
// 약속·여행은 뺐다(파일은 남겨 둠).
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image as PlainImage, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View, type GestureResponderEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ArtPager, ViewToggle } from '@/components/ArtPager';
import { GlassView } from '@/components/GlassView';
import { LookChosenSheet } from '@/components/LookChosenSheet';
import { MatchBadge, MatchLegend, WeatherIcon } from '@/components/LookParts';
import { TabIcon } from '@/components/TabIcon';
import { useTabScrollBottom } from '@/components/tabBarSpace';
import { TabScreen } from '@/components/TabScreen';
import { ItemIcon } from '@/components/WardrobeIcon';
import { kindLabel, SLOTS, type Slot } from '@/data/catalog';
import { dayOfMonth, longDateLabel, nextDays, nowLabel, todayKey, weekday } from '@/data/dates';
import { track } from '@/data/events';
import type { Plan } from '@/data/plans';
import { buildCombos, harmony, type Combo } from '@/data/combos';
import { saveRecommendationChoice, useRecommendationChoices } from '@/data/recommendChoices';
import { lookTips, matchOf, MAX_LOOKS, sortPieces, type Look } from '@/data/recommend';
import { useSession } from '@/data/session';
import { loadArchive, loadFeed, loadWardrobe, useFeedState } from '@/data/store';
import type { StyleImage, WardrobeItem } from '@/data/types';
import { useRecommendation } from '@/data/useRecommendation';
import { setClosetView, useClosetView, useWardrobePhotos, type ClosetView, type WardrobePhoto } from '@/data/wardrobePhotos';
import { SIDO_LIST, type Sido } from '@/data/regions';
import {
  canLocate,
  choicesOf,
  METRO_SIDO,
  hasPickedRegion,
  loadWeather,
  locateCurrentRegion,
  regionFor,
  setRegion,
  sidoOfRegion,
  fitsTemp,
  tempDistance,
  tempGap,
  weatherTip,
  type DayWeather,
  type Region,
  type RegionChoice,
} from '@/data/weather';
import { colors, fonts, glass, layout } from '@/theme';

const DAYS = 7;
// 이만큼만 내려도(손가락으로 밀거나 화면이 움직이면) 날씨를 한 줄로 접는다.
// 11/26: 내용이 짧아 화면이 안 움직일 때(오늘의 룩 준비 전 등)도 미는 동작만으로 접히게 했다.
const SCROLL_SLOP = 10;

export default function RecommendScreen() {
  const today = todayKey();
  const days = nextDays(today, DAYS);
  const scrollBottom = useTabScrollBottom();
  const [selected, setSelected] = useState(today);
  const [hourlyOpen, setHourlyOpen] = useState(false);
  const [lookIndex, setLookIndex] = useState(0);
  const [regionOpen, setRegionOpen] = useState(false);
  const userId = useSession()?.userId ?? 'guest';
  // 날짜별로 고른 룩은 계정마다 이 기기에 남긴다(친구분 recommendChoices.ts) — 다시 들어와도 '입기로 했어요'가 그대로.
  const choices = useRecommendationChoices(userId);
  // '이 룩으로 입을래요'를 누르면 아래에서 '결정!' 창이 올라온다(11/25, LookChosenSheet). 값 = 고른 룩.
  const [chosenSheet, setChosenSheet] = useState<string | null>(null);
  // 코디 알림을 눌러 들어오면 주소에 ?notification=1이 붙는다 — 한 번 기록하고, 그 뒤 고르면 '알림 뒤 다시 고름'으로 남긴다.
  const { notification } = useLocalSearchParams<{ notification?: string }>();
  const fromNotification = notification === '1';
  useEffect(() => {
    if (fromNotification) track('notification_open', { source: 'push' });
  }, [fromNotification]);
  // 11/24 팀 결정 5번: 날씨는 위에 붙여 두고, 스크롤을 내리면 한 줄로 작아진다(11/26: 조금만 밀어도).
  // 다시 맨 위로 올라와도 작은 채로 두고, 한 줄을 누르면 다시 커진다.
  const [weatherSmall, setWeatherSmall] = useState(false);
  const lastY = useRef(0);
  const scrollRef = useRef<ScrollViewInstance>(null);
  // 조합 만들기에서 누른 옷(11/25): 그 옷이 들어간 조합으로 오늘의 룩을 다시 만든다. ×로 풀면 원래대로.
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const expandedAt = useRef(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [locating, setLocating] = useState(false);
  // 지역 고르기에서 지금 보고 있는 단계: null = 도·시 고르기, sido만 = 시·군(또는 구·군) 고르기, group까지 = 구 고르기.
  const [regionPath, setRegionPath] = useState<{ sido: Sido; group: RegionChoice | null } | null>(null);
  const [locateFailed, setLocateFailed] = useState(false);
  const view = useRecommendation(selected);
  const { region, weather, day } = view;

  useFocusEffect(useCallback(() => {
    void loadWardrobe();
    void loadArchive();
    void loadFeed();
  }, []));
  useFocusEffect(useCallback(() => {
    void loadWeather(region);
  }, [region]));

  // 11/24 팀 결정 10번: 처음 열면 현재 위치로 날씨를 맞춘다. 못 받으면 목록 첫 지역 그대로, 지역 버튼으로 직접 고른다.
  useEffect(() => {
    if (hasPickedRegion()) return;
    void locate();
  }, []);

  async function locate() {
    setLocating(true);
    const ok = await locateCurrentRegion();
    setLocating(false);
    setLocateFailed(!ok);
  }

  function closeRegion() {
    setRegionOpen(false);
    setRegionPath(null);
  }

  function pickRegion(next: Region) {
    setRegion(next);
    setLocateFailed(false);
    closeRegion();
  }

  const pick = (date: string) => {
    setSelected(date);
    setLookIndex(0);
    setAnchorId(null);
  };
  const look = view.looks.length > 0 ? view.looks[lookIndex % view.looks.length] : undefined;
  // 11/24 팀 결정 8번: 저장한 사진으로 다 갖춰지는 룩이 없으면 옷장 옷만으로 고른다 —
  // 고른 날 기온에 맞는 옷만 추려서(기온별 옷차림 표) 상의+하의(또는 원피스), 쌀쌀하면 겉옷까지.
  const closetLooks = useMemo(
    () => (view.looks.length > 0 || view.pending > 0 || view.wardrobeStatus !== 'ready' || view.archiveStatus !== 'ready'
      ? []
      : buildCombos({ wardrobe: view.wardrobe, day, max: MAX_LOOKS })),
    [view.looks.length, view.pending, view.wardrobeStatus, view.archiveStatus, view.wardrobe, day],
  );
  const anchor = anchorId === null ? undefined : view.wardrobe.find((item) => item.id === anchorId);
  const anchorLooks = useMemo(() => {
    if (anchor === undefined) return [];
    const fitting = buildCombos({ wardrobe: view.wardrobe, day, anchor, max: MAX_LOOKS });
    const combos = fitting.length > 0 ? fitting : buildCombos({ wardrobe: view.wardrobe, anchor, max: MAX_LOOKS });
    // 고른 옷을 큰 칸(첫 칸)에 보여 준다.
    return combos.map((combo) => ({ ...combo, items: [anchor, ...combo.items.filter((item) => item.id !== anchor.id)] }));
  }, [anchor, view.wardrobe, day]);
  // 조합 만들기(/combo)나 오늘의 룩에서 '입을래요'로 고른 옷장 조합(11/25): 그날 오늘의 룩 맨 앞에 둔다.
  // 룩 id가 옷 id를 + 로 이은 것이라 옷장에서 다시 찾는다(옷이 지워졌으면 없던 걸로).
  const chosenLookId = choices[selected]?.lookId;
  const chosenCombo = useMemo((): Combo | undefined => {
    if (chosenLookId === undefined) return undefined;
    const items = chosenLookId.split('+').map((id) => view.wardrobe.find((item) => item.id === id));
    if (items.length === 0 || items.some((item) => item === undefined)) return undefined;
    const list = items as WardrobeItem[];
    const result = harmony(list);
    const tags = [...(result?.tags ?? [])];
    if (day !== undefined && list.every((item) => fitsTemp(item, day))) tags.push('기온 맞춤');
    return { id: chosenLookId, items: list, tags, score: result?.score ?? 0 };
  }, [chosenLookId, view.wardrobe, day]);
  // 옷장 조합을 새로 고르면(여기서든 조합 만들기에서든) 고른 옷 보기를 풀고 그 조합(맨 앞)을 보여 준다.
  const [seenChoice, setSeenChoice] = useState(chosenLookId);
  if (seenChoice !== chosenLookId) {
    setSeenChoice(chosenLookId);
    if (chosenCombo !== undefined) {
      setAnchorId(null);
      setLookIndex(0);
    }
  }
  // 11/25 팀 결정(오늘의 룩은 어떻게든 보여 준다): 기온에 딱 맞는 조합이 없으면 기온에서 가장 덜 벗어난 조합을 고르고 안내를 붙인다.
  const nearLooks = useMemo(() => {
    if (closetLooks.length > 0 || day === undefined || view.looks.length > 0 || view.pending > 0) return [];
    if (view.wardrobeStatus !== 'ready' || view.archiveStatus !== 'ready') return [];
    const off = (combo: Combo) => combo.items.reduce((sum, item) => sum + tempDistance(item, day), 0);
    return buildCombos({ wardrobe: view.wardrobe, max: MAX_LOOKS * 4 })
      .sort((a, b) => off(a) - off(b))
      .slice(0, MAX_LOOKS);
  }, [closetLooks.length, view.looks.length, view.pending, view.wardrobeStatus, view.archiveStatus, view.wardrobe, day]);

  function collapseWeather() {
    if (weatherSmall) return;
    setWeatherSmall(true);
    setHourlyOpen(false);
  }
  // 화면이 실제로 내려간 경우.
  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    lastY.current = event.nativeEvent.contentOffset.y;
    if (lastY.current > expandedAt.current + SCROLL_SLOP) collapseWeather();
  }
  // 화면이 안 움직여도 아래로 보려고 밀면(손가락을 위로) 접는다. 옆으로 넘기는 줄(조합 만들기·사진 넘기기)은 빼고.
  // 웹은 nativeEvent가 브라우저 터치 이벤트라 위치가 touches[0]에 있다(앱은 둘 다 있음).
  function touchPoint(event: GestureResponderEvent) {
    const point = event.nativeEvent.touches?.[0] ?? event.nativeEvent;
    return { x: point.pageX, y: point.pageY };
  }
  function onTouchStart(event: GestureResponderEvent) {
    touchStart.current = touchPoint(event);
  }
  function onTouchMove(event: GestureResponderEvent) {
    const start = touchStart.current;
    if (start === null) return;
    const now = touchPoint(event);
    const up = start.y - now.y;
    const side = Math.abs(now.x - start.x);
    if (up > SCROLL_SLOP && up > side) collapseWeather();
  }
  // 웹(컴퓨터)에서 마우스 휠·트랙패드로 내릴 때.
  const wheelProps: object = Platform.OS === 'web'
    ? { onWheel: (event: { deltaY: number }) => { if (event.deltaY > 0) collapseWeather(); } }
    : {};

  // 오늘의 룩에 보일 것: 고른 옷이 있으면 그 옷 조합 → '입을래요'로 정한 옷장 조합이 있으면 그것부터 → 원래 순서.
  const defaultClosetLooks = closetLooks.length > 0 ? closetLooks : nearLooks;
  const shownLook = anchor !== undefined || chosenCombo !== undefined ? undefined : look;
  const shownClosetLooks = anchor !== undefined
    ? anchorLooks
    : chosenCombo !== undefined
      ? [chosenCombo, ...defaultClosetLooks.filter((combo) => combo.id !== chosenCombo.id)]
      : defaultClosetLooks;

  return (
    <TabScreen
      title="코디"
      headerRight={
        <Pressable onPress={() => setRegionOpen(true)} accessibilityRole="button" accessibilityLabel={`위치 바꾸기, 지금 ${region.name}`}>
          <GlassView radius={9} style={styles.regionButton}>
            <PinIcon />
            <Text style={styles.regionText}>{locating ? '위치 찾는 중' : region.name}</Text>
            <ChevronDown />
          </GlassView>
        </Pressable>
      }>
      {weatherSmall ? (
        <CompactWeather
          date={selected}
          isToday={selected === today}
          day={day}
          status={weather.status}
          onPress={() => {
            expandedAt.current = lastY.current;
            setWeatherSmall(false);
          }}
        />
      ) : (
        <View style={styles.top}>
          <View style={styles.dateRow} accessibilityRole="tablist" accessibilityLabel="날짜 고르기">
            {days.map((date, index) => {
              const isSelected = date === selected;
              const dayWeather = weather.days.find((item) => item.date === date);
              const bottom = weatherWord(dayWeather);
              const accent = bottom === '비' || bottom === '눈';
              return (
                <Pressable
                  key={date}
                  onPress={() => pick(date)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isSelected }}
                  style={[styles.dateCell, isSelected && styles.dateCellSelected]}>
                  <Text style={[styles.dateLabel, isSelected && styles.dateLabelSelected]}>{index === 0 ? '오늘' : weekday(date)}</Text>
                  <Text style={[styles.dateNum, isSelected && styles.dateNumSelected]}>{dayOfMonth(date)}</Text>
                  <Text style={[styles.dateBottom, accent && styles.dateBottomAccent]} numberOfLines={1}>{bottom}</Text>
                </Pressable>
              );
            })}
          </View>
          {locateFailed && (
            <Text style={styles.locateNote}>위치를 받지 못해 {region.name} 날씨를 보여 드려요. 오른쪽 위 지역 버튼으로 고를 수 있어요</Text>
          )}
          <WeatherCard
            date={selected}
            isToday={selected === today}
            status={weather.status}
            source={weather.source}
            day={day}
            plan={undefined}
            hourlyOpen={hourlyOpen}
            onToggle={() => setHourlyOpen((open) => !open)}
            onRetry={() => void loadWeather(region, { force: true })}
          />
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottom }]}
        onScroll={onScroll}
        scrollEventThrottle={32}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={() => { touchStart.current = null; }}
        {...wheelProps}>
        <View style={styles.main}>
          <LookSection
            title={selected === today ? '오늘의 룩' : `${weekday(selected)}요일 룩`}
            view={view}
            look={shownLook}
            closetLooks={shownClosetLooks}
            near={anchor === undefined && chosenCombo === undefined && closetLooks.length === 0 && nearLooks.length > 0}
            anchor={anchor}
            onClearAnchor={() => {
              setAnchorId(null);
              setLookIndex(0);
            }}
            index={lookIndex}
            date={selected}
            chosenId={choices[selected]?.lookId}
            onChoose={(id) => {
              saveRecommendationChoice(userId, { date: selected, lookId: id, chosenAt: new Date().toISOString(), notificationScheduled: false });
              track('recommendation_choice', { date: selected, recommendation_type: shownLook !== undefined ? 'saved_photo' : 'closet' });
              if (fromNotification) track('notification_recommendation_reselect', { date: selected });
              setChosenSheet(id);
            }}
            onNext={() => setLookIndex((i) => i + 1)}
          />

          {/* 11/24 팀 결정 7번: '오늘 기온에 맞는 내 옷'은 빼고, 내 옷으로 조합 만들기를 오늘의 룩 바로 아래로 올렸다. */}
          {view.wardrobe.length > 0 && (
            <ComboMaker
              wardrobe={view.wardrobe}
              day={day}
              anchorId={anchor?.id ?? null}
              onPick={(id) => {
                setAnchorId((current) => (current === id ? null : id));
                setLookIndex(0);
                scrollRef.current?.scrollTo({ y: 0, animated: true });
              }}
            />
          )}

          {/* 11/26: '하나만 더하면 완성'은 코디 탭에서 뺐다(같은 내용은 비교 결과 화면에 있음). */}
        </View>
      </ScrollView>

      {/* 11/24: 지역 고르기 — 현재 위치, 또는 시·도를 먼저 고르고 그 안에서 시·군·구를 고른다. */}
      <Modal visible={regionOpen} transparent animationType="fade" onRequestClose={closeRegion}>
        <Pressable style={styles.sheetBackdrop} onPress={closeRegion} accessibilityLabel="닫기">
          <Pressable style={styles.sheet} onPress={() => {}} accessible={false}>
            {regionPath === null ? (
              <>
                <Text style={styles.sheetTitle}>날씨를 볼 지역</Text>
                <Pressable
                  onPress={() => {
                    closeRegion();
                    void locate();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: region.current === true }}
                  style={[styles.sheetRow, styles.sheetRowLocate]}>
                  <PinIcon />
                  <View style={styles.flex}>
                    <Text style={[styles.sheetRowText, region.current === true && styles.sheetRowTextCurrent]}>현재 위치로 보기</Text>
                    {!canLocate() && <Text style={styles.sub}>이 기기에서는 아직 위치를 받을 수 없어요</Text>}
                  </View>
                </Pressable>
                <Text style={styles.sheetLabel}>도·시를 골라 주세요</Text>
                <View style={styles.sidoGrid}>
                  {SIDO_LIST.map((sido) => {
                    const on = sidoOfRegion(region) === sido.name;
                    return (
                      <Pressable
                        key={sido.name}
                        onPress={() => (sido.list.length === 1 ? pickRegion(regionFor(sido, sido.list[0])) : setRegionPath({ sido, group: null }))}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={[styles.sidoChip, on && styles.sidoChipOn]}>
                        <Text style={[styles.sidoChipText, on && styles.sidoChipTextOn]}>{sido.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                <View style={styles.sheetHead}>
                  <Pressable
                    onPress={() => setRegionPath(regionPath.group === null ? null : { sido: regionPath.sido, group: null })}
                    accessibilityRole="button"
                    accessibilityLabel="한 단계 돌아가기"
                    hitSlop={10}
                    style={styles.sheetBack}>
                    <ChevronLeft />
                  </Pressable>
                  <Text style={styles.sheetHeadTitle}>
                    {regionPath.sido.name}
                    {regionPath.group !== null && <Text style={styles.sheetHeadPath}>{`  ›  ${regionPath.group.name}`}</Text>}
                  </Text>
                </View>
                <Text style={styles.sheetLabel}>
                  {regionPath.group !== null ? '구를 골라 주세요' : METRO_SIDO.has(regionPath.sido.name) ? '구·군을 골라 주세요' : '시·군을 골라 주세요'}
                </Text>
                <ScrollView style={styles.sheetList} contentContainerStyle={styles.choiceGrid}>
                  {(regionPath.group?.children ?? choicesOf(regionPath.sido)).map((choice) => {
                    const on = choice.region !== undefined
                      ? choice.region.name === region.name
                      : (choice.children ?? []).some((child) => child.region?.name === region.name);
                    return (
                      <Pressable
                        key={choice.name}
                        onPress={() => {
                          if (choice.region !== undefined) pickRegion(choice.region);
                          else setRegionPath({ sido: regionPath.sido, group: choice });
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={[styles.choiceChip, on && styles.sidoChipOn]}>
                        <Text style={[styles.sidoChipText, on && styles.sidoChipTextOn]} numberOfLines={1}>{choice.name}</Text>
                        {choice.children !== undefined && <Text style={styles.choiceMore}>›</Text>}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <LookChosenSheet visible={chosenSheet !== null} date={selected} lookId={chosenSheet} onClose={() => setChosenSheet(null)} />
    </TabScreen>
  );
}

function weatherWord(day: DayWeather | undefined): string {
  if (day === undefined) return '';
  if (day.sky === '비' || day.sky === '소나기' || day.sky === '비/눈' || day.pop >= 60) return '비';
  if (day.sky === '눈') return '눈';
  return `${day.max}°`;
}

// 접힌 날씨 한 줄. 누르면 날짜 줄과 큰 날씨가 다시 나온다.
function CompactWeather({ date, isToday, day, status, onPress }: {
  date: string;
  isToday: boolean;
  day: DayWeather | undefined;
  status: 'idle' | 'loading' | 'ready' | 'error';
  onPress: () => void;
}) {
  const label = isToday ? '오늘' : `${weekday(date)} ${dayOfMonth(date)}일`;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="날씨 크게 보기" style={styles.compactWrap}>
      <GlassView radius={12} style={styles.compact}>
        {day !== undefined ? (
          <>
            <WeatherIcon sky={day.sky} size={30} />
            <Text style={styles.compactTemp}>{isToday ? currentTemp(day) : day.max}°</Text>
            <Text style={[styles.compactText, styles.flex]} numberOfLines={1}>{label} · {day.sky} · 아침 {day.min}° 낮 {day.max}°</Text>
          </>
        ) : (
          <Text style={[styles.compactText, styles.flex]} numberOfLines={1}>
            {label} · {status === 'error' ? '날씨를 불러오지 못했어요' : status === 'ready' ? '예보가 아직 없어요' : '날씨를 불러오는 중이에요'}
          </Text>
        )}
        <ChevronDown color={colors.textPurple} />
      </GlassView>
    </Pressable>
  );
}

function WeatherCard({ date, isToday, status, source, day, plan, hourlyOpen, onToggle, onRetry }: {
  date: string;
  isToday: boolean;
  status: 'idle' | 'loading' | 'ready' | 'error';
  source: string | undefined;
  day: DayWeather | undefined;
  plan: Plan | undefined;
  hourlyOpen: boolean;
  onToggle: () => void;
  onRetry: () => void;
}) {
  const heading = `${longDateLabel(date)} · ${isToday ? nowLabel() : plan !== undefined ? `${plan.title} 날` : '하루 날씨'}`;
  if (day === undefined) {
    const loading = status === 'loading' || status === 'idle';
    // 받아 왔는데 이 날만 없으면(중기예보가 아직 안 나온 먼 날) 다시 불러와도 같다.
    if (status === 'ready') {
      return (
        <GlassView radius={16} style={styles.weather}>
          <Text style={styles.weatherHeading}>{heading}</Text>
          <Text style={styles.weatherEmpty}>이 날 예보는 아직 나오지 않았어요</Text>
          <Text style={styles.sub}>날씨 없이 저장한 사진과 옷장으로만 골랐어요</Text>
        </GlassView>
      );
    }
    return (
      <GlassView radius={16} style={styles.weather}>
        <Text style={styles.weatherHeading}>{heading}</Text>
        <Text style={styles.weatherEmpty}>{loading ? '날씨를 불러오는 중이에요' : '날씨를 불러오지 못했어요'}</Text>
        {!loading && (
          <>
            <Text style={styles.sub}>날씨 없이 저장한 사진과 옷장으로만 골랐어요</Text>
            <Pressable onPress={onRetry} accessibilityRole="button" style={styles.retry}>
              <Text style={styles.retryText}>다시 불러오기</Text>
            </Pressable>
          </>
        )}
      </GlassView>
    );
  }
  const now = isToday ? currentTemp(day) : day.max;
  const tip = weatherTip(day);
  const canOpen = day.hourly.length > 0;
  return (
    <GlassView radius={16} style={styles.weather}>
      <Text style={styles.weatherHeading}>{heading}</Text>
      <Pressable
        onPress={canOpen ? onToggle : undefined}
        accessibilityRole="button"
        accessibilityState={{ expanded: hourlyOpen }}
        accessibilityLabel="시간별 날씨 보기"
        style={styles.weatherRow}>
        <WeatherIcon sky={day.sky} />
        <Text style={styles.weatherTemp}>{now}°</Text>
        <View style={styles.flex}>
          <Text style={styles.weatherSky}>{day.sky}</Text>
          <Text style={styles.weatherMeta}>
            {day.feels_like !== undefined ? `체감 ${day.feels_like}° · ` : ''}아침 {day.min}° 낮 {day.max}°
          </Text>
        </View>
        {canOpen && (
          <View style={styles.hourlyToggle}>
            <Text style={styles.hourlyToggleText}>시간별</Text>
            <View style={hourlyOpen ? styles.flip : undefined}><ChevronDown color={colors.textPurple} /></View>
          </View>
        )}
      </Pressable>
      {hourlyOpen && canOpen && (
        <View style={styles.hourly}>
          {day.hourly.slice(0, 7).map((hour, index) => (
            <View key={hour.time} style={[styles.hourCell, index === 0 && isToday && styles.hourCellNow]}>
              <Text style={[styles.hourLabel, index === 0 && isToday && styles.hourLabelNow]}>{index === 0 && isToday ? '지금' : `${Number(hour.time.slice(0, 2))}시`}</Text>
              <Text style={styles.hourTemp}>{hour.temp}°</Text>
            </View>
          ))}
        </View>
      )}
      <View style={styles.tip}>
        <TempIcon />
        <Text style={styles.tipText}>
          <Text style={styles.tipTitle}>오늘의 날씨 · {tip.title}{'\n'}</Text>
          {tip.body}
        </Text>
      </View>
      {source !== undefined && <Text style={styles.source}>날씨 정보: {source}</Text>}
    </GlassView>
  );
}

function currentTemp(day: DayWeather): number {
  const hour = new Date().getHours();
  // 첫 예보 시각보다 이르면(새벽) 아침 최저로 본다.
  const match = [...day.hourly].reverse().find((item) => Number(item.time.slice(0, 2)) <= hour);
  return match?.temp ?? day.min;
}

// 오늘의 룩을 고르는 순서(11/25 팀 결정 — 오늘의 룩은 어떻게든 보여 준다):
// ① 저장한 사진 룩 중 내 옷으로 다 되는 것(비슷한 옷·대신 입기 포함) → ② 옷장 옷만으로 기온에 맞는 조합
// → ③ 기온에서 가장 덜 벗어난 조합 + 안내 → ④ 옷장에 상의·하의(원피스)가 없으면 오늘 기온에 맞는 추구미 피드 사진.
function LookSection({ title, view, look, closetLooks, near, anchor, onClearAnchor, index, date, chosenId, onChoose, onNext }: {
  title: string;
  view: ReturnType<typeof useRecommendation>;
  look: Look | undefined;
  closetLooks: readonly Combo[];
  near: boolean;
  anchor: WardrobeItem | undefined;
  onClearAnchor: () => void;
  index: number;
  date: string;
  chosenId: string | undefined;
  onChoose: (id: string) => void;
  onNext: () => void;
}) {
  const closet = look === undefined && closetLooks.length > 0 ? closetLooks[index % closetLooks.length] : undefined;
  const total = look !== undefined ? view.looks.length : closetLooks.length;
  const photos = useWardrobePhotos();
  const artView = useClosetView();
  // 이 룩에 사진 넣은 옷이 있으면 그림 | 사진 보기를 고를 수 있다(옷장과 같은 설정).
  // 룩에 사진 넣은 옷이 있으면(저장 사진 룩이든 옷장 옷만으로 고른 룩이든) 그림 | 사진을 고를 수 있다(11/25).
  const shownItems = look !== undefined ? look.pieces.map((piece) => piece.wardrobeItem) : closet?.items ?? [];
  const hasPhoto = shownItems.some((item) => photos[item.id] !== undefined);
  const addClothes = { label: '옷장에 옷 넣기', onPress: () => router.push('/add-item/kind') };
  const feed = useFeedState();
  const tastes = useSession()?.styles ?? [];
  // 옷장에 상의·하의(또는 원피스)가 없으면 저장 사진 맞춰 보기를 기다리지 않는다(어차피 내 옷으로 다 되는 룩이 없다).
  const hasBody = view.wardrobe.some((item) => item.slot === '원피스')
    || (view.wardrobe.some((item) => item.slot === '상의') && view.wardrobe.some((item) => item.slot === '하의'));
  const ready = view.wardrobeStatus === 'ready' && view.archiveStatus === 'ready' && (view.pending === 0 || !hasBody);
  const feedLook = look === undefined && closet === undefined && ready && anchor === undefined ? pickFeedLook(feed.data, tastes, view.day) : undefined;
  let empty: { text: string; action?: { label: string; onPress: () => void } } | null = null;
  if (look === undefined && closet === undefined && feedLook === undefined) {
    if (view.wardrobeStatus !== 'ready' || view.archiveStatus !== 'ready') empty = { text: '불러오는 중이에요' };
    else if (view.wardrobe.length === 0) empty = { text: '옷장에 옷을 넣으면 그날 기온에 맞는 룩을 골라 드려요', action: addClothes };
    else if (view.pending > 0) empty = { text: '저장한 사진을 내 옷장과 맞춰 보는 중이에요' };
    else {
      empty = {
        text: view.day !== undefined
          ? '이 날 기온에 맞는 상의·하의(또는 원피스)가 옷장에 아직 없어요'
          : '상의와 하의(또는 원피스)를 옷장에 넣으면 룩을 골라 드려요',
        action: addClothes,
      };
    }
  }
  const chosen = look !== undefined && chosenId === look.image.id;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={[styles.h2, styles.flex]}>{title}</Text>
        {hasPhoto && <ViewToggle value={artView} onChange={setClosetView} label="룩 옷 보기" />}
        {total > 0 && <Text style={styles.sub}>{(index % total) + 1} / {total}</Text>}
      </View>
      {anchor !== undefined && (
        <View style={styles.anchorRow}>
          <Text style={styles.anchorText} numberOfLines={1}>{anchor.color} {kindLabel(anchor.kind)}로 만든 룩</Text>
          <Pressable onPress={onClearAnchor} accessibilityRole="button" accessibilityLabel="고른 옷 풀고 원래 추천 보기" hitSlop={8} style={styles.anchorClear}>
            <Text style={styles.anchorClearText}>원래 추천 ×</Text>
          </Pressable>
        </View>
      )}
      {look !== undefined ? (
        <>
          <GlassView radius={16} style={styles.lookCard}>
            <View style={styles.lookHead}>
              <Image source={{ uri: look.image.thumbnail_url }} style={styles.thumb} contentFit="cover" accessibilityLabel="저장한 사진" />
              <View style={styles.flex}>
                <Text style={styles.sub} numberOfLines={1}>저장한 사진 · {look.image.style.join('·') || look.image.season}</Text>
                <Text style={styles.lookTitle}>가진 옷 {look.pieces.length}벌로 완성</Text>
              </View>
              <Pressable
                onPress={() => router.push({ pathname: '/look/[id]', params: { id: look.image.id, date } })}
                accessibilityRole="button"
                style={styles.moreButton}>
                <Text style={styles.moreText}>자세히</Text>
                <ChevronRight color={colors.textPurple} />
              </Pressable>
            </View>
            <MatchLegend pieces={look.pieces} />
            <LookGrid look={look} photos={photos} artView={artView} />
            {lookTips(look.pieces, view.day).map((tip) => (
              <View key={tip.label} style={styles.tipRow}>
                <Text style={styles.tipLabel}>{tip.label}</Text>
                <Text style={styles.tipRowText}>{tip.text}</Text>
              </View>
            ))}
            <ChooseRow chosen={chosen} onChoose={() => onChoose(look.image.id)} onNext={total > 1 ? onNext : undefined} />
          </GlassView>
          {total > 1 && <Dots total={total} index={index % total} />}
        </>
      ) : closet !== undefined ? (
        <>
          <ClosetLookCard combo={closet} date={date} day={near ? view.day : undefined} photos={photos} artView={artView} chosen={chosenId === closet.id} onChoose={() => onChoose(closet.id)} onNext={total > 1 ? onNext : undefined} />
          {total > 1 && <Dots total={total} index={index % total} />}
        </>
      ) : feedLook !== undefined ? (
        <FeedLookCard image={feedLook} emptyCloset={view.wardrobe.length === 0} onAdd={addClothes.onPress} />
      ) : (
        <GlassView radius={16} style={styles.emptyCard}>
          <Text style={styles.emptyText}>{empty?.text}</Text>
          {empty?.action !== undefined && (
            <Pressable onPress={empty.action.onPress} accessibilityRole="button" style={styles.retry}>
              <Text style={styles.retryText}>{empty.action.label}</Text>
            </Pressable>
          )}
        </GlassView>
      )}
    </View>
  );
}

function ChooseRow({ chosen, onChoose, onNext }: { chosen: boolean; onChoose: () => void; onNext?: () => void }) {
  return (
    <View style={styles.actions}>
      <Pressable onPress={onChoose} disabled={chosen} accessibilityRole="button" accessibilityState={{ disabled: chosen }} style={[styles.choose, chosen && styles.chooseDone]}>
        <Text style={styles.chooseText}>{chosen ? '이 룩으로 입기로 했어요' : '이 룩으로 입을래요'}</Text>
      </Pressable>
      {onNext !== undefined && (
        <Pressable onPress={onNext} accessibilityRole="button" accessibilityLabel="다른 조합 보기" style={styles.iconButton}>
          <RefreshIcon />
        </Pressable>
      )}
    </View>
  );
}

// 저장한 사진 없이 내 옷장 옷만으로 고른 룩(11/24 팀 결정 8번). 보통은 모두 그날 기온에 맞는 옷이다.
// day가 있으면(③ 가장 가까운 조합) 기온에 딱 맞지 않는다는 안내를 붙인다.
function ClosetLookCard({ combo, date, day, photos, artView, chosen, onChoose, onNext }: {
  combo: Combo;
  date: string;
  day?: DayWeather;
  photos: Readonly<Record<string, WardrobePhoto>>;
  artView: ClosetView;
  chosen: boolean;
  onChoose: () => void;
  onNext?: () => void;
}) {
  const anchor = combo.items.find((item) => item.slot === '상의' || item.slot === '원피스') ?? combo.items[0];
  const gaps = day === undefined ? [] : combo.items.map((item) => tempGap(item, day));
  const nearNote = day === undefined ? null
    : gaps.includes('추움') ? '오늘 기온에 딱 맞는 옷이 부족해 가장 가까운 옷으로 골랐어요. 겉옷이나 스타킹을 더해 따뜻하게 입어요'
      : gaps.includes('더움') ? '오늘 기온에 딱 맞는 옷이 부족해 가장 가까운 옷으로 골랐어요. 얇은 옷 위주로 시원하게 입어요'
        : null;
  return (
    <GlassView radius={16} style={styles.lookCard}>
      <View style={styles.lookHead}>
        <View style={[styles.thumb, styles.closetThumb]}>
          <TabIcon name="closet" color={colors.textPurple} size={22} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.sub} numberOfLines={1}>내 옷장에서 골랐어요{combo.tags.includes('기온 맞춤') ? ' · 기온 맞춤' : ''}</Text>
          <Text style={styles.lookTitle}>가진 옷 {combo.items.length}벌로 완성</Text>
        </View>
        {anchor !== undefined && (
          <Pressable
            onPress={() => router.push({ pathname: '/combo/[id]', params: { id: anchor.id, date } })}
            accessibilityRole="button"
            style={styles.moreButton}>
            <Text style={styles.moreText}>조합 더</Text>
            <ChevronRight color={colors.textPurple} />
          </Pressable>
        )}
      </View>
      <ComboGrid items={combo.items} photos={photos} artView={artView} />
      {nearNote !== null && (
        <View style={styles.tipRow}>
          <Text style={styles.tipLabel}>기온</Text>
          <Text style={styles.tipRowText}>{nearNote}</Text>
        </View>
      )}
      <ChooseRow chosen={chosen} onChoose={onChoose} onNext={onNext} />
    </GlassView>
  );
}

// ④ 옷장에 상의·하의(원피스)가 없을 때: 추구미 피드 사진 중 오늘 기온에 맞는 옷이 나온 사진(피드는 이미 추구미 순서).
function pickFeedLook(feed: readonly StyleImage[], tastes: readonly string[], day: DayWeather | undefined): StyleImage | undefined {
  const liked = tastes.length > 0 ? feed.filter((image) => image.style.some((style) => tastes.includes(style))) : feed;
  const pool = liked.length > 0 ? liked : feed;
  const fitsDay = (image: StyleImage) => day === undefined
    || (image.items ?? []).every((item) => fitsTemp({ kind: item.kind }, day));
  return pool.find((image) => (image.items?.length ?? 0) > 0 && fitsDay(image)) ?? pool.find(fitsDay) ?? pool[0];
}

function FeedLookCard({ image, emptyCloset, onAdd }: { image: StyleImage; emptyCloset: boolean; onAdd: () => void }) {
  const open = () => router.push({ pathname: '/style/[id]', params: { id: image.id } });
  return (
    <GlassView radius={16} style={styles.lookCard}>
      <View style={styles.lookHead}>
        <View style={styles.flex}>
          <Text style={styles.sub} numberOfLines={1}>추구미 사진에서 골랐어요 · {image.style.join('·')}</Text>
          <Text style={styles.lookTitle}>오늘 날씨에 어울리는 룩</Text>
        </View>
        <Pressable onPress={open} accessibilityRole="button" style={styles.moreButton}>
          <Text style={styles.moreText}>자세히</Text>
          <ChevronRight color={colors.textPurple} />
        </Pressable>
      </View>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel="오늘의 룩 사진 자세히 보기">
        <Image source={{ uri: image.thumbnail_url, cacheKey: image.id }} style={styles.feedLookPhoto} contentFit="cover" />
      </Pressable>
      <Text style={styles.tipRowText}>
        {emptyCloset ? '옷장에 옷을 넣으면' : '옷장에 상의·하의(또는 원피스)를 넣으면'} 이 룩처럼 내 옷으로 입을 룩을 골라 드려요
      </Text>
      <View style={styles.actions}>
        <Pressable onPress={onAdd} accessibilityRole="button" style={styles.choose}>
          <Text style={styles.chooseText}>옷장에 옷 넣기</Text>
        </Pressable>
      </View>
    </GlassView>
  );
}

// 오늘의 룩과 같은 칸 배치(큰 칸 + 오른쪽 두 칸 + 아래 줄), 매치 딱지 없이.
// 사진 넣은 옷은 칸을 옆으로 밀면 그림 ↔ 사진(오늘의 룩 사진 룩과 같음, 11/25).
function ComboGrid({ items, photos, artView }: { items: readonly WardrobeItem[]; photos: Readonly<Record<string, WardrobePhoto>>; artView: ClosetView }) {
  const tile = (item: WardrobeItem, size: number, style: object) => (
    <View key={item.id} style={[styles.tile, style]}>
      <ArtPager key={`${item.id}-${artView}`} item={item} photo={photos[item.id]} view={artView} iconSize={size} photoSize={size} height={size + 14} flipOnTap />
      <View style={styles.tileName}>
        <Text style={styles.tileKind}>{kindLabel(item.kind)}</Text>
        <Text style={styles.tileColor}>{item.color}</Text>
      </View>
    </View>
  );
  if (items.length <= 2) {
    return <View style={[styles.grid, styles.gridRow]}>{items.map((item) => tile(item, 96, styles.tileHalf))}</View>;
  }
  const bottom = items.slice(3);
  return (
    <View style={styles.grid}>
      <View style={styles.gridRow}>
        {tile(items[0], 140, styles.tileBig)}
        <View style={styles.gridColumn}>
          {tile(items[1], 84, styles.tileSmall)}
          {tile(items[2], 84, styles.tileSmall)}
        </View>
      </View>
      {bottom.length > 0 && <View style={styles.gridRow}>{bottom.map((item) => tile(item, 66, styles.tileBottom))}</View>}
    </View>
  );
}

// 큰 칸(첫 옷) + 오른쪽 두 칸 + 아래 줄. 옷이 2벌이면 나란히.
// 사진 넣은 옷은 칸을 옆으로 밀면 그림 ↔ 사진(옷장 칸과 같음). 위 '그림 | 사진'으로 전부 한 번에 바꿀 수도 있다.
function LookGrid({ look, photos, artView }: { look: Look; photos: Readonly<Record<string, WardrobePhoto>>; artView: ClosetView }) {
  const pieces = sortPieces(look.pieces);
  const tile = (index: number, size: number, style: object) => {
    const piece = pieces[index];
    const mine = piece.wardrobeItem;
    return (
      <View key={mine.id} style={[styles.tile, style]}>
        <ArtPager key={`${mine.id}-${artView}`} item={mine} photo={photos[mine.id]} view={artView} iconSize={size} photoSize={size} height={size + 14} flipOnTap />
        <MatchBadge match={matchOf(piece)} style={styles.tileBadge} />
        <View style={styles.tileName}>
          <Text style={styles.tileKind}>{kindLabel(mine.kind)}</Text>
          <Text style={styles.tileColor}>{mine.color}</Text>
        </View>
      </View>
    );
  };
  if (pieces.length <= 2) {
    return <View style={[styles.grid, styles.gridRow]}>{pieces.map((_, i) => tile(i, 96, styles.tileHalf))}</View>;
  }
  const bottom = pieces.slice(3);
  return (
    <View style={styles.grid}>
      <View style={styles.gridRow}>
        {tile(0, 140, styles.tileBig)}
        <View style={styles.gridColumn}>
          {tile(1, 84, styles.tileSmall)}
          {tile(2, 84, styles.tileSmall)}
        </View>
      </View>
      {bottom.length > 0 && <View style={styles.gridRow}>{bottom.map((_, i) => tile(i + 3, 66, styles.tileBottom))}</View>}
    </View>
  );
}

// 내 옷으로 조합 만들기: 옷장 옷 하나를 고르면 조합 만들기(/combo/[id])로 간다.
// 11/24 팀 결정 8번: 고른 날 기온에 맞는 옷만 먼저 보여 준다. 11/25: '기온에 맞는 옷만 보기'를 토글 스위치로(끄면 다 보임).
// 옷장을 '사진'으로 보고 있으면 사진 넣은 옷은 사진으로 보인다.
// 11/25: 옷을 누르면 다른 화면으로 가지 않고, 그 옷으로 위 오늘의 룩을 다시 만든다(더 많은 조합은 룩 카드의 '조합 더').
function ComboMaker({ wardrobe, day, anchorId, onPick }: {
  wardrobe: readonly WardrobeItem[];
  day: DayWeather | undefined;
  anchorId: string | null;
  onPick: (id: string) => void;
}) {
  const [slot, setSlot] = useState<Slot | '전체'>('전체');
  const [showAll, setShowAll] = useState(false);
  const photos = useWardrobePhotos();
  const artView = useClosetView();
  const slots = SLOTS.filter((item) => wardrobe.some((piece) => piece.slot === item));
  const inSlot = wardrobe
    .filter((item) => slot === '전체' || item.slot === slot)
    .map((item) => ({ item, gap: day === undefined ? null : tempGap(item, day) }))
    .sort((a, b) => Number(a.gap !== null) - Number(b.gap !== null)
      || SLOTS.indexOf(a.item.slot) - SLOTS.indexOf(b.item.slot)
      || a.item.id.localeCompare(b.item.id));
  const hidden = inSlot.filter(({ gap }) => gap !== null).length;
  const shown = showAll ? inSlot : inSlot.filter(({ gap }) => gap === null);
  return (
    <View style={styles.section}>
      <View>
        <Text style={styles.h2}>내 옷으로 조합 만들기</Text>
        <Text style={styles.sub} numberOfLines={1}>옷을 누르면 그 옷으로 오늘의 룩을 만들어 드려요</Text>
      </View>
      {hidden > 0 && (
        <View style={styles.tempToggle}>
          <Text style={styles.tempToggleText} numberOfLines={1}>
            {day !== undefined ? `${day.min}~${day.max}°에 ` : ''}맞는 옷만 보기{showAll ? '' : <Text style={styles.tempToggleSub}> · {hidden}벌 숨김</Text>}
          </Text>
          <Switch
            value={!showAll}
            onValueChange={(on) => setShowAll(!on)}
            trackColor={{ false: colors.line, true: colors.purpleStrong }}
            thumbColor={colors.white}
            // 웹(react-native-web)은 켜졌을 때 동그라미 색을 따로 받는다.
            {...({ activeThumbColor: colors.white } as object)}
            accessibilityLabel="기온에 맞는 옷만 보기"
          />
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.makerChips}>
        {(['전체', ...slots] as const).map((item) => {
          const on = item === slot;
          return (
            <Pressable key={item} onPress={() => setSlot(item)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.makerChip, on && styles.makerChipOn]}>
              <Text style={[styles.makerChipText, on && styles.makerChipTextOn]}>{item}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {shown.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.clothesRow}>
          {shown.map(({ item, gap }) => (
            <Pressable
              key={item.id}
              onPress={() => onPick(item.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: item.id === anchorId }}
              accessibilityLabel={`${item.color} ${kindLabel(item.kind)}, 이 옷으로 오늘의 룩 만들기`}
              style={styles.clothesItem}>
              <View style={[styles.clothesTile, item.id === anchorId && styles.clothesTileOn]}>
                {artView === 'photo' && photos[item.id] !== undefined
                  ? <PlainImage source={{ uri: photos[item.id].uri }} style={styles.clothesPhoto} resizeMode="contain" accessibilityLabel={`${kindLabel(item.kind)} 사진`} />
                  : <ItemIcon item={item} size={60} />}
              </View>
              <Text style={styles.clothesName} numberOfLines={1}>{kindLabel(item.kind)}</Text>
              {gap !== null && <Text style={styles.makerGap}>{gap === '추움' ? '추울 수도' : '더울 수도'}</Text>}
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.sub}>이 날 기온에 맞는 {slot === '전체' ? '옷' : slot}이 아직 없어요</Text>
      )}
    </View>
  );
}

function Dots({ total, index }: { total: number; index: number }) {
  return (
    <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: total }, (_, i) => <View key={i} style={[styles.dot, i === index && styles.dotActive]} />)}
    </View>
  );
}

// ── 선 아이콘 ──
function PinIcon() {
  return <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textPurple} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 21s-6-5.4-6-10.5a6 6 0 0 1 12 0C18 15.6 12 21 12 21z" /><Path d="M14.2 10.5a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0z" /></Svg>;
}
function ChevronDown({ color = colors.textSecondary }: { color?: string }) {
  return <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M7 10l5 5 5-5" /></Svg>;
}
function ChevronLeft() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 6l-6 6 6 6" /></Svg>;
}
function ChevronRight({ color = colors.textSecondary }: { color?: string }) {
  return <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M9 6l6 6-6 6" /></Svg>;
}
function TempIcon() {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textPurple} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M8 4v12M5 13l3 3 3-3M16 20V8M13 11l3-3 3 3" /></Svg>;
}
function RefreshIcon({ size = 20 }: { size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={colors.textPurple} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Path d="M20 11a8 8 0 1 0-2.3 5.7" /><Path d="M20 4v7h-7" /></Svg>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  flip: { transform: [{ rotate: '180deg' }] },
  scroll: { paddingBottom: 96 }, // 챗봇 버튼에 가리지 않게(11/25)
  regionButton: { height: 32, paddingLeft: 8, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 4 },
  regionText: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },

  dateRow: { flexDirection: 'row', gap: 4, paddingHorizontal: layout.screenPaddingX },
  dateCell: { flex: 1, height: 62, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 1 },
  dateCellSelected: { backgroundColor: colors.white, boxShadow: glass.selectedInnerShadow },
  dateLabel: { fontFamily: fonts.regular, fontSize: 11, color: colors.textSecondary },
  dateLabelSelected: { fontFamily: fonts.bold, color: colors.textPurple },
  dateNum: { fontFamily: fonts.bold, fontSize: 17, color: colors.text },
  dateNumSelected: { fontFamily: fonts.extraBold },
  dateBottom: { fontFamily: fonts.regular, fontSize: 11, color: colors.textSecondary },
  dateBottomAccent: { fontFamily: fonts.bold, color: colors.textPurple },
  addCell: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.purpleFill },
  addText: { fontFamily: fonts.bold, fontSize: 11, color: colors.textPurple },

  upcoming: { marginTop: 12, marginHorizontal: layout.screenPaddingX, height: 42, paddingLeft: 12, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  upcomingTitle: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  upcomingText: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  planCard: { marginTop: 12, marginHorizontal: layout.screenPaddingX, height: 58, paddingLeft: 10, paddingRight: 12, borderRadius: 14, backgroundColor: colors.photoPlaceholder, flexDirection: 'row', alignItems: 'center', gap: 10 },
  planIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  planTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  planMood: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  planEdit: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },

  main: { paddingHorizontal: layout.screenPaddingX, paddingTop: 14, gap: 24 },
  top: { gap: 12, paddingBottom: 4 },
  locateNote: { marginTop: -4, paddingHorizontal: layout.screenPaddingX, fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  compactWrap: { paddingHorizontal: layout.screenPaddingX, paddingBottom: 4 },
  compact: { height: 48, paddingLeft: 8, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  compactTemp: { fontFamily: fonts.extraBold, fontSize: 20, letterSpacing: -0.5, color: colors.text },
  compactText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
  closetThumb: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.purpleTint },
  tempToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  tempToggleText: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  tempToggleSub: { fontFamily: fonts.regular, color: colors.textSecondary },
  sheetRowLocate: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 56 },
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  h2: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },

  weather: { marginHorizontal: layout.screenPaddingX, padding: 14, gap: 12 },
  weatherHeading: { fontFamily: fonts.bold, fontSize: 13, color: colors.textSecondary },
  weatherRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  weatherTemp: { fontFamily: fonts.extraBold, fontSize: 48, letterSpacing: -2, lineHeight: 52, color: colors.text },
  weatherSky: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  weatherMeta: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  weatherEmpty: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  hourlyToggle: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  hourlyToggleText: { fontFamily: fonts.bold, fontSize: 12, color: colors.textPurple },
  hourly: { flexDirection: 'row', gap: 2 },
  hourCell: { flex: 1, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 1 },
  hourCellNow: { backgroundColor: colors.white, boxShadow: glass.selectedInnerShadow },
  hourLabel: { fontFamily: fonts.regular, fontSize: 11, color: colors.textSecondary },
  hourLabelNow: { fontFamily: fonts.bold, color: colors.textPurple },
  hourTemp: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.photoPlaceholder },
  tipText: { flex: 1, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.text },
  source: { alignSelf: 'flex-end', marginTop: -2, fontFamily: fonts.regular, fontSize: 11, color: colors.textSecondary },
  tipTitle: { fontFamily: fonts.bold, color: colors.textPurple },
  retry: { alignSelf: 'flex-start', height: 32, paddingHorizontal: 12, borderRadius: 9, backgroundColor: colors.white, boxShadow: glass.selectedInnerShadow, justifyContent: 'center' },
  retryText: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },

  emptyCard: { padding: 16, gap: 10 },
  emptyText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.text },
  lookCard: { padding: 14, gap: 12 },
  lookHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 40, height: 48, borderRadius: 8, backgroundColor: colors.progressTrack },
  lookTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  moreButton: { height: 32, paddingLeft: 10, paddingRight: 8, borderRadius: 9, backgroundColor: colors.white, boxShadow: glass.selectedInnerShadow, flexDirection: 'row', alignItems: 'center', gap: 2 },
  moreText: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },
  grid: { gap: 2, borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  gridRow: { flexDirection: 'row', gap: 2 },
  gridColumn: { flex: 1, gap: 2 },
  tile: { backgroundColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center' },
  tileBig: { flex: 1, height: 250, paddingBottom: 18 },
  tileSmall: { height: 124, paddingLeft: 48 },
  tileBottom: { flex: 1, height: 96, paddingLeft: 52 },
  tileHalf: { flex: 1, height: 160 },
  tileBadge: { position: 'absolute', left: 8, top: 8 },
  tileName: { position: 'absolute', left: 10, bottom: 8 },
  tileKind: { fontFamily: fonts.bold, fontSize: 12, color: colors.text },
  tileColor: { fontFamily: fonts.regular, fontSize: 11, color: colors.textSecondary },
  tipRow: { flexDirection: 'row', gap: 8 },
  tipLabel: { width: 52, fontFamily: fonts.bold, fontSize: 13, lineHeight: 20, color: colors.textPurple },
  tipRowText: { flex: 1, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.text },
  actions: { flexDirection: 'row', gap: 8 },
  feedLookPhoto: { width: '100%', aspectRatio: 3 / 4, maxHeight: 420, backgroundColor: colors.progressTrack },
  choose: { flex: 1, height: 50, borderRadius: 14, backgroundColor: colors.purpleFill, alignItems: 'center', justifyContent: 'center' },
  chooseDone: { opacity: 0.6 },
  chooseText: { fontFamily: fonts.bold, fontSize: 15, color: colors.onPurpleFill },
  iconButton: { width: 50, height: 50, borderRadius: 14, backgroundColor: colors.white, boxShadow: glass.selectedInnerShadow, alignItems: 'center', justifyContent: 'center' },
  iconButtonSmall: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.white, boxShadow: glass.selectedInnerShadow, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.purpleFill },
  dotActive: { width: 16, backgroundColor: colors.purpleStrong },

  bleed: { marginHorizontal: -layout.screenPaddingX },
  clothesRow: { gap: 8, paddingHorizontal: layout.screenPaddingX },
  clothesItem: { width: 76, alignItems: 'center', gap: 6 },
  clothesTile: { width: 76, height: 76, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)', boxShadow: 'inset 0 1px 0 #FFFFFF, 0 4px 12px rgba(60,40,120,0.08)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  clothesPhoto: { width: 68, height: 68 },
  clothesTileOn: { borderWidth: 2, borderColor: colors.textPurple },
  anchorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  anchorText: { flex: 1, fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },
  anchorClear: { height: 28, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, justifyContent: 'center' },
  anchorClearText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textSecondary },
  clothesName: { fontFamily: fonts.medium, fontSize: 12, color: colors.text },
  makerChips: { gap: 6, paddingHorizontal: layout.screenPaddingX },
  makerChip: { height: 32, paddingHorizontal: 13, borderRadius: 16, borderWidth: 1, borderColor: glass.border, backgroundColor: glass.background, justifyContent: 'center' },
  makerChipOn: { backgroundColor: colors.white, borderColor: colors.purpleLine, borderWidth: 1.5 },
  makerChipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  makerChipTextOn: { fontFamily: fonts.bold, color: colors.textPurple },
  makerGap: { marginTop: -4, fontFamily: fonts.regular, fontSize: 10, color: colors.danger },


  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(30,20,50,0.3)', justifyContent: 'flex-end' },
  tripEntry: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: glass.background, borderWidth: 1, borderColor: glass.border },
  tripEntryTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  tripEntryBeta: { fontFamily: fonts.bold, fontSize: 11, color: colors.tagText },
  sheet: { maxHeight: '70%', paddingTop: 18, paddingBottom: 30, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.background },
  sheetTitle: { paddingHorizontal: 20, paddingBottom: 8, fontFamily: fonts.extraBold, fontSize: 17, color: colors.text },
  sheetList: { paddingHorizontal: 12 },
  sheetLabel: { marginTop: 14, marginBottom: 8, paddingHorizontal: 20, fontFamily: fonts.bold, fontSize: 13, color: colors.textSecondary },
  sidoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20 },
  sidoChip: { width: '22.5%', height: 42, borderRadius: 12, borderWidth: 1, borderColor: glass.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  sidoChipOn: { borderColor: colors.purpleLine, borderWidth: 1.5 },
  sidoChipText: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  sidoChipTextOn: { fontFamily: fonts.bold, color: colors.textPurple },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingBottom: 8 },
  sheetBack: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  sheetHeadTitle: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.text },
  sheetHeadPath: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.textPurple },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 8, paddingBottom: 8 },
  choiceChip: { width: '31.5%', height: 44, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: glass.border, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  choiceMore: { fontFamily: fonts.bold, fontSize: 14, color: colors.textSecondary },
  sheetRow: { height: 48, paddingHorizontal: 8, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.line },
  sheetRowText: { fontFamily: fonts.regular, fontSize: 15, color: colors.text },
  sheetRowTextCurrent: { fontFamily: fonts.bold, color: colors.textPurple },
});
