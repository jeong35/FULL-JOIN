// 추천 탭(11/20 확정 시안: 기본 디자인 + 반반 약속 + 매치 + 하나만 더하면 ①).
// 날짜 줄(7일 + 약속 칸) → 다가오는 약속 한 줄(약속 있는 날은 약속 카드) → 날씨(누르면 시간별) →
// 오늘의 룩(매치 표시) → 오늘 기온에 맞는 내 옷 → 하나만 더하면 완성 → 내 옷으로 조합 만들기(11/22).
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ArtPager, ViewToggle } from '@/components/ArtPager';
import { GlassView } from '@/components/GlassView';
import { KindIcon } from '@/components/KindIcon';
import { MatchBadge, MatchLegend, WeatherIcon } from '@/components/LookParts';
import { TabScreen } from '@/components/TabScreen';
import { ItemIcon } from '@/components/WardrobeIcon';
import { kindLabel, SLOTS, type Slot } from '@/data/catalog';
import { dayOfMonth, longDateLabel, nextDays, nowLabel, todayKey, weekday } from '@/data/dates';
import { nextPlan, plansOn, timeLabel, usePlans, type Plan } from '@/data/plans';
import { clothesForWeather, lookTips, matchOf, sortPieces, type AlmostLook, type Look } from '@/data/recommend';
import { shoppingLinksFor } from '@/data/shopping';
import { loadArchive, loadWardrobe } from '@/data/store';
import { nextTrip, nightsLabel, tripOn, useTrips, type Trip } from '@/data/trips';
import type { WardrobeItem } from '@/data/types';
import { useRecommendation } from '@/data/useRecommendation';
import { setClosetView, useClosetView, useWardrobePhotos, type ClosetView, type WardrobePhoto } from '@/data/wardrobePhotos';
import { loadWeather, REGIONS, setRegion, tempGap, tempRangeLabel, weatherTip, type DayWeather } from '@/data/weather';
import { colors, fonts, glass, layout } from '@/theme';

const DAYS = 7;

