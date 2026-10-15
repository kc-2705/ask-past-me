import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { countEntries, knownTagLabels, type Entry } from '@/db/database';
import { answerQuestion, suggestions } from '@/lib/askEngine';
import { useVoice } from '@/hooks/useVoice';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useApp } from '@/state/AppState';
import { EntryCard } from '@/components/EntryCard';
import { Card, Empty, styles, Txt } from '@/components/ui';

type Msg =
  | { id: number; role: 'me'; text: string }
  | { id: number; role: 'past'; text: string; sources: Entry[]; highlight: string[] };

export default function AskScreen() {
  const db = useSQLiteContext();
  const { theme: t, settings } = useApp();
  const insets = useSafeAreaInsets();
  const voice = useVoice({ lang: settings.lang, keepAudio: false, continuous: false });
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const nextId = useRef(1);

  const load = useCallback(async () => {
    const [topics, people, n] = await Promise.all([knownTagLabels(db, 'topic'), knownTagLabels(db, 'person'), countEntries(db)]);
    setIdeas(suggestions(topics, people));
    setTotal(n);
  }, [db]);

  useRefreshOnFocus(load);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      setInput('');
      setBusy(true);
      setMsgs((m) => [...m, { id: nextId.current++, role: 'me', text: q }]);
      try {
        const a = await answerQuestion(db, q, { birthday: settings.birthday || null });
        setMsgs((m) => [...m, { id: nextId.current++, role: 'past', text: a.text, sources: a.sources, highlight: a.highlight }]);
      } catch {
        setMsgs((m) => [...m, { id: nextId.current++, role: 'past', text: 'Something went wrong while searching. Try asking again.', sources: [], highlight: [] }]);
      } finally {
        setBusy(false);
        setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80);
      }
    },
    [db, busy, settings.birthday],
  );

  // A spoken question is sent as soon as listening ends.
  const { status: voiceStatus, finalText: voiceText, reset: resetVoice } = voice;
  const prev = useRef(voiceStatus);
  useEffect(() => {
    if (prev.current !== 'idle' && voiceStatus === 'idle' && voiceText.trim()) {
      ask(voiceText);
      resetVoice();
    }
    prev.current = voiceStatus;
  }, [voiceStatus, voiceText, ask, resetVoice]);

  const listening = voice.status !== 'idle';
  const bubbleRadius = t.tilt ? 6 : 20;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.colors.bg }}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <View style={{ paddingTop: insets.top + 18, paddingHorizontal: 20, gap: 2 }}>
        <Txt variant="display">Ask past me</Txt>
        <Txt variant="small" muted>Answers come only from your own notes, on this phone.</Txt>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ padding: 20, gap: 14, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        {msgs.length === 0 ? (
          total === 0 ? (
            <Empty
              icon="chatbubbles-outline"
              title="Nothing to ask about yet"
              body="Record a few notes on the Talk tab first. Or load sample memories from the Me tab to try it out."
            />
          ) : (
            <View style={{ gap: 12, paddingTop: 8 }}>
              <Txt variant="label" muted>Try asking</Txt>
              {ideas.map((q) => (
                <Pressable
                  key={q}
                  onPress={() => ask(q)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.row,
                    {
                      gap: 10,
                      backgroundColor: t.colors.surface,
                      borderRadius: t.radius.card,
                      borderWidth: 1,
                      borderColor: t.colors.line,
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Ionicons name="sparkles-outline" size={16} color={t.colors.accent} />
                  <Txt style={{ flex: 1 }}>{q}</Txt>
                </Pressable>
              ))}
            </View>
          )
        ) : null}

        {msgs.map((m) =>
          m.role === 'me' ? (
            <View
              key={m.id}
              style={{
                alignSelf: 'flex-end',
                maxWidth: '82%',
                backgroundColor: t.colors.accent,
                paddingHorizontal: 16,
                paddingVertical: 11,
                borderRadius: bubbleRadius,
                borderBottomRightRadius: 4,
              }}
            >
              <Text style={{ color: t.colors.onAccent, fontFamily: t.fonts.medium, fontSize: 15.5, lineHeight: 22 }}>{m.text}</Text>
            </View>
          ) : (
            <View key={m.id} style={{ alignSelf: 'stretch', gap: 10 }}>
              <Card tone={t.tilt ? 'note' : 'surface'} tilt={-0.8} style={{ borderBottomLeftRadius: 4 }}>
                <Text style={{ fontFamily: t.tilt ? t.fonts.display : t.fonts.bold, fontSize: t.tilt ? 22 : 12, color: t.tilt ? t.colors.accent : t.colors.accent2 }}>
                  {t.tilt ? 'Past you remembers…' : 'PAST YOU'}
                </Text>
                <Txt>{m.text}</Txt>
              </Card>
              {m.sources.length ? (
                <View style={{ gap: 8, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: t.colors.line }}>
                  <Txt variant="label" muted>From your notes</Txt>
                  {m.sources.slice(0, 3).map((e) => (
                    <EntryCard key={e.id} entry={e} highlight={m.highlight} compact />
                  ))}
                </View>
              ) : null}
            </View>
          ),
        )}
        {busy ? <Txt muted variant="small">Looking through your notes…</Txt> : null}
        {voice.error ? <Txt variant="small" style={{ color: t.colors.danger }}>{voice.error}</Txt> : null}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4 }}>
        <View
          style={[
            styles.row,
            {
              gap: 8,
              backgroundColor: t.colors.surface,
              borderRadius: t.tilt ? 14 : 999,
              borderWidth: 1,
              borderColor: t.colors.line,
              paddingLeft: 18,
              paddingRight: 6,
              paddingVertical: 6,
            },
          ]}
        >
          <TextInput
            value={listening ? [voice.finalText, voice.interim].filter(Boolean).join(' ') : input}
            onChangeText={setInput}
            editable={!listening}
            placeholder={listening ? 'Listening…' : 'Ask anything about your past…'}
            placeholderTextColor={t.colors.muted}
            onSubmitEditing={() => ask(input)}
            returnKeyType="send"
            accessibilityLabel="Your question"
            style={{ flex: 1, fontFamily: t.fonts.regular, fontSize: 15.5, color: t.colors.ink, paddingVertical: 8 }}
          />
          <Pressable
            onPress={() => (listening ? voice.stop() : voice.start())}
            accessibilityRole="button"
            accessibilityLabel={listening ? 'Stop listening' : 'Ask by voice'}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: listening ? t.colors.accent2 : t.colors.accentSoft }}
          >
            <Ionicons name={listening ? 'stop' : 'mic-outline'} size={20} color={listening ? t.colors.onAccent2 : t.colors.accent} />
          </Pressable>
          <Pressable
            onPress={() => ask(input)}
            disabled={!input.trim() || busy}
            accessibilityRole="button"
            accessibilityLabel="Send question"
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.accent, opacity: input.trim() ? 1 : 0.4 }}
          >
            <Ionicons name="arrow-up" size={20} color={t.colors.onAccent} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
