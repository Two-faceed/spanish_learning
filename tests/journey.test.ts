import { describe, expect, it } from "vitest";
import {
  buildDailyQuestsForDate,
  buildScaledDailyPlan,
  computeEarnedBadges,
  computeJourneyProgress,
  SPAIN_JOURNEY_CITIES,
} from "@/lib/journey/spain-journey";
import { LessonRecord } from "@/types/database";

describe("Phase 5 — Daily Loop Scaling & 12-City Spain Journey Map", () => {
  it("scales the 7 daily loop blocks cleanly across 30 / 60 / 90 min budgets", () => {
    const plan30 = buildScaledDailyPlan(30);
    const plan60 = buildScaledDailyPlan(60);
    const plan90 = buildScaledDailyPlan(90);

    expect(plan30).toHaveLength(7);
    expect(plan60).toHaveLength(7);
    expect(plan90).toHaveLength(7);

    const sum = (blocks: ReturnType<typeof buildScaledDailyPlan>) =>
      blocks.reduce((acc, b) => acc + b.minutes, 0);

    expect(sum(plan30)).toBeLessThan(sum(plan60));
    expect(sum(plan60)).toBeLessThan(sum(plan90));

    // Progressive unlock: A0 (<150 words) gets 4 core foundation stages;
    // Early A1 (150..349 words) unlocks Pronunciation + Reading (6 stages);
    // 350+ words unlocks full 7-stage path including Voice Roleplay.
    const a0Plan = buildScaledDailyPlan(60, { wordsLearned: 30 });
    expect(a0Plan.map((b) => b.id)).toEqual([
      "warmup",
      "new_words",
      "grammar",
      "wrapup",
    ]);
    expect(a0Plan.map((b) => b.stepNumber)).toEqual([1, 2, 3, 4]);

    const a1Plan = buildScaledDailyPlan(60, { wordsLearned: 180 });
    expect(a1Plan.map((b) => b.id)).toEqual([
      "warmup",
      "new_words",
      "grammar",
      "pronunciation",
      "read",
      "wrapup",
    ]);

    const fullPlan = buildScaledDailyPlan(60, { wordsLearned: 360 });
    expect(fullPlan).toHaveLength(7);

    const earlyOverride = buildScaledDailyPlan(60, {
      wordsLearned: 10,
      unlockAllEarly: true,
    });
    expect(earlyOverride).toHaveLength(7);
  });

  it("unlocks Toledo (Week 2) once Madrid (Week 1) has 6 lessons, 70+ words, and 80%+ boss test", () => {
    const week1Lessons: LessonRecord[] = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
      id: `w1-d${d}`,
      week: 1,
      day: d,
      city: "Madrid",
      topic: "Basics",
      explanation: "",
      examples: [],
      new_words: [],
      exercises: [],
      completed_at: "2026-11-20T10:00:00.000Z",
      score: d === 7 ? 88 : 90,
    }));

    const result = computeJourneyProgress({
      lessons: week1Lessons,
      wordsLearned: 75,
    });

    expect(SPAIN_JOURNEY_CITIES).toHaveLength(12);
    expect(result.cities[0].city).toBe("Madrid");
    expect(result.cities[0].status).toBe("done");
    expect(result.cities[1].city).toBe("Toledo");
    expect(result.cities[1].status).toBe("current");
    expect(result.currentWeek).toBe(2);
    expect(result.postcardsEarned).toBe(1);
  });

  it("generates 3 daily quests and awards milestone badges & streak freezes", () => {
    const quests = buildDailyQuestsForDate("2026-11-23", {
      reviewsDoneToday: 20,
      pron80PlusToday: 3,
      wordsMinedToday: 0,
      lessonsDoneToday: 1,
    });
    expect(quests).toHaveLength(3);
    expect(quests.every((q) => q.done)).toBe(true);

    const { badges, streakFreezes } = computeEarnedBadges({
      wordsKnown: 520,
      attempts: [],
      texts: [],
      sessions: Array.from({ length: 6 }, (_, i) => ({
        date: `2026-11-1${i}`,
        minutes: 60,
        new_count: 10,
        review_count: 30,
        xp: 40,
        goal_met: true,
        streak: i + 1,
        extra_batches: 0,
      })),
    });

    expect(streakFreezes).toBe(1);
    expect(badges).toHaveLength(42);
    expect(badges.find((b) => b.key === "words_1")?.earned).toBe(true);
    expect(badges.find((b) => b.key === "words_100")?.earned).toBe(true);
    expect(badges.find((b) => b.key === "words_500")?.earned).toBe(true);
    expect(badges.find((b) => b.key === "words_1000")?.earned).toBe(false);
    expect(badges.find((b) => b.key === "rev_100")?.earned).toBe(true);
    expect(badges.find((b) => b.key === "streak_3")?.earned).toBe(true);
    expect(badges.find((b) => b.key === "xp_50")?.earned).toBe(true);
  });
});
