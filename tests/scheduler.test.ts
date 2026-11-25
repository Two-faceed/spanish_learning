import { describe, expect, it } from "vitest";
import {
  addOrPromoteWordInDeck,
  createInitialCardsForNote,
  gradeCard,
  isLeechCard,
  previewNextIntervals,
} from "@/lib/fsrs/scheduler";
import {
  buildDailyStudyQueue,
  canUnlockTenMoreWords,
  getEffectiveDailyNewWordsTarget,
  getScheduledNewWordsForWeek,
  getStudyWeekNumber,
} from "@/lib/fsrs/daily-queue";
import { NoteRecord } from "@/types/database";

function makeNote(index: number, word: string, lemma: string): NoteRecord {
  return {
    id: `note-${index}`,
    anki_guid: `guid-${index}`,
    word,
    lemma,
    meaning: `meaning-${index}`,
    example_es: `Ejemplo ${word}.`,
    cloze_es: `Ejemplo __.`,
    example_tr: `Example ${index}.`,
    pos: "n",
    gender: "el",
    image_url: null,
    audio_word_url: null,
    audio_example_url: null,
    deck_audio_word_url: null,
    deck_audio_example_url: null,
    audio_source: "deck",
    part: 1,
    freq_rank: index,
    source: "deck",
    created_at: "2026-10-19T00:00:00.000Z",
  };
}

