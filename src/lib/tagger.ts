import type { Tag } from '@/db/database';
import { MONTHS, WEEKDAYS } from './dates';

// Mood words. The first mood found most often becomes the entry's mood.
export const MOOD_WORDS: Record<string, string[]> = {
  happy: ['happy', 'great day', 'amazing', 'wonderful', 'fun', 'joy', 'laughed', 'smiled', 'awesome', 'fantastic', 'loved it', 'good day'],
  proud: ['proud', 'accomplished', 'achieved', 'nailed', 'promoted', 'praised', 'finished', 'liked it', 'well done'],
  calm: ['calm', 'relaxed', 'peaceful', 'chill', 'rested', 'clear', 'okay', 'slept well'],
  grateful: ['grateful', 'thankful', 'blessed', 'appreciate', 'lucky'],
  excited: ['excited', "can't wait", 'cannot wait', 'thrilled', 'looking forward'],
  tired: ['tired', 'exhausted', 'sleepy', 'drained', 'long day', 'worn out', 'no energy'],
  stressed: ['stressed', 'stress', 'pressure', 'deadline', 'overwhelmed', 'hectic', 'tense', 'too much work'],
  anxious: ['anxious', 'worried', 'nervous', 'scared', 'afraid', 'panic'],
  sad: ['sad', 'lonely', 'miss home', 'missed', 'cried', 'upset', 'homesick', 'feeling low'],
  angry: ['angry', 'annoyed', 'frustrated', 'irritated', 'mad at'],
};
export const MOODS = Object.keys(MOOD_WORDS);
export const LOW_MOODS = ['stressed', 'anxious', 'sad', 'tired', 'angry'];

const FAMILY = [
  'amma', 'appa', 'mom', 'mum', 'mother', 'dad', 'father', 'papa', 'mummy', 'nana', 'nani', 'dadi', 'thatha', 'paati',
  'grandma', 'grandpa', 'sister', 'brother', 'akka', 'anna', 'bhaiya', 'didi', 'wife', 'husband', 'son', 'daughter',
  'aunt', 'uncle', 'cousin', 'boss', 'manager', 'roommate', 'best friend',
];

// Everyday things people later ask "when did I last…" about.
const TOPICS = [
  'haircut', 'gym', 'workout', 'yoga', 'run', 'walk', 'doctor', 'dentist', 'eye checkup', 'checkup', 'movie', 'shopping',
  'groceries', 'interview', 'exam', 'meeting', 'party', 'birthday', 'trip', 'flight', 'cooking', 'cleaning', 'laundry',
  'rent', 'bill', 'salary', 'oil change', 'car service', 'demo', 'presentation', 'date', 'concert', 'temple', 'church',
  'hospital', 'medicine', 'headache', 'fever', 'swim', 'hike', 'book', 'class', 'deadline', 'release', 'vacation',
];

const NOT_NAMES = new Set([
  'i', "i'm", "i've", "i'd", 'ok', 'okay', 'the', 'a', 'an', 'and', 'but', 'so', 'then', 'today', 'tomorrow', 'yesterday',
  'god', 'english', 'hindi', 'telugu', 'tamil', 'indian', 'american', 'covid', 'thai', 'chinese', 'mexican', 'italian',
  'japanese', 'korean', 'french', 'spanish', 'greek', 'christmas', 'diwali', 'halloween', 'thanksgiving',
  ...MONTHS, ...WEEKDAYS,
]);

const PLACE_BEFORE = new Set(['at', 'in', 'to', 'from', 'near', 'visited', 'inside', 'outside']);
// Words that only ever come before a person, even for multi-word names.
const STRONG_PERSON_BEFORE = new Set(['with', 'met', 'told', 'asked', 'texted', 'messaged', 'thanked', 'hugged']);
// Pronouns end a run of capitalized words ("Amma I miss you").
const RUN_BREAK = new Set(['i', "i'm", "i've", "i'd", "i'll"]);

