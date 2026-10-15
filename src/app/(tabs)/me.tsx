import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { countEntries, deleteAllEntries, listEntries } from '@/db/database';
import { loadSampleEntries, SAMPLE_COUNT } from '@/lib/sampleData';
import { confirmAction, downloadText, isWeb } from '@/lib/platform';
import { deleteOrphanRecordings, deleteRecordings, formatBytes, storageUsage, type StorageUsage } from '@/lib/storage';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { cancelReminders, scheduleDailyReminder } from '@/lib/reminders';
import { useApp } from '@/state/AppState';
import { themeList } from '@/theme/themes';
import { Button, Card, styles, Txt } from '@/components/ui';

const AUDIO_DAYS: [number, string][] = [
  [0, 'Never'],
  [30, '30 days'],
  [90, '90 days'],
  [365, '1 year'],
];

const LANGS = [
  ['en-US', 'English (US)'],
  ['en-IN', 'English (India)'],
  ['en-GB', 'English (UK)'],
  ['hi-IN', 'Hindi'],
  ['te-IN', 'Telugu'],
  ['ta-IN', 'Tamil'],
] as const;

export default function MeScreen() {
  const db = useSQLiteContext();
  const { theme: t, settings, update, bumpData } = useApp();
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState(0);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [bMonth, setBMonth] = useState(settings.birthday.slice(0, 2));
  const [bDay, setBDay] = useState(settings.birthday.slice(3, 5));

  const load = useCallback(async () => {
    const [n, u] = await Promise.all([countEntries(db), storageUsage(db)]);
    setCount(n);
    setUsage(u);
  }, [db]);
  useRefreshOnFocus(load);

  const flash = (msg: string) => {
    setNote(msg);
    setTimeout(() => setNote(null), 3000);
  };

  const saveBirthday = (m: string, d: string) => {
    const mm = Number(m);
    const dd = Number(d);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) update('birthday', `${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`);
    else if (!m && !d) update('birthday', '');
  };

  const setReminder = async (on: boolean, hour = settings.reminderHour, minute = settings.reminderMinute) => {
    if (!on) {
      if (!isWeb) await cancelReminders();
      await update('reminderOn', false);
      return;
    }
    if (isWeb) {
      flash('Daily reminders work in the phone app, not in a browser.');
      return;
    }
    const ok = await scheduleDailyReminder(hour, minute);
    if (!ok) {
      flash('Notifications are blocked. Allow them for Ask Past Me in your phone settings.');
      await update('reminderOn', false);
      return;
    }
    await update('reminderOn', true);
    await update('reminderHour', hour);
    await update('reminderMinute', minute);
  };

  const shiftTime = (mins: number) => {
    let total = settings.reminderHour * 60 + settings.reminderMinute + mins;
    total = (total + 24 * 60) % (24 * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (settings.reminderOn) setReminder(true, h, m);
    else {
      update('reminderHour', h);
      update('reminderMinute', m);
    }
  };

  const setLock = async (on: boolean) => {
    if (!on) return update('lockOn', false);
    if (isWeb) {
      flash('The fingerprint lock works in the phone app, not in a browser.');
      return;
    }
    const [hw, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
    if (!hw || !enrolled) {
      flash('Set up a fingerprint or screen lock on your phone first.');
      return;
    }
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirm to turn on the lock' });
    if (res.success) update('lockOn', true);
  };

  const exportBackup = async () => {
    setBusy('export');
    try {
      const entries = await listEntries(db, 100000);
      const name = `ask-past-me-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const json = JSON.stringify({ app: 'Ask Past Me', exportedAt: new Date().toISOString(), entries }, null, 2);
      if (isWeb) {
        downloadText(name, json);
        flash('Backup downloaded.');
        return;
      }
      const file = new File(Paths.cache, name);
      if (file.exists) file.delete();
      file.create();
      file.write(json);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your journal backup' });
      } else {
        flash('Sharing is not available on this phone.');
      }
    } catch {
      flash('Could not create the backup. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const setAudioDays = async (days: number) => {
    await update('audioDays', days);
    if (days > 0) {
      const n = await deleteRecordings(db, days);
      if (n) {
        flash(`Deleted recordings from ${n} older notes. Their text is kept.`);
        bumpData();
      }
    }
  };

  const deleteAllRecordings = async () => {
    const ok = await confirmAction(
      'Delete all recordings?',
      `This frees ${usage ? formatBytes(usage.audioBytes) : 'space'}. The text of every note stays.`,
      'Delete recordings',
    );
    if (!ok) return;
    setBusy('audio');
    try {
      await deleteRecordings(db, 'all');
      await deleteOrphanRecordings(db);
      bumpData();
      flash('Recordings deleted. Your notes are still here.');
    } finally {
      setBusy(null);
    }
  };

  const loadSamples = async () => {
    setBusy('samples');
    try {
      await loadSampleEntries(db);
      bumpData();
      flash(`Added ${SAMPLE_COUNT} sample memories. Try the Ask tab.`);
    } finally {
      setBusy(null);
    }
  };

  const deleteAll = async () => {
    const ok = await confirmAction('Delete all notes?', `This removes all ${count} notes from this device. It can't be undone.`, 'Delete all');
    if (!ok) return;
    await deleteRecordings(db, 'all');
    await deleteAllEntries(db);
    bumpData();
    flash('All notes deleted.');
  };

  const h12 = settings.reminderHour % 12 || 12;
  const timeLabel = `${h12}:${String(settings.reminderMinute).padStart(2, '0')} ${settings.reminderHour >= 12 ? 'pm' : 'am'}`;
  const inputStyle = {
    fontFamily: t.fonts.regular,
    fontSize: 16,
    color: t.colors.ink,
    backgroundColor: t.colors.bg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  };

  return (
    <ScrollView style={{ backgroundColor: t.colors.bg }} contentContainerStyle={{ paddingTop: insets.top + 18, paddingHorizontal: 20, paddingBottom: 48, gap: 20 }}>
      <Txt variant="display">Me</Txt>

      <Pressable
        onPress={() => router.push('/about')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.row, { gap: 14, padding: 16, borderRadius: t.radius.card, backgroundColor: t.colors.accent, opacity: pressed ? 0.85 : 1 }]}
      >
        <Ionicons name="help-circle-outline" size={26} color={t.colors.onAccent} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: t.fonts.bold, fontSize: 16, color: t.colors.onAccent }}>How to use Ask Past Me</Text>
          <Text style={{ fontFamily: t.fonts.regular, fontSize: 13, color: t.colors.onAccent, opacity: 0.85 }}>What it does, questions to try, privacy</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={t.colors.onAccent} />
      </Pressable>

      {note ? (
        <Card tone="soft">
          <Txt>{note}</Txt>
        </Card>
      ) : null}

      <Section title="Look">
        <View style={{ gap: 10 }}>
          {themeList.map((th) => {
            const on = th.id === settings.theme;
            return (
              <Pressable
                key={th.id}
                onPress={() => update('theme', th.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={[
                  styles.row,
                  {
                    gap: 14,
                    padding: 12,
                    borderRadius: 16,
                    borderWidth: 2,
                    borderColor: on ? t.colors.accent : t.colors.line,
                    backgroundColor: t.colors.surface,
                  },
                ]}
              >
                {/* A tiny preview of the theme: its ground, card and accent. */}
                <View style={{ width: 58, height: 58, borderRadius: 12, backgroundColor: th.colors.bg, padding: 8, gap: 5, borderWidth: 1, borderColor: th.colors.line }}>
                  <View style={{ height: 14, borderRadius: 4, backgroundColor: th.colors.surface }} />
                  <View style={[styles.row, { gap: 4 }]}>
                    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: th.colors.accent }} />
                    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: th.colors.accent2 }} />
                  </View>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: th.fonts.display, fontSize: th.id === 'scrapbook' ? 24 : 17, color: t.colors.ink }}>{th.name}</Text>
                  <Txt variant="small" muted>{th.tagline}</Txt>
                </View>
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? t.colors.accent : t.colors.muted} />
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="About you">
        <Card>
          <Txt variant="small" muted>Your name (for the greeting)</Txt>
          <TextInput
            defaultValue={settings.name}
            onEndEditing={(e) => update('name', e.nativeEvent.text.trim())}
            placeholder="Your first name"
            placeholderTextColor={t.colors.muted}
            accessibilityLabel="Your name"
            style={inputStyle}
          />
          <Txt variant="small" muted>Birthday, so you can ask “What did I do on my birthday?”</Txt>
          <View style={[styles.row, { gap: 10 }]}>
            <TextInput
              value={bMonth}
              onChangeText={(v) => setBMonth(v.replace(/\D/g, '').slice(0, 2))}
              onEndEditing={() => saveBirthday(bMonth, bDay)}
              placeholder="MM"
              keyboardType="number-pad"
              placeholderTextColor={t.colors.muted}
              accessibilityLabel="Birthday month"
              style={[inputStyle, { flex: 1, minWidth: 0, textAlign: 'center' }]}
            />
            <TextInput
              value={bDay}
              onChangeText={(v) => setBDay(v.replace(/\D/g, '').slice(0, 2))}
              onEndEditing={() => saveBirthday(bMonth, bDay)}
              placeholder="DD"
              keyboardType="number-pad"
              placeholderTextColor={t.colors.muted}
              accessibilityLabel="Birthday day"
              style={[inputStyle, { flex: 1, minWidth: 0, textAlign: 'center' }]}
            />
          </View>
        </Card>
      </Section>

      <Section title="Voice language">
        <View style={styles.wrap}>
          {LANGS.map(([code, label]) => {
            const on = settings.lang === code;
            return (
              <Pressable
                key={code}
                onPress={() => update('lang', code)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: t.radius.chip, backgroundColor: on ? t.colors.accent : t.colors.surface, borderWidth: 1, borderColor: on ? t.colors.accent : t.colors.line }}
              >
                <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: on ? t.colors.onAccent : t.colors.ink }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Daily reminder">
        <Card>
          <Row label="Remind me to journal" value={settings.reminderOn} onChange={(v) => setReminder(v)} />
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Txt muted>Every day at</Txt>
            <View style={[styles.row, { gap: 6 }]}>
              <Stepper icon="remove" label="Earlier" onPress={() => shiftTime(-15)} />
              <Text style={{ fontFamily: t.fonts.heavy, fontSize: 18, color: t.colors.ink, minWidth: 86, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{timeLabel}</Text>
              <Stepper icon="add" label="Later" onPress={() => shiftTime(15)} />
            </View>
          </View>
        </Card>
      </Section>

      <Section title="Privacy">
        <Card>
          <Row label="Lock with fingerprint" value={settings.lockOn} onChange={setLock} />
          <Txt variant="small" muted>Your notes and recordings stay on this phone. There is no account and no cloud.</Txt>
        </Card>
      </Section>

      <Section title="Voice recordings">
        <Card>
          <Row label="Keep voice recordings" value={settings.keepAudio} onChange={(v) => update('keepAudio', v)} />
          <Txt variant="small" muted>
            {isWeb
              ? 'Recordings are only saved in the phone app.'
              : 'Recordings let you replay a note. They use about 2 MB per minute; the text is tiny.'}
          </Txt>
          <Txt variant="small" muted>Delete recordings older than</Txt>
          <View style={styles.wrap}>
            {AUDIO_DAYS.map(([days, label]) => {
              const on = settings.audioDays === days;
              return (
                <Pressable
                  key={days}
                  onPress={() => setAudioDays(days)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: t.radius.chip, backgroundColor: on ? t.colors.accent : t.colors.bg, borderWidth: 1, borderColor: on ? t.colors.accent : t.colors.line }}
                >
                  <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: on ? t.colors.onAccent : t.colors.ink }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Txt variant="small" muted>The text of each note is always kept.</Txt>
        </Card>
      </Section>

      <Section title="Storage on this device">
        <Card>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Txt>Notes and search index</Txt>
            <Txt variant="bodyStrong">{usage ? formatBytes(usage.notesBytes) : '…'}</Txt>
          </View>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Txt>Voice recordings{usage?.audioFiles ? ` (${usage.audioFiles})` : ''}</Txt>
            <Txt variant="bodyStrong">{usage ? formatBytes(usage.audioBytes) : '…'}</Txt>
          </View>
          {!isWeb ? (
            <Button
              label="Delete all recordings, keep the text"
              icon="trash-outline"
              kind="ghost"
              onPress={deleteAllRecordings}
              disabled={!usage?.audioFiles}
              loading={busy === 'audio'}
            />
          ) : null}
        </Card>
      </Section>

      <Section title={`Your data · ${count} notes`}>
        <View style={{ gap: 10 }}>
          <Button label="Export a backup" icon="share-outline" kind="ghost" onPress={exportBackup} loading={busy === 'export'} disabled={!count} />
          <Button label="Add sample memories" icon="sparkles-outline" kind="ghost" onPress={loadSamples} loading={busy === 'samples'} />
          <Button label="Delete all notes" icon="trash-outline" kind="danger" onPress={deleteAll} disabled={!count} />
        </View>
      </Section>

      <Txt variant="small" muted style={{ textAlign: 'center' }}>
        Ask Past Me · version {Constants.expoConfig?.version ?? '1.0.0'}
      </Txt>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Txt variant="label" muted>{title}</Txt>
      {children}
    </View>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { theme: t } = useApp();
  return (
    <View style={[styles.row, { justifyContent: 'space-between', minHeight: 44 }]}>
      <Txt variant="bodyStrong">{label}</Txt>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: t.colors.accent, false: t.colors.line }}
        thumbColor={t.colors.surface}
      />
    </View>
  );
}

function Stepper({ icon, label, onPress }: { icon: 'add' | 'remove'; label: string; onPress: () => void }) {
  const { theme: t } = useApp();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name={icon} size={18} color={t.colors.accent} />
    </Pressable>
  );
}
