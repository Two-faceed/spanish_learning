import {
  Card as TsFsrsCard,
  createEmptyCard,
  fsrs,
  generatorParameters,
  Grade,
  Rating,
  State,
} from "ts-fsrs";
import {
  CardRecord,
  CardType,
  FSRSRating,
  FSRSState,
  NoteRecord,
  PHASE1_CARD_TYPES,
  ReviewLogRecord,
} from "@/types/database";

const params = generatorParameters({
  enable_fuzz: false,
  enable_short_term: true,
  maximum_interval: 365,
  request_retention: 0.92,
});

const scheduler = fsrs(params);

export const LEECH_LAPSE_THRESHOLD = 6;

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/**
 * Calibrates the first two reviews to match evidence-based Day-1 -> Day-2 -> Day-4
 * language consolidation (Again: 1m, Hard: 10m, Good: 1d -> 2d, Easy: 3d),
 * then lets FSRS expand intervals naturally (5d -> 12d -> 28d -> 65d...).
 */
function computeCalibratedDue(
  card: CardRecord,
  rating: FSRSRating,
  now: Date,
  fsrsDue: Date,
  fsrsScheduledDays: number
): { due: Date; scheduledDays: number } {
  if (card.reps === 0) {
    if (rating === 1) {
      return { due: new Date(now.getTime() + 1 * MINUTE_MS), scheduledDays: 0 };
    }
    if (rating === 2) {
      return { due: new Date(now.getTime() + 10 * MINUTE_MS), scheduledDays: 0 };
    }
    if (rating === 3) {
      return { due: new Date(now.getTime() + 1 * DAY_MS), scheduledDays: 1 };
    }
    // rating === 4 (Easy)
    return { due: new Date(now.getTime() + 3 * DAY_MS), scheduledDays: 3 };
  }

  // Second successful recall (reps === 1): next-next day (2d) before longer FSRS jumps
  if (card.reps === 1 && rating === 3 && fsrsScheduledDays !== 2) {
    return { due: new Date(now.getTime() + 2 * DAY_MS), scheduledDays: 2 };
  }

  return { due: fsrsDue, scheduledDays: fsrsScheduledDays };
}

/**
 * Generates the initial 4 FSRS cards (recognition, recall, listening, cloze) for a note.
 */
