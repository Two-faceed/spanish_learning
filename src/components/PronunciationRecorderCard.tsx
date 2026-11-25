"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Mic,
  Play,
  Repeat,
  Square,
  Volume2,
  Sparkles,
} from "lucide-react";
import { playSpanishAudio } from "@/lib/audio/player";
import { toMadridEnglishPhonetics } from "@/lib/audio/phonetics";
import {
  ActiveWavRecorder,
  RecordedAudioResult,
  startWavRecording,
} from "@/lib/audio/recorder";
import {
  PronunciationAssessmentResult,
  PronunciationAttemptRecord,
} from "@/types/database";
import { SPAIN_SOUND_META_MAP } from "@/lib/pronunciation/spain-sounds";
import { offlineDb } from "@/lib/offline/db";

interface PronunciationRecorderCardProps {
  referenceText: string;
  englishTranslation?: string;
  sourceLabel?: string;
  mode: PronunciationAttemptRecord["mode"];
  nativeAudioFilename?: string | null;
  onScored?: (result: PronunciationAssessmentResult) => void;
  compact?: boolean;
}

function scoreColorClass(score: number): string {
  if (score >= 85) return "text-emerald-300 bg-emerald-500/15 border-emerald-500/35";
  if (score >= 65) return "text-amber-300 bg-amber-500/15 border-amber-500/35";
  return "text-rose-300 bg-rose-500/15 border-rose-500/35";
}

function scoreTextClass(score: number): string {
  if (score >= 85) return "text-emerald-400";
  if (score >= 65) return "text-amber-400";
  return "text-rose-400";
}

