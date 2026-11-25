// 추구미 제안 말풍선(11/24 팀 결정 2번): 추구미가 아닌 스타일의 사진을 저장하면
// "○○도 추구미로 저장할까요?"를 띄운다. 넣으면 잠깐 "추구미에 ○○를 넣었어요"를 보여 준다.
// 추구미가 이미 3개면 마이의 '다시 고르기'(onboarding/taste?replay=1)로 보낸다. ×로 닫으면 그 스타일은 다시 묻지 않는다.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { HintBubble } from '@/components/HintBubble';
import { errorMessage } from '@/data/api';
import type { Style } from '@/data/catalog';
import { track } from '@/data/events';
import { useSession } from '@/data/session';
import { addTaste, declineTaste, tasteSuggestionText, withEulReul } from '@/data/tasteSuggest';
import { colors, fonts } from '@/theme';

const NOTE_MS = 3500;

export function TasteSuggestBubble({ style, onDone, bubbleStyle, noteStyle }: {
  style: Style | null;
  onDone: () => void;
  bubbleStyle?: StyleProp<ViewStyle>;
  noteStyle?: StyleProp<ViewStyle>;
}) {
  const taste = useSession()?.styles ?? [];
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (note === null) return;
    const timer = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(timer);
  }, [note]);

  if (style === null) {
    return note === null ? null : <Text style={[styles.note, noteStyle]}>{note}</Text>;
  }
  const suggestion = tasteSuggestionText(style, taste);

  async function accept(picked: Style) {
    onDone();
    if (suggestion.full) {
      router.push('/onboarding/taste?replay=1');
      return;
    }
    try {
      if (await addTaste(picked)) {
        track('taste_select', { style: picked, source: 'save_bubble' });
        setNote(`추구미에 ${withEulReul(picked)} 넣었어요. 피드 순서도 같이 바뀌어요`);
      }
    } catch (error) {
      setNote(errorMessage(error));
    }
  }

  return (
    <HintBubble
      id="taste_suggest"
      remember={false}
      text={suggestion.text}
      actionLabel={suggestion.action}
      tail="none"
      onPress={() => void accept(style)}
      onClose={() => {
        declineTaste(style);
        onDone();
      }}
      style={bubbleStyle}
    />
  );
}

const styles = StyleSheet.create({
  note: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textPurple,
  },
});
