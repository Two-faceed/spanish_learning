"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Volume2 } from "lucide-react";
import { offlineDb } from "@/lib/offline/db";
import {
  markLessonCompletedOfflineFirst,
  promoteLessonNewWordsToQueue,
  recordTutorMistakeToErrorNotebookAndQueue,
} from "@/lib/offline/sync-manager";
import {
  getBuiltInFallbackLesson,
  getCurriculumSpecForDay,
  TWELVE_WEEK_CURRICULUM,
} from "@/lib/tutor/curriculum";
import { playSpanishAudio } from "@/lib/audio/player";
import { toMadridEnglishPhonetics } from "@/lib/audio/phonetics";
import { FormattedTutorText } from "@/components/FormattedTutorText";
import {
  ERRORS_UPDATED_EVENT,
  openMadridChatWidget,
} from "@/components/MadridChatWidget";
import {
  ErrorRecord,
  LessonRecord,
  TutorExercise,
} from "@/types/database";
import { AiGradePayloadOutput } from "@/lib/ai/json-parser";

type TutorTab = "lesson" | "errors";

const SPANISH_CHARS = ["á", "é", "í", "ó", "ú", "ü", "ñ", "¿", "¡"];

export default function TutorPage() {
  const [activeTab, setActiveTab] = useState<TutorTab>("lesson");

  // Curriculum & Lesson state
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [spanishOnlyMode, setSpanishOnlyMode] = useState<boolean>(false);
  const [lesson, setLesson] = useState<LessonRecord | null>(null);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(
    new Set()
  );
  const [loadingLesson, setLoadingLesson] = useState<boolean>(true);
  const [lessonSourceBadge, setLessonSourceBadge] = useState<string>("");
  const [promotedWordCount, setPromotedWordCount] = useState<number>(0);

  // Exercise runner state
  const [exerciseIdx, setExerciseIdx] = useState<number>(0);
  const [userAnswer, setUserAnswer] = useState<string>("");
  const [grading, setGrading] = useState<boolean>(false);
  const [gradeResult, setGradeResult] = useState<AiGradePayloadOutput | null>(
    null
  );
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [lessonFinished, setLessonFinished] = useState<boolean>(false);
  const [savedErrorBanner, setSavedErrorBanner] = useState<boolean>(false);

  // Context data for AI
  const [knownLemmas, setKnownLemmas] = useState<string[]>([]);
  const [errors, setErrors] = useState<ErrorRecord[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Error drill state
  const [drillActive, setDrillActive] = useState<boolean>(false);
  const [drillIdx, setDrillIdx] = useState<number>(0);
  const [drillInput, setDrillInput] = useState<string>("");
  const [drillChecked, setDrillChecked] = useState<boolean>(false);
  const [drillCorrect, setDrillCorrect] = useState<boolean>(false);

  const currentSpec = useMemo(
    () => getCurriculumSpecForDay(selectedWeek, selectedDay),
    [selectedWeek, selectedDay]
  );

  const loadOfflineContext = useCallback(async () => {
    if (!offlineDb) {
      return {
        allErrors: [] as ErrorRecord[],
        allLessons: [] as LessonRecord[],
        completedSet: new Set<string>(),
      };
    }

    const [allErrors, allLessons, learnedCards] = await Promise.all([
      offlineDb.errors.orderBy("created_at").reverse().toArray(),
      offlineDb.lessons.toArray(),
      offlineDb.cards.where("reps").above(0).limit(80).toArray(),
    ]);

    setErrors(allErrors);

    const completedSet = new Set<string>();
    for (const l of allLessons) {
      if (l.completed_at) {
        completedSet.add(l.id);
      }
    }
    setCompletedLessonIds(completedSet);

    if (learnedCards.length > 0) {
      const noteIds = Array.from(new Set(learnedCards.map((c) => c.note_id)));
      const notes = await offlineDb.notes.bulkGet(noteIds.slice(0, 60));
      const lemmas = notes
        .filter((n): n is NonNullable<typeof n> => Boolean(n))
        .map((n) => n.lemma);
      setKnownLemmas(lemmas);
    }

    return { allErrors, allLessons, completedSet };
  }, []);

  const fetchOrLoadLesson = useCallback(
    async (
      week: number,
      day: number,
      forceRegenerate = false,
      esOnly = false
    ) => {
      setLoadingLesson(true);
      setExerciseIdx(0);
      setUserAnswer("");
      setGradeResult(null);
      setCorrectCount(0);
      setLessonFinished(false);
      setSavedErrorBanner(false);

      const lessonId = `w${week}-d${day}`;
      try {
        if (!forceRegenerate && !esOnly) {
          if (offlineDb) {
            const localCached = await offlineDb.lessons.get(lessonId);
            if (localCached && localCached.exercises?.length > 0) {
              setLesson(localCached);
              setLessonSourceBadge("Madrid Curriculum");
              setLoadingLesson(false);
              return;
            }
          }

          // Instant zero-wait load from curated curriculum (< 5ms)
          const instantLesson = getBuiltInFallbackLesson(week, day);
          if (offlineDb) {
            await offlineDb.lessons.put(instantLesson);
          }
          setLesson(instantLesson);
          setLessonSourceBadge("Madrid Curriculum");
          setLoadingLesson(false);
          const promoted = await promoteLessonNewWordsToQueue(
            instantLesson.new_words ?? []
          );
          setPromotedWordCount(promoted);
          return;
        }

        const recentErrors = errors.slice(0, 20).map((e) => ({
          category: e.category,
          wrong: e.wrong,
          correct: e.correct,
        }));

        const res = await fetch("/api/tutor/lesson", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            week,
            day,
            knownLemmasSample: knownLemmas.slice(0, 50),
            recentErrors,
            spanishOnlyMode: esOnly,
            forceRegenerate,
          }),
        });

        const data = (await res.json()) as {
          lesson?: LessonRecord;
          cached?: boolean;
          fallback?: boolean;
        };

        if (data.lesson) {
          const existing = offlineDb
            ? await offlineDb.lessons.get(data.lesson.id)
            : undefined;
          const merged: LessonRecord = {
            ...data.lesson,
            completed_at: existing?.completed_at ?? null,
            score: existing?.score ?? null,
          };
          if (offlineDb && !data.fallback) {
            await offlineDb.lessons.put(merged);
          }
          setLesson(merged);
          setLessonSourceBadge(
            data.fallback
              ? "Built-in Madrid Lesson"
              : data.cached
                ? "Cached AI Lesson"
                : "Fresh Gemini Flash Lesson"
          );

          // Promote up to 5 new lesson words into FSRS queue
          const promoted = await promoteLessonNewWordsToQueue(
            merged.new_words ?? []
          );
          setPromotedWordCount(promoted);
        }
      } catch (err) {
        console.error("Failed to load lesson:", err);
      } finally {
        setLoadingLesson(false);
      }
    },
    [errors, knownLemmas]
  );

  // Initial load: clear any stale v1/v2 cached lessons once, then find first uncompleted lesson day
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (
        typeof window !== "undefined" &&
        offlineDb &&
        window.localStorage.getItem("espanol_fast_lessons_v4") !== "1"
      ) {
        await offlineDb.lessons.clear();
        window.localStorage.setItem("espanol_fast_lessons_v4", "1");
      }

      const { completedSet } = await loadOfflineContext();
      if (!mounted) return;

      let initWeek = 1;
      let initDay = 1;
      outer: for (let w = 1; w <= 12; w++) {
        for (let d = 1; d <= 7; d++) {
          if (!completedSet.has(`w${w}-d${d}`)) {
            initWeek = w;
            initDay = d;
            break outer;
          }
        }
      }
      setSelectedWeek(initWeek);
      setSelectedDay(initDay);
      await fetchOrLoadLesson(initWeek, initDay, false, false);
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentExercise: TutorExercise | null = useMemo(() => {
    if (!lesson || !lesson.exercises || lesson.exercises.length === 0) {
      return null;
    }
    return lesson.exercises[exerciseIdx] ?? null;
  }, [lesson, exerciseIdx]);

  const handleSelectWeekDay = async (week: number, day: number) => {
    setSelectedWeek(week);
    setSelectedDay(day);
    await fetchOrLoadLesson(week, day, false, spanishOnlyMode);
  };

  const handleGradeExercise = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentExercise || !userAnswer.trim() || grading || gradeResult) return;

    setGrading(true);
    setSavedErrorBanner(false);
    try {
      const res = await fetch("/api/tutor/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exercise: currentExercise,
          userAnswer: userAnswer.trim(),
          topic: currentSpec.dayTitle,
          cefr: currentSpec.cefr,
          spanishOnlyMode,
        }),
      });
      const data = (await res.json()) as AiGradePayloadOutput;
      setGradeResult(data);

      if (data.isCorrect) {
        setCorrectCount((prev) => prev + 1);
      } else if (data.error) {
        await recordTutorMistakeToErrorNotebookAndQueue({
          source: "tutor",
          category: data.error.category,
          wrong: data.error.wrong,
          correct: data.error.correct,
          explanation: data.error.explanation,
        });
        setSavedErrorBanner(true);
        if (offlineDb) {
          const updatedErrors = await offlineDb.errors
            .orderBy("created_at")
            .reverse()
            .toArray();
          setErrors(updatedErrors);
        }
      }
    } catch (err) {
      console.error("Failed to grade exercise:", err);
    } finally {
      setGrading(false);
    }
  };

  const handleNextExercise = async () => {
    if (!lesson) return;
    const nextIdx = exerciseIdx + 1;
    if (nextIdx < lesson.exercises.length) {
      setExerciseIdx(nextIdx);
      setUserAnswer("");
      setGradeResult(null);
      setSavedErrorBanner(false);
    } else {
      const total = lesson.exercises.length || 1;
      const pct = Math.round((correctCount / total) * 100);
      await markLessonCompletedOfflineFirst(lesson, pct);
      setLessonFinished(true);
      setCompletedLessonIds((prev) => new Set([...prev, lesson.id]));
    }
  };

  const handleAppendChar = (ch: string) => {
    setUserAnswer((prev) => prev + ch);
  };

  const handleWordChipClick = (token: string) => {
    if (gradeResult) return;
    setUserAnswer((prev) => (prev ? `${prev} ${token}` : token));
  };

  useEffect(() => {
    const handleErrorsUpdated = () => {
      void loadOfflineContext();
    };
    window.addEventListener(ERRORS_UPDATED_EVENT, handleErrorsUpdated);
    return () =>
      window.removeEventListener(ERRORS_UPDATED_EVENT, handleErrorsUpdated);
  }, [loadOfflineContext]);

  const filteredErrors = useMemo(() => {
    if (selectedCategory === "all") return errors;
    return errors.filter(
      (e) => e.category.toLowerCase() === selectedCategory.toLowerCase()
    );
  }, [errors, selectedCategory]);

  const errorCategories = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of errors) {
      const cat = e.category.toLowerCase();
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [errors]);

  return (
    <div className="space-y-3.5 pb-4">
      {/* Top Hero Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF4F17]">
            WEEK {currentSpec.week} · {currentSpec.city.toUpperCase()} ({currentSpec.cefr})
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">
            Madrid Lessons
          </h1>
        </div>
        <button
          type="button"
          onClick={() => openMadridChatWidget()}
          className="rounded-full bg-[#FF4F17]/15 hover:bg-[#FF4F17]/25 border border-[#FF4F17]/35 px-3 py-1.5 text-[11px] font-extrabold text-[#FF4F17] flex items-center gap-1.5 transition"
        >
          <span>💬 Ask AI</span>
        </button>
      </div>

      {/* Top Segmented 2-Tab Switcher (Daily Lesson + Error Notebook) */}
      <div className="grid grid-cols-2 gap-1.5 rounded-[22px] bg-[#181A1F] p-1.5 border border-white/[0.06]">
        <button
          type="button"
          onClick={() => setActiveTab("lesson")}
          className={`rounded-[16px] py-2 text-xs font-bold transition-all ${
            activeTab === "lesson"
              ? "bg-[#FF4F17] text-black font-extrabold shadow-[0_4px_14px_rgba(255,79,23,0.35)]"
              : "text-[#8E93A4] hover:text-white"
          }`}
        >
          Daily Lesson
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("errors")}
          className={`flex items-center justify-center gap-1.5 rounded-[16px] py-2 text-xs font-bold transition-all ${
            activeTab === "errors"
              ? "bg-[#FF4F17] text-black font-extrabold shadow-[0_4px_14px_rgba(255,79,23,0.35)]"
              : "text-[#8E93A4] hover:text-white"
          }`}
        >
          <span>Error Notebook</span>
          {errors.length > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                activeTab === "errors"
                  ? "bg-black/25 text-black"
                  : "bg-[#FF4F17]/20 text-[#FF4F17]"
              }`}
            >
              {errors.length}
            </span>
          )}
        </button>
      </div>

      {/* ===================== TAB 1: DAILY LESSON & EXERCISES ===================== */}
      {activeTab === "lesson" && (
        <div className="space-y-3.5">
          {/* 12-Week & 7-Day Selector Card */}
          <div className="bento-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#FF4F17]">
                  12-Week Spain Curriculum
                </span>
                <h2 className="text-sm font-bold text-white mt-0.5">
                  W{currentSpec.week}: {currentSpec.city} ({currentSpec.cefr})
                </h2>
              </div>

              <select
                aria-label="Select Curriculum Week"
                value={selectedWeek}
                onChange={(e) =>
                  handleSelectWeekDay(Number(e.target.value), 1)
                }
                className="rounded-xl bg-[#22252D] border border-white/10 px-2.5 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-[#FF4F17]"
              >
                {TWELVE_WEEK_CURRICULUM.map((wk) => (
                  <option key={wk.week} value={wk.week}>
                    W{wk.week} • {wk.city} ({wk.cefr})
                  </option>
                ))}
              </select>
            </div>

            {/* 7 Days Pills (Day 7 = Boss Test) */}
            <div className="grid grid-cols-7 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                const id = `w${selectedWeek}-d${d}`;
                const isDone = completedLessonIds.has(id);
                const isSelected = selectedDay === d;
                const isBoss = d === 7;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleSelectWeekDay(selectedWeek, d)}
                    className={`flex flex-col items-center justify-center rounded-xl py-2 text-[11px] font-extrabold transition-all border ${
                      isSelected
                        ? "bg-[#FF4F17] text-black border-[#FF4F17] shadow-[0_4px_12px_rgba(255,79,23,0.3)]"
                        : isDone
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                          : "bg-[#22252D] text-[#8E93A4] border-white/[0.05] hover:text-white"
                    }`}
                  >
                    <span>{isBoss ? "★ D7" : `D${d}`}</span>
                    <span className="text-[9px] opacity-80">
                      {isDone ? "✓" : isBoss ? "Test" : "Lesson"}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Topic Header + Spanish-Only Mode Toggle */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
              <p className="text-xs font-semibold text-[#C8CCD8] leading-snug">
                {currentSpec.dayTitle}
              </p>
              <button
                type="button"
                onClick={() => {
                  const next = !spanishOnlyMode;
                  setSpanishOnlyMode(next);
                  void fetchOrLoadLesson(selectedWeek, selectedDay, true, next);
                }}
                title="Week 7+ Spanish-only explanation mode"
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold border transition-all ${
                  spanishOnlyMode
                    ? "bg-[#FF4F17]/20 border-[#FF4F17] text-[#FF4F17]"
                    : "bg-[#22252D] border-white/10 text-[#8E93A4]"
                }`}
              >
                {spanishOnlyMode ? "Solo Español: ON" : "EN Explain"}
              </button>
            </div>
          </div>

          {loadingLesson ? (
            <div className="bento-card p-6 text-center space-y-3">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#FF4F17] border-t-transparent" />
              <p className="text-xs font-semibold text-[#8E93A4]">
                Preparing Madrid lesson & 8–10 exercises...
              </p>
            </div>
          ) : lesson ? (
            <>
              {/* Grammar Explanation (< 120 words) + Madrid Examples */}
              <div className="bento-card p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-[#22252D] px-2.5 py-0.5 text-[10px] font-bold text-[#8E93A4]">
                    {lessonSourceBadge || "Madrid Grammar"}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void fetchOrLoadLesson(
                        selectedWeek,
                        selectedDay,
                        true,
                        spanishOnlyMode
                      )
                    }
                    className="text-[11px] font-bold text-[#FF4F17] hover:underline"
                  >
                    ↻ Fresh AI Lesson
                  </button>
                </div>

                <FormattedTutorText
                  text={lesson.explanation}
                  className="text-xs text-[#E4E7F0]"
                />

                {/* Examples with es-ES Audio */}
                {lesson.examples?.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#8E93A4]">
                      Madrid Examples
                    </div>
                    {lesson.examples.map((ex, i) => (
                      <div
                        key={i}
                        className="flex items-start justify-between gap-2 rounded-2xl bg-[#22252D]/90 p-3 border border-white/[0.04] hover:border-[#FF4F17]/35 transition cursor-pointer"
                      >
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-white">
                            {ex.es}
                          </p>
                          <p
                            data-phonetic-guide="true"
                            className="font-mono text-[11px] text-[#FF4F17]/85"
                          >
                            [{toMadridEnglishPhonetics(ex.es)}]
                          </p>
                          <p className="text-[11px] text-[#8E93A4]">{ex.en}</p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void playSpanishAudio({
                              text: ex.es,
                              audioSource: "es-ES TTS",
                            });
                          }}
                          title="Listen"
                          aria-label="Listen"
                          className="shrink-0 w-7 h-7 rounded-xl bg-[#FF4F17]/15 border border-[#FF4F17]/30 flex items-center justify-center text-[#FF4F17] hover:bg-[#FF4F17]/25 transition"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* At most 5 New Words introduced & auto-added to FSRS queue */}
                {lesson.new_words?.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#8E93A4]">
                        Lesson Words (≤ 5 • Auto-queued in FSRS)
                      </span>
                      {promotedWordCount > 0 && (
                        <span className="text-[10px] font-bold text-emerald-400">
                          +{promotedWordCount} added to queue
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {lesson.new_words.slice(0, 5).map((nw, i) => (
                        <div
                          key={i}
                          data-headword-value={nw.word}
                          data-headword-context={nw.example_es || nw.word}
                          className="flex items-center justify-between rounded-xl bg-[#131519] px-3 py-2 border border-white/[0.04] hover:border-[#FF4F17]/35 transition cursor-pointer"
                        >
                          <div>
                            <div>
                              <span className="text-xs font-extrabold text-white underline decoration-white/20 underline-offset-2">
                                {nw.word}
                              </span>
                              <span className="ml-2 text-xs text-[#8E93A4]">
                                — {nw.meaning}
                              </span>
                            </div>
                            <div
                              data-phonetic-guide="true"
                              className="font-mono text-[10px] text-[#FF4F17]/85 mt-0.5"
                            >
                              [{toMadridEnglishPhonetics(nw.word)}]
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void playSpanishAudio({
                                text: nw.word,
                                audioSource: "es-ES TTS",
                              });
                            }}
                            className="text-xs font-bold text-[#FF4F17]"
                          >
                            🔊
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Interactive 8-12 Exercise Runner */}
              {lessonFinished ? (
                <div className="bento-card-orange p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-black/25 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white">
                      Lesson Completed • +20 XP
                    </span>
                    <span className="text-xl font-black text-white">
                      {Math.round(
                        (correctCount / (lesson.exercises.length || 1)) * 100
                      )}
                      %
                    </span>
                  </div>
                  <h3 className="text-lg font-extrabold text-white">
                    ¡Enhorabuena! Day {selectedDay} of Week {selectedWeek} Done
                  </h3>
                  <p className="text-xs text-white/90 leading-relaxed">
                    You got {correctCount} of {lesson.exercises.length}{" "}
                    exercises right on the first try. Any mistakes were
                    automatically saved to your Error Notebook and scheduled in
                    your FSRS review queue.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const nextD = selectedDay < 7 ? selectedDay + 1 : 1;
                      const nextW =
                        selectedDay < 7
                          ? selectedWeek
                          : Math.min(12, selectedWeek + 1);
                      void handleSelectWeekDay(nextW, nextD);
                    }}
                    className="w-full rounded-full bg-[#0D0E11] py-3 text-xs font-extrabold text-white shadow-lg"
                  >
                    Continue to Next Day »
                  </button>
                </div>
              ) : (
                currentExercise && (
                  <div className="bento-card p-4 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-[#FF4F17]/15 border border-[#FF4F17]/30 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17]">
                        Exercise {exerciseIdx + 1} of {lesson.exercises.length}{" "}
                        • {currentExercise.type.replace("_", " ")}
                      </span>
                      <span className="text-[11px] font-bold text-[#8E93A4]">
                        Score: {correctCount}/{exerciseIdx}
                      </span>
                    </div>

                    <p className="text-sm font-bold text-white leading-snug">
                      {currentExercise.prompt}
                    </p>

                    {/* Optional word chips for build_sentence */}
                    {currentExercise.options &&
                      currentExercise.options.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {currentExercise.options.map((tok, idx) => (
                            <button
                              key={`${tok}-${idx}`}
                              type="button"
                              onClick={() => handleWordChipClick(tok)}
                              className="rounded-xl bg-[#22252D] border border-white/10 px-3 py-1.5 text-xs font-bold text-white hover:border-[#FF4F17]"
                            >
                              + {tok}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setUserAnswer("")}
                            className="rounded-xl bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-[#8E93A4]"
                          >
                            Clear
                          </button>
                        </div>
                      )}

                    <form
                      onSubmit={handleGradeExercise}
                      className="space-y-2.5"
                    >
                      <input
                        type="text"
                        value={userAnswer}
                        disabled={Boolean(gradeResult)}
                        onChange={(e) => setUserAnswer(e.target.value)}
                        placeholder="Write your Spain Spanish answer..."
                        className="w-full rounded-2xl bg-[#131519] border border-white/10 px-3.5 py-3 text-sm font-semibold text-white placeholder-[#8E93A4]/60 focus:outline-none focus:border-[#FF4F17]"
                      />

                      {/* Spanish Accent Character Bar */}
                      <div className="flex items-center justify-between gap-1">
                        {SPANISH_CHARS.map((ch) => (
                          <button
                            key={ch}
                            type="button"
                            disabled={Boolean(gradeResult)}
                            onClick={() => handleAppendChar(ch)}
                            className="flex-1 rounded-lg bg-[#22252D] py-1.5 text-xs font-bold text-white hover:bg-[#FF4F17]/20 border border-white/[0.05]"
                          >
                            {ch}
                          </button>
                        ))}
                      </div>

                      {!gradeResult ? (
                        <button
                          type="submit"
                          disabled={grading || !userAnswer.trim()}
                          className="cta-orange-pill w-full py-2.5 px-4 disabled:opacity-50"
                        >
                          <span className="text-xs font-extrabold">
                            {grading
                              ? "Madrid Tutor Grading..."
                              : "Check Answer"}
                          </span>
                          <span className="cta-orange-pill-icon h-7 w-7 text-xs">
                            »
                          </span>
                        </button>
                      ) : (
                        <div className="space-y-3 pt-1">
                          <div
                            className={`rounded-2xl p-3.5 border space-y-2 ${
                              gradeResult.isCorrect
                                ? "bg-emerald-500/10 border-emerald-500/30"
                                : "bg-rose-500/10 border-rose-500/30"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-xs font-extrabold uppercase tracking-wider ${
                                  gradeResult.isCorrect
                                    ? "text-emerald-400"
                                    : "text-rose-400"
                                }`}
                              >
                                {gradeResult.isCorrect
                                  ? "✓ ¡Correcto!"
                                  : `✗ Correction (${
                                      gradeResult.error?.category || "grammar"
                                    })`}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  void playSpanishAudio({
                                    text:
                                      gradeResult.correctedSentence ||
                                      currentExercise.answer,
                                    audioSource: "es-ES TTS",
                                  })
                                }
                                className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold text-white"
                              >
                                🔊 Hear Correct
                              </button>
                            </div>

                            <p className="text-sm font-extrabold text-white">
                              {gradeResult.correctedSentence ||
                                currentExercise.answer}
                            </p>
                            <p className="font-mono text-[11px] text-[#FF4F17]/85">
                              [
                              {toMadridEnglishPhonetics(
                                gradeResult.correctedSentence ||
                                  currentExercise.answer
                              )}
                              ]
                            </p>

                            <p className="text-xs text-[#C8CCD8]">
                              {gradeResult.ruleOneLine ||
                                gradeResult.error?.explanation}
                            </p>

                            {savedErrorBanner && (
                              <div className="rounded-xl bg-[#FF4F17]/15 border border-[#FF4F17]/30 px-2.5 py-1.5 text-[11px] font-bold text-[#FF4F17]">
                                📌 Added to Error Notebook + FSRS Review Queue
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => void handleNextExercise()}
                            className="cta-orange-pill w-full py-2.5 px-4"
                          >
                            <span className="text-xs font-extrabold">
                              {exerciseIdx + 1 < lesson.exercises.length
                                ? "Next Exercise"
                                : "Finish Lesson (+20 XP)"}
                            </span>
                            <span className="cta-orange-pill-icon h-7 w-7 text-xs">
                              »
                            </span>
                          </button>
                        </div>
                      )}
                    </form>
                  </div>
                )
              )}
            </>
          ) : null}
        </div>
      )}

      {/* ===================== TAB 2: ERROR NOTEBOOK & ERROR DRILL ===================== */}
      {activeTab === "errors" && (
        <div className="space-y-3.5">
          <div className="bento-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#FF4F17]">
                  Personal Error Notebook
                </span>
                <h2 className="text-sm font-extrabold text-white mt-0.5">
                  {errors.length} Logged Mistake{errors.length === 1 ? "" : "s"}
                </h2>
              </div>
              {errors.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setDrillActive((prev) => !prev);
                    setDrillIdx(0);
                    setDrillInput("");
                    setDrillChecked(false);
                  }}
                  className="rounded-full bg-[#FF4F17] px-3.5 py-1.5 text-xs font-extrabold text-black shadow-[0_4px_12px_rgba(255,79,23,0.35)]"
                >
                  {drillActive ? "Close Drill" : "⚡ Drill Errors"}
                </button>
              )}
            </div>

            <p className="text-xs text-[#8E93A4] leading-relaxed">
              Every mistake from AI lessons and tutor chat is stored here and
              automatically converted into a card in your daily FSRS review
              queue.
            </p>

            {/* Category Filter Pills */}
            {errors.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedCategory("all")}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                    selectedCategory === "all"
                      ? "bg-[#FF4F17] text-black"
                      : "bg-[#22252D] text-[#8E93A4]"
                  }`}
                >
                  All ({errors.length})
                </button>
                {Object.entries(errorCategories).map(([cat, count]) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                      selectedCategory === cat
                        ? "bg-[#FF4F17] text-black"
                        : "bg-[#22252D] text-[#8E93A4]"
                    }`}
                  >
                    {cat} ({count})
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Interactive Error Drill Mode */}
          {drillActive && filteredErrors.length > 0 && (
            <div className="bento-card p-4 border-[#FF4F17]/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17]">
                  Error Drill {drillIdx + 1} / {filteredErrors.length} •{" "}
                  {filteredErrors[drillIdx].category}
                </span>
                <span className="text-[11px] text-[#8E93A4]">
                  Fix your past mistake
                </span>
              </div>

              <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 space-y-1">
                <div className="text-[10px] uppercase font-bold text-rose-400">
                  You previously wrote:
                </div>
                <div className="text-sm font-bold line-through text-rose-200">
                  {filteredErrors[drillIdx].wrong}
                </div>
                <div className="text-xs text-[#C8CCD8]">
                  Rule: {filteredErrors[drillIdx].explanation}
                </div>
              </div>

              <input
                type="text"
                value={drillInput}
                disabled={drillChecked}
                onChange={(e) => setDrillInput(e.target.value)}
                placeholder="Type the corrected Spain Spanish..."
                className="w-full rounded-xl bg-[#131519] border border-white/10 px-3 py-2.5 text-xs font-bold text-white"
              />

              {!drillChecked ? (
                <button
                  type="button"
                  onClick={() => {
                    const target = filteredErrors[drillIdx].correct
                      .trim()
                      .toLowerCase();
                    const actual = drillInput.trim().toLowerCase();
                    setDrillCorrect(actual === target);
                    setDrillChecked(true);
                  }}
                  className="cta-orange-pill w-full py-2.5 px-4"
                >
                  <span className="text-xs font-extrabold">
                    Verify Correction
                  </span>
                  <span className="cta-orange-pill-icon h-7 w-7 text-xs">
                    »
                  </span>
                </button>
              ) : (
                <div className="space-y-2">
                  <div
                    className={`rounded-xl p-3 text-xs font-bold ${
                      drillCorrect
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-rose-500/15 text-rose-300"
                    }`}
                  >
                    {drillCorrect
                      ? "✓ ¡Exacto! Mastered."
                      : `Correct form: ${filteredErrors[drillIdx].correct}`}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDrillIdx(
                        (prev) => (prev + 1) % filteredErrors.length
                      );
                      setDrillInput("");
                      setDrillChecked(false);
                    }}
                    className="w-full rounded-full bg-[#22252D] py-2.5 text-xs font-extrabold text-white"
                  >
                    Next Error »
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Error Notebook List */}
          {filteredErrors.length === 0 ? (
            <div className="bento-card p-6 text-center space-y-2">
              <p className="text-sm font-bold text-white">
                No errors recorded yet
              </p>
              <p className="text-xs text-[#8E93A4]">
                Complete a daily grammar exercise or chat with the Madrid tutor
                — any mistake you make will automatically appear here and in
                your FSRS review queue.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredErrors.map((err) => (
                <div
                  key={err.id}
                  className="bento-card p-3.5 space-y-2 border border-white/[0.06]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-[#FF4F17]/15 border border-[#FF4F17]/30 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-[#FF4F17]">
                        {err.category}
                      </span>
                      {err.card_id && (
                        <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          In FSRS Queue
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void playSpanishAudio({
                          text: err.correct,
                          audioSource: "es-ES TTS",
                        })
                      }
                      title="Listen"
                      aria-label="Listen"
                      className="w-7 h-7 rounded-xl bg-[#FF4F17]/15 border border-[#FF4F17]/30 flex items-center justify-center text-[#FF4F17] hover:bg-[#FF4F17]/25 transition"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs line-through text-rose-400/85">
                      ✗ {err.wrong}
                    </div>
                    <div className="text-sm font-extrabold text-emerald-300">
                      ✓ {err.correct}
                    </div>
                    <div className="font-mono text-[11px] text-[#FF4F17]/85">
                      [{toMadridEnglishPhonetics(err.correct)}]
                    </div>
                  </div>

                  <p className="text-xs text-[#C8CCD8] leading-snug">
                    {err.explanation}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
