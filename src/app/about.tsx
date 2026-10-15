import type { ReactNode } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/state/AppState';
import { Card, styles, Txt } from '@/components/ui';

const PORTFOLIO = 'https://kavya-portfolio-book.netlify.app/';

const STEPS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'mic-outline',
    title: 'Talk about your day',
    body: 'On the Talk tab, tap the mic and speak. Tap it again when you’re done. Check the text, the tags and the mood, then tap Save. Prefer typing? Tap “Type instead”.',
  },
  {
    icon: 'calendar-number-outline',
    title: 'Add a day you missed',
    body: 'Tap any day in the week strip, or pick Yesterday or a date on the calendar before you save.',
  },
  {
    icon: 'chatbubble-ellipses-outline',
    title: 'Ask your past',
    body: 'On the Ask tab, type or say a question. The answer comes from your notes and shows the notes it used, so you can check it.',
  },
  {
    icon: 'albums-outline',
    title: 'Look back',
    body: 'The Timeline shows every note by month. Search for a word or filter by mood. Tap a note to replay it, edit it, move it to another day or delete it.',
  },
  {
    icon: 'person-circle-outline',
    title: 'Make it yours',
    body: 'On the Me tab, choose a theme, add your name and birthday, set the voice language, turn on a daily reminder or the fingerprint lock, and manage recordings and backups.',
  },
];

const QUESTIONS = [
  'When did I last get a haircut?',
  'What did I do yesterday?',
  'How many times did I go to the gym this month?',
  'Who did I talk to this week?',
  'What helped when I was stressed?',
  'How was my mood last month?',
  'What did I do on my birthday?',
];

const TIPS = [
  'Say names and places: “lunch with Ravi at Panera”. Ask can find them later.',
  'Say “need to…” or “remind me to…” and it is saved as a to-do tag.',
  'Add your birthday on the Me tab so you can ask about it.',
  'Short notes every day work better than long notes once a week.',
];

export default function AboutScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/me'));

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <View style={[styles.row, { paddingTop: insets.top + 8, paddingHorizontal: 12 }]}>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={26} color={t.colors.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40, gap: 22 }}>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <View style={{ width: 84, height: 84, borderRadius: 24, backgroundColor: '#6D4AE0', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chatbubble" size={52} color="#FFFFFF" style={{ position: 'absolute' }} />
            <Ionicons name="mic" size={25} color="#6D4AE0" style={{ marginBottom: 5 }} />
          </View>
          <Txt variant="display" style={{ textAlign: 'center' }}>Ask Past Me</Txt>
          <Txt muted style={{ textAlign: 'center', maxWidth: 320 }}>
            A voice journal that remembers for you. Talk about your day for a minute. Ask about it any time later.
          </Txt>
        </View>

        <Section title="How to use it">
          {STEPS.map((s, i) => (
            <Card key={s.title} tilt={i % 2 ? 0.6 : -0.6}>
              <View style={[styles.row, { gap: 12, alignItems: 'flex-start' }]}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={s.icon} size={20} color={t.colors.accent} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Txt variant="heading">{`${i + 1}. ${s.title}`}</Txt>
                  <Txt>{s.body}</Txt>
                </View>
              </View>
            </Card>
          ))}
        </Section>

        <Section title="Questions you can ask">
          <View style={{ gap: 8 }}>
            {QUESTIONS.map((q) => (
              <View key={q} style={[styles.row, { gap: 10 }]}>
                <Ionicons name="sparkles-outline" size={15} color={t.colors.accent} />
                <Txt style={{ flex: 1 }}>{q}</Txt>
              </View>
            ))}
          </View>
          <Txt variant="small" muted>It understands dates like “yesterday”, “last week”, “in September”, “on 22 August” and “3 days ago”.</Txt>
        </Section>

        <Section title="Your privacy">
          <Card tone="soft">
            <Bullet icon="phone-portrait-outline">Everything stays on this phone: no account, no cloud, no AI service.</Bullet>
            <Bullet icon="mic-outline">Voice to text uses your phone’s own speech engine (the Google app).</Bullet>
            <Bullet icon="trash-outline">Recordings can be turned off or deleted automatically after 30, 90 or 365 days. The text stays.</Bullet>
            <Bullet icon="finger-print">Turn on the fingerprint lock on the Me tab to keep your journal private.</Bullet>
          </Card>
        </Section>

        <Section title="Tips">
          <View style={{ gap: 8 }}>
            {TIPS.map((tip) => (
              <Bullet key={tip} icon="bulb-outline">{tip}</Bullet>
            ))}
          </View>
        </Section>

        <Section title="About">
          <Card>
            <Txt>
              Built by <Text style={{ fontFamily: t.fonts.bold }}>Kavya Immanni</Text> with React Native, Expo, TypeScript and SQLite.
            </Txt>
            <Pressable onPress={() => Linking.openURL(PORTFOLIO).catch(() => {})} accessibilityRole="link" style={[styles.row, { gap: 6, minHeight: 32 }]}>
              <Ionicons name="open-outline" size={16} color={t.colors.accent} />
              <Text style={{ fontFamily: t.fonts.bold, color: t.colors.accent, fontSize: 14 }}>See my portfolio</Text>
            </Pressable>
            <Txt variant="small" muted>Version {Constants.expoConfig?.version ?? '1.0.0'}</Txt>
          </Card>
        </Section>
      </ScrollView>
    </View>
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

function Bullet({ icon, children }: { icon: keyof typeof Ionicons.glyphMap; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.row, { gap: 10, alignItems: 'flex-start' }]}>
      <Ionicons name={icon} size={17} color={t.colors.accent} style={{ marginTop: 3 }} />
      <Txt style={{ flex: 1 }}>{children}</Txt>
    </View>
  );
}
