import type { SQLiteDatabase } from 'expo-sqlite';
import type { TagKind } from '@/theme/themes';
import { dayKey } from '@/lib/dates';

export const DB_NAME = 'askpastme.db';

export type Tag = { kind: TagKind; label: string };

export type Entry = {
  id: number;
  createdAt: number;
  day: string;
  text: string;
  mood: string | null;
  tags: Tag[];
  audio: string[];
  durationMs: number;
};

type EntryRow = {
  id: number;
  created_at: number;
  day: string;
  text: string;
  mood: string | null;
  tags: string;
  audio: string;
  duration_ms: number;
};

const LATEST_VERSION = 1;

// Runs once when the app opens. PRAGMA user_version tracks which migrations already ran.
export async function migrate(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= LATEST_VERSION) return;

  if (version === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        day TEXT NOT NULL,
        text TEXT NOT NULL,
        mood TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        tag_text TEXT NOT NULL DEFAULT '',
        audio TEXT NOT NULL DEFAULT '[]',
        duration_ms INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_entries_day ON entries(day);
      CREATE INDEX IF NOT EXISTS idx_entries_created ON entries(created_at);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    `);
    // The full-text index is optional: the web build of SQLite has no FTS5,
    // so search falls back to LIKE there.
    try {
      await db.execAsync(`
        CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
          text, tag_text, content='entries', content_rowid='id', tokenize='porter unicode61'
        );
        CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
          INSERT INTO entries_fts(rowid, text, tag_text) VALUES (new.id, new.text, new.tag_text);
        END;
        CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
          INSERT INTO entries_fts(entries_fts, rowid, text, tag_text) VALUES ('delete', old.id, old.text, old.tag_text);
        END;
        CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
          INSERT INTO entries_fts(entries_fts, rowid, text, tag_text) VALUES ('delete', old.id, old.text, old.tag_text);
          INSERT INTO entries_fts(rowid, text, tag_text) VALUES (new.id, new.text, new.tag_text);
        END;
      `);
    } catch {
      // No FTS5 here; searchEntries uses the LIKE fallback.
    }
    version = 1;
  }

  await db.execAsync(`PRAGMA user_version = ${version}`);
}

function toEntry(r: EntryRow): Entry {
  return {
    id: r.id,
    createdAt: r.created_at,
    day: r.day,
    text: r.text,
    mood: r.mood,
    tags: safeJson<Tag[]>(r.tags, []),
    audio: safeJson<string[]>(r.audio, []),
    durationMs: r.duration_ms,
  };
}

function safeJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

const tagText = (tags: Tag[]) => tags.map((t) => t.label).join(' ');

// Names and places used before, per kind. The tagger needs them on every note,
// so they are kept in memory and rebuilt only after notes change.
const tagCache = new Map<TagKind, string[]>();
const notesChanged = () => tagCache.clear();

let ftsCache: boolean | null = null;
async function hasFts(db: SQLiteDatabase): Promise<boolean> {
  if (ftsCache == null) {
    const r = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'entries_fts'",
    );
    ftsCache = (r?.n ?? 0) > 0;
  }
  return ftsCache;
}

export type NewEntry = {
  text: string;
  mood: string | null;
  tags: Tag[];
  audio: string[];
  durationMs: number;
  createdAt?: number;
};

export async function addEntry(db: SQLiteDatabase, e: NewEntry): Promise<number> {
  const at = e.createdAt ?? Date.now();
  const res = await db.runAsync(
    `INSERT INTO entries (created_at, updated_at, day, text, mood, tags, tag_text, audio, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    at,
    Date.now(),
    dayKey(new Date(at)),
    e.text.trim(),
    e.mood,
    JSON.stringify(e.tags),
    tagText(e.tags),
    JSON.stringify(e.audio),
    e.durationMs,
  );
  notesChanged();
  return res.lastInsertRowId;
}

export async function updateEntry(
  db: SQLiteDatabase,
  id: number,
  patch: { text: string; mood: string | null; tags: Tag[]; createdAt?: number },
) {
  await db.runAsync(
    'UPDATE entries SET text = ?, mood = ?, tags = ?, tag_text = ?, updated_at = ? WHERE id = ?',
    patch.text.trim(),
    patch.mood,
    JSON.stringify(patch.tags),
    tagText(patch.tags),
    Date.now(),
    id,
  );
  if (patch.createdAt != null) {
    await db.runAsync(
      'UPDATE entries SET created_at = ?, day = ? WHERE id = ?',
      patch.createdAt,
      dayKey(new Date(patch.createdAt)),
      id,
    );
  }
  notesChanged();
}

export async function deleteEntry(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM entries WHERE id = ?', id);
  notesChanged();
}

export async function getEntry(db: SQLiteDatabase, id: number): Promise<Entry | null> {
  const r = await db.getFirstAsync<EntryRow>('SELECT * FROM entries WHERE id = ?', id);
  return r ? toEntry(r) : null;
}

