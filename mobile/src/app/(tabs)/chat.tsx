import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import type { ElementRef } from 'react';
import { useCallback, useRef, useState } from 'react';
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

import { SmallWhiteButton } from '@/components/ui';
import { errorMessage, postChat } from '@/data/api';
import { loadArchive, useArchiveState } from '@/data/store';
import type { ArchiveImage, Product } from '@/data/types';
import { colors, fonts, layout } from '@/theme';

type Message = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  products: Product[];
};

export default function ChatScreen() {
  const archive = useArchiveState();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationImageId, setConversationImageId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const nextMessageId = useRef(1);
  const scrollRef = useRef<ElementRef<typeof ScrollView>>(null);

  useFocusEffect(useCallback(() => {
    loadArchive();
  }, []));

  const selected = archive.data.find((image) => image.id === selectedId) ?? archive.data[0] ?? null;
  const visibleMessages = selected?.id === conversationImageId ? messages : [];

  async function send() {
    const text = input.trim();
    if (selected === null || text.length === 0 || sending) return;
    setInput('');
    setSendError(null);
    const userMessage: Message = {
      id: nextMessageId.current++,
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
    try {
      const result = await postChat(selected.id, text);
      setMessages((current) => [...current, {
        id: nextMessageId.current++,
        role: 'assistant',
        text: result.answer,
        products: result.products,
      }]);
    } catch (error) {
      setSendError(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={76}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">챗봇</Text>
        <Text style={styles.subtitle}>저장한 사진을 골라 이어서 물어봐요</Text>
      </View>

      {selected !== null ? (
        <>
          <SelectedImage image={selected} onChange={() => setShowPicker((current) => !current)} />
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
                    setSelectedId(image.id);
                    setShowPicker(false);
                    setMessages([]);
                    setConversationImageId(null);
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
            {visibleMessages.length === 0 && (
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatTitle}>이 사진에서 궁금한 걸 물어보세요</Text>
                <Text style={styles.emptyChatText}>“내 옷장에서 뭐 입어?” 또는 “비슷한 상품 찾아줘”처럼 물을 수 있어요.</Text>
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
              onChangeText={setInput}
              onSubmitEditing={send}
              placeholder="메시지 입력"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="send"
              editable={!sending}
              style={styles.input}
              accessibilityLabel="챗봇 메시지"
            />
            <Pressable
              onPress={send}
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
              <SmallWhiteButton label="피드로 가기" onPress={() => router.navigate('/')} />
            </>
          )}
        </View>
      )}
    </KeyboardAvoidingView>
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
                  onPress={() => WebBrowser.openBrowserAsync(product.url)}
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
  header: { paddingTop: 28, paddingBottom: 12, paddingHorizontal: layout.screenPaddingX },
  title: { fontFamily: fonts.extraBold, fontSize: 24, letterSpacing: -0.4, color: colors.text },
  subtitle: { marginTop: 4, fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  selectedCard: { marginHorizontal: layout.screenPaddingX, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 18, backgroundColor: '#FBF9FE' },
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
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 24 },
  emptyChatTitle: { textAlign: 'center', fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  emptyChatText: { textAlign: 'center', fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.textSecondary },
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
  input: { flex: 1, height: 44, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 16, backgroundColor: '#FBF9FE', fontFamily: fonts.regular, fontSize: 15, color: colors.text },
  sendButton: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.purpleFill },
  sendButtonDisabled: { opacity: 0.5 },
  sendText: { marginTop: -3, fontFamily: fonts.bold, fontSize: 25, color: colors.onPurpleFill },
  noArchive: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
});
