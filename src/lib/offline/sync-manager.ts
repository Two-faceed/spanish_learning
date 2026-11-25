import {
  CardRecord,
  ErrorRecord,
  ErrorSource,
  FSRSRating,
  LessonNewWord,
  LessonRecord,
  NoteRecord,
  PHASE1_CARD_TYPES,
  PronunciationAssessmentResult,
  WordKnowledgeStatus,
} from "@/types/database";
import {
  addOrPromoteWordInDeck,
  createInitialCardsForNote,
  gradeCard,
} from "@/lib/fsrs/scheduler";
import {
  getOrInitSettings,
  getOrInitTodaySession,
  offlineDb,
} from "./db";
import { scheduleBackgroundProgressPush } from "./backup";
import { ParsedAnkiNote, upsertNotesIdempotently } from "@/lib/anki/parser";

/**
 * Saves an imported deck into IndexedDB (idempotent on `anki_guid`), creates the 4 FSRS cards
 * for any newly inserted notes, and triggers a background sync to Supabase if configured.
 */
export async function saveImportedDeckLocally(
  incomingNotes: ParsedAnkiNote[],
  audioSource: "deck" | "es-ES TTS",
  onProgress?: (done: number, total: number) => void
): Promise<{ insertedCount: number; updatedCount: number; totalNotes: number }> {
  if (!offlineDb) {
    return { insertedCount: 0, updatedCount: 0, totalNotes: 0 };
  }

  const existingNotes = await offlineDb.notes.toArray();
  const existingNoteIds = new Set(existingNotes.map((n) => n.id));

  const { notes: mergedNotes, insertedCount, updatedCount } =
    upsertNotesIdempotently(existingNotes, incomingNotes, audioSource);

  const now = new Date();
  const newCardsToInsert: CardRecord[] = [];
  for (const note of mergedNotes) {
    if (!existingNoteIds.has(note.id)) {
      const cards = createInitialCardsForNote(note.id, now, PHASE1_CARD_TYPES);
      newCardsToInsert.push(...cards);
    }
  }

  // Write in chunks of 1,000 so the UI progress bar stays responsive
  const CHUNK_SIZE = 1000;
  for (let i = 0; i < mergedNotes.length; i += CHUNK_SIZE) {
    const slice = mergedNotes.slice(i, i + CHUNK_SIZE);
    await offlineDb.notes.bulkPut(slice);
    onProgress?.(Math.min(mergedNotes.length, i + slice.length), mergedNotes.length);
  }

  for (let i = 0; i < newCardsToInsert.length; i += CHUNK_SIZE) {
    const slice = newCardsToInsert.slice(i, i + CHUNK_SIZE);
    await offlineDb.cards.bulkPut(slice);
  }

  // Attempt non-blocking sync to server / Supabase
  void syncPendingToServer().catch(() => {});

  return {
    insertedCount,
    updatedCount,
    totalNotes: mergedNotes.length,
  };
}

/**
 * Records a review rating locally in IndexedDB, updates the card's FSRS schedule,
 * updates today's session stats & XP, and queues the review for server sync when online.
 */
