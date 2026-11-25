import { offlineDb } from "@/lib/offline/db";
import {
  CardRecord,
  DailyQuestRecord,
  ErrorRecord,
  JourneyCityRecord,
  LessonRecord,
  NoteRecord,
  PronunciationAttemptRecord,
  ReadingTextRecord,
  ReviewLogRecord,
  RewardRecord,
  SessionRecord,
  SettingsRecord,
  WordStatusRecord,
} from "@/types/database";

export interface FullBackupPayload {
  version: 1;
  exportedAt: string;
  tables: {
    notes: NoteRecord[];
    cards: CardRecord[];
    review_logs: ReviewLogRecord[];
    sessions: SessionRecord[];
    settings: SettingsRecord[];
    lessons: LessonRecord[];
    errors: ErrorRecord[];
    pron_attempts: PronunciationAttemptRecord[];
    texts: ReadingTextRecord[];
    word_status: WordStatusRecord[];
    journey: JourneyCityRecord[];
    rewards: RewardRecord[];
    quests: DailyQuestRecord[];
  };
  localFlags?: Record<string, string>;
}

const LOCAL_FLAG_PREFIXES = [
  "espanol_fast_daily_blocks_v1_",
  "spanishx_unlock_all_stages_v1",
  "spanishx_reading_translations_v1",
  "spanishx_theme_v1",
  "spanishx_audio_rate_v1",
];

