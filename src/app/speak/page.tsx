"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronLeft,
  Loader2,
  Mic,
  PhoneCall,
  PhoneOff,
  Plus,
  Send,
  Sparkles,
  Square,
  Trophy,
  Volume2,
} from "lucide-react";
import {
  getOrInitSettings,
  getOrInitTodaySession,
  offlineDb,
} from "@/lib/offline/db";
import {
  mineWordFromReadingOfflineFirst,
  recordTutorMistakeToErrorNotebookAndQueue,
} from "@/lib/offline/sync-manager";
import { playSpanishAudio } from "@/lib/audio/player";
import { toMadridEnglishPhonetics } from "@/lib/audio/phonetics";
import { ActiveWavRecorder, startWavRecording } from "@/lib/audio/recorder";
import {
  MADRID_ROLEPLAY_SCENARIOS,
  MadridRoleplayScenario,
  SpeakSummaryResult,
  SpeakTurnResult,
} from "@/lib/speak/scenarios";

interface CallMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  en?: string;
  hintEn?: string;
  correctionSuggestion?: string;
}

const VOICE_CAP_STORAGE_PREFIX = "espanol_fast_voice_sec_v1_";
const COMPLETED_SCENARIOS_KEY = "espanol_fast_completed_scenarios_v1";