export async function recordCardReviewOfflineFirst(
  card: CardRecord,
  rating: FSRSRating,
  durationMs: number
): Promise<{
  updatedCard: CardRecord;
  isLeech: boolean;
  wasNewWord: boolean;
}> {
  const wasNewCard = card.state === 0;
  const now = new Date();
  const { updatedCard, reviewLog, isLeech } = gradeCard(
    card,
    rating,
    durationMs,
    now
  );

  let wasNewWord = false;

  if (offlineDb) {
    await offlineDb.cards.put(updatedCard);
    await offlineDb.review_logs.put(reviewLog);
    await offlineDb.pending_reviews.put({
      id: reviewLog.id,
      reviewLog,
      updatedCard,
      createdAt: now.toISOString(),
    });

    // Check if this completed all new cards of a note (or was the first card of a new note)
    if (wasNewCard) {
      const noteCards = await offlineDb.cards
        .where("note_id")
        .equals(card.note_id)
        .toArray();
      const remainingUnreviewed = noteCards.filter(
        (c) => !c.suspended && c.state === 0
      );
      // Count the word as learned today once all its Day-1 card types are completed
      if (remainingUnreviewed.length === 0) {
        wasNewWord = true;
      }
    }

    const todaySession = await getOrInitTodaySession();
    const xpGain = wasNewWord ? 2 : 1; // Spec: review = 1 XP, new word = 2 XP
    const addedMinutes = Math.round(durationMs / 60000);

    await offlineDb.sessions.put({
      ...todaySession,
      review_count: todaySession.review_count + 1,
      new_count: todaySession.new_count + (wasNewWord ? 1 : 0),
      xp: todaySession.xp + xpGain,
      minutes: todaySession.minutes + addedMinutes,
      goal_met: todaySession.review_count + 1 >= 20,
    });
  }

  if (typeof navigator !== "undefined" && navigator.onLine) {
    void syncPendingToServer().catch(() => {});
  }

  return {
    updatedCard,
    isLeech,
    wasNewWord,
  };
}

/**
 * Stores an audio blob in IndexedDB for offline playback.
 */
export async function cacheAudioBlobOffline(
  key: string,
  blob: Blob,
  mimeType: string = blob.type || "audio/mpeg"
): Promise<void> {
  if (!offlineDb) return;
  await offlineDb.audio_blobs.put({
    key,
    blob,
    mimeType,
    sizeBytes: blob.size,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Retrieves an audio blob from IndexedDB if cached.
 */
export async function getCachedAudioBlobOffline(
  key: string
): Promise<Blob | null> {
  if (!offlineDb) return null;
  const entry = await offlineDb.audio_blobs.get(key);
  return entry?.blob ?? null;
}

/**
 * Flushes pending offline review logs and updated FSRS card states to `/api/sync`.
 */
export async function syncPendingToServer(): Promise<{
  syncedReviews: number;
  online: boolean;
}> {
  if (
    !offlineDb ||
    (typeof navigator !== "undefined" && !navigator.onLine)
  ) {
    return { syncedReviews: 0, online: false };
  }

  const pending = await offlineDb.pending_reviews.toArray();
  if (pending.length === 0) {
    return { syncedReviews: 0, online: true };
  }

  try {
    const settings = await getOrInitSettings();
    const todaySession = await getOrInitTodaySession();
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pendingReviews: pending,
        session: todaySession,
        settings,
      }),
    });

    if (res.ok) {
      await offlineDb.pending_reviews.bulkDelete(pending.map((p) => p.id));
      return { syncedReviews: pending.length, online: true };
    }
  } catch {
    // Keep in pending_reviews for next reconnect
  }

  return { syncedReviews: 0, online: false };
}

/**
 * Per docs/SPEC.md ("Every corrected mistake goes to the error notebook and becomes a card"):
 * Saves a mistake into the `errors` table and creates/promotes a corresponding FSRS card in the queue.
 */
