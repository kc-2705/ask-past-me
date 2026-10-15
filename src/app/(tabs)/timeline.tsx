import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { allDays, countEntries, listEntries, searchEntries, usedMoods, type Entry } from '@/db/database';
import { dayKey, monthTitle, streak } from '@/lib/dates';
import { keywordsOf } from '@/lib/askEngine';
import { useApp } from '@/state/AppState';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { EntryCard } from '@/components/EntryCard';
import { Empty, styles, Txt } from '@/components/ui';

// Notes load in pages so the list opens fast even after years of journaling.
const PAGE = 100;

export default function TimelineScreen() {
  const db = useSQLiteContext();
  const { theme: t, dataVersion } = useApp();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [results, setResults] = useState<Entry[] | null>(null);
  const [query, setQuery] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [moods, setMoods] = useState<string[]>([]);
  const [stats, setStats] = useState({ notes: 0, streak: 0, month: 0 });
  const loading = useRef(false);

  const loadFirstPage = useCallback(
    async (m: string | null) => {
      const first = await listEntries(db, PAGE, { mood: m });
      setEntries(first);
      setHasMore(first.length === PAGE);
    },
    [db],
  );

  const load = useCallback(async () => {
    const [n, days, ms] = await Promise.all([countEntries(db), allDays(db), usedMoods(db)]);
    const thisMonth = dayKey(new Date()).slice(0, 7);
    setStats({ notes: n, streak: streak(days), month: days.filter((d) => d.startsWith(thisMonth)).length });
    setMoods(ms);
    await loadFirstPage(mood);
  }, [db, loadFirstPage, mood]);

  useRefreshOnFocus(load);

  const loadMore = async () => {
    if (!hasMore || loading.current || query.trim()) return;
    loading.current = true;
    setLoadingMore(true);
    try {
      const next = await listEntries(db, PAGE, { offset: entries.length, mood });
      setEntries((prev) => [...prev, ...next]);
      setHasMore(next.length === PAGE);
    } finally {
      loading.current = false;
      setLoadingMore(false);
    }
  };

  const chooseMood = (m: string | null) => {
    setMood(m);
    loadFirstPage(m);
  };

  // Search as the person types, with a short pause so every key press doesn't hit the database.
  useEffect(() => {
    const words = query.trim() ? query.toLowerCase().split(/\s+/) : [];
    if (!words.length) return;
    const id = setTimeout(async () => setResults(await searchEntries(db, words, { mode: 'all', limit: 200, order: 'recent' })), 250);
    return () => clearTimeout(id);
  }, [query, db, dataVersion]);

  const searching = query.trim().length > 0;
  const shown = useMemo(
    () => (searching ? (results ?? []).filter((e) => !mood || e.mood === mood) : entries),
    [searching, results, entries, mood],
  );

  const sections = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of shown) {
      const k = e.day.slice(0, 7);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return [...map.entries()].map(([k, data]) => ({ title: monthTitle(`${k}-01`), data }));
  }, [shown]);

  const highlight = query.trim() ? keywordsOf(query).concat(query.trim().toLowerCase().split(/\s+/)) : [];

  return (
    <SectionList
      style={{ backgroundColor: t.colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 18, paddingHorizontal: 20, paddingBottom: 40 }}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      sections={sections}
      keyExtractor={(e) => String(e.id)}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={8}
      windowSize={7}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      ListHeaderComponent={
        <View style={{ gap: 16, marginBottom: 6 }}>
          <Txt variant="display">Timeline</Txt>
          <View style={[styles.row, { gap: 10 }]}>
            {(
              [
                [stats.notes, 'notes'],
                [stats.streak, 'day streak'],
                [stats.month, 'days this month'],
              ] as const
            ).map(([n, label]) => (
              <View key={label} style={{ flex: 1, backgroundColor: t.colors.surface, borderRadius: t.radius.card, padding: 12, gap: 2 }}>
                <Text style={{ fontFamily: t.fonts.heavy, fontSize: 22, color: t.colors.accent, fontVariant: ['tabular-nums'] }}>{n}</Text>
                <Txt variant="small" muted>{label}</Txt>
              </View>
            ))}
          </View>
          <View style={[styles.row, { gap: 8, backgroundColor: t.colors.surface, borderRadius: t.tilt ? 12 : 999, borderWidth: 1, borderColor: t.colors.line, paddingHorizontal: 16 }]}>
            <Ionicons name="search" size={18} color={t.colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search your notes"
              placeholderTextColor={t.colors.muted}
              accessibilityLabel="Search your notes"
              style={{ flex: 1, minWidth: 0, fontFamily: t.fonts.regular, fontSize: 15.5, color: t.colors.ink, paddingVertical: 12 }}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color={t.colors.muted} />
              </Pressable>
            ) : null}
          </View>
          {moods.length ? (
            <View style={styles.wrap}>
              {moods.map((m) => {
                const on = mood === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => chooseMood(on ? null : m)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: t.radius.chip, backgroundColor: on ? t.colors.accent : t.colors.tags.mood.bg }}
                  >
                    <Text style={{ fontFamily: t.fonts.bold, fontSize: 12.5, color: on ? t.colors.onAccent : t.colors.tags.mood.fg }}>{m}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      }
      renderSectionHeader={({ section }) => (
        <Txt variant="label" muted style={{ marginTop: 18, marginBottom: 10 }}>
          {section.title}
        </Txt>
      )}
      renderItem={({ item, index }) => <EntryCard entry={item} highlight={highlight} tilt={index % 2 ? 0.8 : -0.8} />}
      ListFooterComponent={
        loadingMore ? (
          <ActivityIndicator style={{ marginTop: 20 }} color={t.colors.accent} />
        ) : !searching && !hasMore && entries.length > PAGE ? (
          <Txt variant="small" muted style={{ textAlign: 'center', marginTop: 20 }}>That’s every note.</Txt>
        ) : null
      }
      ListEmptyComponent={
        stats.notes === 0 ? (
          <Empty icon="calendar-outline" title="Your timeline is empty" body="Every note you record shows up here, grouped by month." />
        ) : (
          <Empty icon="search-outline" title="No matching notes" body="Try a different word, or clear the mood filter." />
        )
      }
    />
  );
}