export default function SpeakPage() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [categoryFilter, setCategoryFilter] = useState<
    "All" | "City Boss" | "Life in Madrid" | "Business"
  >("All");
  const [voiceCapMinutes, setVoiceCapMinutes] = useState<number>(15);
  const [voiceSecondsUsedToday, setVoiceSecondsUsedToday] = useState<number>(0);
  const [completedScenarios, setCompletedScenarios] = useState<
    Record<string, number>
  >({});

  // Active call state
  const [activeScenario, setActiveScenario] =
    useState<MadridRoleplayScenario | null>(null);
  const [messages, setMessages] = useState<CallMessage[]>([]);
  const [missionCompleted, setMissionCompleted] = useState(false);
  const [showEnglish, setShowEnglish] = useState(true);
  const [slowMode, setSlowMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [liveBars, setLiveBars] = useState<number[]>(Array(24).fill(0.15));
  const [sendingTurn, setSendingTurn] = useState(false);
  const [typedReply, setTypedReply] = useState("");
  const [callError, setCallError] = useState<string | null>(null);
  const lastPayloadRef = useRef<{
    wavBase64?: string;
    userText?: string;
    durationSec?: number;
  } | null>(null);

  // Post-call summary state
  const [endingCall, setEndingCall] = useState(false);
  const [summary, setSummary] = useState<SpeakSummaryResult | null>(null);
  const [phrasesAdded, setPhrasesAdded] = useState(false);
  const [xpBanner, setXpBanner] = useState<string | null>(null);

  const recorderRef = useRef<ActiveWavRecorder | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void getOrInitSettings().then((s) =>
      setVoiceCapMinutes(s.voice_minutes_cap || 15)
    );
    if (typeof window !== "undefined") {
      const saved = Number(
        window.localStorage.getItem(`${VOICE_CAP_STORAGE_PREFIX}${todayStr}`) ??
          "0"
      );
      if (Number.isFinite(saved) && saved > 0) {
        setVoiceSecondsUsedToday(saved);
      }
      try {
        const savedDone = window.localStorage.getItem(COMPLETED_SCENARIOS_KEY);
        if (savedDone) {
          setCompletedScenarios(JSON.parse(savedDone) as Record<string, number>);
        }
      } catch {
        // Ignore parse errors
      }
    }
    return () => {
      recorderRef.current?.cancel();
    };
  }, [todayStr]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sendingTurn]);

  const addVoiceSeconds = useCallback(
    (deltaSeconds: number) => {
      setVoiceSecondsUsedToday((prev) => {
        const next = prev + Math.max(1, Math.round(deltaSeconds));
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            `${VOICE_CAP_STORAGE_PREFIX}${todayStr}`,
            String(next)
          );
        }
        return next;
      });
    },
    [todayStr]
  );

  const voiceMinutesUsed = voiceSecondsUsedToday / 60;
  const isVoiceCapReached = voiceMinutesUsed >= voiceCapMinutes;

  const startScenario = (scenario: MadridRoleplayScenario) => {
    setActiveScenario(scenario);
    setSummary(null);
    setMissionCompleted(false);
    setPhrasesAdded(false);
    setXpBanner(null);
    setCallError(null);
    setMessages([
      {
        id: "opening-1",
        role: "assistant",
        text: scenario.openingLineEs,
        en: scenario.openingLineEn,
      },
    ]);
    void playSpanishAudio({
      text: scenario.openingLineEs,
      audioSource: "es-ES TTS",
    });
  };

  const sendRoleplayTurn = async (payload: {
    wavBase64?: string;
    userText?: string;
    durationSec?: number;
  }) => {
    if (!activeScenario || sendingTurn) return;
    lastPayloadRef.current = payload;
    setCallError(null);
    setSendingTurn(true);

    try {
      const res = await fetch("/api/speak/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioTitle: activeScenario.title,
          goalEn: activeScenario.goalEn,
          characterName: activeScenario.characterName,
          characterRole: activeScenario.characterRole,
          setting: activeScenario.setting,
          cefr: activeScenario.cefr,
          history: messages.map((m) => ({ role: m.role, text: m.text })),
          wavBase64: payload.wavBase64,
          userText: payload.userText,
          slowMode,
        }),
      });

      const data = (await res.json()) as SpeakTurnResult & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error || "Could not process roleplay turn");
      }

      if (payload.durationSec) {
        addVoiceSeconds(payload.durationSec + 6);
      }

      const userMsg: CallMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        text: data.userTranscript || payload.userText || "(spoken)",
        correctionSuggestion: data.correctionSuggestion,
      };
      const aiMsg: CallMessage = {
        id: `a-${Date.now() + 1}`,
        role: "assistant",
        text: data.replyEs,
        en: data.replyEn,
        hintEn: data.quickHintEn,
      };

      setMessages((prev) => [...prev, userMsg, aiMsg]);

      if (data.goalCompleted) {
        setMissionCompleted(true);
      }

      // Auto-play the Madrid partner's response in es-ES
      void playSpanishAudio({
        text: data.replyEs,
        audioSource: "es-ES TTS",
      });
    } catch (err) {
      setCallError(
        err instanceof Error ? err.message : "Roleplay turn failed."
      );
    } finally {
      setSendingTurn(false);
    }
  };

  const handleToggleMic = async () => {
    setCallError(null);

    if (isRecording) {
      const active = recorderRef.current;
      recorderRef.current = null;
      setIsRecording(false);
      if (!active) return;

      const audio = await active.stop();
      await sendRoleplayTurn({
        wavBase64: audio.wavBase64,
        durationSec: Math.max(2, Math.round(audio.durationMs / 1000)),
      });
      return;
    }

    if (isVoiceCapReached) {
      setCallError(
        `Daily voice limit reached (${voiceCapMinutes} min/day cap in Settings). You can still type below or raise the cap in Setup.`
      );
      return;
    }

    try {
      const rec = await startWavRecording((lvl) => {
        setLiveBars((prev) => [...prev.slice(1), Math.max(0.12, lvl)]);
      });
      recorderRef.current = rec;
      setIsRecording(true);
    } catch (err) {
      setCallError(
        err instanceof Error ? err.message : "Microphone access denied."
      );
    }
  };

  const handleEndCallAndScore = async () => {
    if (!activeScenario || endingCall) return;
    recorderRef.current?.cancel();
    setIsRecording(false);
    setEndingCall(true);
    setCallError(null);

    try {
      const res = await fetch("/api/speak/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioTitle: activeScenario.title,
          goalEn: activeScenario.goalEn,
          cefr: activeScenario.cefr,
          transcript: messages.map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = (await res.json()) as SpeakSummaryResult & {
        error?: string;
      };
      if (!res.ok || data.error) {
        throw new Error(data.error || "Could not generate roleplay summary");
      }

      setSummary(data);

      // Persist completed scenario score
      setCompletedScenarios((prev) => {
        const next = {
          ...prev,
          [activeScenario.id]: Math.max(prev[activeScenario.id] ?? 0, data.score),
        };
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            COMPLETED_SCENARIOS_KEY,
            JSON.stringify(next)
          );
        }
        return next;
      });

      // Save all corrections to Error Notebook & FSRS queue
      for (const c of data.corrections) {
        await recordTutorMistakeToErrorNotebookAndQueue({
          source: "speaking",
          category: c.category,
          wrong: c.wrong,
          correct: c.correct,
          explanation: c.explanation,
        });
      }

      // Award +30 XP (per docs/SPEC.md)
      if (offlineDb) {
        const sess = await getOrInitTodaySession(todayStr);
        await offlineDb.sessions.put({
          ...sess,
          xp: sess.xp + 30,
          minutes: sess.minutes + 8,
        });

        // If this is a City Boss roleplay and learner scored 80%+, mark week's Day 7 boss passed
        if (activeScenario.weekBoss && data.score >= 80) {
          const bossId = `w${activeScenario.weekBoss}-d7`;
          const existing = await offlineDb.lessons.get(bossId);
          await offlineDb.lessons.put({
            id: bossId,
            week: activeScenario.weekBoss,
            day: 7,
            city: activeScenario.city,
            topic: `Boss Roleplay: ${activeScenario.title}`,
            explanation: existing?.explanation ?? "",
            examples: existing?.examples ?? [],
            new_words: existing?.new_words ?? [],
            exercises: existing?.exercises ?? [],
            completed_at: new Date().toISOString(),
            score: data.score,
          });
        }
      }

      setXpBanner(
        activeScenario.weekBoss && data.score >= 80
          ? `+30 XP · City Boss Passed (${data.score}%)!`
          : "+30 XP · Madrid Roleplay Completed!"
      );
    } catch (err) {
      setCallError(
        err instanceof Error ? err.message : "Failed to score roleplay."
      );
    } finally {
      setEndingCall(false);
    }
  };

  const handleAddUsefulPhrasesToCards = async () => {
    if (!summary || phrasesAdded) return;
    for (const p of summary.usefulPhrases) {
      await mineWordFromReadingOfflineFirst({
        word: p.es,
        lemma: p.es.toLowerCase(),
        meaning: p.en,
        sentenceEs: p.es,
        sentenceTr: p.en,
        pos: "phrase",
        gender: null,
      });
    }
    setPhrasesAdded(true);
  };

  const filteredScenarios =
    categoryFilter === "All"
      ? MADRID_ROLEPLAY_SCENARIOS
      : MADRID_ROLEPLAY_SCENARIOS.filter((s) => s.category === categoryFilter);

  // ===================== ACTIVE CALL / SUMMARY VIEW =====================
  if (activeScenario) {
    return (
      <div className="space-y-3.5 pb-8">
        {/* Top Call Header */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              recorderRef.current?.cancel();
              setIsRecording(false);
              setActiveScenario(null);
            }}
            className="h-9 px-3 rounded-2xl bg-[#181A1F] border border-white/[0.08] text-xs font-bold text-zinc-200 hover:text-white flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Scenarios</span>
          </button>

          {!summary && (
            <button
              type="button"
              disabled={endingCall || messages.length < 2}
              onClick={() => void handleEndCallAndScore()}
              className="h-9 px-3.5 rounded-2xl bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/40 text-xs font-extrabold flex items-center gap-1.5 disabled:opacity-40 transition"
            >
              {endingCall ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <PhoneOff className="w-3.5 h-3.5" />
              )}
              <span>{endingCall ? "Scoring…" : "End & Feedback"}</span>
            </button>
          )}
        </div>

        {/* Scenario Persona Card */}
        <div className="bento-card p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xl">{activeScenario.emoji}</span>
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-white truncate">
                  {activeScenario.characterName} · {activeScenario.title}
                </div>
                <div className="text-[10px] text-zinc-400 truncate">
                  {activeScenario.characterRole} ({activeScenario.cefr})
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setSlowMode((v) => !v)}
                className={`px-2 py-1 rounded-lg text-[10px] font-extrabold border transition ${
                  slowMode
                    ? "bg-[#FF4F17] text-black border-[#FF4F17]"
                    : "bg-white/[0.06] text-zinc-300 border-white/[0.08]"
                }`}
              >
                🐢 Slow
              </button>
              <button
                type="button"
                onClick={() => setShowEnglish((v) => !v)}
                className={`px-2 py-1 rounded-lg text-[10px] font-extrabold border transition ${
                  showEnglish
                    ? "bg-[#FF4F17]/15 text-[#FF4F17] border-[#FF4F17]/35"
                    : "bg-white/[0.06] text-zinc-400 border-white/[0.08]"
                }`}
              >
                EN
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-[#111318] border border-white/[0.05] px-2.5 py-1.5 text-[11px] text-zinc-300">
            <strong className="text-[#FF4F17]">Goal: </strong>
            {activeScenario.goalEn}
          </div>
        </div>

        {/* POST-CALL FEEDBACK SUMMARY */}
        {summary ? (
          <div className="space-y-3">
            {xpBanner && (
              <div className="rounded-2xl bg-emerald-500/15 border border-emerald-500/35 px-3.5 py-2.5 text-xs font-extrabold text-emerald-300 flex items-center gap-2">
                <Trophy className="w-4 h-4 shrink-0" />
                <span>{xpBanner}</span>
              </div>
            )}

            <div className="bento-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17]">
                    Roleplay Evaluation
                  </div>
                  <h2 className="font-display text-lg font-extrabold text-white">
                    {summary.score >= 80
                      ? "¡Enhorabuena! Great Call"
                      : "Solid Madrid Practice"}
                  </h2>
                </div>
                <span
                  className={`font-display text-3xl font-extrabold ${
                    summary.score >= 80 ? "text-emerald-400" : "text-amber-300"
                  }`}
                >
                  {summary.score}%
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                {summary.summaryEn}
              </p>
            </div>

            {/* 3 Corrections saved to Error Notebook */}
            {summary.corrections.length > 0 && (
              <div className="bento-card p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-400">
                    Corrections ({summary.corrections.length})
                  </span>
                  <span className="text-[10px] font-bold text-[#FF4F17]">
                    + Saved to Error Notebook
                  </span>
                </div>
                {summary.corrections.map((c, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl bg-rose-500/10 border border-rose-500/25 p-2.5 text-xs space-y-1"
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

            {/* 3 Useful Madrid Phrases -> FSRS Cards */}
            {summary.usefulPhrases.length > 0 && (
              <div className="bento-card p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17]">
                    3 Useful Madrid Phrases
                  </span>
                  <button
                    type="button"
                    disabled={phrasesAdded}
                    onClick={() => void handleAddUsefulPhrasesToCards()}
                    className={`rounded-full px-3 py-1 text-[10px] font-extrabold flex items-center gap-1 transition ${
                      phrasesAdded
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-[#FF4F17] text-black hover:bg-[#FF6230]"
                    }`}
                  >
                    {phrasesAdded ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>Added to FSRS</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3 h-3" />
                        <span>Add All 3 to Cards</span>
                      </>
                    )}
                  </button>
                </div>

                {summary.usefulPhrases.map((p, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl bg-[#111318] border border-white/[0.06] p-2.5 flex items-start justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-extrabold text-white">
                        {p.es}
                      </div>
                      <div className="font-mono text-[10px] text-[#FF4F17]/85">
                        [{toMadridEnglishPhonetics(p.es)}]
                      </div>
                      <div className="text-[11px] text-zinc-400">{p.en}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void playSpanishAudio({
                          text: p.es,
                          audioSource: "es-ES TTS",
                        })
                      }
                      className="shrink-0 w-7 h-7 rounded-xl bg-white/[0.07] text-[#FF4F17] flex items-center justify-center"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => startScenario(activeScenario)}
              className="w-full rounded-full bg-[#FF4F17] text-black font-extrabold text-xs py-3"
            >
              Replay Scenario
            </button>
          </div>
        ) : (
          <>
            {/* Live Conversation Transcript */}
            <div className="bento-card p-3.5 space-y-3 max-h-[340px] overflow-y-auto">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col space-y-1 ${
                    m.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      m.role === "user"
                        ? "bg-[#FF4F17] text-black font-bold"
                        : "bg-[#1C1F26] text-white border border-white/[0.07]"
                    }`}
                  >
                    <div>{m.text}</div>
                    {m.role === "assistant" && showEnglish && m.en && (
                      <div className="mt-1 text-[11px] text-zinc-400 italic">
                        {m.en}
                      </div>
                    )}
                    {m.role === "assistant" && (
                      <button
                        type="button"
                        onClick={() =>
                          void playSpanishAudio({
                            text: m.text,
                            audioSource: "es-ES TTS",
                          })
                        }
                        title="Replay"
                        aria-label="Replay"
                        className="mt-1.5 w-7 h-7 rounded-full bg-white/[0.08] hover:bg-white/[0.14] flex items-center justify-center text-[#FF4F17] transition"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {m.role === "user" && m.correctionSuggestion && (
                    <div className="max-w-[88%] rounded-xl bg-amber-500/12 border border-amber-400/35 px-2.5 py-1.5 text-[11px] text-amber-200 leading-snug">
                      ✨ {m.correctionSuggestion}
                    </div>
                  )}
                  {m.hintEn && (
                    <div className="text-[10px] text-zinc-400 pl-1">
                      💡 Idea: {m.hintEn}
                    </div>
                  )}
                </div>
              ))}
              {sendingTurn && (
                <div className="text-xs font-semibold text-zinc-400 animate-pulse">
                  {activeScenario.characterName} is replying…
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {missionCompleted && !summary && (
              <div className="rounded-2xl bg-emerald-500/15 border border-emerald-500/45 p-3.5 space-y-2.5 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-300">
                  <Trophy className="w-4 h-4 shrink-0" />
                  <span>🎉 Mission Completed! You achieved the goal.</span>
                </div>
                <button
                  type="button"
                  disabled={endingCall}
                  onClick={() => void handleEndCallAndScore()}
                  className="w-full rounded-full bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold text-xs py-2.5 flex items-center justify-center gap-1.5 shadow-[0_6px_20px_rgba(52,211,153,0.35)] transition"
                >
                  {endingCall ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Calculating Score &amp; Feedback…</span>
                    </>
                  ) : (
                    <span>Finish Mission &amp; Claim +30 XP »</span>
                  )}
                </button>
              </div>
            )}

            {callError && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3 py-2.5 text-xs font-semibold text-rose-300 space-y-2">
                <div>{callError}</div>
                {lastPayloadRef.current && !sendingTurn && (
                  <button
                    type="button"
                    onClick={() => {
                      if (lastPayloadRef.current) {
                        void sendRoleplayTurn(lastPayloadRef.current);
                      }
                    }}
                    className="rounded-lg bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/40 px-3 py-1 text-[11px] font-extrabold text-white transition"
                  >
                    ↻ Retry Last Turn
                  </button>
                )}
              </div>
            )}

            {/* Voice Mic Control + Optional Text Input */}
            <div className="bento-card p-3.5 space-y-3">
              {isRecording && (
                <div className="h-9 flex items-center justify-between gap-[3px] px-2">
                  {liveBars.map((val, idx) => (
                    <div
                      key={idx}
                      className="flex-1 rounded-full bg-[#FF4F17] transition-all duration-100"
                      style={{
                        height: `${Math.max(16, Math.round(val * 100))}%`,
                      }}
                    />
                  ))}
                </div>
              )}

              <button
                type="button"
                disabled={sendingTurn}
                onClick={() => void handleToggleMic()}
                className={`w-full h-12 rounded-full text-sm font-extrabold flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-45 ${
                  isRecording
                    ? "bg-rose-500 text-white animate-pulse shadow-[0_8px_24px_rgba(244,63,94,0.45)]"
                    : "bg-[#FF4F17] hover:bg-[#FF6230] text-black shadow-[0_8px_24px_rgba(255,79,23,0.35)]"
                }`}
              >
                {sendingTurn ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Listening &amp; Replying…</span>
                  </>
                ) : isRecording ? (
                  <>
                    <Square className="w-4 h-4 fill-current" />
                    <span>Stop &amp; Send Voice</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>Tap to Speak in Spanish</span>
                  </>
                )}
              </button>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!typedReply.trim() || sendingTurn) return;
                  const txt = typedReply.trim();
                  setTypedReply("");
                  void sendRoleplayTurn({ userText: txt });
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={typedReply}
                  onChange={(e) => setTypedReply(e.target.value)}
                  placeholder="Or type your Spanish reply (metro mode)…"
                  className="flex-1 rounded-xl bg-[#101216] border border-white/10 px-3 py-2 text-xs font-semibold text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF4F17]"
                />
                <button
                  type="submit"
                  disabled={!typedReply.trim() || sendingTurn}
                  className="rounded-xl bg-white/[0.08] hover:bg-[#FF4F17] text-white hover:text-black px-3 py-2 text-xs font-extrabold disabled:opacity-40 transition"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    );
  }

  // ===================== SCENARIO PICKER VIEW =====================
  return (
    <div className="space-y-3.5 pb-6">
      <div className="flex items-center justify-between pt-1">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF4F17]">
            PHASE 5 · MADRID VOICE ROLEPLAY
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">
            Speak in Madrid
          </h1>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-[#FF4F17]/15 border border-[#FF4F17]/35 flex items-center justify-center text-[#FF4F17]">
          <PhoneCall className="w-5 h-5" />
        </div>
      </div>

      {/* Unified Speak Studio Switcher: Voice Roleplay | Pronunciation */}
      <div className="grid grid-cols-2 gap-1.5 rounded-[20px] bg-[#181A1F] p-1 border border-white/[0.06]">
        <div className="rounded-[14px] py-2 text-center text-xs font-extrabold bg-[#FF4F17] text-black shadow-[0_4px_14px_rgba(255,79,23,0.35)]">
          Voice Roleplay
        </div>
        <Link
          href="/pronunciation"
          className="rounded-[14px] py-2 text-center text-xs font-extrabold text-zinc-400 hover:text-white transition"
        >
          Pronunciation
        </Link>
      </div>

      {/* Daily Voice Minutes Cap Guardrail */}
      <div className="bento-card p-3 flex items-center justify-between gap-2 text-xs">
        <span className="text-zinc-400 font-semibold flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#FF4F17]" />
          Daily Voice Budget
        </span>
        <span
          className={`font-extrabold ${
            isVoiceCapReached ? "text-rose-400" : "text-emerald-300"
          }`}
        >
          {voiceMinutesUsed.toFixed(1)} / {voiceCapMinutes} min today
        </span>
      </div>

      {/* Category Filter Pills */}
      <div className="grid grid-cols-4 gap-1 rounded-[20px] bg-[#181A1F] p-1 border border-white/[0.06]">
        {(["All", "City Boss", "Life in Madrid", "Business"] as const).map(
          (cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-[14px] py-1.5 text-[10px] font-extrabold transition ${
                categoryFilter === cat
                  ? "bg-[#FF4F17] text-black"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {cat === "Life in Madrid" ? "Madrid" : cat}
            </button>
          )
        )}
      </div>

      {/* Scenario Cards */}
      <div className="space-y-2.5">
        {filteredScenarios.map((sc) => (
          <button
            key={sc.id}
            type="button"
            onClick={() => startScenario(sc)}
            className="w-full text-left bento-card p-4 hover:border-[#FF4F17]/45 transition space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg">{sc.emoji}</span>
                <span className="font-display text-sm font-extrabold text-white truncate">
                  {sc.title}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {typeof completedScenarios[sc.id] === "number" && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-[10px] font-extrabold text-emerald-300">
                    ✓ {completedScenarios[sc.id]}%
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-full bg-[#FF4F17]/15 border border-[#FF4F17]/30 text-[10px] font-extrabold text-[#FF4F17]">
                  {sc.weekBoss ? `W${sc.weekBoss} Boss` : sc.cefr}
                </span>
              </div>
            </div>
            <p className="text-xs text-zinc-400 leading-snug">{sc.goalEn}</p>
            <div className="text-[10px] font-bold text-zinc-500">
              {sc.characterName} · {sc.characterRole}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
