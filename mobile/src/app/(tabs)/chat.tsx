import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import type { ElementRef } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import { errorMessage, postChat } from '@/data/api';
import { actionTarget, chatClock, safeProductUrl, validChatAction } from '@/data/chatActions';
import { track } from '@/data/events';
import { markHintDone } from '@/data/hints';
import { webNotificationSupport } from '@/data/notificationCore';
import { trackScheduleResult } from '@/data/reminder';
import { useSession } from '@/data/session';
import { loadArchive, useArchiveState } from '@/data/store';
import type { ArchiveImage, ChatAction, ChatStyleResult, Product } from '@/data/types';
import { scheduleRecommendationNotification } from '@/data/webNotifications';
import { colors, fonts, layout } from '@/theme';

type Message = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  products: Product[];
  actions: ChatAction[];
  results: ChatStyleResult[];
  requestId: string | null;
  intent: string;
};

// 빈 대화 화면에 보여 주는 예시 질문. 누르면 그대로 보낸다(동료 피드백: 무엇을 물을 수 있는지 알기 어려움).
const EXAMPLE_QUESTIONS = [
  { question: '오늘 뭐 입을까?', help: '오늘의 날씨와 내 옷장에 맞는 추천으로 이동해요' },
  { question: '내 옷으로 입을 수 있는 코디 찾아줘.', help: '실제 피드 코디를 내 옷장과 비교해요' },
  { question: '요즘 입기 좋은 미니멀 코디 보여줘.', help: '옷장 없이도 피드에서 찾을 수 있어요' },
  { question: '전에 저장한 코디를 활용하고 싶어.', help: '저장한 코디와 비교 화면을 찾아요' },
  { question: '비슷한 상품을 찾아줘.', help: '사진이나 옷 조건으로 검증된 검색 링크를 열어요' },
] as const;

