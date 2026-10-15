import type { SQLiteDatabase } from 'expo-sqlite';
import { entriesBetween, listEntries, searchEntries, type Entry } from '@/db/database';
import { DATE_WORDS, daysBetween, findDateRange, formatDayChip, parseDay, relative, type DayRange } from './dates';
import { LOW_MOODS, MOOD_WORDS, sentences } from './tagger';

export type Answer = {
  text: string;
  sources: Entry[];
  // The words to highlight in source quotes.
  highlight: string[];
};

const STOP = new Set([
  'i', 'me', 'my', 'mine', 'myself', 'did', 'do', 'does', 'done', 'when', 'what', 'where', 'who', 'whom', 'which', 'how',
  'why', 'time', 'times', 'the', 'a', 'an', 'was', 'were', 'is', 'am', 'are', 'be', 'been', 'have', 'has', 'had', 'get',
  'got', 'go', 'went', 'ever', 'many', 'much', 'often', 'on', 'in', 'at', 'to', 'of', 'for', 'with', 'about', 'and', 'or',
  'any', 'anything', 'something', 'tell', 'show', 'remind', 'you', 'your', 'that', 'it', 'its', 'thing', 'things',
  'feel', 'felt', 'feeling', 'mood', 'there', 'than', 'most', 'recently', 'recent', 'previous', 'before', 'after', 'last',
  'first', 'can', 'could', 'would', 'should', 'please', 'from', 'by', 'up', 'out', 'over', 'all', 'some', 'say', 'said',
  'mention', 'mentioned', 'talk', 'talked', 'think', 'helped', 'help', 'make', 'made', 'like', 'liked', 'let', 'know',
]);

// Small synonym map so "haircut" also finds "salon" or "barber".
const SYNONYMS: Record<string, string[]> = {
  haircut: ['haircut', 'hair', 'salon', 'barber'],
  doctor: ['doctor', 'clinic', 'appointment', 'hospital'],
  gym: ['gym', 'workout', 'exercise'],
  workout: ['workout', 'gym', 'exercise'],
  call: ['call', 'called', 'phoned'],
  movie: ['movie', 'film', 'cinema'],
  groceries: ['groceries', 'grocery', 'supermarket'],
  restaurant: ['restaurant', 'dinner', 'lunch', 'cafe'],
  sick: ['sick', 'fever', 'cold', 'headache', 'unwell'],
};