export async function recordTutorMistakeToErrorNotebookAndQueue(input: {
  source: ErrorSource;
  category: string;
  wrong: string;
  correct: string;
  explanation: string;
}): Promise<{ errorRecord: ErrorRecord; targetNote: NoteRecord | null }> {
  const now = new Date();
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `err-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`;

  if (!offlineDb) {
    return {
      errorRecord: {
        id,
        source: input.source,
        category: input.category,
        wrong: input.wrong,
        correct: input.correct,
        explanation: input.explanation,
        card_id: null,
        created_at: now.toISOString(),
      },
      targetNote: null,
    };
  }

  const [allNotes, allCards] = await Promise.all([
    offlineDb.notes.toArray(),
    offlineDb.cards.toArray(),
  ]);

  const cleanCorrect = input.correct.trim();
  const res = addOrPromoteWordInDeck(
    allNotes,
    allCards,
    {
      word: cleanCorrect,
      lemma: cleanCorrect.toLowerCase(),
      meaning: `${input.explanation} (Avoid: "${input.wrong}")`,
      example_es: cleanCorrect,
      example_tr: input.explanation,
      pos: input.category,
      gender: null,
      source: "tutor",
    },
    now
  );

  await offlineDb.notes.put(res.targetNote);
  const noteCards = res.cards.filter((c) => c.note_id === res.targetNote.id);
  if (!res.promotedExisting && noteCards.length > 0) {
    await offlineDb.cards.bulkPut(noteCards);
  }

  const primaryCardId =
    noteCards.find((c) => c.type === "cloze")?.id ??
    noteCards.find((c) => c.type === "recall")?.id ??
    noteCards[0]?.id ??
    null;

  const errorRecord: ErrorRecord = {
    id,
    source: input.source,
    category: input.category.trim() || "grammar",
    wrong: input.wrong.trim(),
    correct: cleanCorrect,
    explanation: input.explanation.trim(),
    card_id: primaryCardId,
    created_at: now.toISOString(),
  };

  await offlineDb.errors.put(errorRecord);
  return { errorRecord, targetNote: res.targetNote };
}

/**
 * Adds or promotes a lesson's new words (up to 5 per lesson) to the front of the FSRS new-card queue.
 */
export async function promoteLessonNewWordsToQueue(
  newWords: LessonNewWord[]
): Promise<number> {
  if (!offlineDb || newWords.length === 0) return 0;

  let currentNotes = await offlineDb.notes.toArray();
  let currentCards = await offlineDb.cards.toArray();
  let count = 0;

  for (const nw of newWords.slice(0, 5)) {
    if (!nw.word || !nw.meaning) continue;
    const res = addOrPromoteWordInDeck(currentNotes, currentCards, {
      word: nw.word,
      lemma: nw.lemma || nw.word,
      meaning: nw.meaning,
      example_es: nw.example_es,
      example_tr: nw.example_tr,
      gender: nw.gender ?? null,
      pos: nw.pos ?? null,
      source: "tutor",
    });

    await offlineDb.notes.put(res.targetNote);
    if (!res.promotedExisting) {
      const added = res.cards.filter((c) => c.note_id === res.targetNote.id);
      await offlineDb.cards.bulkPut(added);
    }
    currentNotes = res.notes;
    currentCards = res.cards;
    count++;
  }

  return count;
}

/**
 * Marks a daily grammar lesson completed in IndexedDB and awards 20 XP (per docs/SPEC.md).
 */
export async function markLessonCompletedOfflineFirst(
  lesson: LessonRecord,
  scorePct: number
): Promise<LessonRecord> {
  const nowIso = new Date().toISOString();
  const updated: LessonRecord = {
    ...lesson,
    completed_at: nowIso,
    score: scorePct,
  };

  if (offlineDb) {
    const prev = await offlineDb.lessons.get(lesson.id);
    await offlineDb.lessons.put(updated);

    // Award 20 XP on first completion of this lesson
    if (!prev?.completed_at) {
      const todaySession = await getOrInitTodaySession();
      await offlineDb.sessions.put({
        ...todaySession,
        xp: todaySession.xp + 20,
        minutes: todaySession.minutes + 15,
      });
    }
    scheduleBackgroundProgressPush();
  }

  return updated;
}

/**
 * Per docs/SPEC.md ("a low score adds a pronunciation review" + "a mispronounced word becomes a card"):
 * Creates or resurfaces a `speak` FSRS card for the note and logs the mispronunciation to Error Notebook.
 */
