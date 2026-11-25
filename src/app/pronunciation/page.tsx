"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Ear,
  Mic,
  Target,
  Trophy,
  Volume2,
} from "lucide-react";
import { getOrInitTodaySession, offlineDb } from "@/lib/offline/db";
import { playSpanishAudio } from "@/lib/audio/player";
import { toMadridEnglishPhonetics } from "@/lib/audio/phonetics";
import {
  DEFAULT_MADRID_SHADOWING_SENTENCES,
  SPAIN_MINIMAL_PAIRS,
  STRESS_LINKING_DRILLS,
  ShadowingSentence,
} from "@/lib/pronunciation/drills";
import {
  computeWeakSoundTracker,
  SPAIN_SOUND_META_MAP,
} from "@/lib/pronunciation/spain-sounds";
import { PronunciationRecorderCard } from "@/components/PronunciationRecorderCard";
import {
  PronunciationAssessmentResult,
  PronunciationAttemptRecord,
  SpainSoundGroup,
} from "@/types/database";

type PronTab = "shadow" | "pairs" | "flow" | "sounds";

export default function PronunciationPage() {
  const [activeTab, setActiveTab] = useState<PronTab>("shadow");

  // Shadowing state
  const [sentences, setSentences] = useState<ShadowingSentence[]>(
    DEFAULT_MADRID_SHADOWING_SENTENCES
  );
  const [currentIdx, setCurrentIdx] = useState(0);
  const [sessionScores, setSessionScores] = useState<Record<string, number>>(
    {}
  );

  // Minimal Pairs state
  const [pairIdx, setPairIdx] = useState(0);
  const [pairSpeakSide, setPairSpeakSide] = useState<"left" | "right">("right");
  const [mysterySide, setMysterySide] = useState<"left" | "right" | null>(null);
  const [mysteryGuess, setMysteryGuess] = useState<"left" | "right" | null>(
    null
  );

  // Stress / Linking / Paragraph Read-Aloud state
  const [flowIdx, setFlowIdx] = useState(0);

  // Shared attempts & XP toast
  const [attempts, setAttempts] = useState<PronunciationAttemptRecord[]>([]);
  const [xpToast, setXpToast] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!offlineDb) return;
    try {
      const [allAttempts, allNotes] = await Promise.all([
        offlineDb.pron_attempts
          .orderBy("created_at")
          .reverse()
          .limit(80)
          .toArray(),
        offlineDb.notes.orderBy("freq_rank").limit(40).toArray(),
      ]);

      setAttempts(allAttempts);

      // Build 5 shadowing sentences prioritizing real sentences from today's vocabulary deck
      const deckSentences: ShadowingSentence[] = [];
      for (const note of allNotes) {
        if (deckSentences.length >= 3) break;
        const cleanEs = (note.example_es ?? "").split(" -- ")[0].trim();
        if (cleanEs.length >= 18 && cleanEs.length <= 120) {
          deckSentences.push({
            id: `deck-${note.id}`,
            es: cleanEs,
            en: (note.example_tr ?? note.meaning ?? "").trim(),
            focusSounds: [],
            sourceLabel:
              note.freq_rank > 0
                ? `From Your Deck · #${note.freq_rank} ${note.word}`
                : `From Your Deck · ${note.word}`,
          });
        }
      }

      const merged = [
        ...deckSentences,
        ...DEFAULT_MADRID_SHADOWING_SENTENCES,
      ].slice(0, 5);
      setSentences(merged);
    } catch {
      // Fall back to default Madrid sentences
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const currentSentence = sentences[currentIdx] ?? sentences[0];
  const currentPair = SPAIN_MINIMAL_PAIRS[pairIdx] ?? SPAIN_MINIMAL_PAIRS[0];
  const currentFlow = STRESS_LINKING_DRILLS[flowIdx] ?? STRESS_LINKING_DRILLS[0];

  const { stats: soundStats, weakestTwo } = useMemo(
    () => computeWeakSoundTracker(attempts),
    [attempts]
  );

  const handleScored = async (
    result: PronunciationAssessmentResult,
    trackSentenceId?: string
  ) => {
    if (trackSentenceId) {
      setSessionScores((prev) => ({
        ...prev,
        [trackSentenceId]: result.overall,
      }));
    }

    // Spec XP rule: pronunciation sentence scored 80+ = +5 XP
    if (result.overall >= 80 && offlineDb) {
      const sess = await getOrInitTodaySession();
      await offlineDb.sessions.put({
        ...sess,
        xp: sess.xp + 5,
      });
      setXpToast("+5 XP · Great Madrid pronunciation (80+)!");
      setTimeout(() => setXpToast(null), 3200);
    }

    if (offlineDb) {
      const updated = await offlineDb.pron_attempts
        .orderBy("created_at")
        .reverse()
        .limit(80)
        .toArray();
      setAttempts(updated);
    }
  };

  const handlePlayMysteryPair = async () => {
    const picked: "left" | "right" = Math.random() < 0.5 ? "left" : "right";
    setMysterySide(picked);
    setMysteryGuess(null);
    const wordToPlay =
      picked === "left" ? currentPair.left.es : currentPair.right.es;
    await playSpanishAudio({
      text: wordToPlay,
      audioSource: "es-ES TTS",
    });
  };

  const handleDrillWeakestSound = (target: SpainSoundGroup) => {
    const matchingPairIdx = SPAIN_MINIMAL_PAIRS.findIndex(
      (p) => p.targetGroup === target
    );
    if (matchingPairIdx >= 0) {
      setPairIdx(matchingPairIdx);
      setMysterySide(null);
      setMysteryGuess(null);
      setActiveTab("pairs");
      return;
    }
    const matchingFlowIdx = STRESS_LINKING_DRILLS.findIndex(
      (d) => d.targetGroup === target
    );
    if (matchingFlowIdx >= 0) {
      setFlowIdx(matchingFlowIdx);
      setActiveTab("flow");
      return;
    }
    setActiveTab("shadow");
  };

  const completedCount = Object.keys(sessionScores).length;

  return (
    <div className="space-y-3.5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF4F17]">
            PHASE 3 · MADRID ACCENT (ES-ES)
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">
            Pronunciation Coach
          </h1>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-[#FF4F17]/15 border border-[#FF4F17]/35 flex items-center justify-center text-[#FF4F17]">
          <Mic className="w-5 h-5" />
        </div>
      </div>

      {/* Unified Speak Studio Switcher: Voice Roleplay | Pronunciation */}
      <div className="grid grid-cols-2 gap-1.5 rounded-[20px] bg-[#181A1F] p-1 border border-white/[0.06]">
        <Link
          href="/speak"
          className="rounded-[14px] py-2 text-center text-xs font-extrabold text-zinc-400 hover:text-white transition"
        >
          Voice Roleplay
        </Link>
        <div className="rounded-[14px] py-2 text-center text-xs font-extrabold bg-[#FF4F17] text-black shadow-[0_4px_14px_rgba(255,79,23,0.35)]">
          Pronunciation
        </div>
      </div>

      {/* 4-Tab Segmented Switcher (fits 375px cleanly) */}
      <div className="grid grid-cols-4 gap-1 rounded-[20px] bg-[#181A1F] p-1 border border-white/[0.06]">
        {(
          [
            { id: "shadow", label: "Shadow" },
            { id: "pairs", label: "Pairs" },
            { id: "flow", label: "Flow" },
            { id: "sounds", label: "Sounds" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`rounded-[14px] py-2 text-[11px] font-extrabold transition-all ${
              activeTab === t.id
                ? "bg-[#FF4F17] text-black shadow-[0_4px_14px_rgba(255,79,23,0.35)]"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* XP Toast */}
      {xpToast && (
        <div className="rounded-2xl bg-emerald-500/15 border border-emerald-500/35 px-3.5 py-2 text-xs font-extrabold text-emerald-300 flex items-center gap-2">
          <Trophy className="w-4 h-4 shrink-0" />
          <span>{xpToast}</span>
        </div>
      )}

      {/* ===================== TAB 1: SHADOWING (5 SENTENCES) ===================== */}
      {activeTab === "shadow" && (
        <div className="space-y-3.5">
          {/* Weakest 2 Sounds Preview Pill */}
          <div className="bento-card p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Target Madrid Sounds Today
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {weakestTwo.map((g) => {
                  const meta = SPAIN_SOUND_META_MAP[g];
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => handleDrillWeakestSound(g)}
                      className="px-2 py-0.5 rounded-full bg-[#FF4F17]/15 hover:bg-[#FF4F17]/25 border border-[#FF4F17]/30 text-[10px] font-extrabold text-[#FF4F17] transition"
                    >
                      {meta.symbol} · {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <span className="shrink-0 text-[11px] font-extrabold text-zinc-300">
              {completedCount}/5 done
            </span>
          </div>

          {/* 5-Sentence Shadowing Stepper */}
          <div className="grid grid-cols-5 gap-1.5">
            {sentences.map((s, idx) => {
              const score = sessionScores[s.id];
              const active = idx === currentIdx;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setCurrentIdx(idx)}
                  className={`rounded-xl py-2 text-xs font-extrabold border transition ${
                    active
                      ? "bg-[#FF4F17] text-black border-[#FF4F17] shadow-[0_4px_14px_rgba(255,79,23,0.35)]"
                      : typeof score === "number"
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                        : "bg-[#181A1F] text-zinc-400 border-white/[0.06] hover:text-white"
                  }`}
                >
                  {typeof score === "number" ? `${score}%` : `#${idx + 1}`}
                </button>
              );
            })}
          </div>

          {/* Main Shadowing Recorder + Waveform + Per-Word / Per-Phoneme Scorer */}
          {currentSentence && (
            <PronunciationRecorderCard
              referenceText={currentSentence.es}
              englishTranslation={currentSentence.en}
              sourceLabel={
                currentSentence.sourceLabel ??
                `Shadowing ${currentIdx + 1} of ${sentences.length}`
              }
              mode="shadowing"
              onScored={(res) => void handleScored(res, currentSentence.id)}
            />
          )}

          {/* Prev / Next Navigation */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={currentIdx === 0}
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              className="h-10 px-4 rounded-2xl bg-[#181A1F] border border-white/[0.07] text-xs font-bold text-zinc-200 flex items-center gap-1 disabled:opacity-35 hover:text-white transition"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Prev</span>
            </button>

            <span className="text-xs font-bold text-zinc-400">
              Sentence {currentIdx + 1} of {sentences.length}
            </span>

            <button
              type="button"
              disabled={currentIdx >= sentences.length - 1}
              onClick={() =>
                setCurrentIdx((i) => Math.min(sentences.length - 1, i + 1))
              }
              className="h-10 px-4 rounded-2xl bg-[#181A1F] border border-white/[0.07] text-xs font-bold text-zinc-200 flex items-center gap-1 disabled:opacity-35 hover:text-white transition"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ===================== TAB 2: SPAIN MINIMAL PAIRS ===================== */}
      {activeTab === "pairs" && (
        <div className="space-y-3.5">
          {/* Pair Selector Pills */}
          <div className="flex flex-wrap gap-1.5">
            {SPAIN_MINIMAL_PAIRS.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPairIdx(idx);
                  setMysterySide(null);
                  setMysteryGuess(null);
                }}
                className={`rounded-xl px-2.5 py-1.5 text-[11px] font-extrabold border transition ${
                  idx === pairIdx
                    ? "bg-[#FF4F17] text-black border-[#FF4F17]"
                    : "bg-[#181A1F] text-zinc-300 border-white/[0.06] hover:border-[#FF4F17]/40"
                }`}
              >
                {p.left.es} / {p.right.es}
              </button>
            ))}
          </div>

          {/* Contrast Card + Ear Training */}
          <div className="bento-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17]">
                {currentPair.soundContrast}
              </span>
              <button
                type="button"
                onClick={() => void handlePlayMysteryPair()}
                className="rounded-full bg-[#FF4F17]/15 hover:bg-[#FF4F17]/25 border border-[#FF4F17]/35 px-3 py-1 text-[11px] font-extrabold text-[#FF4F17] flex items-center gap-1.5 transition"
              >
                <Ear className="w-3.5 h-3.5" />
                <span>Ear Quiz</span>
              </button>
            </div>

            {/* Side-by-Side Pair Tiles */}
            <div className="grid grid-cols-2 gap-2.5">
              {(["left", "right"] as const).map((side) => {
                const item = currentPair[side];
                const isSelectedForSpeak = pairSpeakSide === side;
                const isMysteryCorrect =
                  mysteryGuess === side && mysterySide === side;
                const isMysteryWrong =
                  mysteryGuess === side &&
                  mysterySide !== null &&
                  mysterySide !== side;

                return (
                  <div
                    key={side}
                    className={`rounded-2xl p-3 border space-y-1.5 transition ${
                      isMysteryCorrect
                        ? "bg-emerald-500/15 border-emerald-500/45"
                        : isMysteryWrong
                          ? "bg-rose-500/15 border-rose-500/45"
                          : isSelectedForSpeak
                            ? "bg-[#1C1F26] border-[#FF4F17]/50"
                            : "bg-[#121419] border-white/[0.06]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-display text-lg font-extrabold text-white">
                        {item.es}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          void playSpanishAudio({
                            text: item.es,
                            audioSource: "es-ES TTS",
                          })
                        }
                        className="w-7 h-7 rounded-xl bg-white/[0.08] hover:bg-[#FF4F17] text-[#FF4F17] hover:text-black flex items-center justify-center transition"
                        title={`Hear ${item.es} (es-ES)`}
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div
                      data-phonetic-guide="true"
                      className="font-mono text-[10px] font-bold text-[#FF4F17]/90"
                    >
                      [{toMadridEnglishPhonetics(item.es)}]
                    </div>
                    <div className="text-[11px] text-zinc-400">{item.en}</div>

                    {mysterySide !== null ? (
                      <button
                        type="button"
                        onClick={() => setMysteryGuess(side)}
                        className="w-full mt-1 rounded-lg bg-white/[0.07] hover:bg-[#FF4F17] text-zinc-200 hover:text-black py-1 text-[10px] font-extrabold transition"
                      >
                        {isMysteryCorrect
                          ? "✓ Correct!"
                          : isMysteryWrong
                            ? "✗ Try other"
                            : "I heard this"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPairSpeakSide(side)}
                        className={`w-full mt-1 rounded-lg py-1 text-[10px] font-extrabold transition ${
                          isSelectedForSpeak
                            ? "bg-[#FF4F17] text-black"
                            : "bg-white/[0.06] text-zinc-300 hover:text-white"
                        }`}
                      >
                        {isSelectedForSpeak
                          ? "Speaking This"
                          : "Practice This"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-zinc-300 leading-snug bg-[#101216] rounded-xl px-3 py-2 border border-white/[0.05]">
              <strong className="text-[#FF4F17]">Spain Contrast: </strong>
              {currentPair.tip}
            </p>
          </div>

          {/* Speak & Score the Selected Minimal Pair in a Full Sentence */}
          <PronunciationRecorderCard
            referenceText={currentPair[pairSpeakSide].sentence}
            englishTranslation={`Target word: ${currentPair[pairSpeakSide].es} (${currentPair[pairSpeakSide].en})`}
            sourceLabel={`Minimal Pair · ${currentPair[pairSpeakSide].es.toUpperCase()}`}
            mode="minimal_pair"
            onScored={(res) => void handleScored(res)}
          />
        </div>
      )}

      {/* ===================== TAB 3: STRESS, LINKING & READ-ALOUD ===================== */}
      {activeTab === "flow" && (
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-1.5">
            {STRESS_LINKING_DRILLS.map((d, idx) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setFlowIdx(idx)}
                className={`rounded-xl px-3 py-2 text-left border transition ${
                  idx === flowIdx
                    ? "bg-[#FF4F17] text-black border-[#FF4F17]"
                    : "bg-[#181A1F] text-zinc-300 border-white/[0.06] hover:border-[#FF4F17]/40"
                }`}
              >
                <div className="text-[9px] font-extrabold uppercase tracking-wider opacity-80">
                  {d.category}
                </div>
                <div className="text-xs font-extrabold truncate">{d.title}</div>
              </button>
            ))}
          </div>

          <div className="rounded-2xl bg-[#FF4F17]/10 border border-[#FF4F17]/30 px-3.5 py-2.5 text-xs text-zinc-200">
            <span className="font-extrabold text-[#FF4F17]">Focus: </span>
            {currentFlow.focusNote}
          </div>

          <PronunciationRecorderCard
            referenceText={currentFlow.es}
            englishTranslation={currentFlow.en}
            sourceLabel={`${currentFlow.category.toUpperCase()} · ${currentFlow.title}`}
            mode={
              currentFlow.category === "paragraph"
                ? "paragraph"
                : "stress_linking"
            }
            onScored={(res) => void handleScored(res)}
          />
        </div>
      )}

      {/* ===================== TAB 4: SPAIN WEAK-SOUND TRACKER ===================== */}
      {activeTab === "sounds" && (
        <div className="space-y-3.5">
          {/* Weakest 2 Sounds Action Card */}
          <div className="bento-card p-4 space-y-3 border-[#FF4F17]/35">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17] flex items-center gap-1">
                  <Target className="w-3.5 h-3.5" />
                  Daily Weakest-2 Focus
                </div>
                <h2 className="font-display text-base font-extrabold text-white mt-0.5">
                  Your 2 Priority Madrid Sounds
                </h2>
              </div>
              <BarChart3 className="w-5 h-5 text-[#FF4F17]" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              {weakestTwo.map((group) => {
                const stat = soundStats.find((s) => s.group === group);
                const meta = SPAIN_SOUND_META_MAP[group];
                return (
                  <button
                    key={group}
                    type="button"
                    onClick={() => handleDrillWeakestSound(group)}
                    className="rounded-2xl bg-[#121419] hover:bg-[#1B1E26] border border-[#FF4F17]/35 p-3 text-left space-y-1 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-extrabold text-[#FF4F17]">
                        {meta.symbol}
                      </span>
                      <span className="text-xs font-extrabold text-white">
                        {stat?.averageScore !== null &&
                        stat?.averageScore !== undefined
                          ? `${stat.averageScore}%`
                          : "New"}
                      </span>
                    </div>
                    <div className="text-[11px] font-bold text-zinc-200 truncate">
                      {meta.label}
                    </div>
                    <div className="text-[10px] font-extrabold text-[#FF4F17]">
                      Tap to Drill »
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* All 7 Spain-Specific Sound Bars */}
          <div className="bento-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                7 Spain (es-ES) Sound Averages
              </span>
              <span className="text-[10px] font-bold text-zinc-500">
                {attempts.length} total attempts
              </span>
            </div>

            <div className="space-y-3">
              {soundStats.map((stat) => {
                const isWeakest = weakestTwo.includes(stat.group);
                const score = stat.averageScore;
                const barWidth = score !== null ? Math.max(8, score) : 0;
                const barColor =
                  score === null
                    ? "bg-white/10"
                    : score >= 85
                      ? "bg-emerald-400"
                      : score >= 65
                        ? "bg-amber-400"
                        : "bg-rose-400";

                return (
                  <div key={stat.group} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono font-extrabold text-[#FF4F17] w-12 shrink-0">
                          {stat.meta.symbol}
                        </span>
                        <span className="font-bold text-white truncate">
                          {stat.meta.label}
                        </span>
                        {isWeakest && (
                          <span className="px-1.5 py-0.5 rounded bg-[#FF4F17]/15 text-[#FF4F17] text-[9px] font-extrabold uppercase shrink-0">
                            Focus
                          </span>
                        )}
                      </div>
                      <span className="font-extrabold text-zinc-200 shrink-0 ml-2">
                        {score !== null ? `${score}%` : "—"}
                      </span>
                    </div>

                    <div className="h-2 rounded-full bg-[#101216] overflow-hidden border border-white/[0.05]">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span className="truncate">{stat.meta.examples}</span>
                      <span className="shrink-0 ml-2">
                        {stat.attemptsCount}{" "}
                        {stat.attemptsCount === 1 ? "sample" : "samples"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