function readLocalFlags(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const flags: Record<string, string> = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (LOCAL_FLAG_PREFIXES.some((p) => k.startsWith(p))) {
        const v = window.localStorage.getItem(k);
        if (v !== null) flags[k] = v;
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return flags;
}

function writeLocalFlags(flags?: Record<string, string>) {
  if (typeof window === "undefined" || !flags) return;
  try {
    for (const [k, v] of Object.entries(flags)) {
      if (LOCAL_FLAG_PREFIXES.some((p) => k.startsWith(p))) {
        window.localStorage.setItem(k, v);
      }
    }
  } catch {
    // Ignore storage quota errors
  }
}

export async function exportAllLocalData(): Promise<FullBackupPayload> {
  if (!offlineDb) {
    throw new Error("Local browser storage is not available.");
  }

  const [
    notes,
    cards,
    review_logs,
    sessions,
    settings,
    lessons,
    errors,
    pron_attempts,
    texts,
    word_status,
    journey,
    rewards,
    quests,
  ] = await Promise.all([
    offlineDb.notes.toArray(),
    offlineDb.cards.toArray(),
    offlineDb.review_logs.toArray(),
    offlineDb.sessions.toArray(),
    offlineDb.settings.toArray(),
    offlineDb.lessons.toArray(),
    offlineDb.errors.toArray(),
    offlineDb.pron_attempts.toArray(),
    offlineDb.texts.toArray(),
    offlineDb.word_status.toArray(),
    offlineDb.journey.toArray(),
    offlineDb.rewards.toArray(),
    offlineDb.quests.toArray(),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: {
      notes,
      cards,
      review_logs,
      sessions,
      settings,
      lessons,
      errors,
      pron_attempts,
      texts,
      word_status,
      journey,
      rewards,
      quests,
    },
    localFlags: readLocalFlags(),
  };
}

async function bulkPutChunked<T>(
  table: { bulkPut: (items: T[]) => Promise<unknown> },
  items: T[] | undefined
) {
  if (!Array.isArray(items) || items.length === 0) return;
  const CHUNK = 1000;
  for (let i = 0; i < items.length; i += CHUNK) {
    await table.bulkPut(items.slice(i, i + CHUNK));
  }
}

export async function restoreAllLocalData(
  payload: FullBackupPayload
): Promise<{
  notes: number;
  cards: number;
  sessions: number;
  lessons: number;
  texts: number;
}> {
  if (!offlineDb) {
    throw new Error("Local browser storage is not available.");
  }
  if (!payload || !payload.tables || typeof payload.tables !== "object") {
    throw new Error("Invalid backup file format.");
  }

  const t = payload.tables;
  await bulkPutChunked(offlineDb.notes, t.notes);
  await bulkPutChunked(offlineDb.cards, t.cards);
  await bulkPutChunked(offlineDb.review_logs, t.review_logs);
  await bulkPutChunked(offlineDb.sessions, t.sessions);
  await bulkPutChunked(offlineDb.settings, t.settings);
  await bulkPutChunked(offlineDb.lessons, t.lessons);
  await bulkPutChunked(offlineDb.errors, t.errors);
  await bulkPutChunked(offlineDb.pron_attempts, t.pron_attempts);
  await bulkPutChunked(offlineDb.texts, t.texts);
  await bulkPutChunked(offlineDb.word_status, t.word_status);
  await bulkPutChunked(offlineDb.journey, t.journey);
  await bulkPutChunked(offlineDb.rewards, t.rewards);
  await bulkPutChunked(offlineDb.quests, t.quests);

  writeLocalFlags(payload.localFlags);

  return {
    notes: t.notes?.length ?? 0,
    cards: t.cards?.length ?? 0,
    sessions: t.sessions?.length ?? 0,
    lessons: t.lessons?.length ?? 0,
    texts: t.texts?.length ?? 0,
  };
}

export function downloadBackupJsonFile(payload: FullBackupPayload) {
  const json = JSON.stringify(payload);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const dateTag = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `espanol-fast-backup-${dateTag}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const CLOUD_TABLE_ORDER: (keyof FullBackupPayload["tables"])[] = [
  "notes",
  "cards",
  "review_logs",
  "sessions",
  "settings",
  "lessons",
  "errors",
  "pron_attempts",
  "texts",
  "word_status",
  "journey",
  "rewards",
  "quests",
];

/**
 * Pushes all local tables to `/api/sync` in small 800-row chunks (~250 KB each)
 * so it NEVER hits Vercel's 4.5 MB request body limit.
 */
export async function pushAllLocalDataToCloudChunked(
  onProgress?: (label: string) => void
): Promise<{ syncedCount: number; warnings: string[] }> {
  const payload = await exportAllLocalData();
  let syncedCount = 0;
  const warnings: string[] = [];
  const CHUNK_SIZE = 800;

  for (const tableKey of CLOUD_TABLE_ORDER) {
    const rows = payload.tables[tableKey];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const slice = rows.slice(i, i + CHUNK_SIZE);
      onProgress?.(
        `Uploading ${tableKey} (${Math.min(rows.length, i + slice.length).toLocaleString()}/${rows.length.toLocaleString()})...`
      );

      const partialPayload = {
        version: 1 as const,
        exportedAt: payload.exportedAt,
        tables: {
          [tableKey]: slice,
        },
      };

      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullBackup: partialPayload }),
      });

      const rawText = await res.text();
      let data: {
        ok?: boolean;
        syncedCount?: number;
        warnings?: string[];
        error?: string;
      };
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(
          `Server error on ${tableKey} (HTTP ${res.status}): ${rawText.slice(0, 120)}`
        );
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Cloud push failed on ${tableKey}.`);
      }

      syncedCount += data.syncedCount ?? slice.length;
      if (Array.isArray(data.warnings)) {
        warnings.push(...data.warnings);
      }
    }
  }

  return { syncedCount, warnings };
}

/**
 * Pulls all tables from `/api/sync` in 1,000-row paginated slices so it NEVER
 * hits Vercel's 4.5 MB response limit, then restores into IndexedDB.
 */
