import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Sora_300Light, Sora_400Regular, Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { Caveat_700Bold } from '@expo-google-fonts/caveat';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { DB_NAME, migrate, onThisDay } from '@/db/database';
import { dayKey } from '@/lib/dates';
import { deleteOrphanRecordings, deleteRecordings } from '@/lib/storage';
import { AppStateProvider, useApp } from '@/state/AppState';
import { Button, Txt } from '@/components/ui';
import { Intro, type IntroKind } from '@/components/Intro';
import Ionicons from '@expo/vector-icons/Ionicons';

SplashScreen.preventAutoHideAsync().catch(() => {});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    Sora_300Light,
    Sora_400Regular,
    Sora_600SemiBold,
    Sora_700Bold,
    Caveat_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });
  // If fonts fail, carry on with system fonts rather than a blank screen.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName={DB_NAME} onInit={migrate}>
        <AppStateProvider>
          <ThemedApp />
        </AppStateProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

function ThemedApp() {
  const db = useSQLiteContext();
  const { ready, theme, settings, bumpData } = useApp();
  const [introDone, setIntroDone] = useState(false);
  // Rewind plays only on days with a note from this date in an earlier year; otherwise the voice wave.
  const [introKind, setIntroKind] = useState<IntroKind | null>(null);
  useEffect(() => {
    if (!ready) return;
    onThisDay(db, dayKey(new Date()))
      .then((past) => setIntroKind(past.length ? 'rewind' : 'wave'))
      .catch(() => setIntroKind('wave'));
  }, [ready, db]);
  const endIntro = useCallback(() => setIntroDone(true), []);
  // The launch screen stays up until the intro has drawn its first frame, so there is no flash between them.
  const hideSplash = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // Housekeeping once per launch, after the first screen is up: apply the
  // "delete recordings older than" setting and remove unused recording files.
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(async () => {
      try {
        const changed = settings.audioDays > 0 ? await deleteRecordings(db, settings.audioDays) : 0;
        await deleteOrphanRecordings(db);
        if (changed) bumpData();
      } catch {
        // Housekeeping must never break the app.
      }
    }, 2000);
    return () => clearTimeout(id);
    // Run once when settings are first loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  if (!ready) return null;
  return (
    // In a browser, show the app in a phone-sized column so it looks like it will on a phone.
    <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? theme.colors.line : theme.colors.bg, alignItems: 'center' }}>
    <View style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 440 : undefined, backgroundColor: theme.colors.bg }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <LockGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.bg },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="entry/[id]" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="about" />
        </Stack>
      </LockGate>
    </View>
    {!introDone && introKind ? <Intro kind={introKind} onDone={endIntro} onShown={hideSplash} /> : null}
    </View>
  );
}

const RELOCK_AFTER_MS = 60_000;

/** When "Lock with fingerprint" is on, the journal stays hidden until the person unlocks it. */
function LockGate({ children }: { children: ReactNode }) {
  const { settings, theme } = useApp();
  const [unlocked, setUnlocked] = useState(!settings.lockOn);
  const [message, setMessage] = useState<string | null>(null);
  const leftAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock your journal' });
    setMessage(null);
    if (res.success) setUnlocked(true);
    else if (res.error !== 'user_cancel' && res.error !== 'system_cancel') setMessage('That didn’t work. Try again.');
  }, []);

  // Ask for the fingerprint once when the app opens; the Unlock button handles retries.
  useEffect(() => {
    if (!settings.lockOn) return;
    let alive = true;
    LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock your journal' }).then((res) => {
      if (alive && res.success) setUnlocked(true);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') leftAt.current = Date.now();
      if (s === 'active' && settings.lockOn && leftAt.current && Date.now() - leftAt.current > RELOCK_AFTER_MS) {
        setUnlocked(false);
      }
    });
    return () => sub.remove();
  }, [settings.lockOn]);

  if (unlocked || !settings.lockOn) return <>{children}</>;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, backgroundColor: theme.colors.bg }}>
      <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: theme.colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="lock-closed" size={36} color={theme.colors.accent} />
      </View>
      <Txt variant="display" style={{ textAlign: 'center' }}>Your journal is locked</Txt>
      <Txt muted style={{ textAlign: 'center' }}>Use your fingerprint or phone PIN to open it.</Txt>
      {message ? <Txt style={{ color: theme.colors.danger }}>{message}</Txt> : null}
      <Button label="Unlock" icon="finger-print" onPress={unlock} />
    </View>
  );
}