export function createInitialCardsForNote(
  noteId: string,
  now: Date = new Date(),
  cardTypes: CardType[] = PHASE1_CARD_TYPES
): CardRecord[] {
  const empty = createEmptyCard(now);
  return cardTypes.map((type) => ({
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${noteId}-${type}`,
    note_id: noteId,
    type,
    due: empty.due.toISOString(),
    stability: empty.stability,
    difficulty: empty.difficulty,
    elapsed_days: empty.elapsed_days,
    scheduled_days: empty.scheduled_days,
    reps: empty.reps,
    lapses: empty.lapses,
    state: empty.state as FSRSState,
    last_review: null,
    suspended: false,
  }));
}

/**
 * Converts a stored CardRecord to a ts-fsrs Card object.
 */
export function toTsFsrsCard(record: CardRecord): TsFsrsCard {
  return {
    due: new Date(record.due),
    stability: record.stability,
    difficulty: record.difficulty,
    elapsed_days: record.elapsed_days,
    scheduled_days: record.scheduled_days,
    reps: record.reps,
    lapses: record.lapses,
    state: record.state as State,
    last_review: record.last_review ? new Date(record.last_review) : undefined,
  };
}

/**
 * Maps numeric rating 1..4 to ts-fsrs Grade.
 */
export function toFsrsGrade(rating: FSRSRating): Grade {
  switch (rating) {
    case 1:
      return Rating.Again;
    case 2:
      return Rating.Hard;
    case 3:
      return Rating.Good;
    case 4:
      return Rating.Easy;
  }
}

/**
 * Schedules a card review with ts-fsrs and returns the updated CardRecord, ReviewLogRecord,
 * and whether the card is flagged as a leech (6+ failures).
 * Note: ts-fsrs only increments `lapses` when a card is in State.Review and rated Again.
 * To honour the spec ("a card failed 6+ times is flagged"), we increment `lapses` whenever
 * `rating === 1` (Again) if ts-fsrs did not already increment it.
 */
export function gradeCard(
  card: CardRecord,
  rating: FSRSRating,
  durationMs: number = 4000,
  now: Date = new Date()
): {
  updatedCard: CardRecord;
  reviewLog: ReviewLogRecord;
  isLeech: boolean;
} {
  const fsrsCard = toTsFsrsCard(card);
  const grade = toFsrsGrade(rating);
  const result = scheduler.next(fsrsCard, now, grade);
  const nextCard = result.card;
  const calibrated = computeCalibratedDue(
    card,
    rating,
    now,
    nextCard.due,
    nextCard.scheduled_days
  );

  const nextLapses =
    rating === 1
      ? Math.max(nextCard.lapses, card.lapses + 1)
      : nextCard.lapses;

  const updatedCard: CardRecord = {
    ...card,
    due: calibrated.due.toISOString(),
    stability: nextCard.stability,
    difficulty: nextCard.difficulty,
    elapsed_days: nextCard.elapsed_days,
    scheduled_days: calibrated.scheduledDays,
    reps: nextCard.reps,
    lapses: nextLapses,
    state: nextCard.state as FSRSState,
    last_review: now.toISOString(),
  };

  const reviewLog: ReviewLogRecord = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `rev-${card.id}-${now.getTime()}`,
    card_id: card.id,
    rating,
    duration_ms: durationMs,
    reviewed_at: now.toISOString(),
  };

  return {
    updatedCard,
    reviewLog,
    isLeech: isLeechCard(updatedCard),
  };
}

/**
 * Previews the next interval label (e.g. "<10m", "1d", "4d") for each rating button on the review screen.
 */
export function previewNextIntervals(
  card: CardRecord,
  now: Date = new Date()
): Record<FSRSRating, string> {
  const fsrsCard = toTsFsrsCard(card);
  const ratings: FSRSRating[] = [1, 2, 3, 4];
  const labels = {} as Record<FSRSRating, string>;

  for (const r of ratings) {
    const res = scheduler.next(fsrsCard, now, toFsrsGrade(r));
    const calibrated = computeCalibratedDue(
      card,
      r,
      now,
      res.card.due,
      res.card.scheduled_days
    );
    const diffMs = calibrated.due.getTime() - now.getTime();
    const diffMins = Math.max(1, Math.round(diffMs / 60000));
    if (diffMins < 60) {
      labels[r] = `${diffMins}m`;
    } else if (diffMins < 1440) {
      labels[r] = `${Math.round(diffMins / 60)}h`;
    } else {
      labels[r] = `${Math.max(1, Math.round(diffMins / 1440))}d`;
    }
  }

  return labels;
}

/**
 * Returns true if a card has been failed 6 or more times (Leech threshold per SPEC.md).
 */
export function isLeechCard(card: Pick<CardRecord, "lapses">): boolean {
  return card.lapses >= LEECH_LAPSE_THRESHOLD;
}

/**
 * Deduplicates / promotes a word when added from reading, tutor, or manual entry:
 * "No duplicates: if a marked word already exists in the deck, it is moved to the front of the new-card queue."
 */
export function addOrPromoteWordInDeck(
  existingNotes: NoteRecord[],
  existingCards: CardRecord[],
  input: {
    word: string;
    lemma: string;
    meaning: string;
    example_es?: string;
    example_tr?: string;
    gender?: NoteRecord["gender"];
    pos?: string | null;
    source: NoteRecord["source"];
  },
  now: Date = new Date()
): {
  notes: NoteRecord[];
  cards: CardRecord[];
  promotedExisting: boolean;
  targetNote: NoteRecord;
} {
  const cleanLemma = input.lemma.trim().toLowerCase();
  const matchIdx = existingNotes.findIndex(
    (n) =>
      n.lemma.toLowerCase() === cleanLemma ||
      n.word.toLowerCase() === input.word.trim().toLowerCase()
  );

  const minFreqRank = existingNotes.reduce(
    (min, n) => Math.min(min, n.freq_rank),
    1
  );
  const frontRank = Math.min(0, minFreqRank - 1);

  if (matchIdx >= 0) {
    const matched = existingNotes[matchIdx];
    const promotedNote: NoteRecord = {
      ...matched,
      freq_rank: frontRank,
      part: 1,
      example_es: matched.example_es || input.example_es || "",
      example_tr: matched.example_tr || input.example_tr || "",
    };
    const updatedNotes = [...existingNotes];
    updatedNotes[matchIdx] = promotedNote;
    return {
      notes: updatedNotes,
      cards: existingCards,
      promotedExisting: true,
      targetNote: promotedNote,
    };
  }

  const newNoteId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `manual-${Date.now()}`;
  const newNote: NoteRecord = {
    id: newNoteId,
    anki_guid: `custom-${cleanLemma}-${Date.now()}`,
    word: input.word.trim(),
    lemma: input.lemma.trim(),
    meaning: input.meaning.trim(),
    example_es: input.example_es?.trim() ?? "",
    cloze_es: "",
    example_tr: input.example_tr?.trim() ?? "",
    pos: input.pos ?? null,
    gender: input.gender ?? null,
    image_url: null,
    audio_word_url: null,
    audio_example_url: null,
    deck_audio_word_url: null,
    deck_audio_example_url: null,
    audio_source: "es-ES TTS",
    part: 1,
    freq_rank: frontRank,
    source: input.source,
    created_at: now.toISOString(),
  };

  const newCards = createInitialCardsForNote(newNote.id, now);
  return {
    notes: [newNote, ...existingNotes],
    cards: [...existingCards, ...newCards],
    promotedExisting: false,
    targetNote: newNote,
  };
}
