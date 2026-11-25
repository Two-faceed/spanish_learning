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

async function bulkPutNotesSafe(incoming: NoteRecord[] | undefined) {
  if (!offlineDb || !Array.isArray(incoming) || incoming.length === 0) return;
  // Dexie has a unique index `&anki_guid` on `notes`. If a device already has a note
  // with the same `anki_guid` under a different `id`, `bulkPut` throws ConstraintError.
  // Resolve conflicts cleanly by deleting stale duplicate `anki_guid` rows first.
  const existing = await offlineDb.notes.toArray();
  const existingByGuid = new Map<string, string>();
  for (const n of existing) {
    if (n.anki_guid) existingByGuid.set(n.anki_guid, n.id);
  }

  const idsToRemove: string[] = [];
  for (const n of incoming) {
    const oldId = existingByGuid.get(n.anki_guid);
    if (oldId && oldId !== n.id) {
      idsToRemove.push(oldId);
    }
  }
  if (idsToRemove.length > 0) {
    await offlineDb.notes.bulkDelete(idsToRemove);
  }

  await bulkPutChunked(offlineDb.notes, incoming);
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
  await bulkPutNotesSafe(t.notes);
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
        notes?: NoteRecord[];
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

    // 1. Merge reviewed cards FIRST (keep whichever has more reps or newer last_review)
    if (Array.isArray(p.cards) && p.cards.length > 0) {
      try {
        const localCards = await offlineDb.cards.bulkGet(
          p.cards.map((c) => c.id)
        );
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
      } catch (e) {
        console.warn("[sync] cards merge warning:", e);
      }
    }

    // 2. Merge sessions (keep higher xp / review_count per date)
    if (Array.isArray(p.sessions) && p.sessions.length > 0) {
      try {
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
              review_count: Math.max(
                remote.review_count,
                local?.review_count ?? 0
              ),
              new_count: Math.max(remote.new_count, local?.new_count ?? 0),
              streak: Math.max(remote.streak, local?.streak ?? 0),
            });
          }
        });
        if (toPut.length > 0) {
          await offlineDb.sessions.bulkPut(toPut);
          changed = true;
        }
      } catch (e) {
        console.warn("[sync] sessions merge warning:", e);
      }
    }

    // 3. Safely merge non-deck mined/tutor notes (deduping &anki_guid)
    if (Array.isArray(p.notes) && p.notes.length > 0) {
      try {
        await bulkPutNotesSafe(p.notes);
      } catch (e) {
        console.warn("[sync] notes merge warning:", e);
      }
    }

    // 4. Merge lessons, errors, texts, word_status, pron_attempts, settings independently
    const safePut = async <T,>(
      fn: () => Promise<T>,
      label: string
    ) => {
      try {
        await fn();
      } catch (e) {
        console.warn(`[sync] ${label} merge warning:`, e);
      }
    };

    if (Array.isArray(p.lessons) && p.lessons.length > 0) {
      await safePut(() => offlineDb!.lessons.bulkPut(p.lessons!), "lessons");
      changed = true;
    }
    if (Array.isArray(p.errors) && p.errors.length > 0) {
      await safePut(() => offlineDb!.errors.bulkPut(p.errors!), "errors");
    }
    if (Array.isArray(p.texts) && p.texts.length > 0) {
      await safePut(() => offlineDb!.texts.bulkPut(p.texts!), "texts");
    }
    if (Array.isArray(p.word_status) && p.word_status.length > 0) {
      await safePut(
        () => offlineDb!.word_status.bulkPut(p.word_status!),
        "word_status"
      );
    }
    if (Array.isArray(p.pron_attempts) && p.pron_attempts.length > 0) {
      await safePut(
        () => offlineDb!.pron_attempts.bulkPut(p.pron_attempts!),
        "pron_attempts"
      );
    }
    if (Array.isArray(p.settings) && p.settings.length > 0) {
      await safePut(() => offlineDb!.settings.bulkPut(p.settings!), "settings");
    }

    return changed;
  } catch {
    return false;
  }
}

/**
 * Fast background cloud push (<250ms): uploads ONLY lightweight progress tables
 * (reviewed cards, mined/tutor notes, sessions, settings, lessons, errors,
 * pronunciation attempts, reading texts, and word statuses) to Supabase.
 */
export async function pushProgressToCloudFast(): Promise<void> {
  if (!offlineDb || typeof navigator === "undefined" || !navigator.onLine) {
    return;
  }
  try {
    const [
      allNotes,
      allCards,
      sessions,
      settings,
      lessons,
      errors,
      pron_attempts,
      texts,
      word_status,
    ] = await Promise.all([
      offlineDb.notes.toArray(),
      offlineDb.cards.toArray(),
      offlineDb.sessions.toArray(),
      offlineDb.settings.toArray(),
      offlineDb.lessons.toArray(),
      offlineDb.errors.toArray(),
      offlineDb.pron_attempts.toArray(),
      offlineDb.texts.toArray(),
      offlineDb.word_status.toArray(),
    ]);

    const minedNotes = allNotes.filter((n) => n.source !== "deck");
    const reviewedCards = allCards.filter((c) => c.reps > 0 || c.state !== 0);

    const partialTables: Partial<FullBackupPayload["tables"]> = {
      notes: minedNotes,
      cards: reviewedCards,
      sessions,
      settings,
      lessons,
      errors,
      pron_attempts,
      texts,
      word_status,
    };

    // Push each non-empty table in <= 800-row slices so we never exceed Vercel's 4.5MB limit
    const CHUNK = 800;
    for (const [tableKey, rows] of Object.entries(partialTables)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullBackup: {
              version: 1,
              exportedAt: new Date().toISOString(),
              tables: { [tableKey]: slice },
            },
          }),
        });
      }
    }
  } catch {
    // Silent offline-first fallback
  }
}

let bgPushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced background push (1.2s) so rapid taps across Lessons, Reading,
 * Pronunciation, and Reviews coalesce into one fast automatic cloud sync.
 */
export function scheduleBackgroundProgressPush(): void {
  if (typeof window === "undefined") return;
  if (bgPushTimer) clearTimeout(bgPushTimer);
  bgPushTimer = setTimeout(() => {
    bgPushTimer = null;
    void pushProgressToCloudFast();
  }, 1200);
}