export async function scheduleSpeakCardForLowPronunciation(
  note: NoteRecord,
  result: PronunciationAssessmentResult
): Promise<CardRecord | null> {
  if (!offlineDb) return null;
  const nowIso = new Date().toISOString();

  const existingSpeak = await offlineDb.cards
    .where("[note_id+type]")
    .equals([note.id, "speak"])
    .first();

  const speakCard: CardRecord = existingSpeak
    ? {
        ...existingSpeak,
        due: nowIso,
        suspended: false,
      }
    : {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `speak-${note.id}-${Date.now()}`,
        note_id: note.id,
        type: "speak",
        due: nowIso,
        stability: 0,
        difficulty: 0,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        lapses: 0,
        state: 0,
        last_review: null,
        suspended: false,
      };

  await offlineDb.cards.put(speakCard);

  const errorEntry: ErrorRecord = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `pron-err-${Date.now()}`,
    source: "pronunciation",
    category: "sounds",
    wrong: result.recognizedText || `Scored ${result.overall}% on "${note.word}"`,
    correct: result.referenceText || note.word,
    explanation: `Pronunciation ${result.overall}% — ${result.rhythmTip}`,
    card_id: speakCard.id,
    created_at: nowIso,
  };
  await offlineDb.errors.put(errorEntry);
  scheduleBackgroundProgressPush();

  return speakCard;
}

/**
 * Updates a word's explicit knowledge status in the Reading module (`known | learning | ignored | new`).
 */
export async function setWordKnowledgeStatusOffline(input: {
  lemma: string;
  status: WordKnowledgeStatus;
  textId?: string | null;
}): Promise<void> {
  if (!offlineDb) return;
  const cleanLemma = input.lemma.trim().toLowerCase();
  if (!cleanLemma) return;
  await offlineDb.word_status.put({
    lemma: cleanLemma,
    status: input.status,
    first_seen_text_id: input.textId ?? null,
    updated_at: new Date().toISOString(),
  });
  scheduleBackgroundProgressPush();
}

/**
 * Per docs/SPEC.md ("Marked words become cards with the original sentence as the example (sentence mining)"):
 * Adds or promotes the tapped reading word into the FSRS new-card queue using the book/article sentence,
 * and marks its word_status as "learning".
 */
export async function mineWordFromReadingOfflineFirst(input: {
  word: string;
  lemma: string;
  meaning: string;
  sentenceEs: string;
  sentenceTr?: string;
  pos?: string | null;
  gender?: "el" | "la" | "el/la" | null;
  textId?: string | null;
}): Promise<{ promotedExisting: boolean; targetNote: NoteRecord | null }> {
  if (!offlineDb) return { promotedExisting: false, targetNote: null };

  const [allNotes, allCards] = await Promise.all([
    offlineDb.notes.toArray(),
    offlineDb.cards.toArray(),
  ]);

  const cleanLemma = (input.lemma || input.word)
    .replace(/^(el|la|los|las|un|una)\s+/i, "")
    .trim()
    .toLowerCase();

  const res = addOrPromoteWordInDeck(allNotes, allCards, {
    word: input.word.trim(),
    lemma: cleanLemma,
    meaning: input.meaning.trim() || "Mined from reading",
    example_es: input.sentenceEs.trim(),
    example_tr: (input.sentenceTr ?? "").trim(),
    pos: input.pos ?? "word",
    gender: input.gender ?? null,
    source: "reading",
  });

  // Ensure the book/article sentence is attached when promoting an existing note that lacked one
  const finalNote: NoteRecord = {
    ...res.targetNote,
    example_es: res.targetNote.example_es || input.sentenceEs.trim(),
  };

  await offlineDb.notes.put(finalNote);
  if (!res.promotedExisting) {
    const added = res.cards.filter((c) => c.note_id === finalNote.id);
    if (added.length > 0) {
      await offlineDb.cards.bulkPut(added);
    }
  }

  await setWordKnowledgeStatusOffline({
    lemma: cleanLemma,
    status: "learning",
    textId: input.textId,
  });

  return { promotedExisting: res.promotedExisting, targetNote: finalNote };
}
