import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import type { ElementRef } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SmallWhiteButton } from '@/components/ui';
import { CHAT_HISTORY_ENABLED, deleteChatHistory, errorMessage, fetchChatHistory, postChat } from '@/data/api';
import { track } from '@/data/events';
import { markHintDone } from '@/data/hints';
import { loadArchive, useArchiveState } from '@/data/store';
import type { ArchiveImage, Product } from '@/data/types';
import { colors, fonts, layout } from '@/theme';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  products: Product[];
};

// 빈 대화 화면에 보여 주는 예시 질문. 누르면 그대로 보낸다(동료 피드백: 무엇을 물을 수 있는지 알기 어려움).
const EXAMPLE_QUESTIONS = [
  { question: '내 옷장에서 뭐 입어?', help: '이 코디와 비슷하게 입을 내 옷을 골라 줘요' },
  { question: '비슷한 상품 찾아줘', help: '사진 속 옷과 비슷한 상품 검색 링크를 줘요' },
] as const;

export default function ChatScreen() {
  const archive = useArchiveState();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationImageId, setConversationImageId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const nextMessageId = useRef(1);
  const scrollRef = useRef<ElementRef<typeof ScrollView>>(null);
  const inputStarted = useRef(false);

  // 비교 결과의 '챗봇에 물어보기'로 오면(image=사진 ID) 그 사진을 고른 채로 연다. 방금 저장한 사진일 수 있어 새로 받는다.
  const { image } = useLocalSearchParams<{ image?: string }>();
  const requestedImage = typeof image === 'string' && image !== '' ? image : null;
  const [openedImage, setOpenedImage] = useState<string | null>(null);
  if (requestedImage !== null && requestedImage !== openedImage) {
    setOpenedImage(requestedImage);
    setSelectedId(requestedImage);
    setShowPicker(false);
  }
  useEffect(() => {
    if (requestedImage !== null) void loadArchive({ force: true });
  }, [requestedImage]);

  useFocusEffect(useCallback(() => {
    loadArchive();
  }, []));

  useEffect(() => {
    if (archive.status === 'ready' && archive.data.length === 0) track('chat_no_saved');
  }, [archive.status, archive.data.length]);

  const selected = archive.data.find((image) => image.id === selectedId) ?? archive.data[0] ?? null;
  const activeImageId = useRef<string | null>(null);
  const visibleMessages = selected?.id === conversationImageId ? messages : [];

  useEffect(() => {
    activeImageId.current = selected?.id ?? null;
  }, [selected?.id]);

  useEffect(() => {
    const styleImageId = selected?.id;
    if (!CHAT_HISTORY_ENABLED || styleImageId === undefined) return;
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const history = await fetchChatHistory(styleImageId);
        if (cancelled) return;
        setConversationImageId(styleImageId);
        setMessages(history.messages.map((message) => ({
          id: message.id,
          role: message.role,
          text: message.content,
          products: message.products,
        })));
        setNextBefore(history.next_before);
      } catch (error) {
        if (cancelled) return;
        setConversationImageId(styleImageId);
        setMessages([]);
        setNextBefore(null);
        setHistoryError(errorMessage(error));
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  async function loadEarlier() {
    if (selected === null || nextBefore === null || historyLoading) return;
    const styleImageId = selected.id;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const history = await fetchChatHistory(styleImageId, nextBefore);
      if (activeImageId.current !== styleImageId) return;
      setMessages((current) => [
        ...history.messages.map((message) => ({
          id: message.id,
          role: message.role,
          text: message.content,
          products: message.products,
        })),
        ...current,
      ]);
      setNextBefore(history.next_before);
    } catch (error) {
      if (activeImageId.current === styleImageId) setHistoryError(errorMessage(error));
    } finally {
      if (activeImageId.current === styleImageId) setHistoryLoading(false);
    }
  }

  function confirmDeleteHistory() {
    if (selected === null || deleting) return;
    const styleImageId = selected.id;
    const deleteSelectedHistory = () => {
      setDeleting(true);
      setHistoryError(null);
      void deleteChatHistory(styleImageId)
        .then(() => {
          if (activeImageId.current !== styleImageId) return;
          setMessages([]);
          setConversationImageId(styleImageId);
          setNextBefore(null);
        })
        .catch((error) => setHistoryError(errorMessage(error)))
        .finally(() => setDeleting(false));
    };
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('이 사진의 대화를 지울까요? 삭제한 대화는 복구할 수 없어요.')) {
        deleteSelectedHistory();
      }
      return;
    }
    Alert.alert('이 사진의 대화를 지울까요?', '삭제한 대화는 복구할 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: deleteSelectedHistory,
      },
    ]);
  }

  // preset: 빈 대화 화면의 예시 질문 버튼을 눌렀을 때 그 문장을 바로 보낸다.
  async function send(preset?: string) {
    const text = (preset ?? input).trim();
    if (selected === null || text.length === 0 || sending) return;
    const styleImageId = selected.id;
    setInput('');
    setSendError(null);
    const history = visibleMessages.slice(-8).map((message) => ({
      role: message.role,
      content: message.text,
    }));
    const userMessage: Message = {
      id: `local-user-${nextMessageId.current++}`,
      role: 'user',
      text,
      products: [],
    };
    if (conversationImageId === selected.id) {
      setMessages((current) => [...current, userMessage]);
    } else {
      setConversationImageId(selected.id);
      setMessages([userMessage]);
    }
    setSending(true);
    const startedAt = Date.now();
    inputStarted.current = false;
    // 질문 내용은 남기지 않고, 어느 사진에 몇 번째 질문인지만 남긴다.
    track('chat_send', { style_image_id: styleImageId, turn: history.filter((message) => message.role === 'user').length + 1 });
    markHintDone('result_chat');
    try {
      const result = await postChat(styleImageId, text, history);
      if (activeImageId.current !== styleImageId) return;
      setMessages((current) => [...current, {
        id: `local-assistant-${nextMessageId.current++}`,
        role: 'assistant',
        text: result.answer,
        products: result.products,
      }]);
      track('chat_response_done', { latency_ms: Date.now() - startedAt, product_count: result.products.length });
    } catch (error) {
      const message = errorMessage(error);
      track('chat_response_failed', { latency_ms: Date.now() - startedAt, error_code: message });
      track('error_shown', { screen: 'chat', error_code: message });
      if (activeImageId.current === styleImageId) setSendError(message);
    } finally {
      setSending(false);
    }
  }

  function sendInput() {
    void send();
  }

  function sendPreset(question: string) {
    void send(question);
  }

  // 폰 위쪽 상태 표시줄(시간·배터리)과 제목이 겹치지 않게 다른 탭처럼 안전 영역 안에 그린다.
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={76}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title} accessibilityRole="header">챗봇</Text>
            <View style={styles.betaBadge}><Text style={styles.betaText}>베타</Text></View>
          </View>
          <Text style={styles.subtitle}>저장한 사진을 골라 이어서 물어봐요</Text>
        </View>

        {selected !== null ? (
          <>
            <SelectedImage
              image={selected}
              onChange={() => {
                track('chat_picker_open', { style_image_id: selected.id });
                setShowPicker((current) => !current);
              }}
            />
            {showPicker && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pickerContent}
                style={styles.picker}>
                {archive.data.map((image) => (
                  <Pressable
                    key={image.id}
                    onPress={() => {
                      track('chat_image_select', { style_image_id: image.id });
                      setSelectedId(image.id);
                      setShowPicker(false);
                      setMessages([]);
                      setConversationImageId(null);
                      setNextBefore(null);
                      setHistoryError(null);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: image.id === selected.id }}
                    style={[styles.pickerImage, image.id === selected.id && styles.pickerImageSelected]}>
                    <Image
                      source={{ uri: image.thumbnail_url, cacheKey: image.id }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <ScrollView
              ref={scrollRef}
              style={styles.messages}
              contentContainerStyle={styles.messagesContent}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
              {CHAT_HISTORY_ENABLED && (historyLoading || historyError !== null || visibleMessages.length > 0) && (
                <View style={styles.historyActions}>
                  {nextBefore !== null && (
                    <Pressable onPress={() => void loadEarlier()} disabled={historyLoading} accessibilityRole="button">
                      <Text style={styles.historyActionText}>이전 대화 더 보기</Text>
                    </Pressable>
                  )}
                  {visibleMessages.length > 0 && (
                    <Pressable onPress={confirmDeleteHistory} disabled={deleting} accessibilityRole="button">
                      <Text style={styles.deleteHistoryText}>{deleting ? '삭제 중…' : '대화 삭제'}</Text>
                    </Pressable>
                  )}
                  {historyLoading && <ActivityIndicator size="small" color={colors.textPurple} />}
                </View>
              )}
              {historyError !== null && <Text style={styles.error}>{historyError}</Text>}
              {!historyLoading && visibleMessages.length === 0 && (
                <View style={styles.emptyChat}>
                  <Text style={styles.emptyChatTitle}>이 사진에서 궁금한 걸 물어보세요</Text>
                  <Text style={styles.emptyChatText}>
                    저장한 사진 속 옷과 내 옷장에 등록한 옷을 바탕으로 답해요.{'\n'}그 밖의 옷이나 사이즈는 아직 답하기 어려워요.
                  </Text>
                  <ExampleQuestions onPick={sendPreset} disabled={sending} />
                </View>
              )}
              {visibleMessages.map((message) => <ChatBubble key={message.id} message={message} />)}
              {sending && (
                <View style={styles.assistantRow}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>o.</Text></View>
                  <View style={styles.loadingBubble}><ActivityIndicator size="small" color={colors.textPurple} /></View>
                </View>
              )}
            </ScrollView>

            {sendError !== null && <Text style={styles.error}>{sendError}</Text>}
            <View style={styles.composer}>
              <TextInput
                value={input}
                onChangeText={(text) => {
                  if (!inputStarted.current && text.length > 0) {
                    inputStarted.current = true;
                    track('chat_input_start', { style_image_id: selected.id });
                  }
                  setInput(text);
                }}
                onSubmitEditing={sendInput}
                placeholder="메시지 입력"
                placeholderTextColor={colors.textSecondary}
                returnKeyType="send"
                editable={!sending}
                style={styles.input}
                accessibilityLabel="챗봇 메시지"
              />
              <Pressable
                onPress={sendInput}
                disabled={sending || input.trim().length === 0}
                accessibilityRole="button"
                accessibilityLabel="보내기"
                style={[styles.sendButton, (sending || input.trim().length === 0) && styles.sendButtonDisabled]}>
                <Text style={styles.sendText}>↑</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.noArchive}>
            {archive.status === 'loading' || archive.status === 'idle' ? (
              <ActivityIndicator color={colors.textPurple} />
            ) : (
              <>
                <Text style={styles.emptyChatTitle}>먼저 마음에 드는 사진을 저장해 주세요</Text>
                <Text style={styles.emptyChatText}>{archive.error ?? '저장한 사진을 골라야 대화를 시작할 수 있어요.'}</Text>
                <SmallWhiteButton
                  label="피드로 가기"
                  onPress={() => {
                    track('chat_go_feed_click');
                    router.navigate('/');
                  }}
                />
              </>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ExampleQuestions({ onPick, disabled }: { onPick: (question: string) => void; disabled: boolean }) {
  return (
    <View style={styles.examples}>
      {EXAMPLE_QUESTIONS.map((example) => (
        <Pressable
          key={example.question}
          onPress={() => onPick(example.question)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={example.question}
          style={styles.example}>
          <Text style={styles.exampleQuestion}>{example.question}</Text>
          <Text style={styles.exampleHelp}>{example.help}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function SelectedImage({ image, onChange }: { image: ArchiveImage; onChange: () => void }) {
  return (
    <View style={styles.selectedCard}>
      <Image source={{ uri: image.thumbnail_url, cacheKey: image.id }} style={styles.selectedThumb} contentFit="cover" />
      <View style={styles.selectedText}>
        <Text style={styles.selectedLabel}>이 사진에 대해 묻는 중</Text>
        <Text style={styles.selectedTitle} numberOfLines={1}>
          {image.season_year} {image.season} · {image.style.join('·')}
        </Text>
      </View>
      <Pressable onPress={onChange} accessibilityRole="button" style={styles.changeButton}>
        <Text style={styles.changeButtonText}>바꾸기</Text>
      </Pressable>
    </View>
  );
}

function ChatBubble({ message }: { message: Message }) {
  if (message.role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}><Text style={styles.bubbleText}>{message.text}</Text></View>
      </View>
    );
  }
  return (
    <View style={styles.assistantRow}>
      <View style={styles.avatar}><Text style={styles.avatarText}>o.</Text></View>
      <View style={styles.assistantContent}>
        <Text style={styles.assistantName}>odit.</Text>
        <View style={styles.assistantBubble}>
          <Text style={styles.assistantText}>{message.text}</Text>
          {message.products.length > 0 && (
            <View style={styles.productLinks}>
              {message.products.map((product) => (
                <Pressable
                  key={`${product.item_id}-${product.platform}`}
                  onPress={() => {
                    track('shop_link_click', { place: 'chat', platform: product.platform, match_type: product.match_type });
                    void WebBrowser.openBrowserAsync(product.url);
                  }}
                  accessibilityRole="link"
                  style={styles.productLink}>
                  <Text style={styles.productLinkText}>{product.platform} ›</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { paddingTop: 28, paddingBottom: 12, paddingHorizontal: layout.screenPaddingX },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: fonts.extraBold, fontSize: 24, letterSpacing: -0.4, color: colors.text },
  betaBadge: { height: 22, paddingHorizontal: 8, borderRadius: 999, justifyContent: 'center', backgroundColor: colors.photoPlaceholder },
  betaText: { fontFamily: fonts.bold, fontSize: 11, color: colors.textPurple },
  subtitle: { marginTop: 4, fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  selectedCard: { marginHorizontal: layout.screenPaddingX, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 18, backgroundColor: colors.white },
  selectedThumb: { width: 38, height: 46, borderRadius: 10, backgroundColor: colors.line },
  selectedText: { flex: 1, minWidth: 0 },
  selectedLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  selectedTitle: { marginTop: 2, fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  changeButton: { height: 34, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: colors.photoPlaceholder },
  changeButtonText: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },
  picker: { maxHeight: 76, marginTop: 8 },
  pickerContent: { gap: 6, paddingHorizontal: layout.screenPaddingX },
  pickerImage: { width: 52, height: 66, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  pickerImageSelected: { borderColor: colors.purpleStrong },
  messages: { flex: 1 },
  messagesContent: { flexGrow: 1, gap: 14, padding: 18, paddingBottom: 8 },
  historyActions: { minHeight: 24, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 14 },
  historyActionText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textPurple },
  deleteHistoryText: { fontFamily: fonts.medium, fontSize: 12, color: colors.danger },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 24 },
  emptyChatTitle: { textAlign: 'center', fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  emptyChatText: { textAlign: 'center', fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.textSecondary },
  examples: { alignSelf: 'stretch', gap: 8, marginTop: 12 },
  example: { paddingVertical: 11, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.white },
  exampleQuestion: { fontFamily: fonts.bold, fontSize: 14, color: colors.textPurple },
  exampleHelp: { marginTop: 2, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  userRow: { alignItems: 'flex-end' },
  userBubble: { maxWidth: 270, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 20, borderBottomRightRadius: 6, backgroundColor: colors.purpleFill },
  bubbleText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.onPurpleFill },
  assistantRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  avatar: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.purpleFill },
  avatarText: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.onPurpleFill },
  assistantContent: { flex: 1, alignItems: 'flex-start', gap: 6 },
  assistantName: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  assistantBubble: { maxWidth: 275, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 20, borderBottomLeftRadius: 6, backgroundColor: colors.white },
  assistantText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.text },
  loadingBubble: { height: 42, minWidth: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.white },
  productLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  productLink: { height: 32, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: colors.background },
  productLinkText: { fontFamily: fonts.bold, fontSize: 12, color: colors.textPurple },
  error: { marginHorizontal: layout.screenPaddingX, marginBottom: 4, fontFamily: fonts.regular, fontSize: 12, color: '#A23B3B' },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  input: { flex: 1, height: 44, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 16, backgroundColor: colors.white, fontFamily: fonts.regular, fontSize: 16, color: colors.text },
  sendButton: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.purpleFill },
  sendButtonDisabled: { opacity: 0.5 },
  sendText: { marginTop: -3, fontFamily: fonts.bold, fontSize: 25, color: colors.onPurpleFill },
  noArchive: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
});