describe("FSRS Scheduler & Daily Queue", () => {
  it("creates 4 Phase-1 card types per note and transitions states across ratings", () => {
    const now = new Date("2026-10-19T08:00:00.000Z");
    const cards = createInitialCardsForNote("note-1", now);
    expect(cards.map((c) => c.type)).toEqual([
      "recognition",
      "recall",
      "listening",
      "cloze",
    ]);

    const previews = previewNextIntervals(cards[0], now);
    expect(previews[1]).toBeTruthy();
    expect(previews[3]).toBeTruthy();

    // Grade Good (3) -> moves out of New (0) state
    const { updatedCard, reviewLog, isLeech } = gradeCard(
      cards[0],
      3,
      3200,
      now
    );
    expect(updatedCard.reps).toBe(1);
    expect(updatedCard.state).not.toBe(0);
    expect(new Date(updatedCard.due).getTime()).toBeGreaterThan(now.getTime());
    expect(reviewLog.rating).toBe(3);
    expect(isLeech).toBe(false);
  });

  it("flags a card as a leech after 6 failures (Again ratings)", () => {
    let card = createInitialCardsForNote("note-leech")[0];
    let now = new Date("2026-10-19T08:00:00.000Z");

    for (let i = 1; i <= 5; i++) {
      const res = gradeCard(card, 1, 2000, now);
      card = res.updatedCard;
      expect(res.isLeech).toBe(false);
      now = new Date(now.getTime() + 600000);
    }

    const sixth = gradeCard(card, 1, 2000, now);
    expect(sixth.updatedCard.lapses).toBe(6);
    expect(sixth.isLeech).toBe(true);
    expect(isLeechCard(sixth.updatedCard)).toBe(true);
  });

  it("ramps new words from 10/day in week 1 up to 50/day in week 5+", () => {
    expect(getScheduledNewWordsForWeek(1)).toBe(10);
    expect(getScheduledNewWordsForWeek(2)).toBe(20);
    expect(getScheduledNewWordsForWeek(3)).toBe(30);
    expect(getScheduledNewWordsForWeek(4)).toBe(40);
    expect(getScheduledNewWordsForWeek(5)).toBe(50);
    expect(getScheduledNewWordsForWeek(12)).toBe(50);

    const start = "2026-10-01";
    expect(getStudyWeekNumber(start, new Date("2026-10-03"))).toBe(1);
    expect(getStudyWeekNumber(start, new Date("2026-10-09"))).toBe(2);
  });

  it("caps new words when due reviews exceed time budget, but never below 10", () => {
    // Week 5 base target = 50/day, 60 min budget comfortable capacity = 160 reviews
    const normal = getEffectiveDailyNewWordsTarget({
      weekNumber: 5,
      dueReviewCount: 120,
      dailyMinutes: 60,
    });
    expect(normal.effectiveTarget).toBe(50);
    expect(normal.reducedByBacklog).toBe(false);

    // Heavy backlog (250 due reviews on 60m budget) reduces new words
    const reduced = getEffectiveDailyNewWordsTarget({
      weekNumber: 5,
      dueReviewCount: 250,
      dailyMinutes: 60,
    });
    expect(reduced.reducedByBacklog).toBe(true);
    expect(reduced.effectiveTarget).toBeLessThan(50);
    expect(reduced.effectiveTarget).toBeGreaterThanOrEqual(10);

    // Extreme backlog (500 due reviews) still never drops below 10
    const floorCheck = getEffectiveDailyNewWordsTarget({
      weekNumber: 5,
      dueReviewCount: 500,
      dailyMinutes: 30,
    });
    expect(floorCheck.effectiveTarget).toBe(10);
  });

  it("enforces the 'Learn 10 more words?' guardrail and promotes existing words instead of duplicating", () => {
    expect(
      canUnlockTenMoreWords({
        remainingDueReviews: 5,
        remainingDailyNewWords: 0,
      })
    ).toBe(false);
    expect(
      canUnlockTenMoreWords({
        remainingDueReviews: 0,
        remainingDailyNewWords: 2,
      })
    ).toBe(false);
    expect(
      canUnlockTenMoreWords({
        remainingDueReviews: 0,
        remainingDailyNewWords: 0,
      })
    ).toBe(true);

    const notes = [
      makeNote(1, "el color", "color"),
      makeNote(2, "tener", "tener"),
      makeNote(3, "hablar", "hablar"),
    ];
    const cards = notes.flatMap((n) => createInitialCardsForNote(n.id));

    // Promoting "hablar" moves it to the front of the queue without creating a duplicate note
    const promoted = addOrPromoteWordInDeck(notes, cards, {
      word: "hablar",
      lemma: "hablar",
      meaning: "to speak",
      source: "reading",
    });
    expect(promoted.promotedExisting).toBe(true);
    expect(promoted.notes.length).toBe(3);
    expect(promoted.targetNote.freq_rank).toBeLessThan(1);

    const queue = buildDailyStudyQueue({
      notes: promoted.notes,
      cards: promoted.cards,
      weekNumber: 1,
      dailyMinutes: 60,
      newWordsLearnedToday: 9,
      extraBatchesToday: 0,
    });
    // With 9 of 10 words learned today, only 1 new word (the promoted "hablar") is queued
    expect(queue.newCards[0].note.lemma).toBe("hablar");
  });

  it("interleaves new cards across waves so the same word never repeats back-to-back", () => {
    const tenNotes = Array.from({ length: 10 }, (_, i) =>
      makeNote(i + 1, `palabra-${i + 1}`, `palabra-${i + 1}`)
    );
    const fortyCards = tenNotes.flatMap((n) => createInitialCardsForNote(n.id));

    const queue = buildDailyStudyQueue({
      notes: tenNotes,
      cards: fortyCards,
      weekNumber: 1,
      dailyMinutes: 60,
      newWordsLearnedToday: 0,
      extraBatchesToday: 0,
    });

    expect(queue.newCards).toHaveLength(40);
    // First 10 cards introduce all 10 distinct words (recognition wave)
    const firstTenNoteIds = new Set(
      queue.newCards.slice(0, 10).map((c) => c.note_id)
    );
    expect(firstTenNoteIds.size).toBe(10);

    // No two consecutive cards across the entire 40-card queue have the same note_id
    for (let i = 1; i < queue.newCards.length; i++) {
      expect(queue.newCards[i].note_id).not.toBe(queue.newCards[i - 1].note_id);
    }
  });

  it("uses optimal Day-1 -> Day-2 initial intervals and never accumulates unlearned new words across days", () => {
    const now = new Date("2026-11-24T08:00:00.000Z");
    const freshCard = createInitialCardsForNote("note-timing", now)[0];

    const previews = previewNextIntervals(freshCard, now);
    expect(previews[1]).toBe("1m");
    expect(previews[2]).toBe("10m");
    expect(previews[3]).toBe("1d");
    expect(previews[4]).toBe("3d");

    const afterFirstGood = gradeCard(freshCard, 3, 2500, now).updatedCard;
    expect(afterFirstGood.scheduled_days).toBe(1);

    const nextDay = new Date(now.getTime() + 86_400_000);
    const secondPreview = previewNextIntervals(afterFirstGood, nextDay);
    expect(secondPreview[3]).toBe("2d");

    // Week 2 goal = 20 words/day. Even if 5 words were partially started earlier and 30 more are unseen,
    // total new words in today's batch MUST stay capped at 20 (never 25 or 40!).
    const thirtyFiveNotes = Array.from({ length: 35 }, (_, i) =>
      makeNote(i + 1, `word-${i + 1}`, `word-${i + 1}`)
    );
    const allCards = thirtyFiveNotes.flatMap((n, idx) => {
      const c = createInitialCardsForNote(n.id, now);
      // Mark first 5 notes as partially started (recognition already done)
      if (idx < 5) {
        c[0] = gradeCard(c[0], 3, 2000, now).updatedCard;
      }
      return c;
    });

    const queue = buildDailyStudyQueue({
      notes: thirtyFiveNotes,
      cards: allCards,
      now,
      weekNumber: 2,
      dailyMinutes: 60,
      newWordsLearnedToday: 0,
      extraBatchesToday: 0,
    });

    expect(queue.dailyNewWordGoal).toBe(20);
    expect(queue.newWordsRemainingCount).toBe(20);
    // Only the 15 completely unseen notes should trigger New Word Intro (not the 5 already started)
    expect(queue.unseenNoteIds).toHaveLength(15);
  });
});
