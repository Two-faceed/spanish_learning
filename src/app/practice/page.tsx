"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Check,
  ChevronRight,
  Ear,
  Flame,
  Loader2,
  PenTool,
  RefreshCw,
  Sparkles,
  Trophy,
  Volume2,
} from "lucide-react";
import { getOrInitTodaySession, offlineDb } from "@/lib/offline/db";
import { recordTutorMistakeToErrorNotebookAndQueue } from "@/lib/offline/sync-manager";
import { playSpanishAudio } from "@/lib/audio/player";
import { toMadridEnglishPhonetics } from "@/lib/audio/phonetics";
import {
  computeCharDiff,
  ConjugationQuestion,
  ConjugationTense,
  DAILY_WRITING_PROMPTS,
  DEFAULT_MADRID_DICTATION_ITEMS,
  DictationCheckResult,
  DictationItem,
  JournalCorrectionResult,
  pickRandomConjugationQuestion,
  TENSE_LABELS,
} from "@/lib/practice/drills";

type PracticeTab = "dictation" | "verbs" | "journal";

const SPANISH_CHARS = ["á", "é", "í", "ó", "ú", "ü", "ñ", "¿", "¡"];

export default function PracticeLabPage() {
  const [activeTab, setActiveTab] = useState<PracticeTab>("dictation");
  const [xpToast, setXpToast] = useState<string | null>(null);

  // 1. Dictation state
  const [dictItems, setDictItems] = useState<DictationItem[]>(
    DEFAULT_MADRID_DICTATION_ITEMS
  );
  const [dictIdx, setDictIdx] = useState(0);
  const [dictInput, setDictInput] = useState("");
  const [dictResult, setDictResult] = useState<DictationCheckResult | null>(
    null
  );
  const [playingDict, setPlayingDict] = useState(false);

  // 2. Conjugation Trainer state
  const [selectedTenses, setSelectedTenses] = useState<ConjugationTense[]>([
    "present",
    "preterite",
  ]);
  const [verbQuestion, setVerbQuestion] = useState<ConjugationQuestion>(() =>
    pickRandomConjugationQuestion(["present", "preterite"], true)
  );
  const [verbInput, setVerbInput] = useState("");
  const [verbChecked, setVerbChecked] = useState<"correct" | "wrong" | null>(
    null
  );
  const [verbStreak, setVerbStreak] = useState(0);

  // 3. Writing Journal state
  const [promptIdx, setPromptIdx] = useState(0);
  const [journalText, setJournalText] = useState("");
  const [journalBusy, setJournalBusy] = useState(false);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [journalResult, setJournalResult] =
    useState<JournalCorrectionResult | null>(null);
  const [awardedPromptIndices, setAwardedPromptIndices] = useState<number[]>(
    []
  );

  const loadDeckDictation = useCallback(async () => {
    if (!offlineDb) return;
    try {
      const notes = await offlineDb.notes.orderBy("freq_rank").limit(30).toArray();
      const fromDeck: DictationItem[] = [];
      for (const n of notes) {
        if (fromDeck.length >= 3) break;
        const cleanEs = (n.example_es ?? "").split(" -- ")[0].trim();
        if (cleanEs.length >= 16 && cleanEs.length <= 105) {
          fromDeck.push({
            id: `deck-dict-${n.id}`,
            es: cleanEs,
            en: (n.example_tr ?? n.meaning ?? "").trim(),
            source: `Your Deck · ${n.word}`,
          });
        }
      }
      if (fromDeck.length > 0) {
        setDictItems([...fromDeck, ...DEFAULT_MADRID_DICTATION_ITEMS]);
      }
    } catch {
      // Keep defaults
    }
  }, []);

  useEffect(() => {
    void loadDeckDictation();
  }, [loadDeckDictation]);

  const awardXp = async (amount: number, msg: string) => {
    if (!offlineDb) return;
    const sess = await getOrInitTodaySession();
    await offlineDb.sessions.put({
      ...sess,
      xp: sess.xp + amount,
    });
    setXpToast(`+${amount} XP · ${msg}`);
    setTimeout(() => setXpToast(null), 3000);
  };

  // --- Dictation handlers ---
  const currentDict = dictItems[dictIdx] ?? dictItems[0];

  const handlePlayDictation = async () => {
    if (!currentDict) return;
    setPlayingDict(true);
    try {
      await playSpanishAudio({
        text: currentDict.es,
        audioSource: "es-ES TTS",
      });
    } finally {
      setPlayingDict(false);
    }
  };

  const handleCheckDictation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDict || !dictInput.trim()) return;
    const res = computeCharDiff(currentDict.es, dictInput);
    setDictResult(res);
    if (res.accuracyPct >= 85) {
      await awardXp(5, `Dictation ${res.accuracyPct}%!`);
    }
  };

  const handleNextDictation = () => {
    setDictIdx((i) => (i + 1) % dictItems.length);
    setDictInput("");
    setDictResult(null);
  };

  // --- Conjugation handlers ---
  const toggleTense = (t: ConjugationTense) => {
    setSelectedTenses((prev) => {
      const next = prev.includes(t)
        ? prev.length > 1
          ? prev.filter((x) => x !== t)
          : prev
        : [...prev, t];
      setVerbQuestion(pickRandomConjugationQuestion(next, true));
      setVerbInput("");
      setVerbChecked(null);
      return next;
    });
  };

  const handleCheckVerb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verbInput.trim() || verbChecked) return;
    const ok =
      verbInput.trim().toLowerCase() === verbQuestion.answer.toLowerCase();
    setVerbChecked(ok ? "correct" : "wrong");
    if (ok) {
      setVerbStreak((s) => s + 1);
      await awardXp(2, `Correct: ${verbQuestion.answer}`);
    } else {
      setVerbStreak(0);
    }
  };

  const handleNextVerb = () => {
    setVerbQuestion(pickRandomConjugationQuestion(selectedTenses, true));
    setVerbInput("");
    setVerbChecked(null);
  };

  // --- Writing Journal handler ---
  const handleSubmitJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!journalText.trim() || journalBusy) return;
    setJournalError(null);
    setJournalBusy(true);
    try {
      const res = await fetch("/api/practice/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: DAILY_WRITING_PROMPTS[promptIdx],
          entryEs: journalText.trim(),
          cefr: "A1-A2",
        }),
      });
      const data = (await res.json()) as JournalCorrectionResult & {
        error?: string;
      };
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to grade journal");
      }
      setJournalResult(data);

      for (const ch of data.changes) {
        await recordTutorMistakeToErrorNotebookAndQueue({
          source: "writing",
          category: ch.category,
          wrong: ch.wrong,
          correct: ch.correct,
          explanation: ch.explanation,
        });
      }

      // Award +15 XP ONLY when the entire text is error-free (0 changes) and once per prompt
      if (
        data.changes.length === 0 &&
        !awardedPromptIndices.includes(promptIdx)
      ) {
        setAwardedPromptIndices((prev) => [...prev, promptIdx]);
        await awardXp(15, `Error-free Writing Journal (${data.score}%)!`);
      }
    } catch (err) {
      setJournalError(
        err instanceof Error ? err.message : "Could not correct journal entry."
      );
    } finally {
      setJournalBusy(false);
    }
  };

  return (
    <div className="space-y-3.5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF4F17]">
            PHASE 5 · EXTRA SKILLS LAB (ES-ES)
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">
            Practice Lab
          </h1>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-[#FF4F17]/15 border border-[#FF4F17]/35 flex items-center justify-center text-[#FF4F17]">
          <PenTool className="w-5 h-5" />
        </div>
      </div>

      {/* 3-Tab Switcher */}
      <div className="grid grid-cols-3 gap-1.5 rounded-[22px] bg-[#181A1F] p-1.5 border border-white/[0.06]">
        {(
          [
            { id: "dictation", label: "Dictation" },
            { id: "verbs", label: "Verbs" },
            { id: "journal", label: "Journal" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`rounded-[16px] py-2 text-xs font-extrabold transition-all ${
              activeTab === t.id
                ? "bg-[#FF4F17] text-black shadow-[0_4px_14px_rgba(255,79,23,0.35)]"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {xpToast && (
        <div className="rounded-2xl bg-emerald-500/15 border border-emerald-500/35 px-3.5 py-2 text-xs font-extrabold text-emerald-300 flex items-center gap-2">
          <Trophy className="w-4 h-4 shrink-0" />
          <span>{xpToast}</span>
        </div>
      )}

      {/* ===================== TAB 1: LISTENING DICTATION ===================== */}
      {activeTab === "dictation" && currentDict && (
        <div className="bento-card p-4 space-y-4">
          <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider">
            <span className="text-[#FF4F17]">{currentDict.source}</span>
            <span className="text-zinc-400">
              {dictIdx + 1} / {dictItems.length}
            </span>
          </div>

          <div className="text-center py-2 space-y-2">
            <button
              type="button"
              disabled={playingDict}
              onClick={() => void handlePlayDictation()}
              className="w-20 h-20 rounded-full bg-[#FF4F17] hover:bg-[#FF6230] text-black flex flex-col items-center justify-center mx-auto shadow-[0_0_28px_rgba(255,79,23,0.4)] transition active:scale-95 disabled:opacity-60"
            >
              <Ear className="w-8 h-8" />
              <span className="text-[9px] font-extrabold mt-0.5">
                {playingDict ? "PLAYING" : "LISTEN"}
              </span>
            </button>
            <p className="text-xs text-zinc-400">
              Listen in Madrid <code className="font-mono">es-ES</code> and type
              exactly what you hear.
            </p>
          </div>

          <form
            onSubmit={(e) => void handleCheckDictation(e)}
            className="space-y-2.5"
          >
            <textarea
              rows={2}
              value={dictInput}
              disabled={Boolean(dictResult)}
              onChange={(e) => setDictInput(e.target.value)}
              placeholder="Type the Spanish sentence here…"
              className="w-full rounded-2xl bg-[#101216] border border-white/10 px-3.5 py-2.5 text-sm font-semibold text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF4F17]"
            />

            <div className="grid grid-cols-9 gap-1">
              {SPANISH_CHARS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  disabled={Boolean(dictResult)}
                  onClick={() => setDictInput((p) => p + ch)}
                  className="h-7 rounded-lg bg-[#121419] hover:bg-[#FF4F17] text-zinc-300 hover:text-black font-bold text-xs border border-white/[0.06]"
                >
                  {ch}
                </button>
              ))}
            </div>

            {!dictResult ? (
              <button
                type="submit"
                disabled={!dictInput.trim()}
                className="w-full rounded-full bg-[#FF4F17] hover:bg-[#FF6230] text-black font-extrabold text-xs py-3 disabled:opacity-40 transition"
              >
                Check Character-Level Diff
              </button>
            ) : (
              <div className="space-y-3 pt-1">
                <div className="rounded-2xl bg-[#101216] border border-white/[0.08] p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-extrabold">
                    <span
                      className={
                        dictResult.accuracyPct >= 85
                          ? "text-emerald-400"
                          : "text-amber-300"
                      }
                    >
                      {dictResult.exactMatch
                        ? "✓ Exact Match!"
                        : `Accuracy: ${dictResult.accuracyPct}%`}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      Green = match · Red = missing · Strikethrough = extra
                    </span>
                  </div>

                  {/* Character-Level Diff Output */}
                  <div className="font-mono text-sm leading-relaxed break-words">
                    {dictResult.segments.map((seg, idx) => (
                      <span
                        key={idx}
                        className={
                          seg.status === "match"
                            ? "text-emerald-300"
                            : seg.status === "missing"
                              ? "bg-rose-500/25 text-rose-200 underline decoration-rose-400 px-0.5 rounded"
                              : "bg-amber-500/20 text-amber-300 line-through px-0.5 rounded"
                        }
                      >
                        {seg.char}
                      </span>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-white/[0.06] space-y-0.5">
                    <div className="text-xs font-bold text-white">
                      {currentDict.es}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {currentDict.en}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleNextDictation}
                  className="w-full rounded-full bg-[#FF4F17] text-black font-extrabold text-xs py-2.5 flex items-center justify-center gap-1"
                >
                  <span>Next Dictation Sentence</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* ===================== TAB 2: CONJUGATION TRAINER (VOSOTROS) ===================== */}
      {activeTab === "verbs" && (
        <div className="space-y-3.5">
          {/* Tense Filter Pills */}
          <div className="bento-card p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                Active Tenses (includes Spain vosotros)
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-extrabold text-[#FF4F17]">
                <Flame className="w-3.5 h-3.5 fill-[#FF4F17]" />
                {verbStreak} streak
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(TENSE_LABELS) as ConjugationTense[]).map((t) => {
                const active = selectedTenses.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTense(t)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold border transition ${
                      active
                        ? "bg-[#FF4F17] text-black border-[#FF4F17]"
                        : "bg-[#121419] text-zinc-400 border-white/[0.06] hover:text-white"
                    }`}
                  >
                    {TENSE_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Drill Card */}
          <form
            onSubmit={(e) => void handleCheckVerb(e)}
            className="bento-card p-4 space-y-3.5"
          >
            <div className="text-center space-y-1.5 py-2">
              <div className="text-[10px] font-extrabold uppercase tracking-widest text-[#FF4F17]">
                {TENSE_LABELS[verbQuestion.tense]}
              </div>
              <div className="font-display text-3xl font-extrabold text-white">
                {verbQuestion.verb.infinitive}
              </div>
              <div className="text-xs text-zinc-400">
                {verbQuestion.verb.meaning}
              </div>
              <div className="inline-block mt-1 px-3 py-1 rounded-full bg-[#FF4F17]/15 border border-[#FF4F17]/35 text-xs font-extrabold text-[#FF4F17]">
                {verbQuestion.personLabel}
              </div>
            </div>

            <input
              type="text"
              value={verbInput}
              disabled={Boolean(verbChecked)}
              onChange={(e) => setVerbInput(e.target.value)}
              placeholder={`Conjugate for ${verbQuestion.personLabel}…`}
              className="w-full rounded-2xl bg-[#101216] border border-white/10 px-4 py-3 text-center text-base font-extrabold text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF4F17]"
            />

            <div className="grid grid-cols-7 gap-1">
              {["á", "é", "í", "ó", "ú", "ñ", "ü"].map((ch) => (
                <button
                  key={ch}
                  type="button"
                  disabled={Boolean(verbChecked)}
                  onClick={() => setVerbInput((p) => p + ch)}
                  className="h-8 rounded-lg bg-[#121419] hover:bg-[#FF4F17] text-zinc-200 hover:text-black font-bold text-xs border border-white/[0.06]"
                >
                  {ch}
                </button>
              ))}
            </div>

            {!verbChecked ? (
              <button
                type="submit"
                disabled={!verbInput.trim()}
                className="w-full rounded-full bg-[#FF4F17] text-black font-extrabold text-xs py-3 disabled:opacity-40"
              >
                Check Conjugation
              </button>
            ) : (
              <div className="space-y-2.5">
                <div
                  className={`rounded-2xl p-3 border flex items-center justify-between gap-2 ${
                    verbChecked === "correct"
                      ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300"
                      : "bg-rose-500/15 border-rose-500/35 text-rose-300"
                  }`}
                >
                  <div>
                    <div className="text-xs font-extrabold">
                      {verbChecked === "correct"
                        ? "✓ ¡Correcto!"
                        : `✗ Correct: ${verbQuestion.answer}`}
                    </div>
                    <div className="font-mono text-[10px] text-[#FF4F17] mt-0.5">
                      [{toMadridEnglishPhonetics(verbQuestion.answer)}]
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void playSpanishAudio({
                        text: verbQuestion.answer,
                        audioSource: "es-ES TTS",
                      })
                    }
                    title="Listen"
                    aria-label="Listen"
                    className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleNextVerb}
                  className="w-full rounded-full bg-[#FF4F17] text-black font-extrabold text-xs py-2.5 flex items-center justify-center gap-1"
                >
                  <span>Next Verb</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* ===================== TAB 3: WRITING JOURNAL ===================== */}
      {activeTab === "journal" && (
        <div className="space-y-3.5">
          <form
            onSubmit={(e) => void handleSubmitJournal(e)}
            className="bento-card p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17]">
                Daily Writing Prompt (5–10 sentences)
              </span>
              <button
                type="button"
                onClick={() => {
                  setPromptIdx((i) => (i + 1) % DAILY_WRITING_PROMPTS.length);
                  setJournalResult(null);
                }}
                className="text-[11px] font-bold text-zinc-400 hover:text-white inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Swap</span>
              </button>
            </div>

            <p className="text-xs font-bold text-white bg-[#101216] border border-white/[0.06] rounded-2xl p-3 leading-snug">
              {DAILY_WRITING_PROMPTS[promptIdx]}
            </p>

            <textarea
              rows={5}
              value={journalText}
              onChange={(e) => setJournalText(e.target.value)}
              placeholder="Write 5–8 sentences in Spain Spanish…"
              className="w-full rounded-2xl bg-[#101216] border border-white/10 px-3.5 py-2.5 text-sm font-semibold text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF4F17]"
            />

            <div className="grid grid-cols-9 gap-1">
              {SPANISH_CHARS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setJournalText((p) => p + ch)}
                  className="h-7 rounded-lg bg-[#121419] hover:bg-[#FF4F17] text-zinc-300 hover:text-black font-bold text-xs border border-white/[0.06]"
                >
                  {ch}
                </button>
              ))}
            </div>

            {journalError && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-xs text-rose-300">
                {journalError}
              </div>
            )}

            <button
              type="submit"
              disabled={journalBusy || journalText.trim().length < 10}
              className="w-full rounded-full bg-[#FF4F17] hover:bg-[#FF6230] text-black font-extrabold text-xs py-3 flex items-center justify-center gap-1.5 disabled:opacity-45 transition"
            >
              {journalBusy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Madrid Tutor Reviewing…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Correct My Spanish (+15 XP)</span>
                </>
              )}
            </button>
          </form>

          {journalResult && (
            <div className="bento-card p-4 space-y-3 border-[#FF4F17]/35">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  Natural Madrid Version
                </span>
                <span className="font-display text-xl font-extrabold text-[#FF4F17]">
                  {journalResult.score}%
                </span>
              </div>

              <div className="rounded-2xl bg-[#101216] border border-white/[0.06] p-3 text-sm font-semibold text-white leading-relaxed space-y-2">
                <p>{journalResult.correctedEs}</p>
                <button
                  type="button"
                  onClick={() =>
                    void playSpanishAudio({
                      text: journalResult.correctedEs,
                      audioSource: "es-ES TTS",
                    })
                  }
                  title="Listen to corrected version"
                  aria-label="Listen to corrected version"
                  className="w-7 h-7 rounded-full bg-[#FF4F17]/15 hover:bg-[#FF4F17]/25 border border-[#FF4F17]/35 flex items-center justify-center text-[#FF4F17] transition"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-xs text-zinc-300">{journalResult.feedbackEn}</p>

              {journalResult.changes.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-400">
                    Highlighted Changes (+ Saved to Error Notebook)
                  </div>
                  <div className="text-[11px] font-semibold text-amber-300">
                    Fix the mistake(s) above and re-check to earn +15 XP.
                  </div>
                  {journalResult.changes.map((c, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl bg-rose-500/10 border border-rose-500/25 p-2.5 text-xs space-y-0.5"
                    >
                      <div className="line-through text-rose-300/80">
                        ✗ {c.wrong}
                      </div>
                      <div className="font-extrabold text-emerald-300">
                        ✓ {c.correct}
                      </div>
                      <div className="text-[11px] text-zinc-300">
                        {c.explanation}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
