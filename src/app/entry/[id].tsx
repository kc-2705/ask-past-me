import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { deleteEntry, getEntry, knownTagLabels, updateEntry, type Entry, type Tag } from '@/db/database';
import { dayKey, formatLong, formatTime, parseDay, relative } from '@/lib/dates';
import { extractTags, MOODS } from '@/lib/tagger';
import { confirmAction } from '@/lib/platform';
import { deleteFiles } from '@/lib/storage';
import { useApp } from '@/state/AppState';
import { AudioChip } from '@/components/EntryCard';
import { Button, Card, Empty, styles, TagChip, Txt } from '@/components/ui';
import { DayPicker } from '@/components/DayPicker';

export default function EntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { theme: t, bumpData } = useApp();
  const insets = useSafeAreaInsets();
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [day, setDay] = useState(() => new Date());

  useEffect(() => {
    getEntry(db, Number(id)).then((e) => {
      setEntry(e);
      if (e) {
        setText(e.text);
        setMood(e.mood);
        setTags(e.tags);
        setDay(parseDay(e.day));
      }
    });
  }, [db, id]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (entry === undefined) return <View style={{ flex: 1, backgroundColor: t.colors.bg }} />;
  if (entry === null) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg, paddingTop: insets.top + 40 }}>
        <Empty icon="document-outline" title="This note was deleted" body="It may have been removed on another screen.">
          <Button label="Go back" onPress={close} />
        </Empty>
      </View>
    );
  }

  const entryDay = parseDay(entry.day);

  const retag = async () => {
    const [people, places] = await Promise.all([knownTagLabels(db, 'person'), knownTagLabels(db, 'place')]);
    setTags(extractTags(text, { people, places }));
  };

  const save = async () => {
    if (!text.trim()) return;
    // Moving a note to another day keeps its original time of day.
    const old = new Date(entry.createdAt);
    const createdAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), old.getHours(), old.getMinutes()).getTime();
    await updateEntry(db, entry.id, { text, mood, tags, createdAt });
    setEntry({ ...entry, text: text.trim(), mood, tags, createdAt, day: dayKey(day) });
    setEditing(false);
    bumpData();
  };

  const remove = async () => {
    if (!(await confirmAction('Delete this note?', 'It will be removed from your journal and Ask answers.', 'Delete'))) return;
    await deleteEntry(db, entry.id);
    deleteFiles(entry.audio);
    bumpData();
    close();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior="padding">
      <View style={[styles.row, { justifyContent: 'space-between', paddingTop: insets.top + 8, paddingHorizontal: 12 }]}>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-down" size={26} color={t.colors.ink} />
        </Pressable>
        {!editing ? (
          <Pressable onPress={() => setEditing(true)} accessibilityRole="button" style={{ paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ fontFamily: t.fonts.bold, color: t.colors.accent, fontSize: 15 }}>Edit</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 48, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 4 }}>
          <Txt variant="label" muted>{relative(entryDay)} · {formatTime(new Date(entry.createdAt))}</Txt>
          <Txt variant="display">{formatLong(entryDay)}{entryDay.getFullYear() !== new Date().getFullYear() ? ` ${entryDay.getFullYear()}` : ''}</Txt>
        </View>

        {entry.audio.map((uri, i) => (
          <AudioChip key={uri} uri={uri} label={entry.audio.length > 1 ? `Recording ${i + 1}` : 'Play your voice note'} />
        ))}

        {editing ? (
          <View style={{ gap: 8 }}>
            <Txt variant="label" muted>Date</Txt>
            <DayPicker value={day} onChange={setDay} />
          </View>
        ) : null}

        <Card tilt={-0.8}>
          {editing ? (
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              accessibilityLabel="Note text"
              style={{ fontFamily: t.fonts.regular, fontSize: 16.5, lineHeight: 25, color: t.colors.ink, minHeight: 160, textAlignVertical: 'top' }}
            />
          ) : (
            <Txt selectable style={{ fontSize: 16.5, lineHeight: 25 }}>{entry.text}</Txt>
          )}
        </Card>

        <View style={{ gap: 8 }}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Txt variant="label" muted>Tags</Txt>
            {editing ? (
              <Pressable onPress={retag} hitSlop={8} accessibilityRole="button">
                <Text style={{ fontFamily: t.fonts.bold, color: t.colors.accent, fontSize: 13 }}>Find tags again</Text>
              </Pressable>
            ) : null}
          </View>
          {(editing ? tags : entry.tags).length ? (
            <View style={styles.wrap}>
              {(editing ? tags : entry.tags).map((tg) => (
                <TagChip
                  key={tg.kind + tg.label}
                  kind={tg.kind}
                  label={tg.label}
                  onRemove={editing ? () => setTags((x) => x.filter((y) => y !== tg)) : undefined}
                />
              ))}
            </View>
          ) : (
            <Txt variant="small" muted>No tags.</Txt>
          )}
        </View>

        <View style={{ gap: 8 }}>
          <Txt variant="label" muted>Mood</Txt>
          {editing ? (
            <View style={styles.wrap}>
              {MOODS.map((m) => {
                const on = mood === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMood(on ? null : m)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: t.radius.chip, backgroundColor: on ? t.colors.accent : t.colors.surface, borderWidth: 1, borderColor: on ? t.colors.accent : t.colors.line }}
                  >
                    <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: on ? t.colors.onAccent : t.colors.ink }}>{m}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : entry.mood ? (
            <View style={styles.wrap}>
              <TagChip kind="mood" label={entry.mood} />
            </View>
          ) : (
            <Txt variant="small" muted>No mood set.</Txt>
          )}
        </View>

        {editing ? (
          <View style={[styles.row, { gap: 10 }]}>
            <Button
              label="Cancel"
              kind="ghost"
              style={{ flex: 1 }}
              onPress={() => {
                setText(entry.text);
                setMood(entry.mood);
                setTags(entry.tags);
                setDay(parseDay(entry.day));
                setEditing(false);
              }}
            />
            <Button label="Save changes" icon="checkmark" style={{ flex: 2 }} onPress={save} disabled={!text.trim()} />
          </View>
        ) : (
          <Button label="Delete note" icon="trash-outline" kind="danger" onPress={remove} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