export function keywordsOf(q: string): string[] {
  const words = q.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  const out: string[] = [];
  for (const w of words) {
    const base = w.replace(/'s$/, '');
    if (STOP.has(base) || DATE_WORDS.has(base) || base.length < 2) continue;
    out.push(...(SYNONYMS[base] ?? [base]));
  }
  return [...new Set(out)];
}

const quote = (s: string) => `“${s.replace(/\s+/g, ' ').trim()}”`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** The sentence of an entry that best matches the words, or its first sentence. */
export function bestSentence(e: Entry, words: string[]): string {
  const parts = sentences(e.text);
  if (!words.length) return parts[0] ?? e.text;
  let best = parts[0] ?? e.text;
  let score = 0;
  for (const p of parts) {
    const low = p.toLowerCase();
    const s = words.reduce((n, w) => n + (low.includes(w) ? 1 : 0), 0);
    if (s > score) {
      score = s;
      best = p;
    }
  }
  return best;
}

const dayOf = (e: Entry) => parseDay(e.day);
const inRange = (e: Entry, r: DayRange | null) => !r || (e.day >= r.start && e.day <= r.end);

export async function answerQuestion(
  db: SQLiteDatabase,
  question: string,
  opts: { birthday?: string | null; now?: Date } = {},
): Promise<Answer> {
  const now = opts.now ?? new Date();
  const q = question.trim().toLowerCase();
  const range = findDateRange(q, now, opts.birthday);
  const words = keywordsOf(q);

  // "What helped when I was stressed?"
  if (/\b(what|which)\b.*\b(help|helped|helps|better|calm me|cheer)/.test(q)) {
    return whatHelped(db, q, range);
  }

  // "How many times did I go to the gym this month?"
  if (/\bhow (many|often)\b/.test(q) && words.length) {
    const hits = (await searchEntries(db, words, { mode: 'any', limit: 500, order: 'recent' })).filter((e) => inRange(e, range));
    const days = new Set(hits.map((e) => e.day));
    if (!hits.length) return notFound(words, range);
    return {
      text: `${capFirst(words[0])} came up on ${plural(days.size, 'day')} ${range ? range.label : 'in your notes'}. The most recent was ${formatDayChip(dayOf(hits[0]))} (${relative(dayOf(hits[0]), now)}).`,
      sources: hits.slice(0, 5),
      highlight: words,
    };
  }

  // "How was my mood last month?" / "How did I feel this week?"
  if (/\b(mood|how (was|did|have) i (been |)(feel|feeling|doing)|how was i)\b/.test(q)) {
    return moodSummary(db, range, now);
  }

  // "Who did I talk to this week?"
  if (/^who\b|\bwhich (people|friends)\b/.test(q)) {
    const pool = range ? await entriesBetween(db, range.start, range.end) : await listEntries(db, 300);
    const counts = new Map<string, number>();
    for (const e of pool) for (const t of e.tags) if (t.kind === 'person') counts.set(t.label, (counts.get(t.label) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!top.length) return { text: `I didn't find any people mentioned ${range ? range.label : 'yet'}.`, sources: [], highlight: [] };
    const list = top.map(([n, c]) => `${n} (${plural(c, 'time')})`).join(', ');
    const names = top.map(([n]) => n.toLowerCase());
    return {
      text: `${range ? capFirst(range.label) : 'Most often'} you mentioned: ${list}.`,
      sources: pool.filter((e) => e.tags.some((t) => names.includes(t.label.toLowerCase()))).slice(0, 5),
      highlight: names,
    };
  }

  // "Where did I go last weekend?"
  if (/^where\b/.test(q) && !words.length) {
    const pool = range ? await entriesBetween(db, range.start, range.end) : await listEntries(db, 100);
    const places = [...new Set(pool.flatMap((e) => e.tags.filter((t) => t.kind === 'place').map((t) => t.label)))];
    if (!places.length) return { text: `I didn't find any places ${range ? range.label : 'in your recent notes'}.`, sources: [], highlight: [] };
    return { text: `${range ? capFirst(range.label) : 'Recently'} you went to ${joinList(places.slice(0, 6))}.`, sources: pool.slice(0, 5), highlight: places.map((p) => p.toLowerCase()) };
  }

  // "When did I last get a haircut?"
  if (/\b(when|last time|latest)\b/.test(q) && words.length) {
    let hits = await searchEntries(db, words, { mode: 'all', limit: 50, order: 'recent' });
    if (!hits.length) hits = await searchEntries(db, words, { mode: 'any', limit: 50, order: 'recent' });
    hits = hits.filter((e) => inRange(e, range));
    if (!hits.length) return notFound(words, range);
    const [first, second] = uniqueDays(hits);
    let text = `Most recently on ${formatDayChip(dayOf(first))}, ${relative(dayOf(first), now)}. You said ${quote(bestSentence(first, words))}`;
    if (second) {
      const gap = daysBetween(dayOf(second), dayOf(first));
      text += `\n\nBefore that: ${formatDayChip(dayOf(second))}, ${gap} days earlier.`;
    }
    return { text, sources: uniqueDays(hits).slice(0, 3), highlight: words };
  }

  // "What did I do yesterday?" – a date with nothing else to search for.
  if (range && !words.length) {
    const pool = await entriesBetween(db, range.start, range.end);
    if (!pool.length) return { text: `You have no notes for ${range.label}.`, sources: [], highlight: [] };
    const lines = pool.slice(0, 4).reverse().map((e) => `• ${bestSentence(e, [])}`);
    return {
      text: `${capFirst(range.label)} you made ${plural(pool.length, 'note')}:\n${lines.join('\n')}`,
      sources: pool.slice(0, 5),
      highlight: [],
    };
  }

  // Anything else: a ranked search.
  if (!words.length) {
    return { text: 'Ask me about something you did, a person, a place, or a date. For example: "When did I last call Amma?"', sources: [], highlight: [] };
  }
  const hits = (await searchEntries(db, words, { mode: 'any', limit: 50 })).filter((e) => inRange(e, range));
  if (!hits.length) return notFound(words, range);
  const top = hits[0];
  return {
    text: `I found ${plural(hits.length, 'note')} about that. The closest is from ${formatDayChip(dayOf(top))}: ${quote(bestSentence(top, words))}`,
    sources: hits.slice(0, 4),
    highlight: words,
  };
}

async function whatHelped(db: SQLiteDatabase, q: string, range: DayRange | null): Promise<Answer> {
  const askedMood = LOW_MOODS.find((m) => q.includes(m) || MOOD_WORDS[m].some((w) => q.includes(w))) ?? 'stressed';
  const pool = range ? await entriesBetween(db, range.start, range.end) : await listEntries(db, 400);
  const helpRe = /\b(helped|felt better|feel better|better after|relaxed|calmed|cleared my head|head felt clear|cheered me up|laughed|slept better)\b/i;
  const found: { e: Entry; s: string }[] = [];
  for (const e of pool) {
    for (const s of sentences(e.text)) if (helpRe.test(s)) found.push({ e, s });
  }
  const lowDays = new Set(pool.filter((e) => e.mood && LOW_MOODS.includes(e.mood)).map((e) => e.day));
  if (!found.length) {
    return {
      text: lowDays.size
        ? `You felt ${askedMood} on ${plural(lowDays.size, 'day')}, but you didn't mention what helped. Next time, try saying what made it better.`
        : `I couldn't find notes about what helped when you felt ${askedMood}.`,
      sources: [],
      highlight: [],
    };
  }
  const lines = found.slice(0, 3).map((f) => `• ${formatDayChip(parseDay(f.e.day))}: ${quote(f.s)}`);
  return {
    text: `Here's what you said helped:\n${lines.join('\n')}`,
    sources: [...new Map(found.map((f) => [f.e.id, f.e])).values()].slice(0, 4),
    highlight: ['helped', 'better', 'relaxed', 'clear', 'calm'],
  };
}

async function moodSummary(db: SQLiteDatabase, range: DayRange | null, now: Date): Promise<Answer> {
  const r = range ?? { start: dayKeyOffset(now, -29), end: dayKeyOffset(now, 0), label: 'the last 30 days' };
  const pool = await entriesBetween(db, r.start, r.end);
  const counts = new Map<string, number>();
  for (const e of pool) if (e.mood) counts.set(e.mood, (counts.get(e.mood) ?? 0) + 1);
  if (!counts.size) return { text: `I don't have any moods for ${r.label} yet.`, sources: [], highlight: [] };
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const low = sorted.filter(([m]) => LOW_MOODS.includes(m)).reduce((n, [, c]) => n + c, 0);
  const total = sorted.reduce((n, [, c]) => n + c, 0);
  const lean = low * 2 > total ? 'It was a heavier stretch.' : 'Mostly a good stretch.';
  return {
    text: `${capFirst(r.label)}: ${sorted.slice(0, 4).map(([m, c]) => `${m} ${plural(c, 'time')}`).join(', ')}. ${lean}`,
    sources: pool.filter((e) => e.mood === sorted[0][0]).slice(0, 3),
    highlight: MOOD_WORDS[sorted[0][0]] ?? [],
  };
}

function notFound(words: string[], range: DayRange | null): Answer {
  return {
    text: `I couldn't find "${words.slice(0, 3).join(' ')}" in your notes${range ? ` for ${range.label}` : ''}. Try other words, or ask about a date like "last week".`,
    sources: [],
    highlight: [],
  };
}

function uniqueDays(es: Entry[]): Entry[] {
  const seen = new Set<string>();
  return es.filter((e) => (seen.has(e.day) ? false : (seen.add(e.day), true)));
}

function dayKeyOffset(now: Date, n: number) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const joinList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** Question ideas built from the person's own data. */
export function suggestions(topTopics: string[], topPeople: string[]): string[] {
  const out = ['What did I do yesterday?'];
  if (topTopics[0]) out.push(`When did I last have a ${topTopics[0].toLowerCase()}?`);
  if (topPeople[0]) out.push(`When did I last talk to ${topPeople[0]}?`);
  out.push('What helped when I was stressed?', 'How was my mood last month?', 'Who did I talk to this week?');
  return out.slice(0, 5);
}
