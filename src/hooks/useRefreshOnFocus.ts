import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { dayKey } from '@/lib/dates';
import { useApp } from '@/state/AppState';

/**
 * Runs `load` when the screen comes into view, but only if notes changed
 * since the last load (or the date rolled over). Switching tabs back and
 * forth no longer re-reads the database each time.
 */
export function useRefreshOnFocus(load: () => void) {
  const { dataVersion } = useApp();
  const loadedFor = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      const key = `${dataVersion}|${dayKey(new Date())}`;
      if (loadedFor.current === key) return;
      loadedFor.current = key;
      load();
    }, [dataVersion, load]),
  );
}
