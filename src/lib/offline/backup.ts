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