const TASK_RE = /\b(?:need to|needs to|have to|has to|must|should|remind me to|don't forget to|do not forget to|got to|gotta|plan to|planning to)\s+([^.!?,;\n]+)/gi;

const capWords = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export function detectMood(text: string): string | null {
  const s = ' ' + text.toLowerCase() + ' ';
  let best: string | null = null;
  let bestScore = 0;
  for (const mood of MOODS) {
    let score = 0;
    for (const w of MOOD_WORDS[mood]) {
      const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\']/g, '\\$&')}\\b`, 'g');
      score += (s.match(re) ?? []).length;
    }
    if (score > bestScore) {
      best = mood;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Pulls people, places, to-dos and topics out of a journal entry.
 * `known` holds names the person already used, so lowercase mentions of
 * them (speech engines don't always capitalize) are still found.
 */
export function extractTags(text: string, known: { people: string[]; places: string[] } = { people: [], places: [] }): Tag[] {
  const tags: Tag[] = [];
  const seen = new Set<string>();
  const push = (kind: Tag['kind'], label: string) => {
    const key = label.toLowerCase();
    if (!label || seen.has(key)) return;
    seen.add(key);
    tags.push({ kind, label });
  };
  const lower = text.toLowerCase();
  const hasWord = (w: string) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower);

  // 1. Names already known from earlier entries.
  for (const p of known.people) if (hasWord(p)) push('person', p);
  for (const p of known.places) if (hasWord(p)) push('place', p);

  // 2. Family and relationship words.
  for (const f of FAMILY) if (hasWord(f)) push('person', capWords(f));

  // 3. Capitalized word runs that are not at the start of a sentence.
  const tokens = text.match(/[A-Za-z][A-Za-z'’-]*|[.!?]/g) ?? [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!/^[A-Z]/.test(t)) continue;
    const prev = tokens[i - 1];
    const sentenceStart = i === 0 || /^[.!?]$/.test(prev);
    let j = i;
    const run: string[] = [];
    while (j < tokens.length && /^[A-Z][a-z'’-]*/.test(tokens[j]) && !RUN_BREAK.has(tokens[j].toLowerCase())) {
      run.push(tokens[j]);
      j++;
    }
    if (!run.length) continue;
    i = j - 1;
    // At a sentence start the first word is capitalized only by grammar ("Called Amma"),
    // so drop it and let the word after it decide.
    let before = (prev ?? '').toLowerCase();
    if (sentenceStart) before = run.shift()!.toLowerCase();
    // A lone word like "Thai" or "Monday" is not a name; inside a run ("Thai Basil") it is.
    if (!run.length || (run.length === 1 && NOT_NAMES.has(run[0].toLowerCase()))) continue;
    const label = run.join(' ');
    if (PLACE_BEFORE.has(before)) push('place', label);
    else if (run.length === 1) push('person', label);
    // Several capitalized words are usually a place or business ("a cafe called Thai Basil")
    // unless the word before clearly points to a person ("met Ravi Kumar").
    else if (STRONG_PERSON_BEFORE.has(before)) push('person', label);
    else push('place', label);
  }

  // 4. To-dos: "need to book an eye checkup".
  for (const m of text.matchAll(TASK_RE)) {
    const words = m[1].trim().split(/\s+/).slice(0, 6).join(' ');
    if (words.length > 2) push('task', words.charAt(0).toUpperCase() + words.slice(1));
  }

  // 5. Everyday topics.
  let topics = 0;
  for (const t of TOPICS) {
    if (topics >= 4) break;
    if (hasWord(t)) {
      push('topic', capWords(t));
      topics++;
    }
  }
  return tags;
}

/** Splits text into sentences; long unpunctuated speech is cut into ~25-word chunks. */
export function sentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const words = p.split(/\s+/);
    if (words.length <= 30) out.push(p);
    else for (let i = 0; i < words.length; i += 25) out.push(words.slice(i, i + 25).join(' '));
  }
  return out;
}
