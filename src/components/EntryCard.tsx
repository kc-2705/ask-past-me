import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router } from 'expo-router';
import type { Entry } from '@/db/database';
import { formatDayChip, formatTime, parseDay } from '@/lib/dates';
import { useTheme } from '@/state/AppState';
import { Card, styles, TagChip, Txt } from './ui';

/** Shows text with the given words in bold accent color. */
export function Highlighted({ text, words, numberOfLines }: { text: string; words: string[]; numberOfLines?: number }) {
  const t = useTheme();
  const clean = words.map((w) => w.trim()).filter((w) => w.length > 1);
  if (!clean.length) return <Txt numberOfLines={numberOfLines}>{text}</Txt>;
  const re = new RegExp(`(${clean.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(re);
  return (
    <Txt numberOfLines={numberOfLines}>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={{ fontFamily: t.fonts.bold, color: t.dark || t.tilt ? t.colors.accent : t.colors.accent2 }}>
            {p}
          </Text>
        ) : (
          p
        ),
      )}
    </Txt>
  );
}

export function EntryCard({
  entry,
  highlight = [],
  compact,
  tilt = 0,
}: {
  entry: Entry;
  highlight?: string[];
  compact?: boolean;
  tilt?: number;
}) {
  const t = useTheme();
  const d = new Date(entry.createdAt);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/entry/[id]', params: { id: String(entry.id) } })}
      accessibilityRole="button"
      accessibilityLabel={`Open note from ${formatDayChip(parseDay(entry.day))}`}
    >
      <Card tilt={tilt} style={{ gap: 8 }}>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Text style={{ fontFamily: t.id === 'scrapbook' ? t.fonts.display : t.fonts.bold, fontSize: t.id === 'scrapbook' ? 22 : 13, color: t.tilt ? t.colors.accent : t.colors.accent2 }}>
            {formatDayChip(parseDay(entry.day))}
          </Text>
          <View style={[styles.row, { gap: 8 }]}>
            {entry.audio.length ? <Ionicons name="mic-outline" size={14} color={t.colors.muted} /> : null}
            <Txt variant="small" muted>{formatTime(d)}</Txt>
          </View>
        </View>
        <Highlighted text={entry.text} words={highlight} numberOfLines={compact ? 3 : 6} />
        {!compact && (entry.mood || entry.tags.length) ? (
          <View style={styles.wrap}>
            {entry.mood ? <TagChip kind="mood" label={entry.mood} /> : null}
            {entry.tags.slice(0, 5).map((tg) => (
              <TagChip key={tg.kind + tg.label} kind={tg.kind} label={tg.label} />
            ))}
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

/** Play button for one saved voice recording. */
export function AudioChip({ uri, label }: { uri: string; label: string }) {
  const t = useTheme();
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  const toggle = () => {
    if (playing) player.pause();
    else {
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.1)) player.seekTo(0);
      player.play();
    }
  };
  const progress = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;
  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={playing ? `Pause ${label}` : `Play ${label}`}
      style={[styles.row, { gap: 12, backgroundColor: t.colors.accentSoft, borderRadius: t.radius.card, padding: 10 }]}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.colors.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color={t.colors.onAccent} />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Txt variant="small">{label}</Txt>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: t.colors.accentRing, overflow: 'hidden' }}>
          <View style={{ height: 4, width: `${progress * 100}%`, backgroundColor: t.colors.accent }} />
        </View>
      </View>
      <Txt variant="small" muted>
        {fmtSecs(playing || status.currentTime > 0 ? status.currentTime : status.duration)}
      </Txt>
    </Pressable>
  );
}

const fmtSecs = (s: number) => {
  const n = Math.max(0, Math.round(s || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};
