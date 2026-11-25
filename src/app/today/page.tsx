"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronsRight,
  Clock,
  Flame,
  ShieldCheck,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import { AchievementsWall } from "@/components/AchievementsWall";
import {
  getOrInitSettings,
  getOrInitTodaySession,
  offlineDb,
} from "@/lib/offline/db";
import {
  buildDailyQuestsForDate,
  buildScaledDailyPlan,
  computeEarnedBadges,
  computeJourneyProgress,
  DailyLoopBlock,
} from "@/lib/journey/spain-journey";
import {
  DailyQuestRecord,
  LessonRecord,
  PronunciationAttemptRecord,
  ReadingTextRecord,
  SessionRecord,
} from "@/types/database";

const TODAY_BLOCKS_STORAGE_PREFIX = "espanol_fast_daily_blocks_v1_";

export default function TodayLoopPage() {
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [loading, setLoading] = useState(true);
  const [dailyMinutes, setDailyMinutes] = useState<30 | 60 | 90>(60);
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [completedBlockIds, setCompletedBlockIds] = useState<string[]>([]);
  const [quests, setQuests] = useState<DailyQuestRecord[]>([]);
  const [wordsLearned, setWordsLearned] = useState(0);
  const [errorsCount, setErrorsCount] = useState(0);
  const [pronAvg, setPronAvg] = useState<number | null>(null);
  const [lessons, setLessons] = useState<LessonRecord[]>([]);
  const [attempts, setAttempts] = useState<PronunciationAttemptRecord[]>([]);
  const [texts, setTexts] = useState<ReadingTextRecord[]>([]);
  const [allSessions, setAllSessions] = useState<SessionRecord[]>([]);
  const [showWrapUp, setShowWrapUp] = useState(false);

  const loadTodayData = useCallback(async () => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(
          `${TODAY_BLOCKS_STORAGE_PREFIX}${todayStr}`
        );
        if (saved) {
          const parsed = JSON.parse(saved) as string[];
          if (Array.isArray(parsed)) setCompletedBlockIds(parsed);
        }
      } catch {
        // Ignore storage errors
      }
    }

    if (!offlineDb) {
      setLoading(false);
      return;
    }

    try {
      const [
        settings,
        todaySess,
        allCards,
        allLessons,
        allErrors,
        allAttempts,
        allTexts,
        sessionsList,
        wordStatuses,
      ] = await Promise.all([
        getOrInitSettings(),
        getOrInitTodaySession(todayStr),
        offlineDb.cards.toArray(),
        offlineDb.lessons.toArray(),
        offlineDb.errors.toArray(),
        offlineDb.pron_attempts.toArray(),
        offlineDb.texts.toArray(),
        offlineDb.sessions.toArray(),
        offlineDb.word_status.toArray(),
      ]);

      setDailyMinutes(settings.daily_minutes);
      setSession(todaySess);
      setLessons(allLessons);
      setErrorsCount(allErrors.length);
      setAttempts(allAttempts);
      setTexts(allTexts);
      setAllSessions(sessionsList);

      const learnedNoteIds = new Set(
        allCards.filter((c) => c.reps > 0).map((c) => c.note_id)
      );
      setWordsLearned(learnedNoteIds.size);

      const todayAttempts = allAttempts.filter((a) =>
        a.created_at.startsWith(todayStr)
      );
      const pron80PlusToday = todayAttempts.filter((a) => a.overall >= 80).length;

      if (allAttempts.length > 0) {
        const avg = Math.round(
          allAttempts.reduce((sum, a) => sum + a.overall, 0) / allAttempts.length
        );
        setPronAvg(avg);
      }

      const lessonsDoneToday = allLessons.filter(
        (l) => l.completed_at && l.completed_at.startsWith(todayStr)
      ).length;
      const wordsMinedToday = wordStatuses.filter((w) =>
        w.updated_at.startsWith(todayStr)
      ).length;

      const builtQuests = buildDailyQuestsForDate(todayStr, {
        reviewsDoneToday: todaySess.review_count,
        pron80PlusToday,
        wordsMinedToday,
        lessonsDoneToday,
      });
      setQuests(builtQuests);

      // Auto-mark blocks that have real activity today
      const autoDone = new Set<string>();
      if (todaySess.review_count >= 5) autoDone.add("warmup");
      if (todaySess.new_count >= 5) autoDone.add("new_words");
      if (lessonsDoneToday >= 1) autoDone.add("grammar");
      if (todayAttempts.length >= 1) autoDone.add("pronunciation");
      if (wordsMinedToday >= 1 || allTexts.some((t) => t.progress >= 100)) {
        autoDone.add("read");
      }

      if (autoDone.size > 0) {
        setCompletedBlockIds((prev) => {
          const merged = Array.from(new Set([...prev, ...autoDone]));
          if (typeof window !== "undefined") {
            window.localStorage.setItem(
              `${TODAY_BLOCKS_STORAGE_PREFIX}${todayStr}`,
              JSON.stringify(merged)
            );
          }
          return merged;
        });
      }
    } finally {
      setLoading(false);
    }
  }, [todayStr]);

  useEffect(() => {
    void loadTodayData();
    const onCloudSynced = () => void loadTodayData();
    window.addEventListener("spanishx:cloud-synced", onCloudSynced);
    return () =>
      window.removeEventListener("spanishx:cloud-synced", onCloudSynced);
  }, [loadTodayData]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("wrapup") === "1") {
        setShowWrapUp(true);
      }
    }
  }, []);

  const blocks = useMemo(() => {
    const unlockAllEarly =
      typeof window !== "undefined" &&
      window.localStorage.getItem("spanishx_unlock_all_stages_v1") === "1";
    return buildScaledDailyPlan(dailyMinutes, {
      wordsLearned,
      unlockAllEarly,
    });
  }, [dailyMinutes, wordsLearned]);

  const toggleBlockDone = (id: DailyLoopBlock["id"]) => {
    setCompletedBlockIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          `${TODAY_BLOCKS_STORAGE_PREFIX}${todayStr}`,
          JSON.stringify(next)
        );
      }
      return next;
    });
  };

  const handleChangeBudget = async (mins: 30 | 60 | 90) => {
    setDailyMinutes(mins);
    if (!offlineDb) return;
    const current = await getOrInitSettings();
    await offlineDb.settings.put({ ...current, daily_minutes: mins });
  };

  const { badges, streakFreezes } = useMemo(
    () =>
      computeEarnedBadges({
        wordsKnown: wordsLearned,
        attempts,
        texts,
        sessions: allSessions,
        lessons,
      }),
    [wordsLearned, attempts, texts, allSessions, lessons]
  );

  const completedVisibleCount = useMemo(
    () => blocks.filter((b) => completedBlockIds.includes(b.id)).length,
    [blocks, completedBlockIds]
  );

  const handleCompleteWrapUp = () => {
    if (!completedBlockIds.includes("wrapup")) {
      toggleBlockDone("wrapup");
    }
    setShowWrapUp(false);
  };

  const journey = useMemo(
    () => computeJourneyProgress({ lessons, wordsLearned }),
    [lessons, wordsLearned]
  );

  const nextBlock =
    blocks.find((b) => !completedBlockIds.includes(b.id)) ?? blocks[blocks.length - 1];

  const xpGoal = dailyMinutes === 30 ? 30 : dailyMinutes === 60 ? 50 : 75;
  const currentXp = session?.xp ?? 0;
  const xpPct = Math.min(100, Math.round((currentXp / xpGoal) * 100));

  if (loading) {
    return (
      <div className="bento-card p-8 text-center text-sm text-zinc-400">
        Building today&apos;s Madrid study plan…
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Hero XP Ring + Daily Budget Card */}
      <section className="rounded-[28px] bg-[#181A1F] border border-white/[0.07] p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF4F17]">
              GUIDED DAILY LOOP · WEEK {journey.currentWeek}
            </div>
            <h1 className="font-display text-2xl font-extrabold text-white tracking-tight">
              Today&apos;s Plan
            </h1>
            <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
              <span className="inline-flex items-center gap-1 font-bold text-white">
                <Flame className="w-3.5 h-3.5 text-[#FF4F17] fill-[#FF4F17]" />
                {session?.streak ?? 1}d streak
              </span>
              <span>·</span>
              <span
                title="5 goal days in a week earns 1 streak freeze (max 2)"
                className="inline-flex items-center gap-1 text-sky-300 font-bold"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {streakFreezes}/2 freezes
              </span>
            </div>
          </div>

          {/* XP Goal Ring */}
          <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
              <circle
                cx="32"
                cy="32"
                r="26"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="6"
              />
              <circle
                cx="32"
                cy="32"
                r="26"
                fill="none"
                stroke="#FF4F17"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 26}`}
                strokeDashoffset={`${2 * Math.PI * 26 * (1 - xpPct / 100)}`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-xs font-extrabold text-white leading-none">
                {currentXp}
              </span>
              <span className="text-[9px] text-zinc-400 font-bold">
                /{xpGoal}xp
              </span>
            </div>
          </div>
        </div>

        {/* 30 / 60 / 90 min Time Budget Selector */}
        <div className="flex items-center justify-between gap-2 bg-[#111318] rounded-2xl p-1.5 border border-white/[0.06]">
          <span className="text-[11px] font-bold text-zinc-400 pl-2 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-[#FF4F17]" />
            Budget:
          </span>
          <div className="grid grid-cols-3 gap-1">
            {([30, 60, 90] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => void handleChangeBudget(m)}
                className={`px-3 py-1 rounded-xl text-xs font-extrabold transition ${
                  dailyMinutes === m
                    ? "bg-[#FF4F17] text-black"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {m}m
              </button>
            ))}
          </div>
        </div>

        {/* One-Button Next Block CTA */}
        {nextBlock.id === "wrapup" ? (
          <button
            type="button"
            onClick={() => setShowWrapUp(true)}
            className="w-full rounded-full bg-[#FF4F17] hover:bg-[#FF6230] text-black font-extrabold text-sm py-2.5 pl-5 pr-2.5 flex items-center justify-between shadow-[0_10px_28px_rgba(255,79,23,0.35)] transition"
          >
            <span>Open Daily Wrap-Up Summary</span>
            <span className="w-9 h-9 rounded-full bg-[#0D0E11] text-[#FF4F17] flex items-center justify-center">
              <Trophy className="w-4 h-4" />
            </span>
          </button>
        ) : (
          <Link
            href={nextBlock.href}
            className="w-full rounded-full bg-[#FF4F17] hover:bg-[#FF6230] text-black font-extrabold text-sm py-2.5 pl-5 pr-2.5 flex items-center justify-between shadow-[0_10px_28px_rgba(255,79,23,0.35)] transition"
          >
            <span>
              Start Step {nextBlock.stepNumber}: {nextBlock.title} (
              {nextBlock.minutes}m)
            </span>
            <span className="w-9 h-9 rounded-full bg-[#0D0E11] text-[#FF4F17] flex items-center justify-center shrink-0">
              <ChevronsRight className="w-4 h-4" />
            </span>
          </Link>
        )}
      </section>

      {/* Progressive Daily Loop Blocks */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
            Today&apos;s Session ({completedVisibleCount}/{blocks.length} done)
          </span>
          <span className="text-[10px] font-bold text-[#FF4F17]">
            Scaled to {dailyMinutes} min
          </span>
        </div>

        {blocks.map((block) => {
          const isDone = completedBlockIds.includes(block.id);
          const isNext = nextBlock.id === block.id && !isDone;
          return (
            <div
              key={block.id}
              className={`rounded-2xl p-3 border flex items-center justify-between gap-2.5 transition ${
                isDone
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : isNext
                    ? "bg-[#1C1F26] border-[#FF4F17]/50"
                    : "bg-[#181A1F] border-white/[0.06]"
              }`}
            >
              <button
                type="button"
                onClick={() => toggleBlockDone(block.id)}
                title="Mark block complete"
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border transition ${
                  isDone
                    ? "bg-emerald-500 text-black border-emerald-500"
                    : "bg-[#111318] text-zinc-500 border-white/10 hover:border-[#FF4F17]"
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <span className="text-[11px] font-extrabold">
                    {block.stepNumber}
                  </span>
                )}
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-xs font-extrabold truncate ${
                      isDone ? "text-emerald-200 line-through" : "text-white"
                    }`}
                  >
                    {block.title}
                  </span>
                  <span className="text-[10px] font-bold text-[#FF4F17] shrink-0">
                    {block.minutes}m
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 truncate">
                  {block.subtitle}
                </p>
              </div>

              {block.id === "wrapup" ? (
                <button
                  type="button"
                  onClick={() => setShowWrapUp((v) => !v)}
                  className="shrink-0 rounded-xl bg-white/[0.07] hover:bg-[#FF4F17] text-zinc-200 hover:text-black px-2.5 py-1.5 text-[11px] font-extrabold transition"
                >
                  Summary
                </button>
              ) : (
                <Link
                  href={block.href}
                  className="shrink-0 rounded-xl bg-white/[0.07] hover:bg-[#FF4F17] text-zinc-200 hover:text-black px-2.5 py-1.5 text-[11px] font-extrabold transition"
                >
                  Open »
                </Link>
              )}
            </div>
          );
        })}
      </section>

      {/* Daily Wrap-Up Summary Modal (centered, impossible to miss) */}
      {showWrapUp && (
        <div
          id="wrapup"
          onClick={() => setShowWrapUp(false)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <section
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[380px] rounded-[28px] bg-[#16181F] border border-[#FF4F17]/45 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.85)] space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#FF4F17] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>Daily Wrap-Up Summary</span>
              </span>
              <button
                type="button"
                onClick={() => setShowWrapUp(false)}
                aria-label="Close summary"
                className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center py-1">
              <div className="font-display text-3xl font-extrabold text-white">
                +{currentXp} XP Today
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                {session?.review_count ?? 0} reviews · {session?.streak ?? 1}d streak ·{" "}
                {badges.filter((b) => b.earned).length}/{badges.length} achievements
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-2xl bg-[#101218] p-3 border border-white/[0.06]">
                <div className="text-[10px] text-zinc-400">Words Learned</div>
                <div className="font-display text-lg font-extrabold text-white">
                  {wordsLearned}
                </div>
              </div>
              <div className="rounded-2xl bg-[#101218] p-3 border border-white/[0.06]">
                <div className="text-[10px] text-zinc-400">Achievements</div>
                <div className="font-display text-lg font-extrabold text-emerald-300">
                  {badges.filter((b) => b.earned).length}/{badges.length}
                </div>
              </div>
              <div className="rounded-2xl bg-[#101218] p-3 border border-white/[0.06]">
                <div className="text-[10px] text-zinc-400">Error Notebook</div>
                <div className="font-display text-lg font-extrabold text-white">
                  {errorsCount} saved
                </div>
              </div>
              <div className="rounded-2xl bg-[#101218] p-3 border border-white/[0.06]">
                <div className="text-[10px] text-zinc-400">Spain Journey</div>
                <div className="font-display text-lg font-extrabold text-[#FF4F17]">
                  W{journey.currentWeek} · {journey.postcardsEarned}/12
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCompleteWrapUp}
              className="w-full py-3 rounded-2xl bg-[#FF4F17] hover:bg-[#FF6230] text-black font-extrabold text-sm flex items-center justify-center gap-1.5 shadow-[0_8px_24px_rgba(255,79,23,0.35)] transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Complete Today</span>
            </button>
          </section>
        </div>
      )}

      {/* 3 Daily Quests */}
      <section className="bento-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17]">
            Daily Quests (3 / Day)
          </span>
          <span className="text-[10px] font-bold text-zinc-400">
            {quests.filter((q) => q.done).length}/3 complete
          </span>
        </div>

        <div className="space-y-2.5">
          {quests.map((q) => {
            const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
            return (
              <div key={q.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span
                    className={`font-bold ${
                      q.done ? "text-emerald-300 line-through" : "text-zinc-200"
                    }`}
                  >
                    {q.done ? "✓ " : ""}
                    {q.description}
                  </span>
                  <span className="text-[11px] font-extrabold text-zinc-400 shrink-0 ml-2">
                    {Math.min(q.progress, q.target)}/{q.target}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[#101216] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      q.done ? "bg-emerald-400" : "bg-[#FF4F17]"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 42-Achievement Trophy Wall */}
      <AchievementsWall badges={badges} />
    </div>
  );
}
