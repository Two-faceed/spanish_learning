"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookmarkCheck,
  Check,
  ChevronRight,
  HardDriveDownload,
  Lock,
  MapPin,
  Play,
  PlusCircle,
} from "lucide-react";
import {
  getOrInitSettings,
  getOrInitTodaySession,
  offlineDb,
} from "@/lib/offline/db";
import {
  buildDailyStudyQueue,
  getStudyWeekNumber,
} from "@/lib/fsrs/daily-queue";
import { prefetchQueueAudioForOffline } from "@/lib/audio/player";
import { saveImportedDeckLocally } from "@/lib/offline/sync-manager";
import { ParsedApkgResult } from "@/lib/anki/parser";
import {
  buildScaledDailyPlan,
  computeJourneyProgress,
  UNLOCK_PRONUNCIATION_READING_WORDS,
  UNLOCK_SPEAK_WORDS,
} from "@/lib/journey/spain-journey";
import { LessonRecord } from "@/types/database";

const TODAY_BLOCKS_STORAGE_PREFIX = "espanol_fast_daily_blocks_v1_";
const UNLOCK_ALL_STAGES_KEY = "spanishx_unlock_all_stages_v1";

export default function HomePage() {
  const router = useRouter();
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [loading, setLoading] = useState(true);
  const [totalNotes, setTotalNotes] = useState(0);
  const [wordsLearned, setWordsLearned] = useState(0);
  const [dueCount, setDueCount] = useState(0);
  const [newWordsRemainingToday, setNewWordsRemainingToday] = useState(0);
  const [canLearnTenMore, setCanLearnTenMore] = useState(false);
  const [dailyMinutes, setDailyMinutes] = useState<30 | 60 | 90>(60);
  const [completedStages, setCompletedStages] = useState<string[]>([]);
  const [allLessons, setAllLessons] = useState<LessonRecord[]>([]);
  const [cachedAudioCount, setCachedAudioCount] = useState(0);
  const [cachingOffline, setCachingOffline] = useState(false);
  const [cacheProgressText, setCacheProgressText] = useState<string | null>(
    null
  );
  const [quickImporting, setQuickImporting] = useState(false);

  const loadDashboard = useCallback(async () => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(
          `${TODAY_BLOCKS_STORAGE_PREFIX}${todayStr}`
        );
        if (saved) {
          const parsed = JSON.parse(saved) as string[];
          if (Array.isArray(parsed)) setCompletedStages(parsed);
        }
      } catch {
        // Ignore storage errors
      }
    }

    if (!offlineDb) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [
        notes,
        cards,
        settings,
        session,
        audioCount,
        lessonsList,
        attempts,
        texts,
        wordStatuses,
      ] = await Promise.all([
        offlineDb.notes.toArray(),
        offlineDb.cards.toArray(),
        getOrInitSettings(),
        getOrInitTodaySession(todayStr),
        offlineDb.audio_blobs.count(),
        offlineDb.lessons.toArray(),
        offlineDb.pron_attempts.toArray(),
        offlineDb.texts.toArray(),
        offlineDb.word_status.toArray(),
      ]);

      setTotalNotes(notes.length);
      setDailyMinutes(settings.daily_minutes);
      setCachedAudioCount(audioCount);
      setAllLessons(lessonsList);

      const learnedIds = new Set(
        cards.filter((c) => c.reps > 0).map((c) => c.note_id)
      );
      setWordsLearned(learnedIds.size);

      const wk = getStudyWeekNumber(settings.start_date);
      const queue = buildDailyStudyQueue({
        notes,
        cards,
        weekNumber: wk,
        dailyMinutes: settings.daily_minutes,
        newWordsLearnedToday: session.new_count,
        extraBatchesToday: session.extra_batches,
      });

      setDueCount(queue.dueCards.length);
      setNewWordsRemainingToday(queue.newWordsRemainingCount);
      setCanLearnTenMore(queue.canLearnTenMore && notes.length > 0);

      // Auto-detect completed daily stages from real activity today
      const autoDone = new Set<string>();
      if (session.review_count >= 5 || (notes.length > 0 && queue.dueCards.length === 0)) {
        autoDone.add("warmup");
      }
      if (
        (notes.length > 0 && queue.newWordsRemainingCount === 0) ||
        session.new_count >= queue.dailyNewWordGoal
      ) {
        autoDone.add("new_words");
      }
      if (
        lessonsList.some(
          (l) => l.completed_at && l.completed_at.startsWith(todayStr)
        )
      ) {
        autoDone.add("grammar");
      }
      if (attempts.some((a) => a.created_at.startsWith(todayStr))) {
        autoDone.add("pronunciation");
      }
      if (
        wordStatuses.some((w) => w.updated_at.startsWith(todayStr)) ||
        texts.some((t) => t.progress >= 100 && t.updated_at.startsWith(todayStr))
      ) {
        autoDone.add("read");
      }

      if (autoDone.size > 0) {
        setCompletedStages((prev) => {
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
    void loadDashboard();
    const onCloudSynced = () => void loadDashboard();
    window.addEventListener("spanishx:cloud-synced", onCloudSynced);
    return () =>
      window.removeEventListener("spanishx:cloud-synced", onCloudSynced);
  }, [loadDashboard]);

  const [unlockAllEarly, setUnlockAllEarly] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(UNLOCK_ALL_STAGES_KEY) === "1";
  });

  const handleToggleUnlockAll = () => {
    setUnlockAllEarly((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(UNLOCK_ALL_STAGES_KEY, next ? "1" : "0");
      }
      return next;
    });
  };

  const stages = useMemo(
    () =>
      buildScaledDailyPlan(dailyMinutes, {
        wordsLearned,
        unlockAllEarly,
      }),
    [dailyMinutes, wordsLearned, unlockAllEarly]
  );

  const completedVisibleCount = useMemo(
    () => stages.filter((s) => completedStages.includes(s.id)).length,
    [stages, completedStages]
  );

  const journey = useMemo(
    () => computeJourneyProgress({ lessons: allLessons, wordsLearned }),
    [allLessons, wordsLearned]
  );

  const currentCity =
    journey.cities.find((c) => c.status === "current") ?? journey.cities[0];
  const nextCity =
    journey.cities[Math.min(journey.cities.length - 1, currentCity.week)];

  const activeStage =
    stages.find((s) => !completedStages.includes(s.id)) ??
    stages[stages.length - 1];

  const handleToggleStage = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCompletedStages((prev) => {
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

  const handleQuickImportSpain5000 = async () => {
    if (quickImporting) return;
    setQuickImporting(true);
    try {
      const res = await fetch(
        "/api/local-deck?action=parse&file=New_Spanish_Top_5000_Vocabulary.apkg"
      );
      if (!res.ok) return;
      const parsed = (await res.json()) as ParsedApkgResult;
      await saveImportedDeckLocally(parsed.notes, "deck");
      await loadDashboard();
    } finally {
      setQuickImporting(false);
    }
  };

  const handleLearnTenMore = async () => {
    if (!offlineDb || !canLearnTenMore) return;
    const session = await getOrInitTodaySession(todayStr);
    await offlineDb.sessions.put({
      ...session,
      extra_batches: session.extra_batches + 1,
    });
    router.push("/review");
  };

  const handleCacheOfflineAudio = async () => {
    if (!offlineDb || cachingOffline) return;
    setCachingOffline(true);
    setCacheProgressText("Caching today's es-ES audio...");
    try {
      const [notes, cards, settings, session] = await Promise.all([
        offlineDb.notes.toArray(),
        offlineDb.cards.toArray(),
        getOrInitSettings(),
        getOrInitTodaySession(todayStr),
      ]);
      const wk = getStudyWeekNumber(settings.start_date);
      const q = buildDailyStudyQueue({
        notes,
        cards,
        weekNumber: wk,
        dailyMinutes: settings.daily_minutes,
        newWordsLearnedToday: session.new_count,
        extraBatchesToday: session.extra_batches,
      });
      const allQueue = [...q.dueCards, ...q.newCards].slice(0, 40);
      await prefetchQueueAudioForOffline(
        allQueue.map((c) => c.note),
        (done, total) => setCacheProgressText(`Offline cache: ${done}/${total}`)
      );
      const count = await offlineDb.audio_blobs.count();
      setCachedAudioCount(count);
      setCacheProgressText(`Ready offline (${count} clips cached)`);
      setTimeout(() => setCacheProgressText(null), 2600);
    } finally {
      setCachingOffline(false);
    }
  };

  const stageDisplayTitle = (id: string, fallback: string) => {
    if (id === "warmup") return "Remember Old Words";
    if (id === "new_words") return "Learn New Words";
    return fallback;
  };

  const stageDisplaySub = (id: string, fallback: string) => {
    if (id === "warmup") {
      return dueCount > 0
        ? `${dueCount} due FSRS cards · es-ES audio`
        : "All due cards reviewed today";
    }
    if (id === "new_words") {
      return newWordsRemainingToday > 0
        ? `${newWordsRemainingToday} new words ready today`
        : "Daily new-word batch complete";
    }
    return fallback;
  };

  if (loading) {
    return (
      <div className="bento-card p-8 text-center text-xs text-zinc-400">
        Loading today&apos;s stages...
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      {/* 1. HERO: SINGLE-FOCUS NEXT STAGE CARD */}
      <section className="rounded-[28px] bg-[#181A1F] border border-white/[0.07] p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#FF4F17]">
            {totalNotes === 0
              ? "STEP 1 · LOAD DECK"
              : `UP NEXT · STAGE ${activeStage.stepNumber} OF ${stages.length}`}
          </span>

          <div className="flex items-center gap-1.5">
            <Link
              href="/today"
              className="px-2.5 py-0.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[10px] font-extrabold text-zinc-300 transition"
            >
              {dailyMinutes}m Budget
            </Link>
            {totalNotes > 0 && (
              <button
                type="button"
                onClick={() => void handleCacheOfflineAudio()}
                disabled={cachingOffline}
                title="Cache today's audio for Offline Metro Mode"
                className="w-7 h-7 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-300 transition cursor-pointer"
              >
                {cachedAudioCount > 0 ? (
                  <BookmarkCheck className="w-3.5 h-3.5 text-[#FF4F17]" />
                ) : (
                  <HardDriveDownload className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>

        {totalNotes === 0 ? (
          <div className="space-y-3">
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">
                Load Your Spain Deck
              </h1>
              <p className="text-xs text-zinc-400 mt-1">
                Import your 5,000-word es-ES vocabulary deck to unlock your
                daily stages.
              </p>
            </div>
            <button
              type="button"
              disabled={quickImporting}
              onClick={() => void handleQuickImportSpain5000()}
              className="w-full py-3.5 px-5 rounded-full bg-[#FF4F17] hover:bg-[#FF6230] text-black font-extrabold text-sm flex items-center justify-between shadow-[0_10px_28px_rgba(255,79,23,0.35)] transition cursor-pointer"
            >
              <span>
                {quickImporting
                  ? "Importing Spain Deck..."
                  : "Load Spain Top 5,000 Deck"}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">
                {stageDisplayTitle(activeStage.id, activeStage.title)}
              </h1>
              <p className="text-xs text-zinc-400 mt-1">
                {stageDisplaySub(activeStage.id, activeStage.subtitle)}
              </p>
            </div>

            {/* 7-Stage Minimal Progress Bar */}
            <div className="grid grid-cols-7 gap-1.5">
              {stages.map((st) => {
                const isDone = completedStages.includes(st.id);
                const isCurrent = st.id === activeStage.id && !isDone;
                return (
                  <div
                    key={st.id}
                    className={`h-1.5 rounded-full transition ${
                      isDone
                        ? "bg-emerald-400"
                        : isCurrent
                          ? "bg-[#FF4F17]"
                          : "bg-white/10"
                    }`}
                  />
                );
              })}
            </div>

            <Link
              href={activeStage.id === "wrapup" ? "/today?wrapup=1" : activeStage.href}
              className="w-full py-3.5 px-5 rounded-full bg-[#FF4F17] hover:bg-[#FF6230] text-black font-extrabold text-sm flex items-center justify-between shadow-[0_10px_28px_rgba(255,79,23,0.35)] transition"
            >
              <span className="inline-flex items-center gap-2">
                <Play className="w-4 h-4 fill-current" />
                <span>
                  Start Stage {activeStage.stepNumber} ({activeStage.minutes}m)
                </span>
              </span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            {canLearnTenMore && (
              <button
                type="button"
                onClick={() => void handleLearnTenMore()}
                className="w-full py-2 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.07] text-[11px] font-extrabold text-zinc-200 inline-flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5 text-[#FF4F17]" />
                <span>Learn +10 More Words</span>
              </button>
            )}
          </>
        )}

        {cacheProgressText && (
          <div className="text-[11px] text-center text-zinc-400">
            {cacheProgressText}
          </div>
        )}
      </section>

      {/* 2. ADAPTIVE DAILY STAGES TIMELINE */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
            Today&apos;s Path ({completedVisibleCount} / {stages.length} Done)
          </span>
          <Link
            href="/today"
            className="text-[10px] font-extrabold text-[#FF4F17] hover:underline"
          >
            Quests &amp; Ring »
          </Link>
        </div>

        <div className="rounded-[24px] bg-[#14161B] border border-white/[0.06] divide-y divide-white/[0.05] overflow-hidden">
          {stages.map((stage) => {
            const isDone = completedStages.includes(stage.id);
            const isCurrent = stage.id === activeStage.id && !isDone;
            const href = stage.id === "wrapup" ? "/today?wrapup=1" : stage.href;
            return (
              <Link
                key={stage.id}
                href={href}
                className={`px-4 py-3 flex items-center justify-between gap-3 transition ${
                  isCurrent ? "bg-[#FF4F17]/10" : "hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={(e) => handleToggleStage(stage.id, e)}
                    title={isDone ? "Mark incomplete" : "Mark stage done"}
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-extrabold transition cursor-pointer ${
                      isDone
                        ? "bg-emerald-500/20 text-emerald-400"
                        : isCurrent
                          ? "bg-[#FF4F17] text-black"
                          : "bg-white/[0.06] text-zinc-400 hover:bg-white/15"
                    }`}
                  >
                    {isDone ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      stage.stepNumber
                    )}
                  </button>

                  <div className="min-w-0">
                    <div
                      className={`text-xs font-extrabold truncate ${
                        isDone
                          ? "text-zinc-500 line-through"
                          : isCurrent
                            ? "text-white"
                            : "text-zinc-200"
                      }`}
                    >
                      {stageDisplayTitle(stage.id, stage.title)}
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate">
                      {stageDisplaySub(stage.id, stage.subtitle)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`text-[10px] font-extrabold ${
                      isCurrent ? "text-[#FF4F17]" : "text-zinc-500"
                    }`}
                  >
                    {stage.minutes}m
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                </div>
              </Link>
            );
          })}
        </div>

        {/* Progressive Unlock Note for A0 / Early A1 Learners */}
        {wordsLearned < UNLOCK_SPEAK_WORDS && (
          <div className="rounded-2xl bg-[#14161B]/80 border border-white/[0.05] px-3.5 py-2.5 flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-2 text-zinc-400 min-w-0">
              <Lock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <span className="truncate">
                {unlockAllEarly
                  ? "All 7 stages unlocked early"
                  : wordsLearned < UNLOCK_PRONUNCIATION_READING_WORDS
                    ? `Reading & Pronunciation unlock at ${UNLOCK_PRONUNCIATION_READING_WORDS}w · Speak at ${UNLOCK_SPEAK_WORDS}w`
                    : `Voice Roleplay unlocks at ${UNLOCK_SPEAK_WORDS} words`}
              </span>
            </div>
            <button
              type="button"
              onClick={handleToggleUnlockAll}
              className="shrink-0 text-[10px] font-extrabold text-[#FF4F17] hover:underline"
            >
              {unlockAllEarly ? "Auto-pace" : "Unlock all"}
            </button>
          </div>
        )}
      </section>

      {/* 3. COMPACT SPAIN JOURNEY PILL (Tap to open 12-City Map in More) */}
      <Link
        href="/more"
        className="w-full rounded-2xl bg-[#181A1F] hover:border-[#FF4F17]/40 border border-white/[0.06] px-4 py-3 flex items-center justify-between text-xs transition"
      >
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="w-4 h-4 text-[#FF4F17] shrink-0" />
          <span className="font-extrabold text-white truncate">
            {currentCity.city} → {nextCity.city}
          </span>
          <span className="text-zinc-500 shrink-0">
            · {wordsLearned.toLocaleString()} / 3,500w
          </span>
        </div>
        <span className="text-[11px] font-extrabold text-[#FF4F17] shrink-0 ml-2">
          12 Cities »
        </span>
      </Link>
    </div>
  );
}
