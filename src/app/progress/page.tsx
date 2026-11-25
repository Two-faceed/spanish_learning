"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Award,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Flame,
  GraduationCap,
  Mic,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { getOrInitSettings, offlineDb } from "@/lib/offline/db";
import { getStudyWeekNumber } from "@/lib/fsrs/daily-queue";
import { computeWeakSoundTracker } from "@/lib/pronunciation/spain-sounds";
import {
  CEFR_LEVEL_CHECK_QUESTIONS,
  estimateCefrFromScore,
} from "@/lib/telemetry/cost-meter";
import {
  LessonRecord,
  PronunciationAttemptRecord,
  ReadingTextRecord,
  ReviewLogRecord,
  SessionRecord,
} from "@/types/database";

const CEFR_HISTORY_KEY = "espanol_fast_cefr_history_v1";

interface CefrHistoryEntry {
  date: string;
  cefr: string;
  pct: number;
  correct: number;
  total: number;
}

export default function ProgressDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [wordsKnown, setWordsKnown] = useState(0);
  const [wordsLearning, setWordsLearning] = useState(0);
  const [weekNumber, setWeekNumber] = useState(1);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [reviewLogs, setReviewLogs] = useState<ReviewLogRecord[]>([]);
  const [lessons, setLessons] = useState<LessonRecord[]>([]);
  const [attempts, setAttempts] = useState<PronunciationAttemptRecord[]>([]);
  const [texts, setTexts] = useState<ReadingTextRecord[]>([]);
  const [errorsCount, setErrorsCount] = useState(0);

  // 4-Week CEFR Level-Check Quiz state
  const [quizActive, setQuizActive] = useState(false);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizPicked, setQuizPicked] = useState<number | null>(null);
  const [quizCorrectCount, setQuizCorrectCount] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);
  const [cefrHistory, setCefrHistory] = useState<CefrHistoryEntry[]>([]);

  const loadProgress = useCallback(async () => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(CEFR_HISTORY_KEY);
        if (raw) setCefrHistory(JSON.parse(raw) as CefrHistoryEntry[]);
      } catch {
        // Ignore
      }
    }

    if (!offlineDb) {
      setLoading(false);
      return;
    }

    try {
      const [
        settings,
        allCards,
        allSessions,
        allLogs,
        allLessons,
        allAttempts,
        allTexts,
        errCount,
      ] = await Promise.all([
        getOrInitSettings(),
        offlineDb.cards.toArray(),
        offlineDb.sessions.toArray(),
        offlineDb.review_logs.toArray(),
        offlineDb.lessons.toArray(),
        offlineDb.pron_attempts.toArray(),
        offlineDb.texts.toArray(),
        offlineDb.errors.count(),
      ]);

      setWeekNumber(getStudyWeekNumber(settings.start_date));
      setSessions(allSessions);
      setReviewLogs(allLogs);
      setLessons(allLessons);
      setAttempts(allAttempts);
      setTexts(allTexts);
      setErrorsCount(errCount);

      const byNote = new Map<string, typeof allCards>();
      for (const c of allCards) {
        const arr = byNote.get(c.note_id) ?? [];
        arr.push(c);
        byNote.set(c.note_id, arr);
      }
      let known = 0;
      let learning = 0;
      for (const list of byNote.values()) {
        const hasRep = list.some((c) => c.reps > 0);
        if (!hasRep) continue;
        const maxDays = list.reduce(
          (m, c) => Math.max(m, c.scheduled_days ?? 0),
          0
        );
        if (maxDays >= 7) known++;
        else learning++;
      }
      setWordsKnown(known);
      setWordsLearning(learning);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  const totalLearnedWords = wordsKnown + wordsLearning;
  const targetByNow = Math.min(3500, weekNumber * 290);
  const day90Pct = Math.min(100, Math.round((totalLearnedWords / 3500) * 100));

  const reviewAccuracyPct = useMemo(() => {
    if (reviewLogs.length === 0) return 100;
    const goodOrEasy = reviewLogs.filter((l) => l.rating >= 3).length;
    return Math.round((goodOrEasy / reviewLogs.length) * 100);
  }, [reviewLogs]);

  const totalMinutes = useMemo(
    () => sessions.reduce((s, x) => s + (x.minutes ?? 0), 0),
    [sessions]
  );

  const currentStreak = useMemo(
    () =>
      sessions.reduce((max, s) => Math.max(max, s.streak ?? 0), 0) || 1,
    [sessions]
  );

  const lessonsDone = useMemo(
    () => lessons.filter((l) => Boolean(l.completed_at)).length,
    [lessons]
  );

  const booksRead = useMemo(
    () => texts.filter((t) => t.progress >= 100).length,
    [texts]
  );

  const { stats: soundStats, weakestTwo } = useMemo(
    () => computeWeakSoundTracker(attempts),
    [attempts]
  );

  const bestSound = useMemo(() => {
    const scored = soundStats.filter((s) => s.averageScore !== null);
    if (scored.length === 0) return null;
    return scored.sort(
      (a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0)
    )[0];
  }, [soundStats]);

  const handleAnswerCefr = (idx: number) => {
    if (quizPicked !== null) return;
    setQuizPicked(idx);
    if (idx === CEFR_LEVEL_CHECK_QUESTIONS[quizIdx].correctIdx) {
      setQuizCorrectCount((c) => c + 1);
    }
  };

  const handleNextCefr = () => {
    if (quizIdx + 1 < CEFR_LEVEL_CHECK_QUESTIONS.length) {
      setQuizIdx((i) => i + 1);
      setQuizPicked(null);
    } else {
      const est = estimateCefrFromScore(
        quizCorrectCount,
        CEFR_LEVEL_CHECK_QUESTIONS.length
      );
      const entry: CefrHistoryEntry = {
        date: new Date().toISOString().slice(0, 10),
        cefr: est.cefr,
        pct: est.pct,
        correct: quizCorrectCount,
        total: CEFR_LEVEL_CHECK_QUESTIONS.length,
      };
      const nextHist = [entry, ...cefrHistory].slice(0, 8);
      setCefrHistory(nextHist);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(CEFR_HISTORY_KEY, JSON.stringify(nextHist));
      }
      setQuizFinished(true);
    }
  };

  if (loading) {
    return (
      <div className="bento-card p-8 text-center text-sm text-zinc-400">
        Loading your 12-week progress…
      </div>
    );
  }

  const latestCefr = cefrHistory[0];

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF4F17]">
            PHASE 5 · WEEK {weekNumber} OF 12
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">
            Progress Dashboard
          </h1>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-[#FF4F17]/15 border border-[#FF4F17]/35 flex items-center justify-center text-[#FF4F17]">
          <TrendingUp className="w-5 h-5" />
        </div>
      </div>

      {/* Day 90 Target Trajectory Card (3,500 words) */}
      <section className="bento-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17]">
              Road to B1 · Day 90 Target
            </div>
            <div className="font-display text-2xl font-extrabold text-white mt-0.5">
              {totalLearnedWords.toLocaleString()}{" "}
              <span className="text-sm font-bold text-zinc-400">
                / 3,500 words
              </span>
            </div>
          </div>
          <span className="rounded-full bg-[#FF4F17]/15 border border-[#FF4F17]/35 px-2.5 py-1 text-xs font-extrabold text-[#FF4F17]">
            {day90Pct}%
          </span>
        </div>

        <div className="w-full h-2.5 rounded-full bg-[#101216] overflow-hidden border border-white/[0.06]">
          <div
            className="h-full bg-gradient-to-r from-[#FF4F17] to-emerald-400 rounded-full transition-all"
            style={{ width: `${Math.max(2, day90Pct)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-zinc-400">
          <span>
            {wordsKnown} known (7d+) · {wordsLearning} learning
          </span>
          <span>W{weekNumber} pace target: {targetByNow}w</span>
        </div>
      </section>

      {/* 4 Core KPI Tiles */}
      <section className="grid grid-cols-2 gap-2.5">
        <div className="bento-card p-3.5 space-y-1">
          <div className="text-[10px] font-bold uppercase text-zinc-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Review Accuracy
          </div>
          <div className="font-display text-2xl font-extrabold text-white">
            {reviewAccuracyPct}%
          </div>
          <div className="text-[10px] text-zinc-500">
            {reviewLogs.length} total reviews
          </div>
        </div>

        <div className="bento-card p-3.5 space-y-1">
          <div className="text-[10px] font-bold uppercase text-zinc-400 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-[#FF4F17]" />
            Streak &amp; Time
          </div>
          <div className="font-display text-2xl font-extrabold text-white">
            {currentStreak}d
          </div>
          <div className="text-[10px] text-zinc-500">
            {totalMinutes} min logged
          </div>
        </div>

        <div className="bento-card p-3.5 space-y-1">
          <div className="text-[10px] font-bold uppercase text-zinc-400 flex items-center gap-1">
            <GraduationCap className="w-3.5 h-3.5 text-sky-400" />
            Grammar Units
          </div>
          <div className="font-display text-2xl font-extrabold text-white">
            {lessonsDone}
            <span className="text-xs text-zinc-400 font-bold">/84</span>
          </div>
          <div className="text-[10px] text-zinc-500">
            {errorsCount} errors in notebook
          </div>
        </div>

        <div className="bento-card p-3.5 space-y-1">
          <div className="text-[10px] font-bold uppercase text-zinc-400 flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            Reading &amp; Speech
          </div>
          <div className="font-display text-2xl font-extrabold text-white">
            {booksRead}
            <span className="text-xs text-zinc-400 font-bold"> texts</span>
          </div>
          <div className="text-[10px] text-zinc-500">
            {attempts.length} pron attempts
          </div>
        </div>
      </section>

      {/* Weekly Postcard Recap */}
      <section className="rounded-[24px] bg-gradient-to-br from-[#FF4F17]/15 to-[#181A1F] border border-[#FF4F17]/35 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17] flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" />
            Weekly Postcard Recap
          </span>
          <span className="text-[10px] font-bold text-zinc-300">
            Week {weekNumber}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-[#111318]/80 p-2.5 border border-white/[0.06]">
            <div className="text-[10px] text-zinc-400">Best Madrid Sound</div>
            <div className="font-extrabold text-emerald-300 mt-0.5">
              {bestSound
                ? `${bestSound.meta.symbol} (${bestSound.averageScore}%)`
                : "Record in /pronunciation"}
            </div>
          </div>
          <div className="rounded-xl bg-[#111318]/80 p-2.5 border border-white/[0.06]">
            <div className="text-[10px] text-zinc-400">Priority Sound</div>
            <div className="font-extrabold text-[#FF4F17] mt-0.5">
              {weakestTwo[0].toUpperCase()}
            </div>
          </div>
        </div>
      </section>

      {/* 7 Spain Sounds Pronunciation Trend */}
      <section className="bento-card p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
            <Mic className="w-3.5 h-3.5 text-[#FF4F17]" />
            Pronunciation Per Spain Sound
          </span>
          <Link
            href="/pronunciation"
            className="text-[11px] font-bold text-[#FF4F17] hover:underline"
          >
            Drill »
          </Link>
        </div>

        <div className="space-y-2">
          {soundStats.map((s) => (
            <div key={s.group} className="flex items-center gap-2 text-xs">
              <span className="font-mono font-extrabold text-[#FF4F17] w-14 shrink-0">
                {s.meta.symbol}
              </span>
              <div className="flex-1 h-2 rounded-full bg-[#101216] overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    s.averageScore === null
                      ? "bg-white/10"
                      : s.averageScore >= 85
                        ? "bg-emerald-400"
                        : s.averageScore >= 65
                          ? "bg-amber-400"
                          : "bg-rose-400"
                  }`}
                  style={{ width: `${s.averageScore ?? 0}%` }}
                />
              </div>
              <span className="w-9 text-right font-extrabold text-zinc-200">
                {s.averageScore !== null ? `${s.averageScore}%` : "—"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 4-Week CEFR Level-Check Test */}
      <section className="bento-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17] flex items-center gap-1">
              <Award className="w-3.5 h-3.5" />
              4-Week CEFR Level-Check
            </div>
            <h2 className="font-display text-base font-extrabold text-white mt-0.5">
              {latestCefr
                ? `Current Estimate: ${latestCefr.cefr} (${latestCefr.pct}%)`
                : "Estimate Your Spain Spanish Level"}
            </h2>
          </div>
          {!quizActive && (
            <button
              type="button"
              onClick={() => {
                setQuizActive(true);
                setQuizIdx(0);
                setQuizPicked(null);
                setQuizCorrectCount(0);
                setQuizFinished(false);
              }}
              className="rounded-full bg-[#FF4F17] hover:bg-[#FF6230] text-black px-3.5 py-1.5 text-xs font-extrabold transition"
            >
              {latestCefr ? "Retake" : "Start Test"}
            </button>
          )}
        </div>

        {quizActive && !quizFinished && (
          <div className="rounded-2xl bg-[#111318] border border-white/[0.08] p-3.5 space-y-3">
            <div className="flex items-center justify-between text-[10px] font-extrabold text-zinc-400">
              <span>
                Question {quizIdx + 1} / {CEFR_LEVEL_CHECK_QUESTIONS.length}
              </span>
              <span className="text-[#FF4F17]">
                Target: {CEFR_LEVEL_CHECK_QUESTIONS[quizIdx].level}
              </span>
            </div>

            <p className="text-sm font-bold text-white leading-snug">
              {CEFR_LEVEL_CHECK_QUESTIONS[quizIdx].prompt}
            </p>

            <div className="grid grid-cols-2 gap-1.5">
              {CEFR_LEVEL_CHECK_QUESTIONS[quizIdx].options.map((opt, i) => {
                const isPicked = quizPicked === i;
                const isCorrect =
                  i === CEFR_LEVEL_CHECK_QUESTIONS[quizIdx].correctIdx;
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={quizPicked !== null}
                    onClick={() => handleAnswerCefr(i)}
                    className={`rounded-xl py-2 px-2.5 text-xs font-extrabold border transition ${
                      quizPicked === null
                        ? "bg-[#1C1F26] border-white/[0.08] text-zinc-200 hover:border-[#FF4F17]"
                        : isCorrect
                          ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                          : isPicked
                            ? "bg-rose-500/20 border-rose-500/50 text-rose-300"
                            : "bg-[#16181E] border-white/[0.04] text-zinc-500"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>

            {quizPicked !== null && (
              <div className="space-y-2 pt-1">
                <p className="text-[11px] text-zinc-300">
                  {CEFR_LEVEL_CHECK_QUESTIONS[quizIdx].rule}
                </p>
                <button
                  type="button"
                  onClick={handleNextCefr}
                  className="w-full rounded-full bg-[#FF4F17] text-black font-extrabold text-xs py-2"
                >
                  {quizIdx + 1 < CEFR_LEVEL_CHECK_QUESTIONS.length
                    ? "Next Question »"
                    : "See My CEFR Estimate »"}
                </button>
              </div>
            )}
          </div>
        )}

        {quizFinished && (
          <div className="rounded-2xl bg-emerald-500/15 border border-emerald-500/35 p-3.5 text-center space-y-2">
            <div className="text-xs font-extrabold uppercase text-emerald-300">
              Level Check Complete
            </div>
            <div className="font-display text-3xl font-extrabold text-white">
              {
                estimateCefrFromScore(
                  quizCorrectCount,
                  CEFR_LEVEL_CHECK_QUESTIONS.length
                ).cefr
              }
            </div>
            <div className="text-xs text-zinc-300">
              {quizCorrectCount} of {CEFR_LEVEL_CHECK_QUESTIONS.length} correct (
              {
                estimateCefrFromScore(
                  quizCorrectCount,
                  CEFR_LEVEL_CHECK_QUESTIONS.length
                ).pct
              }
              %)
            </div>
            <button
              type="button"
              onClick={() => setQuizActive(false)}
              className="rounded-full bg-[#111318] px-4 py-1.5 text-xs font-bold text-white"
            >
              Done
            </button>
          </div>
        )}

        {/* Quick Link to Monthly Cost Meter in Settings */}
        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-[#FF4F17]" />
            API Spend &amp; Budget Guardrails
          </span>
          <Link
            href="/settings"
            className="font-extrabold text-[#FF4F17] hover:underline"
          >
            View Cost Meter »
          </Link>
        </div>
      </section>
    </div>
  );
}
