import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Ionicons from '@expo/vector-icons/Ionicons';
import { addEntry, allDays, entriesBetween, knownTagLabels, listEntries, onThisDay, type Entry, type Tag } from '@/db/database';
import { addDays, dayKey, formatDayChip, formatLong, streak, WEEKDAYS } from '@/lib/dates';
import { detectMood, extractTags, MOODS } from '@/lib/tagger';
import { useVoice } from '@/hooks/useVoice';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { deleteFiles } from '@/lib/storage';
import { useApp } from '@/state/AppState';
import { AudioChip, EntryCard } from '@/components/EntryCard';
import { Button, Card, MicButton, styles, TagChip, Txt, Waveform } from '@/components/ui';
import { atDay, DayPicker } from '@/components/DayPicker';

type Mode = 'home' | 'listening' | 'review';

export default function TalkScreen() {
  const db = useSQLiteContext();
  const { theme: t, settings, bumpData } = useApp();
  const insets = useSafeAreaInsets();
  const voice = useVoice({ lang: settings.lang, keepAudio: settings.keepAudio, continuous: true });

  const [mode, setMode] = useState<Mode>('home');
  const [draft, setDraft] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [mood, setMood] = useState<string | null>(null);
  // Which day the note is for. Defaults to today; can be any earlier day.
  const [noteDate, setNoteDate] = useState(() => new Date());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [known, setKnown] = useState<{ people: string[]; places: string[] }>({ people: [], places: [] });
  const [days, setDays] = useState<string[]>([]);
  const [memory, setMemory] = useState<{ label: string; entry: Entry } | null>(null);
  const [todayEntries, setTodayEntries] = useState<Entry[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const tagsEdited = useRef(false);
  const moodEdited = useRef(false);

  const today = dayKey(new Date());

  const load = useCallback(async () => {
    const [d, otd, todays, people, places] = await Promise.all([
      allDays(db),
      onThisDay(db, today),
      entriesBetween(db, today, today),
      knownTagLabels(db, 'person'),
      knownTagLabels(db, 'place'),
    ]);
    setDays(d);
    setTodayEntries(todays);
    setKnown({ people, places });
    if (otd[0]) {
      const years = Number(today.slice(0, 4)) - Number(otd[0].day.slice(0, 4));
      setMemory({ label: years === 1 ? 'One year ago today' : `${years} years ago today`, entry: otd[0] });
    } else {
      const latest = (await listEntries(db, 5)).find((e) => e.day !== today);
      setMemory(latest ? { label: 'Your last note', entry: latest } : null);
    }
  }, [db, today]);

  useRefreshOnFocus(load);

  // Live timer while listening.
  useEffect(() => {
    if (voice.status !== 'listening' || !voice.startedAt) return;
    const id = setInterval(() => setElapsed(Date.now() - (voice.startedAt ?? Date.now())), 500);
    return () => clearInterval(id);
  }, [voice.status, voice.startedAt]);

  // When listening ends, move to the review step with what was heard.
  const prevStatus = useRef(voice.status);
  useEffect(() => {
    if (prevStatus.current !== 'idle' && voice.status === 'idle' && mode === 'listening') {
      const text = voice.finalText.trim();
      setDraft(text);
      tagsEdited.current = false;
      moodEdited.current = false;
      setTags(extractTags(text, known));
      setMood(detectMood(text));
      setMode('review');
    }
    prevStatus.current = voice.status;
  }, [voice.status, voice.finalText, mode, known]);

  // Re-tag and re-read the mood while the person edits the text, unless they changed them by hand.
  useEffect(() => {
    if (mode !== 'review') return;
    const id = setTimeout(() => {
      if (!tagsEdited.current) setTags(extractTags(draft, known));
      if (!moodEdited.current) setMood(detectMood(draft));
    }, 400);
    return () => clearTimeout(id);
  }, [draft, mode, known]);

  const liveText = [voice.finalText, voice.interim].filter(Boolean).join(' ');
  const liveTags = useMemo(() => (mode === 'listening' ? extractTags(liveText, known) : []), [liveText, mode, known]);

  const onMic = async () => {
    if (voice.status === 'listening') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      voice.stop();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setElapsed(0);
    setNoteDate(new Date());
    if (await voice.start()) setMode('listening');
  };

  const typeInstead = (day: Date = new Date()) => {
    voice.reset();
    setNoteDate(day);
    setDraft('');
    setTags([]);
    setMood(null);
    tagsEdited.current = false;
    moodEdited.current = false;
    setMode('review');
  };

  const discard = () => {
    // A discarded note's recording is not needed.
    deleteFiles(voice.audio);
    voice.cancel();
    setMode('home');
    setDraft('');
  };

  const save = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      // Tags and mood update after a short typing pause; work them out now in case Save came first.
      const finalTags = tagsEdited.current ? tags : extractTags(draft, known);
      const finalMood = moodEdited.current ? mood : detectMood(draft);
      await addEntry(db, { text: draft, mood: finalMood, tags: finalTags, audio: voice.audio, durationMs: elapsed, createdAt: atDay(noteDate) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      voice.reset();
      setDraft('');
      setMode('home');
      setToast(dayKey(noteDate) === today ? 'Saved to your journal' : `Saved to ${formatDayChip(noteDate)}`);
      setTimeout(() => setToast(null), 2200);
      bumpData();
    } finally {
      setSaving(false);
    }
  };

  const greetingName = settings.name.trim() ? `, ${settings.name.trim()}` : '';
  const streakDays = streak(days);
  const daySet = new Set(days);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior="padding">
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 18, paddingHorizontal: 20, paddingBottom: 40, gap: 18 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 4 }}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Txt variant="label" muted>{formatLong(new Date())}</Txt>
            <View style={[styles.row, { gap: 6 }]}>
              {streakDays > 1 ? (
                <View style={{ backgroundColor: t.colors.accent2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontFamily: t.fonts.bold, fontSize: 12, color: t.colors.onAccent2 }}>{streakDays}-day streak</Text>
                </View>
              ) : null}
              <Pressable
                onPress={() => router.push('/about')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="How to use the app"
                style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="information-circle-outline" size={24} color={t.colors.muted} />
              </Pressable>
            </View>
          </View>
          <Txt variant="display">
            {mode === 'review' ? 'Check your note' : mode === 'listening' ? 'I’m listening…' : `How was your day${greetingName}?`}
          </Txt>
        </View>

        {mode === 'home' ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 6)).map((d) => {
              const k = dayKey(d);
              const has = daySet.has(k);
              const isToday = k === today;
              return (
                <Pressable
                  key={k}
                  onPress={() => typeInstead(d)}
                  accessibilityRole="button"
                  accessibilityLabel={`Write a note for ${formatDayChip(d)}`}
                  style={{ alignItems: 'center', gap: 4 }}
                >
                  <Txt variant="small" muted>{WEEKDAYS[d.getDay()].charAt(0).toUpperCase()}</Txt>
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: has ? t.colors.accent : 'transparent',
                      borderWidth: isToday && !has ? 2 : 0,
                      borderColor: t.colors.accent,
                      borderStyle: t.tilt ? 'dashed' : 'solid',
                    }}
                  >
                    <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: has ? t.colors.onAccent : t.colors.ink }}>{d.getDate()}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {mode === 'home' ? (
          <Txt variant="small" muted style={{ textAlign: 'center', marginTop: -8 }}>Tap a day to add a note for it</Txt>
        ) : null}

        {mode !== 'review' ? (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <MicButton active={voice.status === 'listening'} onPress={onMic} />
            <Txt variant="small" muted>
              {voice.status === 'listening'
                ? `Listening · ${fmt(elapsed)} · tap to finish`
                : voice.status === 'stopping'
                  ? 'Finishing up…'
                  : 'Tap and talk. I’ll write it down.'}
            </Txt>
            {mode === 'home' ? (
              <Pressable onPress={() => typeInstead()} hitSlop={8} accessibilityRole="button">
                <Text style={{ fontFamily: t.fonts.bold, color: t.colors.accent, fontSize: 14, paddingVertical: 6 }}>Type instead</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {voice.error ? (
          <Card tone="note">
            <View style={[styles.row, { gap: 8 }]}>
              <Ionicons name="alert-circle-outline" size={18} color={t.colors.danger} />
              <Txt style={{ flex: 1 }}>{voice.error}</Txt>
            </View>
            <Button label="Type instead" kind="ghost" onPress={() => typeInstead()} />
          </Card>
        ) : null}

        {mode === 'listening' ? (
          <Card tilt={-1}>
            <Waveform levels={voice.levels} />
            <Txt>
              {voice.finalText}
              {voice.interim ? <Text style={{ color: t.colors.muted }}>{(voice.finalText ? ' ' : '') + voice.interim}</Text> : null}
              {!liveText ? <Text style={{ color: t.colors.muted }}>Start talking about your day…</Text> : null}
            </Txt>
            {liveTags.length ? (
              <View style={styles.wrap}>
                {liveTags.slice(0, 6).map((tg) => (
                  <TagChip key={tg.kind + tg.label} kind={tg.kind} label={tg.label} />
                ))}
              </View>
            ) : null}
            <Button label="Cancel" kind="ghost" onPress={discard} />
          </Card>
        ) : null}

        {mode === 'review' ? (
          <View style={{ gap: 16 }}>
            {!draft && voice.audio.length === 0 && voice.startedAt ? (
              <Txt muted>I didn’t catch any words. You can type your note below, or discard and try again.</Txt>
            ) : null}
            <View style={{ gap: 8 }}>
              <Txt variant="label" muted>Date</Txt>
              <DayPicker value={noteDate} onChange={setNoteDate} />
            </View>
            <Card tilt={-1}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                multiline
                placeholder={`What happened ${dayKey(noteDate) === today ? 'today' : 'that day'}? Who did you see? How did you feel?`}
                placeholderTextColor={t.colors.muted}
                accessibilityLabel="Journal note"
                style={{ fontFamily: t.fonts.regular, fontSize: 16, lineHeight: 24, color: t.colors.ink, minHeight: 140, textAlignVertical: 'top' }}
              />
            </Card>
            {voice.audio.map((uri, i) => (
              <AudioChip key={uri} uri={uri} label={voice.audio.length > 1 ? `Recording ${i + 1}` : 'Your recording'} />
            ))}

            <View style={{ gap: 8 }}>
              <Txt variant="label" muted>I noticed</Txt>
              {tags.length ? (
                <View style={styles.wrap}>
                  {tags.map((tg) => (
                    <TagChip
                      key={tg.kind + tg.label}
                      kind={tg.kind}
                      label={tg.label}
                      onRemove={() => {
                        tagsEdited.current = true;
                        setTags((x) => x.filter((y) => y !== tg));
                      }}
                    />
                  ))}
                </View>
              ) : (
                <Txt variant="small" muted>People, places and to-dos you mention will show up here.</Txt>
              )}
            </View>

            <View style={{ gap: 8 }}>
              <Txt variant="label" muted>Mood</Txt>
              <View style={styles.wrap}>
                {MOODS.map((m) => {
                  const on = mood === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => {
                        moodEdited.current = true;
                        setMood(on ? null : m);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: t.radius.chip,
                        backgroundColor: on ? t.colors.accent : t.colors.surface,
                        borderWidth: 1,
                        borderColor: on ? t.colors.accent : t.colors.line,
                      }}
                    >
                      <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: on ? t.colors.onAccent : t.colors.ink }}>{m}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={[styles.row, { gap: 10 }]}>
              <Button label="Discard" kind="ghost" onPress={discard} style={{ flex: 1 }} />
              <Button label="Save" icon="checkmark" onPress={save} loading={saving} disabled={!draft.trim()} style={{ flex: 2 }} />
            </View>
          </View>
        ) : null}

        {mode === 'home' && memory ? (
          <View style={{ gap: 8 }}>
            <Txt variant="label" muted>{memory.label}</Txt>
            <EntryCard entry={memory.entry} compact tilt={1.2} />
          </View>
        ) : null}

        {mode === 'home' && todayEntries.length ? (
          <View style={{ gap: 8 }}>
            <Txt variant="label" muted>Today</Txt>
            {todayEntries.map((e) => (
              <EntryCard key={e.id} entry={e} compact />
            ))}
          </View>
        ) : null}
      </ScrollView>

      {toast ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', bottom: 18, alignSelf: 'center', backgroundColor: t.colors.ink, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 }}
        >
          <Text style={{ color: t.colors.bg, fontFamily: t.fonts.bold }}>{toast}</Text>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