export function PronunciationRecorderCard({
  referenceText,
  englishTranslation,
  sourceLabel,
  mode,
  nativeAudioFilename,
  onScored,
  compact = false,
}: PronunciationRecorderCardProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isAssessing, setIsAssessing] = useState(false);
  const [isPlayingNative, setIsPlayingNative] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [liveBars, setLiveBars] = useState<number[]>(Array(32).fill(0.12));
  const [recorded, setRecorded] = useState<RecordedAudioResult | null>(null);
  const [result, setResult] = useState<PronunciationAssessmentResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recorderRef = useRef<ActiveWavRecorder | null>(null);

  // Reset state whenever the target sentence changes
  useEffect(() => {
    setResult(null);
    setErrorMsg(null);
    setLiveBars(Array(32).fill(0.12));
    setRecorded((prev) => {
      if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
  }, [referenceText]);

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
    };
  }, []);

  const handlePlayNative = async () => {
    setIsPlayingNative(true);
    try {
      await playSpanishAudio({
        text: referenceText,
        audioFilename: nativeAudioFilename ?? null,
        audioSource: nativeAudioFilename ? "deck" : "es-ES TTS",
      });
    } finally {
      setIsPlayingNative(false);
    }
  };

  const handlePlayOwnRecording = async (url?: string): Promise<void> => {
    const targetUrl = url ?? recorded?.objectUrl;
    if (!targetUrl) return;
    await new Promise<void>((resolve) => {
      const audio = new Audio(targetUrl);
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      void audio.play().catch(() => resolve());
    });
  };

  const handleRecordAndCompare = async () => {
    if (!recorded?.objectUrl || isComparing) return;
    setIsComparing(true);
    try {
      await handlePlayNative();
      await new Promise((r) => setTimeout(r, 320));
      await handlePlayOwnRecording(recorded.objectUrl);
    } finally {
      setIsComparing(false);
    }
  };

  const assessRecordedAudio = async (audio: RecordedAudioResult) => {
    setErrorMsg(null);
    setIsAssessing(true);
    try {
      const res = await fetch("/api/pronunciation/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wavBase64: audio.wavBase64,
          referenceText,
        }),
      });

      const data = (await res.json()) as PronunciationAssessmentResult & {
        error?: string;
      };

      if (!res.ok || data.error) {
        throw new Error(data.error || "Pronunciation assessment failed");
      }

      setResult(data);

      // Save attempt offline in Dexie pron_attempts table
      if (offlineDb) {
        const attempt: PronunciationAttemptRecord = {
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `pron-${Date.now()}`,
          reference_text: referenceText,
          mode,
          engine: data.engine,
          overall: data.overall,
          accuracy: data.accuracy,
          fluency: data.fluency,
          completeness: data.completeness,
          words_phonemes: data.words,
          sound_scores: data.soundScores,
          rhythm_tip: data.rhythmTip,
          created_at: new Date().toISOString(),
        };
        await offlineDb.pron_attempts.put(attempt);
      }

      onScored?.(data);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Could not score recording. Check mic permissions and try again."
      );
    } finally {
      setIsAssessing(false);
    }
  };

  const handleToggleRecord = async () => {
    setErrorMsg(null);

    if (isRecording) {
      const active = recorderRef.current;
      recorderRef.current = null;
      setIsRecording(false);
      if (!active) return;

      const audio = await active.stop();
      setRecorded((prev) => {
        if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
        return audio;
      });
      await assessRecordedAudio(audio);
      return;
    }

    // Start recording
    try {
      setResult(null);
      const rec = await startWavRecording((level) => {
        setLiveBars((prev) => [...prev.slice(1), Math.max(0.1, level)]);
      });
      recorderRef.current = rec;
      setIsRecording(true);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Microphone access denied. Please allow microphone access to score pronunciation."
      );
    }
  };

  const barsToRender = recorded ? recorded.waveformPeaks : liveBars;

  return (
    <div className={`bento-card ${compact ? "p-3.5" : "p-4"} space-y-3.5`}>
      {/* Reference Sentence Header */}
      <div className="space-y-1.5">
        {sourceLabel && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17]">
              {sourceLabel}
            </span>
            {result && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                {result.engine === "azure-es-ES"
                  ? "Azure es-ES Phoneme"
                  : "Gemini es-ES Audio"}
              </span>
            )}
          </div>
        )}

        <p
          className={`font-display font-extrabold text-white leading-snug ${
            compact ? "text-base" : "text-lg"
          }`}
        >
          {referenceText}
        </p>

        <p
          data-phonetic-guide="true"
          className="font-mono text-[11px] font-bold text-[#FF4F17]/90 leading-snug"
        >
          [{toMadridEnglishPhonetics(referenceText)}]
        </p>

        {englishTranslation && (
          <p className="text-xs text-zinc-400 leading-snug">
            {englishTranslation}
          </p>
        )}
      </div>

      {/* Waveform Visualizer */}
      <div className="rounded-2xl bg-[#101216] border border-white/[0.06] px-3 py-3">
        <div className="h-12 flex items-center justify-between gap-[3px]">
          {barsToRender.map((val, idx) => (
            <div
              key={idx}
              className={`flex-1 rounded-full transition-all duration-100 ${
                isRecording
                  ? "bg-[#FF4F17]"
                  : recorded
                    ? "bg-emerald-400/80"
                    : "bg-white/15"
              }`}
              style={{
                height: `${Math.max(12, Math.round(val * 100))}%`,
              }}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] font-semibold text-zinc-500">
          <span>
            {isRecording
              ? "● Recording Madrid Spanish (es-ES)..."
              : isAssessing
                ? "Scoring phonemes & rhythm..."
                : recorded
                  ? `Recorded ${(recorded.durationMs / 1000).toFixed(1)}s`
                  : "1. Listen to native es-ES → 2. Tap Record & Shadow"}
          </span>
          {recorded && <span>16 kHz WAV</span>}
        </div>
      </div>

      {/* Controls Row */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void handlePlayNative()}
          disabled={isPlayingNative || isRecording}
          className="h-11 rounded-2xl bg-[#1C1F26] hover:bg-[#242832] border border-white/[0.08] text-xs font-extrabold text-white flex items-center justify-center gap-1.5 disabled:opacity-50 transition"
        >
          <Volume2 className="w-4 h-4 text-[#FF4F17]" />
          <span>{isPlayingNative ? "Playing..." : "Listen Native"}</span>
        </button>

        <button
          type="button"
          onClick={() => void handleToggleRecord()}
          disabled={isAssessing}
          className={`h-11 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50 ${
            isRecording
              ? "bg-rose-500 text-white shadow-[0_6px_20px_rgba(244,63,94,0.45)] animate-pulse"
              : "bg-[#FF4F17] hover:bg-[#FF6230] text-black shadow-[0_6px_20px_rgba(255,79,23,0.35)]"
          }`}
        >
          {isAssessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Scoring...</span>
            </>
          ) : isRecording ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop & Score</span>
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              <span>{recorded ? "Record Again" : "Record & Score"}</span>
            </>
          )}
        </button>
      </div>

      {/* Record & Compare Back-to-Back Playback */}
      {recorded && !isRecording && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handlePlayOwnRecording()}
            className="h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.07] text-[11px] font-bold text-zinc-200 flex items-center justify-center gap-1.5 transition"
          >
            <Play className="w-3.5 h-3.5 text-emerald-400" />
            <span>Play Mine</span>
          </button>
          <button
            type="button"
            onClick={() => void handleRecordAndCompare()}
            disabled={isComparing}
            className="h-9 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-[11px] font-extrabold text-emerald-300 flex items-center justify-center gap-1.5 transition disabled:opacity-50"
          >
            <Repeat className="w-3.5 h-3.5" />
            <span>{isComparing ? "Comparing..." : "Native → Mine"}</span>
          </button>
        </div>
      )}

      {/* Error Message + Retry Scoring without re-recording */}
      {errorMsg && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3 py-2.5 text-xs font-semibold text-rose-300 space-y-2">
          <div>{errorMsg}</div>
          {recorded && !isAssessing && (
            <button
              type="button"
              onClick={() => void assessRecordedAudio(recorded)}
              className="rounded-lg bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/40 px-3 py-1 text-[11px] font-extrabold text-white transition"
            >
              ↻ Retry Scoring This Recording
            </button>
          )}
        </div>
      )}

      {/* Assessment Results */}
      {result && (
        <div className="space-y-3 pt-2 border-t border-white/[0.07]">
          {/* 4 Metric Tiles */}
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: "Overall", val: result.overall },
              { label: "Accuracy", val: result.accuracy },
              { label: "Fluency", val: result.fluency },
              { label: "Complete", val: result.completeness },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-xl bg-[#101216] border border-white/[0.06] py-2 px-1 text-center"
              >
                <div
                  className={`font-display text-lg font-extrabold ${scoreTextClass(
                    m.val
                  )}`}
                >
                  {m.val}
                </div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                  {m.label}
                </div>
              </div>
            ))}
          </div>

          {/* Per-Word Color-Coded Breakdown */}
          {result.words.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Word & Phoneme Breakdown
              </div>
              <div className="flex flex-wrap gap-1.5">
                {result.words.map((w, idx) => (
                  <div
                    key={`${w.word}-${idx}`}
                    className={`rounded-xl border px-2.5 py-1.5 text-xs ${scoreColorClass(
                      w.accuracy
                    )}`}
                  >
                    <div className="flex items-center gap-1.5 font-extrabold">
                      <span>{w.word}</span>
                      <span className="text-[10px] opacity-85">{w.accuracy}%</span>
                    </div>
                    {w.phonemes.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1 font-mono text-[10px] opacity-90">
                        {w.phonemes.map((ph, pIdx) => (
                          <span
                            key={pIdx}
                            className="px-1 rounded bg-black/25"
                            title={`${ph.phoneme}: ${ph.accuracy}%`}
                          >
                            /{ph.phoneme}/ {ph.accuracy}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Spain Sound Group Scores */}
          {Object.keys(result.soundScores).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(result.soundScores).map(([group, score]) => {
                const meta =
                  SPAIN_SOUND_META_MAP[
                    group as keyof typeof SPAIN_SOUND_META_MAP
                  ];
                if (!meta || typeof score !== "number") return null;
                return (
                  <span
                    key={group}
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold ${scoreColorClass(
                      score
                    )}`}
                  >
                    {meta.symbol}: {score}%
                  </span>
                );
              })}
            </div>
          )}

          {/* Madrid Rhythm & Accent Coaching Tip */}
          <div className="rounded-xl bg-[#FF4F17]/10 border border-[#FF4F17]/30 px-3 py-2 text-xs text-zinc-200 flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[#FF4F17] shrink-0 mt-0.5" />
            <div>
              <span className="font-extrabold text-[#FF4F17]">Madrid Tip: </span>
              {result.rhythmTip}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