export async function pullAllCloudDataChunked(
  onProgress?: (label: string) => void
): Promise<{
  notes: number;
  cards: number;
  sessions: number;
  lessons: number;
  texts: number;
}> {
  const tables: Record<string, unknown[]> = {};
  const PAGE_SIZE = 1000;

  for (const tableKey of CLOUD_TABLE_ORDER) {
    const collected: unknown[] = [];
    let offset = 0;

    while (true) {
      onProgress?.(
        `Downloading ${tableKey}${offset > 0 ? ` (${offset.toLocaleString()}+)` : ""}...`
      );
      const res = await fetch(
        `/api/sync?table=${encodeURIComponent(tableKey)}&offset=${offset}&limit=${PAGE_SIZE}`
      );
      const rawText = await res.text();
      let data: {
        ok?: boolean;
        rows?: unknown[];
        hasMore?: boolean;
        error?: string;
      };
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(
          `Server error pulling ${tableKey} (HTTP ${res.status}): ${rawText.slice(0, 120)}`
        );
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Cloud pull failed on ${tableKey}.`);
      }

      const rows = Array.isArray(data.rows) ? data.rows : [];
      collected.push(...rows);
      if (!data.hasMore || rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    tables[tableKey] = collected;
  }

  const backup: FullBackupPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: tables as unknown as FullBackupPayload["tables"],
  };

  onProgress?.("Saving to device storage...");
  return restoreAllLocalData(backup);
}

/**
 * Fast automatic background sync (<250ms): pulls ONLY reviewed cards (`reps > 0`),
 * sessions, lessons, errors, reading texts, word_status, and pronunciation attempts
 * from Supabase and merges them non-destructively (keeping higher reps / newer updates).
 */
export async function syncProgressFromCloudFast(): Promise<boolean> {
  if (!offlineDb) return false;
  try {
    const res = await fetch("/api/sync?mode=progress");
    if (!res.ok) return false;
    const data = (await res.json()) as {
      ok?: boolean;
      progress?: {
        cards?: CardRecord[];
        sessions?: SessionRecord[];
        settings?: SettingsRecord[];
        lessons?: LessonRecord[];
        errors?: ErrorRecord[];
        pron_attempts?: PronunciationAttemptRecord[];
        texts?: ReadingTextRecord[];
        word_status?: WordStatusRecord[];
      };
    };
    if (!data.ok || !data.progress) return false;

    let changed = false;
    const p = data.progress;

    // 1. Merge reviewed cards (keep whichever has more reps or newer last_review)
    if (Array.isArray(p.cards) && p.cards.length > 0) {
      const localCards = await offlineDb.cards.bulkGet(p.cards.map((c) => c.id));
      const toPut: CardRecord[] = [];
      p.cards.forEach((remote, idx) => {
        const local = localCards[idx];
        const remoteTime = remote.last_review
          ? new Date(remote.last_review).getTime()
          : 0;
        const localTime = local?.last_review
          ? new Date(local.last_review).getTime()
          : 0;
        if (
          !local ||
          remote.reps > local.reps ||
          (remote.reps === local.reps && remoteTime > localTime)
        ) {
          toPut.push(remote);
        }
      });
      if (toPut.length > 0) {
        await offlineDb.cards.bulkPut(toPut);
        changed = true;
      }
    }

    // 2. Merge sessions (keep higher xp / review_count per date)
    if (Array.isArray(p.sessions) && p.sessions.length > 0) {
      const localSessions = await offlineDb.sessions.bulkGet(
        p.sessions.map((s) => s.date)
      );
      const toPut: SessionRecord[] = [];
      p.sessions.forEach((remote, idx) => {
        const local = localSessions[idx];
        if (
          !local ||
          remote.xp > local.xp ||
          remote.review_count > local.review_count ||
          remote.new_count > local.new_count
        ) {
          toPut.push({
            ...remote,
            xp: Math.max(remote.xp, local?.xp ?? 0),
            review_count: Math.max(remote.review_count, local?.review_count ?? 0),
            new_count: Math.max(remote.new_count, local?.new_count ?? 0),
            streak: Math.max(remote.streak, local?.streak ?? 0),
          });
        }
      });
      if (toPut.length > 0) {
        await offlineDb.sessions.bulkPut(toPut);
        changed = true;
      }
    }

    // 3. Merge lessons, errors, texts, word_status, pron_attempts
    if (Array.isArray(p.lessons) && p.lessons.length > 0) {
      await offlineDb.lessons.bulkPut(p.lessons);
    }
    if (Array.isArray(p.errors) && p.errors.length > 0) {
      await offlineDb.errors.bulkPut(p.errors);
    }
    if (Array.isArray(p.texts) && p.texts.length > 0) {
      await offlineDb.texts.bulkPut(p.texts);
    }
    if (Array.isArray(p.word_status) && p.word_status.length > 0) {
      await offlineDb.word_status.bulkPut(p.word_status);
    }
    if (Array.isArray(p.pron_attempts) && p.pron_attempts.length > 0) {
      await offlineDb.pron_attempts.bulkPut(p.pron_attempts);
    }

    return changed;
  } catch {
    return false;
  }
}
