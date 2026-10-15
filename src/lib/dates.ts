export const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const MONTH_SHORT = MONTHS.map((m) => m.slice(0, 3));
export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const pad = (n: number) => String(n).padStart(2, '0');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Local calendar day as 'YYYY-MM-DD'. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

/** "Tuesday, 14 October" */
export function formatLong(d: Date): string {
  return `${cap(WEEKDAYS[d.getDay()])}, ${d.getDate()} ${cap(MONTHS[d.getMonth()])}`;
}

/** "14 Oct", or "14 Oct 2025" when not this year. */
export function formatShort(d: Date, now = new Date()): string {
  const base = `${d.getDate()} ${cap(MONTH_SHORT[d.getMonth()])}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** "Tue, 14 Oct" */
export function formatDayChip(d: Date): string {
  return `${cap(WEEKDAYS[d.getDay()].slice(0, 3))}, ${d.getDate()} ${cap(MONTH_SHORT[d.getMonth()])}`;
}

export function formatTime(d: Date): string {
  let h = d.getHours();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${pad(d.getMinutes())} ${ampm}`;
}

export function monthTitle(key: string): string {
  const d = parseDay(key);
  return `${cap(MONTHS[d.getMonth()])} ${d.getFullYear()}`;
}

/** "today", "yesterday", "5 days ago", "about 7 weeks ago", "about 3 months ago" */
export function relative(d: Date, now = new Date()): string {
  const n = daysBetween(d, now);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 14) return `${n} days ago`;
  if (n < 60) return `about ${Math.round(n / 7)} weeks ago`;
  if (n < 365) return `about ${Math.round(n / 30)} months ago`;
  const y = Math.round(n / 365);
  return `about ${y} year${y > 1 ? 's' : ''} ago`;
}

/** Days in a row with at least one entry, counting back from today (or yesterday). */
export function streak(daysDesc: string[], now = new Date()): number {
  const set = new Set(daysDesc);
  let cursor = set.has(dayKey(now)) ? now : addDays(now, -1);
  let n = 0;
  while (set.has(dayKey(cursor))) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export type DayRange = { start: string; end: string; label: string };

function range(a: Date, b: Date, label: string): DayRange {
  return { start: dayKey(a), end: dayKey(b), label };
}

/**
 * Finds a time phrase in a question and turns it into a day range.
 * Handles: today, yesterday, N days/weeks ago, this/last week|month|year,
 * last <weekday>, in <month>, on <day> <month> / <month> <day>, my birthday.
 */
export function findDateRange(q: string, now = new Date(), birthday?: string | null): DayRange | null {
  const s = q.toLowerCase();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (/\btoday\b/.test(s)) return range(today, today, 'today');
  if (/\byesterday\b/.test(s)) {
    const y = addDays(today, -1);
    return range(y, y, 'yesterday');
  }

  let m = s.match(/\b(\d+|a|one|two|three|four|five|six)\s+(day|week|month)s?\s+ago\b/);
  if (m) {
    const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
    const n = words[m[1]] ?? Number(m[1]);
    const unit = m[2];
    if (unit === 'day') {
      const d = addDays(today, -n);
      return range(d, d, `${n} day${n > 1 ? 's' : ''} ago`);
    }
    if (unit === 'week') {
      const mid = addDays(today, -7 * n);
      return range(addDays(mid, -3), addDays(mid, 3), `${n} week${n > 1 ? 's' : ''} ago`);
    }
    const mo = new Date(today.getFullYear(), today.getMonth() - n, 1);
    return range(mo, new Date(mo.getFullYear(), mo.getMonth() + 1, 0), `${cap(MONTHS[mo.getMonth()])}`);
  }

  const monday = addDays(today, -((today.getDay() + 6) % 7));
  if (/\bthis week\b/.test(s)) return range(monday, today, 'this week');
  if (/\blast week\b/.test(s)) return range(addDays(monday, -7), addDays(monday, -1), 'last week');
  if (/\b(past|last) (7|seven) days\b/.test(s)) return range(addDays(today, -6), today, 'the last 7 days');
  if (/\b(past|last) (30|thirty) days\b/.test(s)) return range(addDays(today, -29), today, 'the last 30 days');
  if (/\bthis month\b/.test(s)) return range(new Date(today.getFullYear(), today.getMonth(), 1), today, 'this month');
  if (/\blast month\b/.test(s)) {
    const a = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return range(a, new Date(today.getFullYear(), today.getMonth(), 0), 'last month');
  }
  if (/\bthis year\b/.test(s)) return range(new Date(today.getFullYear(), 0, 1), today, 'this year');
  if (/\blast year\b/.test(s)) {
    const y = today.getFullYear() - 1;
    return range(new Date(y, 0, 1), new Date(y, 11, 31), String(y));
  }

  m = s.match(/\blast (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/) ??
    s.match(/\bon (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (m) {
    const target = WEEKDAYS.indexOf(m[1]);
    let back = (today.getDay() - target + 7) % 7;
    if (back === 0) back = 7;
    const d = addDays(today, -back);
    return range(d, d, `last ${cap(m[1])}`);
  }

  if (/\bmy birthday\b/.test(s) && birthday && /^\d{2}-\d{2}$/.test(birthday)) {
    const [bm, bd] = birthday.split('-').map(Number);
    let d = new Date(today.getFullYear(), bm - 1, bd);
    if (d > today) d = new Date(today.getFullYear() - 1, bm - 1, bd);
    return range(d, d, `your birthday (${formatShort(d, now)})`);
  }

  const monthAlt = MONTHS.map((x, i) => `${x}|${MONTH_SHORT[i]}`).join('|');
  m = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthAlt})\\b`)) ;
  let dayNum: number | null = null;
  let monthIdx: number | null = null;
  if (m) {
    dayNum = Number(m[1]);
    monthIdx = monthIndex(m[2]);
  } else {
    m = s.match(new RegExp(`\\b(${monthAlt})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
    if (m) {
      monthIdx = monthIndex(m[1]);
      dayNum = Number(m[2]);
    }
  }
  if (dayNum != null && monthIdx != null && dayNum >= 1 && dayNum <= 31) {
    let d = new Date(today.getFullYear(), monthIdx, dayNum);
    if (d > today) d = new Date(today.getFullYear() - 1, monthIdx, dayNum);
    return range(d, d, formatShort(d, now));
  }

  m = s.match(new RegExp(`\\b(?:in|during|of|last)\\s+(${monthAlt})\\b`));
  if (m) {
    const mi = monthIndex(m[1]);
    let y = today.getFullYear();
    if (mi > today.getMonth()) y -= 1;
    return range(new Date(y, mi, 1), new Date(y, mi + 1, 0), cap(MONTHS[mi]));
  }
  return null;
}

function monthIndex(word: string): number {
  const i = MONTHS.indexOf(word);
  return i >= 0 ? i : MONTH_SHORT.indexOf(word);
}

/** Removes the time phrase from a question so it is not treated as a search word. */
export const DATE_WORDS = new Set([
  'today', 'yesterday', 'ago', 'week', 'weeks', 'month', 'months', 'year', 'years', 'day', 'days',
  'this', 'last', 'past', 'birthday', ...MONTHS, ...MONTH_SHORT, ...WEEKDAYS,
]);