export default function RecommendScreen() {
  const today = todayKey();
  const days = nextDays(today, DAYS);
  const [selected, setSelected] = useState(today);
  const [hourlyOpen, setHourlyOpen] = useState(false);
  const [lookIndex, setLookIndex] = useState(0);
  const [almostIndex, setAlmostIndex] = useState(0);
  const [regionOpen, setRegionOpen] = useState(false);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const plans = usePlans();
  const trips = useTrips();
  const view = useRecommendation(selected);
  const { region, weather, day, plan } = view;

  useFocusEffect(useCallback(() => {
    void loadWardrobe();
    void loadArchive();
  }, []));
  useFocusEffect(useCallback(() => {
    void loadWeather(region);
  }, [region]));

  const pick = (date: string) => {
    setSelected(date);
    setLookIndex(0);
    setAlmostIndex(0);
  };
  const upcoming = nextPlan(plans, today);
  const trip = nextTrip(trips, today);
  const look = view.looks.length > 0 ? view.looks[lookIndex % view.looks.length] : undefined;
  const almost = view.almost.length > 0 ? view.almost[almostIndex % view.almost.length] : undefined;
  const clothes = clothesForWeather(view.wardrobe, day);

  return (
    <TabScreen
      title="추천"
      headerRight={
        <Pressable onPress={() => setRegionOpen(true)} accessibilityRole="button" accessibilityLabel={`위치 바꾸기, 지금 ${region.name}`}>
          <GlassView radius={9} style={styles.regionButton}>
            <PinIcon />
            <Text style={styles.regionText}>{region.name}</Text>
            <ChevronDown />
          </GlassView>
        </Pressable>
      }>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.dateRow} accessibilityRole="tablist" accessibilityLabel="날짜 고르기">
          {days.map((date, index) => {
            const isSelected = date === selected;
            const dayPlan = plansOn(plans, date)[0];
            const dayWeather = weather.days.find((item) => item.date === date);
            const dayTrip = tripOn(trips, date);
            const bottom = dayPlan?.title ?? (dayTrip !== undefined ? '여행' : weatherWord(dayWeather));
            const accent = dayPlan !== undefined || dayTrip !== undefined || bottom === '비' || bottom === '눈';
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
          <Pressable
            onPress={() => router.push({ pathname: '/plan/edit', params: { date: selected } })}
            accessibilityRole="button"
            accessibilityLabel="약속 추가"
            style={[styles.dateCell, styles.addCell]}>
            <PlusIcon />
            <Text style={styles.addText}>약속</Text>
          </Pressable>
        </View>

        {plan !== undefined ? (
          <PlanCard plan={plan} />
        ) : upcoming !== undefined && upcoming.date !== selected ? (
          <Pressable onPress={() => pick(upcoming.date)} accessibilityRole="button" accessibilityLabel={`다가오는 약속, ${upcomingText(upcoming)} 보기`}>
            <GlassView radius={12} style={styles.upcoming}>
              <HeartIcon size={15} />
              <Text style={styles.upcomingTitle}>다가오는 약속</Text>
              <Text style={styles.upcomingText} numberOfLines={1}>{upcomingText(upcoming)}</Text>
              <ChevronRight />
            </GlassView>
          </Pressable>
        ) : null}

        {trip !== undefined && (
          <Pressable onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })} accessibilityRole="button" accessibilityLabel={`여행 ${tripText(trip)} 보기`}>
            <GlassView radius={12} style={styles.upcoming}>
              <SuitcaseIcon />
              <Text style={styles.upcomingTitle}>{trip.start <= today ? '여행 중' : '다가오는 여행'}</Text>
              <Text style={styles.upcomingText} numberOfLines={1}>{tripText(trip)}</Text>
              <ChevronRight />
            </GlassView>
          </Pressable>
        )}

        <View style={styles.main}>
          <WeatherCard
            date={selected}
            isToday={selected === today}
            status={weather.status}
            source={weather.source}
            day={day}
            plan={plan}
            hourlyOpen={hourlyOpen}
            onToggle={() => setHourlyOpen((open) => !open)}
            onRetry={() => void loadWeather(region, { force: true })}
          />

          <LookSection
            title={plan !== undefined ? `${weekday(selected)}요일 ${plan.title} 룩` : '오늘의 룩'}
            view={view}
            look={look}
            index={lookIndex}
            date={selected}
            chosen={look !== undefined && chosen[selected] === look.image.id}
            onChoose={() => look !== undefined && setChosen((prev) => ({ ...prev, [selected]: look.image.id }))}
            onNext={() => setLookIndex((i) => i + 1)}
          />

          {day !== undefined && clothes.length > 0 && (
            <View style={styles.section}>
              <View>
                <Text style={styles.h2}>오늘 기온에 맞는 내 옷</Text>
                <Text style={styles.sub}>기온별 옷차림 {tempRangeLabel(day)} · 내 옷장에서 {clothes.length}벌</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.clothesRow}>
                {clothes.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => router.push({ pathname: '/combo/[id]', params: { id: item.id, date: selected } })}
                    accessibilityRole="button"
                    accessibilityLabel={`${kindLabel(item.kind)} 조합 보기`}
                    style={styles.clothesItem}>
                    <View style={styles.clothesTile}>
                      <ItemIcon item={item} size={60} />
                    </View>
                    <Text style={styles.clothesName} numberOfLines={1}>{kindLabel(item.kind)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {almost !== undefined && (
            <AlmostSection almost={almost} index={almostIndex} total={view.almost.length} onNext={() => setAlmostIndex((i) => i + 1)} />
          )}

          {view.wardrobe.length > 0 && <ComboMaker wardrobe={view.wardrobe} day={day} date={selected} />}

          {trip === undefined && (
            <Pressable onPress={() => router.push({ pathname: '/trip/edit', params: { start: selected } })} accessibilityRole="button" style={styles.tripEntry}>
              <SuitcaseIcon />
              <View style={styles.flex}>
                <Text style={styles.tripEntryTitle}>여행 가요? <Text style={styles.tripEntryBeta}>시험판</Text></Text>
                <Text style={styles.sub}>MT·워크숍도 돼요. 날마다 코디와 챙길 짐을 내 옷장에서 골라 드려요</Text>
              </View>
              <ChevronRight />
            </Pressable>
          )}
        </View>
      </ScrollView>

      <Modal visible={regionOpen} transparent animationType="fade" onRequestClose={() => setRegionOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setRegionOpen(false)} accessibilityLabel="닫기">
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>날씨를 볼 지역</Text>
            <ScrollView style={styles.sheetList}>
              {REGIONS.map((item) => {
                const isCurrent = item.name === region.name;
                return (
                  <Pressable
                    key={item.name}
                    onPress={() => {
                      setRegion(item);
                      setRegionOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isCurrent }}
                    style={styles.sheetRow}>
                    <Text style={[styles.sheetRowText, isCurrent && styles.sheetRowTextCurrent]}>{item.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </TabScreen>
  );
}

function weatherWord(day: DayWeather | undefined): string {
  if (day === undefined) return '';
  if (day.sky === '비' || day.sky === '소나기' || day.sky === '비/눈' || day.pop >= 60) return '비';
  if (day.sky === '눈') return '눈';
  return `${day.max}°`;
}

function tripText(trip: Trip): string {
  return `${trip.region.split(' ')[0] ?? trip.region} ${nightsLabel(trip.start, trip.end)} · ${weekday(trip.start)} ${dayOfMonth(trip.start)}일부터`;
}

function upcomingText(plan: Plan): string {
  const place = plan.place ? ` ${plan.place}` : '';
  return `${weekday(plan.date)} ${dayOfMonth(plan.date)} ${plan.title} · ${timeLabel(plan.time)}${place}`;
}

function PlanCard({ plan }: { plan: Plan }) {
  const mood = plan.styles.length > 0 ? `${plan.styles.join('·')} 무드로 골랐어요` : '무드를 넣으면 그 스타일로 골라 드려요';
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/plan/edit', params: { id: plan.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${plan.title} 약속 고치기`}
      style={styles.planCard}>
      <View style={styles.planIcon}><HeartIcon size={18} /></View>
      <View style={styles.flex}>
        <Text style={styles.planTitle} numberOfLines={1}>{plan.title} · {timeLabel(plan.time)}{plan.place ? ` ${plan.place}` : ''}</Text>
        <Text style={styles.planMood} numberOfLines={1}>{mood}</Text>
      </View>
      <Text style={styles.planEdit}>고치기</Text>
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

function LookSection({ title, view, look, index, date, chosen, onChoose, onNext }: {
  title: string;
  view: ReturnType<typeof useRecommendation>;
  look: Look | undefined;
  index: number;
  date: string;
  chosen: boolean;
  onChoose: () => void;
  onNext: () => void;
}) {
  const total = view.looks.length;
  const photos = useWardrobePhotos();
  const artView = useClosetView();
  // 이 룩에 사진 넣은 옷이 있으면 그림 | 사진 보기를 고를 수 있다(옷장과 같은 설정).
  const hasPhoto = look !== undefined && look.pieces.some((piece) => photos[piece.wardrobeItem.id] !== undefined);
  let empty: { text: string; action?: { label: string; onPress: () => void } } | null = null;
  if (look === undefined) {
    if (view.wardrobeStatus !== 'ready' || view.archiveStatus !== 'ready') empty = { text: '불러오는 중이에요' };
    else if (view.wardrobe.length === 0) {
      empty = { text: '옷장에 옷을 넣으면 저장한 사진으로 룩을 골라 드려요', action: { label: '옷장에 옷 넣기', onPress: () => router.push('/add-item/kind') } };
    } else if (view.archiveCount === 0) {
      empty = { text: '피드에서 마음에 드는 코디 사진을 저장하면 내 옷으로 똑같이 입는 룩을 골라 드려요', action: { label: '피드 보러 가기', onPress: () => router.navigate('/') } };
    } else if (view.pending > 0) empty = { text: '저장한 사진을 내 옷장과 맞춰 보는 중이에요' };
    else empty = { text: '지금 옷장으로 다 갖춰지는 룩은 아직 없어요. 아래 \'하나만 더하면 완성\'을 봐 주세요' };
  }
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={[styles.h2, styles.flex]}>{title}</Text>
        {hasPhoto && <ViewToggle value={artView} onChange={setClosetView} label="룩 옷 보기" />}
        {total > 0 && <Text style={styles.sub}>{(index % total) + 1} / {total}</Text>}
      </View>
      {look === undefined ? (
        <GlassView radius={16} style={styles.emptyCard}>
          <Text style={styles.emptyText}>{empty?.text}</Text>
          {empty?.action !== undefined && (
            <Pressable onPress={empty.action.onPress} accessibilityRole="button" style={styles.retry}>
              <Text style={styles.retryText}>{empty.action.label}</Text>
            </Pressable>
          )}
        </GlassView>
      ) : (
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
            <View style={styles.actions}>
              <Pressable onPress={onChoose} disabled={chosen} accessibilityRole="button" accessibilityState={{ disabled: chosen }} style={[styles.choose, chosen && styles.chooseDone]}>
                <Text style={styles.chooseText}>{chosen ? '이 룩으로 입기로 했어요' : '이 룩으로 입을래요'}</Text>
              </Pressable>
              {total > 1 && (
                <Pressable onPress={onNext} accessibilityRole="button" accessibilityLabel="다른 조합 보기" style={styles.iconButton}>
                  <RefreshIcon />
                </Pressable>
              )}
            </View>
          </GlassView>
          {total > 1 && <Dots total={total} index={index % total} />}
        </>
      )}
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
        <ArtPager key={`${mine.id}-${artView}`} item={mine} photo={photos[mine.id]} view={artView} iconSize={size} photoSize={size} height={size + 14} />
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

// 내 옷으로 조합 만들기: 옷장 옷 아무거나 하나를 고르면 조합 만들기(/combo/[id])로 간다.
// 카테고리 칩으로 거르고, 고른 날 기온에 맞는 옷을 앞에 둔다. 안 맞는 옷도 고를 수 있게 두고 작게 알려 준다.
function ComboMaker({ wardrobe, day, date }: { wardrobe: readonly WardrobeItem[]; day: DayWeather | undefined; date: string }) {
  const [slot, setSlot] = useState<Slot | '전체'>('전체');
  const slots = SLOTS.filter((item) => wardrobe.some((piece) => piece.slot === item));
  const shown = wardrobe
    .filter((item) => slot === '전체' || item.slot === slot)
    .map((item) => ({ item, gap: day === undefined ? null : tempGap(item.kind, day) }))
    .sort((a, b) => Number(a.gap !== null) - Number(b.gap !== null)
      || SLOTS.indexOf(a.item.slot) - SLOTS.indexOf(b.item.slot)
      || a.item.id.localeCompare(b.item.id));
  return (
    <View style={styles.section}>
      <View>
        <Text style={styles.h2}>내 옷으로 조합 만들기</Text>
        <Text style={styles.sub}>옷 하나를 고르면 같이 입을 조합을 보여 드려요</Text>
      </View>
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.clothesRow}>
        {shown.map(({ item, gap }) => (
          <Pressable
            key={item.id}
            onPress={() => router.push({ pathname: '/combo/[id]', params: { id: item.id, date } })}
            accessibilityRole="button"
            accessibilityLabel={`${item.color} ${kindLabel(item.kind)}, 조합 만들기`}
            style={styles.clothesItem}>
            <View style={styles.clothesTile}>
              <ItemIcon item={item} size={60} />
            </View>
            <Text style={styles.clothesName} numberOfLines={1}>{kindLabel(item.kind)}</Text>
            {gap !== null && <Text style={styles.makerGap}>{gap === '추움' ? '추울 수도' : '더울 수도'}</Text>}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function AlmostSection({ almost, index, total, onNext }: { almost: AlmostLook; index: number; total: number; onNext: () => void }) {
  const missing = almost.missing;
  const links = shoppingLinksFor(missing, []);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.flex}>
          <Text style={styles.h2}>하나만 더하면 완성</Text>
          <Text style={styles.sub}>저장한 사진처럼 입으려면 이것만 있으면 돼요</Text>
        </View>
        {total > 1 && (
          <Pressable onPress={onNext} accessibilityRole="button" accessibilityLabel="다른 사진 보기" style={styles.iconButtonSmall}>
            <RefreshIcon size={18} />
          </Pressable>
        )}
      </View>
      <GlassView radius={16} style={styles.lookCard}>
        <View style={styles.lookHead}>
          <Image source={{ uri: almost.image.thumbnail_url }} style={styles.thumb} contentFit="cover" accessibilityLabel="저장한 사진" />
          <View style={styles.flex}>
            <Text style={styles.sub} numberOfLines={1}>저장한 사진 · {almost.image.style.join('·') || almost.image.season}</Text>
            <Text style={styles.lookTitle}>{missing.kind !== undefined ? kindLabel(missing.kind) : '옷 하나'}만 있으면 완성</Text>
          </View>
          <View style={styles.ownPill}><Text style={styles.ownPillText}>내 옷 {almost.owned.length}벌 있어요</Text></View>
        </View>
        <View style={styles.almostGrid}>
          {[...almost.pieces].sort((x, y) => Number(y.type === 'missing') - Number(x.type === 'missing')).map((piece) => {
            const need = piece.type === 'missing';
            const kind = need ? piece.item.kind : piece.wardrobeItem.kind;
            if (kind === undefined) return null;
            return (
              <View key={piece.item.item_id} style={[styles.almostTile, need && styles.almostTileNeed]}>
                <View style={[styles.almostLabel, need && styles.almostLabelNeed]}>
                  <Text style={[styles.almostLabelText, need && styles.almostLabelTextNeed]}>{need ? '필요해요' : '있어요'}</Text>
                </View>
                {need ? (
                  <KindIcon kind={kind} color={piece.item.color ?? null} fit={piece.item.visual_fit ?? null} size={56} />
                ) : (
                  <ItemIcon item={piece.wardrobeItem} size={56} />
                )}
                <Text style={[styles.almostName, need && styles.almostNameNeed]} numberOfLines={1}>{kindLabel(kind)}</Text>
              </View>
            );
          })}
        </View>
        <Pressable
          onPress={() => links[0] !== undefined && void WebBrowser.openBrowserAsync(links[0].url)}
          accessibilityRole="link"
          style={styles.shopButton}>
          <Text style={styles.chooseText}>{links[0]?.platform ?? '쇼핑몰'}에서 비슷한 {missing.kind !== undefined ? kindLabel(missing.kind) : '옷'} 찾기</Text>
          <ArrowRight />
        </Pressable>
        <View style={styles.shopRow}>
          {links.slice(1, 3).map((link) => (
            <Pressable key={link.url} onPress={() => void WebBrowser.openBrowserAsync(link.url)} accessibilityRole="link" hitSlop={6}>
              <Text style={styles.shopLink}>{link.platform}에서 찾기</Text>
            </Pressable>
          ))}
        </View>
      </GlassView>
      {total > 1 && <Dots total={total} index={index % total} />}
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
function ChevronRight({ color = colors.textSecondary }: { color?: string }) {
  return <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M9 6l6 6-6 6" /></Svg>;
}
function PlusIcon() {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textPurple} strokeWidth={2.2} strokeLinecap="round"><Path d="M12 5v14M5 12h14" /></Svg>;
}
function HeartIcon({ size }: { size: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" fill={colors.purpleStrong} /></Svg>;
}
function TempIcon() {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textPurple} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M8 4v12M5 13l3 3 3-3M16 20V8M13 11l3-3 3 3" /></Svg>;
}
function RefreshIcon({ size = 20 }: { size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={colors.textPurple} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Path d="M20 11a8 8 0 1 0-2.3 5.7" /><Path d="M20 4v7h-7" /></Svg>;
}
function SuitcaseIcon() {
  return <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.purpleStrong} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M4 8h16v11H4z" /><Path d="M9 8V5h6v3M9 12v3M15 12v3" /></Svg>;
}
function ArrowRight() {
  return <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.onPurpleFill} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  flip: { transform: [{ rotate: '180deg' }] },
  scroll: { paddingBottom: 32 },
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
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  h2: { fontFamily: fonts.bold, fontSize: 16, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },

  weather: { padding: 14, gap: 12 },
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
  grid: { gap: 2, backgroundColor: colors.line, borderWidth: 2, borderColor: colors.line },
  gridRow: { flexDirection: 'row', gap: 2 },
  gridColumn: { flex: 1, gap: 2 },
  tile: { backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
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
  clothesTile: { width: 76, height: 76, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  clothesName: { fontFamily: fonts.medium, fontSize: 12, color: colors.text },
  makerChips: { gap: 6, paddingHorizontal: layout.screenPaddingX },
  makerChip: { height: 32, paddingHorizontal: 13, borderRadius: 16, borderWidth: 1, borderColor: glass.border, backgroundColor: glass.background, justifyContent: 'center' },
  makerChipOn: { backgroundColor: colors.white, borderColor: colors.purpleLine, borderWidth: 1.5 },
  makerChipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  makerChipTextOn: { fontFamily: fonts.bold, color: colors.textPurple },
  makerGap: { marginTop: -4, fontFamily: fonts.regular, fontSize: 10, color: colors.danger },

  ownPill: { height: 26, paddingHorizontal: 9, borderRadius: 7, backgroundColor: colors.purpleTint, justifyContent: 'center' },
  ownPillText: { fontFamily: fonts.bold, fontSize: 12, color: colors.textPurple },
  almostGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 8, borderRadius: 12, backgroundColor: '#F1EFF7' },
  almostTile: { width: '31.5%', height: 128, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.white, borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'space-between' },
  almostTileNeed: { borderStyle: 'dashed', borderColor: colors.purpleStrong, boxShadow: '0 4px 12px rgba(30,20,50,0.10)' },
  almostLabel: { height: 22, paddingHorizontal: 8, borderRadius: 6, backgroundColor: colors.purpleTint, justifyContent: 'center' },
  almostLabelNeed: { backgroundColor: colors.textPurple },
  almostLabelText: { fontFamily: fonts.bold, fontSize: 11, color: colors.textPurple },
  almostLabelTextNeed: { color: colors.white },
  almostName: { fontFamily: fonts.bold, fontSize: 12, color: colors.text },
  almostNameNeed: { color: colors.tagText },
  shopButton: { height: 48, borderRadius: 14, backgroundColor: colors.purpleFill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  shopRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: -4 },
  shopLink: { fontFamily: fonts.medium, fontSize: 12, color: colors.textSecondary, textDecorationLine: 'underline' },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(30,20,50,0.3)', justifyContent: 'flex-end' },
  tripEntry: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: glass.background, borderWidth: 1, borderColor: glass.border },
  tripEntryTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  tripEntryBeta: { fontFamily: fonts.bold, fontSize: 11, color: colors.tagText },
  sheet: { maxHeight: '70%', paddingTop: 18, paddingBottom: 30, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.background },
  sheetTitle: { paddingHorizontal: 20, paddingBottom: 8, fontFamily: fonts.extraBold, fontSize: 17, color: colors.text },
  sheetList: { paddingHorizontal: 12 },
  sheetRow: { height: 48, paddingHorizontal: 8, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.line },
  sheetRowText: { fontFamily: fonts.regular, fontSize: 15, color: colors.text },
  sheetRowTextCurrent: { fontFamily: fonts.bold, color: colors.textPurple },
});