/** Newest notes first, one page at a time. `mood` limits it to notes with that mood. */
export async function listEntries(
  db: SQLiteDatabase,
  limit = 500,
  opts: { offset?: number; mood?: string | null } = {},
): Promise<Entry[]> {
  const rows = opts.mood
    ? await db.getAllAsync<EntryRow>(
        'SELECT * FROM entries WHERE mood = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        opts.mood,
        limit,
        opts.offset ?? 0,
      )
    : await db.getAllAsync<EntryRow>('SELECT * FROM entries ORDER BY created_at DESC LIMIT ? OFFSET ?', limit, opts.offset ?? 0);
  return rows.map(toEntry);
}

/** Moods that appear in at least one note, most used first. */
export async function usedMoods(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ mood: string }>(
    'SELECT mood FROM entries WHERE mood IS NOT NULL GROUP BY mood ORDER BY COUNT(*) DESC',
  );
  return rows.map((r) => r.mood);
}

/** Entries whose day falls inside [startDay, endDay], both 'YYYY-MM-DD', newest first. */
export async function entriesBetween(db: SQLiteDatabase, startDay: string, endDay: string) {
  const rows = await db.getAllAsync<EntryRow>(
    'SELECT * FROM entries WHERE day BETWEEN ? AND ? ORDER BY created_at DESC',
    startDay,
    endDay,
  );
  return rows.map(toEntry);
}

/**
 * Full-text search. `terms` are plain words; each becomes a prefix match so
 * "haircut" also finds "haircuts". Results are ranked by relevance (bm25).
 */
export async function searchEntries(
  db: SQLiteDatabase,
  terms: string[],
  opts: { mode?: 'any' | 'all'; limit?: number; order?: 'rank' | 'recent' } = {},
): Promise<Entry[]> {
  const clean = terms.map((t) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  if (!clean.length) return [];
  if (!(await hasFts(db))) return searchWithLike(db, clean, opts);
  const match = clean.map((t) => `"${t}"*`).join(opts.mode === 'all' ? ' AND ' : ' OR ');
  const order = opts.order === 'recent' ? 'e.created_at DESC' : 'bm25(entries_fts), e.created_at DESC';
  const rows = await db.getAllAsync<EntryRow>(
    `SELECT e.* FROM entries_fts JOIN entries e ON e.id = entries_fts.rowid
     WHERE entries_fts MATCH ? ORDER BY ${order} LIMIT ?`,
    match,
    opts.limit ?? 20,
  );
  return rows.map(toEntry);
}

/** Search without FTS5 (web): each word must appear as a substring; newest first. */
async function searchWithLike(
  db: SQLiteDatabase,
  words: string[],
  opts: { mode?: 'any' | 'all'; limit?: number },
): Promise<Entry[]> {
  const one = '(lower(text) LIKE ? OR lower(tag_text) LIKE ?)';
  const where = words.map(() => one).join(opts.mode === 'all' ? ' AND ' : ' OR ');
  const params = words.flatMap((w) => [`%${w}%`, `%${w}%`]);
  const rows = await db.getAllAsync<EntryRow>(
    `SELECT * FROM entries WHERE ${where} ORDER BY created_at DESC LIMIT ?`,
    ...params,
    opts.limit ?? 20,
  );
  return rows.map(toEntry);
}

/** Same calendar day (MM-DD) in earlier years. */
export async function onThisDay(db: SQLiteDatabase, today: string) {
  const rows = await db.getAllAsync<EntryRow>(
    "SELECT * FROM entries WHERE substr(day, 6) = ? AND day < ? ORDER BY day DESC LIMIT 5",
    today.slice(5),
    today.slice(0, 4) + '-01-01',
  );
  return rows.map(toEntry);
}

export async function allDays(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ day: string }>('SELECT DISTINCT day FROM entries ORDER BY day DESC');
  return rows.map((r) => r.day);
}

export async function knownTagLabels(db: SQLiteDatabase, kind: TagKind): Promise<string[]> {
  const cached = tagCache.get(kind);
  if (cached) return cached;
  const rows = await db.getAllAsync<{ tags: string }>('SELECT tags FROM entries ORDER BY created_at DESC LIMIT 1000');
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const t of safeJson<Tag[]>(r.tags, [])) {
      if (t.kind === kind) counts.set(t.label, (counts.get(t.label) ?? 0) + 1);
    }
  }
  const labels = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
  tagCache.set(kind, labels);
  return labels;
}

export async function countEntries(db: SQLiteDatabase) {
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM entries');
  return r?.n ?? 0;
}

export async function deleteAllEntries(db: SQLiteDatabase) {
  await db.execAsync('DELETE FROM entries');
  notesChanged();
  if (await hasFts(db)) await db.execAsync("INSERT INTO entries_fts(entries_fts) VALUES ('rebuild')");
}

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return r?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export async function getAllSettings(db: SQLiteDatabase): Promise<Record<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
