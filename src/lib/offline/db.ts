import Dexie, { type EntityTable } from "dexie";
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

export interface CachedAudioBlob {
  key: string; // filename or "tts:<voice>:<text>"
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
  updatedAt: string;
}

export interface PendingSyncReview {
  id: string;
  reviewLog: ReviewLogRecord;
  updatedCard: CardRecord;
  createdAt: string;
}

export class EspanolFastOfflineDB extends Dexie {
  notes!: EntityTable<NoteRecord, "id">;
  cards!: EntityTable<CardRecord, "id">;
  review_logs!: EntityTable<ReviewLogRecord, "id">;
  pending_reviews!: EntityTable<PendingSyncReview, "id">;
  audio_blobs!: EntityTable<CachedAudioBlob, "key">;
  sessions!: EntityTable<SessionRecord, "date">;
  settings!: EntityTable<SettingsRecord, "id">;
  lessons!: EntityTable<LessonRecord, "id">;
  errors!: EntityTable<ErrorRecord, "id">;
  pron_attempts!: EntityTable<PronunciationAttemptRecord, "id">;
  texts!: EntityTable<ReadingTextRecord, "id">;
  word_status!: EntityTable<WordStatusRecord, "lemma">;
  journey!: EntityTable<JourneyCityRecord, "week">;
  rewards!: EntityTable<RewardRecord, "id">;
  quests!: EntityTable<DailyQuestRecord, "id">;

  constructor() {
    super("EspanolFastOfflineDB");
    this.version(1).stores({
      notes: "id, &anki_guid, lemma, part, freq_rank, source",
      cards: "id, note_id, type, state, due, lapses, [note_id+type]",
      review_logs: "id, card_id, reviewed_at",
      pending_reviews: "id, createdAt",
      audio_blobs: "key, updatedAt",
      sessions: "date",
      settings: "id",
    });
    this.version(2).stores({
      notes: "id, &anki_guid, lemma, part, freq_rank, source",
      cards: "id, note_id, type, state, due, lapses, [note_id+type]",
      review_logs: "id, card_id, reviewed_at",
      pending_reviews: "id, createdAt",
      audio_blobs: "key, updatedAt",
      sessions: "date",
      settings: "id",
      lessons: "id, [week+day], week, day, completed_at",
      errors: "id, source, category, card_id, created_at",
    });
    this.version(3).stores({
      notes: "id, &anki_guid, lemma, part, freq_rank, source",
      cards: "id, note_id, type, state, due, lapses, [note_id+type]",
      review_logs: "id, card_id, reviewed_at",
      pending_reviews: "id, createdAt",
      audio_blobs: "key, updatedAt",
      sessions: "date",
      settings: "id",
      lessons: "id, [week+day], week, day, completed_at",
      errors: "id, source, category, card_id, created_at",
      pron_attempts: "id, mode, created_at",
    });
    this.version(4).stores({
      notes: "id, &anki_guid, lemma, part, freq_rank, source",
      cards: "id, note_id, type, state, due, lapses, [note_id+type]",
      review_logs: "id, card_id, reviewed_at",
      pending_reviews: "id, createdAt",
      audio_blobs: "key, updatedAt",
      sessions: "date",
      settings: "id",
      lessons: "id, [week+day], week, day, completed_at",
      errors: "id, source, category, card_id, created_at",
      pron_attempts: "id, mode, created_at",
      texts: "id, type, updated_at",
      word_status: "lemma, status, first_seen_text_id",
    });
    this.version(5).stores({
      notes: "id, &anki_guid, lemma, part, freq_rank, source",
      cards: "id, note_id, type, state, due, lapses, [note_id+type]",
      review_logs: "id, card_id, reviewed_at",
      pending_reviews: "id, createdAt",
      audio_blobs: "key, updatedAt",
      sessions: "date",
      settings: "id",
      lessons: "id, [week+day], week, day, completed_at",
      errors: "id, source, category, card_id, created_at",
      pron_attempts: "id, mode, created_at",
      texts: "id, type, updated_at",
      word_status: "lemma, status, first_seen_text_id",
      journey: "week, status",
      rewards: "id, type, key",
      quests: "id, date, key",
    });
  }
}

export const offlineDb =
  typeof window !== "undefined" ? new EspanolFastOfflineDB() : null;

export const DEFAULT_SETTINGS: SettingsRecord = {
  id: 1,
  daily_minutes: 60,
  new_words_start: 10,
  weekly_increase: 10,
  new_words_max: 50,
  voice: "es-ES-AlvaroNeural",
  voice_minutes_cap: 15,
  start_date: new Date().toISOString().slice(0, 10),
  field_mappings: {},
};

export async function getOrInitSettings(): Promise<SettingsRecord> {
  if (!offlineDb) return DEFAULT_SETTINGS;
  const existing = await offlineDb.settings.get(1);
  if (existing) return existing;
  await offlineDb.settings.put(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export async function getOrInitTodaySession(
  todayStr: string = new Date().toISOString().slice(0, 10)
): Promise<SessionRecord> {
  const fallback: SessionRecord = {
    date: todayStr,
    minutes: 0,
    new_count: 0,
    review_count: 0,
    xp: 0,
    goal_met: false,
    streak: 1,
    extra_batches: 0,
  };
  if (!offlineDb) return fallback;

  const existing = await offlineDb.sessions.get(todayStr);
  if (existing) return existing;

  const allSessions = await offlineDb.sessions
    .orderBy("date")
    .reverse()
    .limit(2)
    .toArray();
  const prevStreak = allSessions[0]?.streak ?? 0;
  const initialized: SessionRecord = {
    ...fallback,
    streak: prevStreak > 0 ? prevStreak : 1,
  };
  await offlineDb.sessions.put(initialized);
  return initialized;
}
