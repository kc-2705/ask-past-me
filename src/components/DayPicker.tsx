import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { addDays, dayKey, formatDayChip, MONTHS } from '@/lib/dates';
import { useTheme } from '@/state/AppState';
import { styles, Txt } from './ui';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Chooses which day a note belongs to: Today, Yesterday, or any earlier day
 * from a small month calendar. Future days can't be picked.
 */
export function DayPicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const t = useTheme();
  const today = new Date();
  const todayKey = dayKey(today);
  const yesterdayKey = dayKey(addDays(today, -1));
  const valueKey = dayKey(value);
  const isOther = valueKey !== todayKey && valueKey !== yesterdayKey;
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));

  const chip = (label: string, on: boolean, onPress: () => void, icon?: keyof typeof Ionicons.glyphMap) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[
        styles.row,
        {
          gap: 6,
          paddingHorizontal: 14,
          paddingVertical: 9,
          borderRadius: t.radius.chip,
          backgroundColor: on ? t.colors.accent : t.colors.surface,
          borderWidth: 1,
          borderColor: on ? t.colors.accent : t.colors.line,
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={15} color={on ? t.colors.onAccent : t.colors.ink} /> : null}
      <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: on ? t.colors.onAccent : t.colors.ink }}>{label}</Text>
    </Pressable>
  );

  const pick = (d: Date) => {
    onChange(d);
    setOpen(false);
  };

  // Calendar cells for the shown month, Monday first; null = blank before day 1.
  const first = month;
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  const canGoNext = new Date(first.getFullYear(), first.getMonth() + 1, 1) <= today;

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.wrap}>
        {chip('Today', valueKey === todayKey, () => pick(today))}
        {chip('Yesterday', valueKey === yesterdayKey, () => pick(addDays(today, -1)))}
        {chip(isOther ? formatDayChip(value) : 'Pick a day', isOther || open, () => setOpen((o) => !o), 'calendar-outline')}
      </View>

      {open ? (
        <View style={{ backgroundColor: t.colors.surface, borderRadius: t.radius.card, padding: 12, gap: 8, borderWidth: 1, borderColor: t.colors.line }}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Pressable
              onPress={() => setMonth(new Date(first.getFullYear(), first.getMonth() - 1, 1))}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="chevron-back" size={20} color={t.colors.ink} />
            </Pressable>
            <Txt variant="bodyStrong">{`${cap(MONTHS[first.getMonth()])} ${first.getFullYear()}`}</Txt>
            <Pressable
              onPress={() => canGoNext && setMonth(new Date(first.getFullYear(), first.getMonth() + 1, 1))}
              disabled={!canGoNext}
              accessibilityRole="button"
              accessibilityLabel="Next month"
              style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: canGoNext ? 1 : 0.3 }}
            >
              <Ionicons name="chevron-forward" size={20} color={t.colors.ink} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row' }}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <Txt key={i} variant="small" muted style={{ flex: 1, textAlign: 'center' }}>{d}</Txt>
            ))}
          </View>
          {Array.from({ length: cells.length / 7 }, (_, row) => (
            <View key={row} style={{ flexDirection: 'row' }}>
              {cells.slice(row * 7, row * 7 + 7).map((d, i) => {
                if (!d) return <View key={i} style={{ flex: 1, height: 38 }} />;
                const k = dayKey(d);
                const future = k > todayKey;
                const on = k === valueKey;
                return (
                  <Pressable
                    key={i}
                    onPress={() => !future && pick(d)}
                    disabled={future}
                    accessibilityRole="button"
                    accessibilityLabel={formatDayChip(d)}
                    accessibilityState={{ selected: on, disabled: future }}
                    style={{ flex: 1, height: 38, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: on ? t.colors.accent : 'transparent',
                        borderWidth: k === todayKey && !on ? 1.5 : 0,
                        borderColor: t.colors.accent,
                      }}
                    >
                      <Text style={{ fontFamily: t.fonts.bold, fontSize: 13, color: on ? t.colors.onAccent : future ? t.colors.line : t.colors.ink }}>
                        {d.getDate()}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Puts a note on the chosen day, keeping the current time of day (or now, for today). */
export function atDay(day: Date): number {
  const now = new Date();
  if (dayKey(day) === dayKey(now)) return now.getTime();
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), now.getHours(), now.getMinutes()).getTime();
}
