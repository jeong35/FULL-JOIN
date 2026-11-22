// 추천 탭과 룩 자세히 화면이 같이 쓰는 작은 부품: 매치 표시, 옷 설명, 날씨 그림.
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { kindLabel } from '@/data/catalog';
import { matchOf, type Match, type OwnedPiece } from '@/data/recommend';
import type { Sky } from '@/data/weather';
import { colors, fonts } from '@/theme';

// ── 매치 표시: 내 옷 쏙!(같은 옷) · 비슷해요(비슷한 내 옷) · 대체 추천(가까운 종류의 내 옷) ──
const BADGE: Record<Match, { box: ViewStyle; text: string }> = {
  '내 옷 쏙!': { box: { backgroundColor: colors.purpleFill }, text: colors.onPurpleFill },
  비슷해요: { box: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.purpleStrong }, text: colors.tagText },
  '대체 추천': { box: { backgroundColor: '#EEECF2' }, text: colors.textSecondary },
};

export function MatchBadge({ match, label, small = false, style }: {
  match: Match;
  label?: string;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const look = BADGE[match];
  return (
    <View style={[styles.badge, small && styles.badgeSmall, look.box, style]}>
      <Text style={[styles.badgeText, small && styles.badgeTextSmall, { color: look.text }]}>{label ?? match}</Text>
    </View>
  );
}

export function MatchLegend({ pieces }: { pieces: readonly OwnedPiece[] }) {
  const counts = (['내 옷 쏙!', '비슷해요', '대체 추천'] as const)
    .map((match) => [match, pieces.filter((piece) => matchOf(piece) === match).length] as const)
    .filter(([, n]) => n > 0);
  return (
    <View style={styles.legend} accessibilityLabel="저장한 사진 속 옷과 내 옷 매치">
      <Text style={styles.legendTitle}>사진 속 옷과 매치</Text>
      {counts.map(([match, n]) => <MatchBadge key={match} match={match} label={`${match} ${n}`} small />)}
    </View>
  );
}

// 받침이 없거나 ㄹ 받침이면 '로', 아니면 '으로'.
export function withRo(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const final = code >= 0 && code <= 11171 ? code % 28 : 0;
  return `${word}${final === 0 || final === 8 ? '로' : '으로'}`;
}

// 목록 한 줄 설명: 같은 옷은 색·핏, 비슷한 옷·대체 옷은 사진 속 옷과 무엇이 다른지.
export function pieceNote(piece: OwnedPiece): string {
  const mine = piece.wardrobeItem;
  const photo = piece.item;
  if (piece.substitute) return `사진은 ${photo.kind !== undefined ? kindLabel(photo.kind) : '다른 옷'} · 내 ${mine.color} ${withRo(kindLabel(mine.kind))} 대신`;
  if (piece.similar) {
    const photoKind = photo.kind !== undefined ? kindLabel(photo.kind) : null;
    const desc = [photo.color, photo.kind !== mine.kind ? photoKind : null].filter(Boolean).join(' ') || (photoKind ?? '');
    return `사진은 ${desc} · 내 ${mine.color} ${withRo(kindLabel(mine.kind))}`;
  }
  return [mine.color, mine.visual_fit].filter(Boolean).join(' · ');
}

// ── 날씨 그림(선 그림) ──
export function WeatherIcon({ sky, size = 56, color = colors.textPurple }: { sky: Sky; size?: number; color?: string }) {
  const sun = <><Circle cx="19" cy="17" r="6.5" fill="none" stroke={color} strokeWidth={1.8} /><Path d="M19 5.5v2.5M7.5 17H10M10.9 8.9l1.8 1.8M27.1 8.9l-1.8 1.8M30.5 17H28" stroke={color} strokeWidth={1.8} strokeLinecap="round" /></>;
  const cloud = <Path d="M15 40h20a6.5 6.5 0 0 0 .4-13 9 9 0 0 0-17.2 2.6A5.2 5.2 0 0 0 15 40z" fill={colors.white} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />;
  const bigSun = <><Circle cx="24" cy="24" r="8.5" fill={colors.white} stroke={color} strokeWidth={1.8} /><Path d="M24 7v4M24 37v4M7 24h4M37 24h4M12 12l2.8 2.8M33.2 33.2L36 36M12 36l2.8-2.8M33.2 14.8L36 12" stroke={color} strokeWidth={1.8} strokeLinecap="round" /></>;
  const bigCloud = <Path d="M12 34h24a8 8 0 0 0 .5-16 11 11 0 0 0-21 3.2A6.4 6.4 0 0 0 12 34z" fill={colors.white} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />;
  const drops = <Path d="M17 38l-2 5M25 38l-2 5M33 38l-2 5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />;
  const flakes = <Path d="M17 40v4M15 42h4M25 40v4M23 42h4M33 40v4M31 42h4" stroke={color} strokeWidth={1.6} strokeLinecap="round" />;
  let body;
  if (sky === '맑음') body = bigSun;
  else if (sky === '구름 조금') body = <>{sun}{cloud}</>;
  else if (sky === '비' || sky === '소나기') body = <>{bigCloud}{drops}</>;
  else if (sky === '눈') body = <>{bigCloud}{flakes}</>;
  else if (sky === '비/눈') body = <>{bigCloud}<Path d="M17 38l-2 5M33 38l-2 5M25 40v4M23 42h4" stroke={color} strokeWidth={1.7} strokeLinecap="round" /></>;
  else body = bigCloud;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {body}
    </Svg>
  );
}

const styles = StyleSheet.create({
  badge: {
    height: 26,
    paddingHorizontal: 9,
    borderRadius: 7,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  badgeSmall: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  badgeTextSmall: {
    fontSize: 11,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendTitle: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
