import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getAllSettings, setSetting } from '@/db/database';
import { themes, type Theme, type ThemeId } from '@/theme/themes';

export type Settings = {
  theme: ThemeId;
  name: string;
  birthday: string; // 'MM-DD' or ''
  lang: string; // speech language, e.g. 'en-US'
  reminderOn: boolean;
  reminderHour: number;
  reminderMinute: number;
  lockOn: boolean;
  keepAudio: boolean;
  // Recordings older than this many days are deleted (the text stays). 0 = keep forever.
  audioDays: number;
};

const DEFAULTS: Settings = {
  theme: 'lilac',
  name: '',
  birthday: '',
  lang: 'en-US',
  reminderOn: false,
  reminderHour: 21,
  reminderMinute: 0,
  lockOn: false,
  keepAudio: true,
  audioDays: 0,
};

type AppState = {
  ready: boolean;
  settings: Settings;
  theme: Theme;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
  // Screens read this to know when entries changed somewhere else.
  dataVersion: number;
  bumpData: () => void;
};

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    getAllSettings(db).then((raw) => {
      const next = { ...DEFAULTS };
      for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
        if (raw[key] == null) continue;
        try {
          (next as Record<string, unknown>)[key] = JSON.parse(raw[key]);
        } catch {
          // Ignore a bad value and keep the default.
        }
      }
      if (!themes[next.theme]) next.theme = 'lilac';
      setSettings(next);
      setReady(true);
    });
  }, [db]);

  const update = useCallback(
    async <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((s) => ({ ...s, [key]: value }));
      await setSetting(db, key, JSON.stringify(value));
    },
    [db],
  );

  const bumpData = useCallback(() => setDataVersion((v) => v + 1), []);

  const value = useMemo(
    () => ({ ready, settings, theme: themes[settings.theme], update, dataVersion, bumpData }),
    [ready, settings, update, dataVersion, bumpData],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppStateProvider');
  return v;
}

export const useTheme = () => useApp().theme;
