import type { SQLiteDatabase } from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import { isWeb } from './platform';

// Voice recordings are WAV files (about 1.9 MB a minute), so they are the
// only thing that grows fast. Notes and the search index stay small.

export const audioDir = () => new Directory(Paths.document, 'audio');

export type StorageUsage = { notesBytes: number; audioBytes: number; audioFiles: number };

export async function storageUsage(db: SQLiteDatabase): Promise<StorageUsage> {
  const pages = await db.getFirstAsync<{ page_count: number }>('PRAGMA page_count');
  const size = await db.getFirstAsync<{ page_size: number }>('PRAGMA page_size');
  const notesBytes = (pages?.page_count ?? 0) * (size?.page_size ?? 0);
  let audioBytes = 0;
  let audioFiles = 0;
  if (!isWeb) {
    try {
      const dir = audioDir();
      if (dir.exists) {
        for (const f of dir.list()) {
          if (f instanceof File) {
            audioBytes += f.size ?? 0;
            audioFiles++;
          }
        }
      }
    } catch {
      // If the folder can't be read, show zero rather than fail the screen.
    }
  }
  return { notesBytes, audioBytes, audioFiles };
}

function deleteFile(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
}

/**
 * Deletes recordings from notes older than `days` (or from every note when
 * `days` is 'all'). The text of each note is kept. Returns how many notes changed.
 */
export async function deleteRecordings(db: SQLiteDatabase, days: number | 'all'): Promise<number> {
  if (isWeb) return 0;
  const cutoff = days === 'all' ? Number.MAX_SAFE_INTEGER : Date.now() - days * 86_400_000;
  const rows = await db.getAllAsync<{ id: number; audio: string }>(
    "SELECT id, audio FROM entries WHERE audio != '[]' AND created_at < ?",
    cutoff,
  );
  for (const r of rows) {
    try {
      for (const uri of JSON.parse(r.audio) as string[]) deleteFile(uri);
    } catch {
      // Bad JSON: still clear the list below.
    }
  }
  if (rows.length) {
    await db.runAsync("UPDATE entries SET audio = '[]' WHERE audio != '[]' AND created_at < ?", cutoff);
  }
  return rows.length;
}

/**
 * Removes recording files no note points to, such as recordings from notes
 * that were discarded. Files from the last hour are left alone in case a note
 * is still being written.
 */
export async function deleteOrphanRecordings(db: SQLiteDatabase): Promise<number> {
  if (isWeb) return 0;
  const dir = audioDir();
  if (!dir.exists) return 0;
  const rows = await db.getAllAsync<{ audio: string }>("SELECT audio FROM entries WHERE audio != '[]'");
  const used = new Set<string>();
  for (const r of rows) {
    try {
      for (const uri of JSON.parse(r.audio) as string[]) used.add(uri);
    } catch {
      // Ignore a bad row.
    }
  }
  let removed = 0;
  const hourAgo = Date.now() - 3_600_000;
  for (const f of dir.list()) {
    if (!(f instanceof File) || used.has(f.uri)) continue;
    // Recording names carry their creation time: note-<ms>.wav
    const made = Number(f.name.match(/note-(\d+)/)?.[1] ?? 0);
    if (made && made > hourAgo) continue;
    deleteFile(f.uri);
    removed++;
  }
  return removed;
}

export function deleteFiles(uris: string[]) {
  if (isWeb) return;
  uris.forEach(deleteFile);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
