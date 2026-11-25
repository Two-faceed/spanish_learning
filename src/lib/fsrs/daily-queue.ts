import {
  CardRecord,
  CardType,
  CardWithNote,
  NoteRecord,
  SettingsRecord,
} from "@/types/database";

export const EXTRA_BATCH_SIZE = 10;
export const MIN_DAILY_NEW_WORDS = 10;

/**
 * Calculates the current study week (1..12+) from the learner's start_date.
 */
export function getStudyWeekNumber(
  startDateStr: string,
  now: Date = new Date()
): number {
  const start = new Date(startDateStr);
  if (Number.isNaN(start.getTime())) return 1;
  const diffMs = Math.max(0, now.getTime() - start.getTime());
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

/**
 * Computes the scheduled daily new-word target before review-cap adjustment:
 * Week 1: 10/day
 * Week 2: 20/day
 * Week 3: 30/day
 * Week 4: 40/day
 * Week 5+: 50/day
 */
export function getScheduledNewWordsForWeek(
  weekNumber: number,
  settings: Pick<
    SettingsRecord,
    "new_words_start" | "weekly_increase" | "new_words_max"
  > = {
    new_words_start: 10,
    weekly_increase: 10,
    new_words_max: 50,
  }
): number {
  const w = Math.max(1, weekNumber);
  const raw = settings.new_words_start + (w - 1) * settings.weekly_increase;
  return Math.min(settings.new_words_max, Math.max(MIN_DAILY_NEW_WORDS, raw));
}

/**
 * Applies the Review Cap rule from SPEC.md:
 * "Review cap: if due reviews exceed the time budget, the app reduces new words that day
 * (never below 10) instead of letting the backlog explode."
 */
export function getEffectiveDailyNewWordsTarget(params: {
  weekNumber: number;
  dueReviewCount: number;
  dailyMinutes: 30 | 60 | 90;
  extraBatchesToday?: number;
  settings?: Pick<
    SettingsRecord,
    "new_words_start" | "weekly_increase" | "new_words_max"
  >;
}): {
  baseTarget: number;
  effectiveTarget: number;
  totalTargetWithExtra: number;
  reducedByBacklog: boolean;
  reviewCapacityThreshold: number;
} {
  const baseTarget = getScheduledNewWordsForWeek(
    params.weekNumber,
    params.settings
  );

  const reviewCapacityThreshold = Math.round((params.dailyMinutes / 30) * 80);
  let effectiveTarget = baseTarget;
  let reducedByBacklog = false;

  if (params.dueReviewCount > reviewCapacityThreshold) {
    reducedByBacklog = true;
    const overflow = params.dueReviewCount - reviewCapacityThreshold;
    const reduction = Math.ceil(overflow / 40) * 10;
    effectiveTarget = Math.max(MIN_DAILY_NEW_WORDS, baseTarget - reduction);
  }

  const extraWords =
    Math.max(0, params.extraBatchesToday ?? 0) * EXTRA_BATCH_SIZE;

  return {
    baseTarget,
    effectiveTarget,
    totalTargetWithExtra: effectiveTarget + extraWords,
    reducedByBacklog,
    reviewCapacityThreshold,
  };
}

/**
 * Guardrail from SPEC.md:
 * "Guardrail: no XP for skipping reviews, and no '10 more words' until today's reviews are done."
 */
export function canUnlockTenMoreWords(params: {
  remainingDueReviews: number;
  remainingDailyNewWords: number;
}): boolean {
  return (
    params.remainingDueReviews === 0 && params.remainingDailyNewWords === 0
  );
}

/**
 * Deterministic stride-based permutation so each card-type wave (recognition, listening, cloze, recall)
 * traverses the batch of words in a different mixed order.
 */
function mixWaveOrder<T>(items: T[], waveIndex: number): T[] {
  const n = items.length;
  if (n <= 2 || waveIndex === 0) return [...items];

  const strides = [1, 3, 7, 5, 11];
  let stride = strides[waveIndex % strides.length];
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  while (gcd(stride, n) !== 1) {
    stride++;
  }

  const offset = (waveIndex * 3) % n;
  const result: T[] = [];
  for (let i = 0; i < n; i++) {
    const idx = (offset + i * stride) % n;
    result.push(items[idx]);
  }
  return result;
}

/**
 * Ensures no two adjacent cards belong to the same word (`note_id`) whenever another word is available,
 * and maximizes spacing between sibling cards of the same note.
 */
export function spreadSameNoteCards(cards: CardWithNote[]): CardWithNote[] {
  if (cards.length <= 2) return [...cards];
  const pool = [...cards];
  const result: CardWithNote[] = [];

  while (pool.length > 0) {
    const lastNoteId = result[result.length - 1]?.note_id;
    const secondLastNoteId = result[result.length - 2]?.note_id;

    // Prefer a card whose note_id differs from the last 2 cards
    let pickIdx = pool.findIndex(
      (c) => c.note_id !== lastNoteId && c.note_id !== secondLastNoteId
    );
    if (pickIdx === -1) {
      pickIdx = pool.findIndex((c) => c.note_id !== lastNoteId);
    }
    if (pickIdx === -1) {
      pickIdx = 0;
    }

    const [picked] = pool.splice(pickIdx, 1);
    result.push(picked);
  }

  return result;
}

/**
 * Builds today's study queue (due review cards + today's new word batch in frequency order),
 * mixing cards across waves (`recognition` -> `listening` -> `cloze` -> `recall`) so the same word
 * never repeats back-to-back.
 */
export function buildDailyStudyQueue(params: {
  notes: NoteRecord[];
  cards: CardRecord[];
  now?: Date;
  weekNumber: number;
  dailyMinutes: 30 | 60 | 90;
  newWordsLearnedToday: number;
  extraBatchesToday: number;
}): {
  dueCards: CardWithNote[];
  newCards: CardWithNote[];
  newWordsRemainingCount: number;
  unseenNoteIds: string[];
  canLearnTenMore: boolean;
  dailyNewWordGoal: number;
  reducedByBacklog: boolean;
} {
  const now = params.now ?? new Date();
  const nowMs = now.getTime();
  const noteById = new Map<string, NoteRecord>(
    params.notes.map((n) => [n.id, n])
  );

  // 1. Due review/learning cards (state != 0 and due <= now)
  const rawDueCards: CardWithNote[] = [];
  for (const c of params.cards) {
    if (c.suspended) continue;
    if (c.state !== 0 && new Date(c.due).getTime() <= nowMs) {
      const note = noteById.get(c.note_id);
      if (note) {
        rawDueCards.push({ ...c, note });
      }
    }
  }

  rawDueCards.sort(
    (a, b) => new Date(a.due).getTime() - new Date(b.due).getTime()
  );
  const dueCards = spreadSameNoteCards(rawDueCards);

  // 2. Calculate today's new-word allowance
  const targetInfo = getEffectiveDailyNewWordsTarget({
    weekNumber: params.weekNumber,
    dueReviewCount: dueCards.length,
    dailyMinutes: params.dailyMinutes,
    extraBatchesToday: params.extraBatchesToday,
  });

  const remainingNewWordsToday = Math.max(
    0,
    targetInfo.totalTargetWithExtra - params.newWordsLearnedToday
  );

  // 3. Collect today's active new notes — strictly capped at `remainingNewWordsToday`
  // so unlearned words from previous days NEVER accumulate (e.g. always <= 20/day, never 40/day).
  const cardsByNoteId = new Map<string, CardRecord[]>();
  for (const c of params.cards) {
    if (c.suspended) continue;
    const list = cardsByNoteId.get(c.note_id) ?? [];
    list.push(c);
    cardsByNoteId.set(c.note_id, list);
  }

  const sortedNotes = [...params.notes].sort(
    (a, b) => a.part - b.part || a.freq_rank - b.freq_rank
  );

  const selectedNotes: {
    note: NoteRecord;
    unreviewedCards: CardRecord[];
    isCompletelyUnseen: boolean;
  }[] = [];

  // First pass: finish any partially-started words from today's batch (without exceeding daily cap)
  for (const note of sortedNotes) {
    if (selectedNotes.length >= remainingNewWordsToday) break;
    const noteCards = cardsByNoteId.get(note.id) ?? [];
    if (noteCards.length === 0) continue;

    const unreviewed = noteCards.filter((c) => c.state === 0);
    if (unreviewed.length === 0) continue;

    const isCompletelyUnseen = unreviewed.length === noteCards.length;
    if (!isCompletelyUnseen) {
      selectedNotes.push({
        note,
        unreviewedCards: unreviewed,
        isCompletelyUnseen: false,
      });
    }
  }

  // Second pass: fill remaining daily slots with completely unseen words
  for (const note of sortedNotes) {
    if (selectedNotes.length >= remainingNewWordsToday) break;
    const noteCards = cardsByNoteId.get(note.id) ?? [];
    if (noteCards.length === 0) continue;

    const unreviewed = noteCards.filter((c) => c.state === 0);
    if (unreviewed.length === 0) continue;

    const isCompletelyUnseen = unreviewed.length === noteCards.length;
    if (isCompletelyUnseen) {
      selectedNotes.push({
        note,
        unreviewedCards: unreviewed,
        isCompletelyUnseen: true,
      });
    }
  }

  const unseenNoteIds = selectedNotes
    .filter((item) => item.isCompletelyUnseen)
    .map((item) => item.note.id);

  // 4. Interleave across waves (Wave 1: recognition, Wave 2: listening, Wave 3: cloze, Wave 4: recall)
  const waveOrder: CardType[] = [
    "recognition",
    "listening",
    "cloze",
    "recall",
    "speak",
  ];
  const rawNewCards: CardWithNote[] = [];

  waveOrder.forEach((cardType, waveIdx) => {
    const waveItems: CardWithNote[] = [];
    for (const item of selectedNotes) {
      const matchingCard = item.unreviewedCards.find(
        (c) => c.type === cardType
      );
      if (matchingCard) {
        waveItems.push({ ...matchingCard, note: item.note });
      }
    }
    const mixedWave = mixWaveOrder(waveItems, waveIdx);
    rawNewCards.push(...mixedWave);
  });

  const newCards = spreadSameNoteCards(rawNewCards);

  const canLearnTenMore = canUnlockTenMoreWords({
    remainingDueReviews: dueCards.length,
    remainingDailyNewWords: selectedNotes.length,
  });

  return {
    dueCards,
    newCards,
    newWordsRemainingCount: selectedNotes.length,
    unseenNoteIds,
    canLearnTenMore,
    dailyNewWordGoal: targetInfo.totalTargetWithExtra,
    reducedByBacklog: targetInfo.reducedByBacklog,
  };
}