export default function ChatScreen() {
  const archive = useArchiveState();
  const session = useSession();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [notificationSupported] = useState(() => webNotificationSupport().supported);
  const nextMessageId = useRef(1);
  const requestSerial = useRef(0);
  const scrollRef = useRef<ElementRef<typeof ScrollView>>(null);
  const inputStarted = useRef(false);

  // 비교 결과의 '챗봇에 물어보기'로 오면(image=사진 ID) 그 사진을 고른 채로 연다. 방금 저장한 사진일 수 있어 새로 받는다.
  const { image } = useLocalSearchParams<{ image?: string }>();
  const requestedImage = typeof image === 'string' && image !== '' ? image : null;
  const openedImage = useRef<string | null>(null);
  useEffect(() => {
    if (requestedImage === null || requestedImage === openedImage.current) return undefined;
    openedImage.current = requestedImage;
    requestSerial.current += 1;
    const timer = setTimeout(() => {
      setSelectedId(requestedImage);
      setShowPicker(false);
      setMessages([]);
      void loadArchive({ force: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [requestedImage]);

  useFocusEffect(useCallback(() => {
    loadArchive();
  }, []));

  useEffect(() => {
    if (archive.status === 'ready' && archive.data.length === 0) track('chat_no_saved');
  }, [archive.status, archive.data.length]);

  const selected = archive.data.find((entry) => entry.id === selectedId) ?? null;
  const visibleMessages = messages;
  const examples = useMemo(() => notificationSupported
    ? [...EXAMPLE_QUESTIONS, { question: '매일 아침 코디를 추천받고 싶어.', help: '지원되는 브라우저에서 매일 알림을 설정해요' }]
    : [...EXAMPLE_QUESTIONS], [notificationSupported]);

  // preset: 빈 대화 화면의 예시 질문 버튼을 눌렀을 때 그 문장을 바로 보낸다.
  async function send(preset?: string) {
    const text = (preset ?? input).trim();
    if (text.length === 0 || sending) return;
    const serial = ++requestSerial.current;
    const contextId = selected?.id ?? null;
    setInput('');
    setSendError(null);
    const history = visibleMessages.slice(-8).map((message) => ({
      role: message.role,
      content: message.text,
    }));
    const userMessage: Message = {
      id: nextMessageId.current++,
      role: 'user',
      text,
      products: [],
      actions: [],
      results: [],
      requestId: null,
      intent: '',
    };
    setMessages((current) => [...current, userMessage]);
    setSending(true);
    const startedAt = chatClock();
    inputStarted.current = false;
    // 질문 내용은 남기지 않고, 어느 사진에 몇 번째 질문인지만 남긴다.
    const eventContext = { style_image_id: contextId, turn: history.filter((message) => message.role === 'user').length + 1 };
    track('chat_send', eventContext);
    track('chat_message_sent', eventContext);
    markHintDone('result_chat');
    try {
      const result = await postChat(contextId, text, history);
      if (serial !== requestSerial.current) return;
      const actions = (result.actions ?? []).filter(validChatAction)
        .filter((action) => action.type !== 'OFFER_DAILY_REMINDER' || notificationSupported);
      const intent = result.intents?.[0] ?? 'out_of_scope';
      setMessages((current) => [...current, {
        id: nextMessageId.current++,
        role: 'assistant',
        text: result.answer,
        products: result.products,
        actions,
        results: result.results ?? [],
        requestId: result.request_id ?? null,
        intent,
      }]);
      const common = { request_id: result.request_id ?? null, intent, latency_ms: chatClock() - startedAt };
      track('chat_intent_classified', common);
      track('chat_response_done', { ...common, product_count: result.products.length });
      track('chat_response_received', { ...common, result_count: result.results?.length ?? 0 });
      if ((result.results?.length ?? 0) > 0) track('chat_result_impression', { ...common, result_count: result.results?.length ?? 0 });
      actions.forEach((action) => track('chat_action_impression', { ...common, action_id: action.action_id, action_type: action.type, target_screen: actionTarget(action) }));
    } catch (error) {
      const message = errorMessage(error);
      track('chat_response_failed', { latency_ms: chatClock() - startedAt, error_code: message });
      track('error_shown', { screen: 'chat', error_code: message });
      if (serial === requestSerial.current) setSendError(message);
    } finally {
      if (serial === requestSerial.current) setSending(false);
    }
  }

  function sendInput() {
    void send();
  }

  function sendPreset(question: string) {
    void send(question);
  }

  function changeContext(next: string | null) {
    requestSerial.current += 1;
    setSelectedId(next);
    setShowPicker(false);
    setMessages([]);
    setSending(false);
    setSendError(null);
    setActionMessage(null);
  }

  async function runAction(action: ChatAction, requestId: string | null, intent: string) {
    if (actionBusy !== null) return;
    const common = {
      action_id: action.action_id,
      request_id: requestId,
      intent,
      action_type: action.type,
      source_screen: 'chat',
      target_screen: actionTarget(action),
    };
    track('chat_action_clicked', common);
    setActionMessage(null);
    try {
      if (action.type === 'OFFER_DAILY_REMINDER') {
        if (session === null || !notificationSupported) throw new Error('notification_unsupported');
        setActionBusy(action.action_id);
        track('chat_reminder_accepted', common);
        const result = await scheduleRecommendationNotification(session.userId, 'chat-daily-outfit', new Date());
        trackScheduleResult(result);
        if (!result.ok) throw new Error(result.reason);
        track('chat_reminder_scheduled', { ...common, scheduled_for: result.value.scheduledFor });
        track('chat_action_completed', { ...common, success: true });
        setActionMessage('내일부터 매일 이 시간에 알려 드릴게요. 마이 탭에서 시간 변경과 끄기가 가능해요.');
        return;
      }
      if (action.type === 'OPEN_PRODUCT_SEARCH') {
        const url = safeProductUrl(action.params.url);
        if (url === null) throw new Error('invalid_product_url');
        await WebBrowser.openBrowserAsync(url);
        track('chat_action_navigation_success', common);
        track('chat_action_completed', { ...common, success: true });
        return;
      }
      navigateAction(action);
      track('chat_action_navigation_success', common);
    } catch (error) {
      track('chat_action_failed', {
        ...common,
        success: false,
        failure_reason: error instanceof Error ? error.message : 'action_failed',
      });
      setActionMessage('이동하거나 알림을 설정하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setActionBusy(null);
    }
  }

  function navigateAction(action: ChatAction) {
    const attribution = { action_id: action.action_id, chat_action_type: action.type };
    if (action.type === 'OPEN_RECOMMENDATION') router.push({ pathname: '/recommend', params: attribution });
    else if (action.type === 'OPEN_FILTERED_FEED') router.push({ pathname: '/search/results', params: { ...attribution, styles: action.params.styles?.join(','), kind: action.params.kind ?? undefined, color: action.params.color ?? undefined } });
    else if (action.type === 'OPEN_STYLE_DETAIL' && action.params.style_image_id) router.push({ pathname: '/style/[id]', params: { ...attribution, id: action.params.style_image_id } });
    else if (action.type === 'OPEN_COMPARISON' && action.params.style_image_id) router.push({ pathname: '/result/[id]', params: { ...attribution, id: action.params.style_image_id } });
    else if (action.type === 'OPEN_WARDROBE') router.push('/closet');
    else if (action.type === 'OPEN_PHOTO_ADD') router.push({ pathname: '/add-item/photo-crop', params: attribution });
    else if (action.type === 'OPEN_ARCHIVE') router.push('/saved');
    else if (action.type === 'OPEN_WARDROBE_ADD') {
      if (action.params.slot && action.params.kind) {
        router.push({ pathname: '/add-item/color-fit', params: { ...attribution, slot: action.params.slot, kind: action.params.kind, color: action.params.color ?? undefined, from: 'chat' } });
      } else {
        router.push({ pathname: '/add-item/kind', params: { ...attribution, slot: action.params.slot ?? undefined } });
      }
    } else throw new Error('unsupported_action');
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
          <Text style={styles.subtitle}>원하는 코디와 다음 행동을 빠르게 찾아 드려요</Text>
        </View>

        {selected !== null ? (
            <SelectedImage
              image={selected}
              onChange={() => {
                track('chat_picker_open', { style_image_id: selected.id });
                setShowPicker((current) => !current);
              }}
              onClear={() => changeContext(null)}
            />
        ) : (
          <View style={styles.contextEmpty}>
            <Text style={styles.contextHint}>사진 없이 질문 중</Text>
            {archive.data.length > 0 && (
              <Pressable
                onPress={() => {
                  track('chat_picker_open', { style_image_id: null });
                  setShowPicker((current) => !current);
                }}
                accessibilityRole="button"
                style={styles.contextButton}>
                <Text style={styles.contextButtonText}>저장 사진 추가</Text>
              </Pressable>
            )}
          </View>
        )}
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
                      changeContext(image.id);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: image.id === selected?.id }}
                    style={[styles.pickerImage, image.id === selected?.id && styles.pickerImageSelected]}>
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
              {visibleMessages.length === 0 && (
                <View style={styles.emptyChat}>
                  <Text style={styles.welcomeTitle}>오늘은 어떤 도움이 필요하세요?</Text>
                  <Text style={styles.emptyChatText}>내 옷장과 취향을 바탕으로 원하는 코디를 찾을 수 있도록 도와드릴게요.</Text>
                  {/* 11/27: 큰 카드 6개가 화면을 꽉 채워 답답해서, 질문만 담은 작은 버튼으로 모아 둔다(설명은 읽어 주기용으로만). */}
                  <View style={styles.examples}>
                    {examples.map((example) => (
                      <Pressable
                        key={example.question}
                        onPress={() => sendPreset(example.question)}
                        disabled={sending}
                        accessibilityRole="button"
                        accessibilityHint={example.help}
                        style={styles.example}>
                        <Text style={styles.exampleQuestion} numberOfLines={1}>{example.question.replace(/\.$/, '')}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
              {visibleMessages.map((message) => (
                <ChatBubble
                  key={message.id}
                  message={message}
                  busy={actionBusy}
                  onAction={(action) => void runAction(action, message.requestId, message.intent)}
                />
              ))}
              {sending && (
                <View style={styles.assistantRow}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>o.</Text></View>
                  <View style={styles.loadingBubble}><ActivityIndicator size="small" color={colors.textPurple} /></View>
                </View>
              )}
        </ScrollView>

        {sendError !== null && <Text style={styles.error}>{sendError}</Text>}
        {actionMessage !== null && <Text style={styles.actionMessage}>{actionMessage}</Text>}
        <View style={styles.composer}>
              <TextInput
                value={input}
                onChangeText={(text) => {
                  if (!inputStarted.current && text.length > 0) {
                    inputStarted.current = true;
                    track('chat_input_start', { style_image_id: selected?.id ?? null });
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SelectedImage({ image, onChange, onClear }: { image: ArchiveImage; onChange: () => void; onClear: () => void }) {
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
      <Pressable onPress={onClear} accessibilityRole="button" style={styles.clearButton}>
        <Text style={styles.clearButtonText}>해제</Text>
      </Pressable>
    </View>
  );
}

function ChatBubble({ message, busy, onAction }: { message: Message; busy: string | null; onAction: (action: ChatAction) => void }) {
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
          {message.products.length > 0 && !message.actions.some((action) => action.type === 'OPEN_PRODUCT_SEARCH') && (
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
        {message.results.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.resultList}>
            {message.results.map((result) => <ResultCard key={result.style_image_id} result={result} />)}
          </ScrollView>
        )}
        {message.actions.length > 0 && (
          <View style={styles.actions}>
            {message.actions.map((action) => (
              <Pressable
                key={action.action_id}
                onPress={() => onAction(action)}
                disabled={busy !== null}
                accessibilityRole="button"
                style={[styles.action, busy === action.action_id && styles.actionBusy]}>
                {busy === action.action_id
                  ? <ActivityIndicator size="small" color={colors.textPurple} />
                  : <Text style={styles.actionText}>{action.label}</Text>}
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function ResultCard({ result }: { result: ChatStyleResult }) {
  return (
    <View style={styles.resultCard}>
      <Image source={{ uri: result.thumbnail_url, cacheKey: result.style_image_id }} style={styles.resultImage} contentFit="cover" />
      <Text style={styles.resultStyle} numberOfLines={1}>{result.style.join(' · ')}</Text>
      {result.total_item_count > 0 && (
        <Text style={styles.resultMeta}>
          활용 {result.usable_item_count}/{result.total_item_count}
          {result.similar_item_count > 0 ? ` · 비슷함 ${result.similar_item_count}` : ''}
        </Text>
      )}
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
  clearButton: { height: 34, paddingHorizontal: 8, justifyContent: 'center' },
  clearButtonText: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  contextEmpty: { marginHorizontal: layout.screenPaddingX, marginBottom: 6, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 16, backgroundColor: colors.white },
  contextHint: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  contextButton: { paddingVertical: 8, paddingHorizontal: 10 },
  contextButtonText: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },
  picker: { maxHeight: 76, marginTop: 8 },
  pickerContent: { gap: 6, paddingHorizontal: layout.screenPaddingX },
  pickerImage: { width: 52, height: 66, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  pickerImageSelected: { borderColor: colors.purpleStrong },
  messages: { flex: 1 },
  messagesContent: { flexGrow: 1, gap: 14, padding: 18, paddingBottom: 8 },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 24 },
  welcomeTitle: { textAlign: 'center', fontFamily: fonts.extraBold, fontSize: 20, color: colors.text },
  emptyChatTitle: { textAlign: 'center', fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  emptyChatText: { textAlign: 'center', fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.textSecondary },
  examples: { alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 18 },
  example: { height: 38, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 19, backgroundColor: colors.white, justifyContent: 'center' },
  exampleQuestion: { fontFamily: fonts.bold, fontSize: 13, color: colors.textPurple },
  userRow: { alignItems: 'flex-end' },
  userBubble: { maxWidth: 270, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 20, borderBottomRightRadius: 6, backgroundColor: colors.purpleFill },
  bubbleText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.onPurpleFill },
  assistantRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  avatar: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.purpleFill },
  avatarText: { fontFamily: fonts.extraBold, fontSize: 15, color: colors.onPurpleFill },
  assistantContent: { flex: 1, alignItems: 'stretch', gap: 6 },
  assistantName: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  assistantBubble: { maxWidth: 275, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 20, borderBottomLeftRadius: 6, backgroundColor: colors.white },
  assistantText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.text },
  loadingBubble: { height: 42, minWidth: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.white },
  productLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  productLink: { height: 32, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: colors.background },
  productLinkText: { fontFamily: fonts.bold, fontSize: 12, color: colors.textPurple },
  resultList: { gap: 8, paddingVertical: 2 },
  resultCard: { width: 150, padding: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.white },
  resultImage: { width: 132, height: 150, borderRadius: 10, backgroundColor: colors.photoPlaceholder },
  resultStyle: { marginTop: 7, fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  resultMeta: { marginTop: 3, fontFamily: fonts.regular, fontSize: 11, color: colors.textSecondary },
  actions: { gap: 7 },
  action: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.purpleTint },
  actionBusy: { opacity: 0.7 },
  actionText: { fontFamily: fonts.bold, fontSize: 14, color: colors.textPurple },
  error: { marginHorizontal: layout.screenPaddingX, marginBottom: 4, fontFamily: fonts.regular, fontSize: 12, color: '#A23B3B' },
  actionMessage: { marginHorizontal: layout.screenPaddingX, marginBottom: 4, fontFamily: fonts.medium, fontSize: 12, color: colors.textPurple },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  input: { flex: 1, height: 44, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 16, backgroundColor: colors.white, fontFamily: fonts.regular, fontSize: 16, color: colors.text },
  sendButton: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.purpleFill },
  sendButtonDisabled: { opacity: 0.5 },
  sendText: { marginTop: -3, fontFamily: fonts.bold, fontSize: 25, color: colors.onPurpleFill },
  noArchive: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
});
