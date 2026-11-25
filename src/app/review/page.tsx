"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronsRight,
  Ear,
  ImagePlus,
  LayoutGrid,
  Mic,
  PlusCircle,
  Sparkles,
  Volume2,
} from "lucide-react";
import {
  CardWithNote,
  FSRSRating,
  Gender,
  LeechMnemonicResult,
  PronunciationAssessmentResult,
} from "@/types/database";
import {
  getOrInitSettings,
  getOrInitTodaySession,
  offlineDb,
} from "@/lib/offline/db";
import {
  buildDailyStudyQueue,
  getStudyWeekNumber,
  spreadSameNoteCards,
} from "@/lib/fsrs/daily-queue";
import { isLeechCard, previewNextIntervals } from "@/lib/fsrs/scheduler";
import {
  buildClozeSentence,
  matchesSpanishTargetAnswer,
} from "@/lib/anki/field-mapping";
import {
  recordCardReviewOfflineFirst,
  scheduleSpeakCardForLowPronunciation,
} from "@/lib/offline/sync-manager";
import { playSpanishAudio } from "@/lib/audio/player";
import { toMadridEnglishPhonetics } from "@/lib/audio/phonetics";
import { PronunciationRecorderCard } from "@/components/PronunciationRecorderCard";

function getGenderColorClass(gender: Gender): string {
  if (gender === "el" || gender === "los") return "gender-el";
  if (gender === "la" || gender === "las") return "gender-la";
  if (gender === "el/la") return "gender-both";
  return "text-white";
}

function getGenderBadge(
  gender: Gender
): { label: string; classes: string } | null {
  if (gender === "el" || gender === "los") {
    return {
      label: `${gender} · masculine`,
      classes: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    };
  }
  if (gender === "la" || gender === "las") {
    return {
      label: `${gender} · feminine`,
      classes: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    };
  }
  if (gender === "el/la") {
    return {
      label: "el/la · common noun",
      classes: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    };
  }
  return null;
}

export default function ReviewPage() {
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<CardWithNote[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [introQueue, setIntroQueue] = useState<CardWithNote[]>([]);
  const [introIndex, setIntroIndex] = useState(0);
  const [inIntroPhase, setInIntroPhase] = useState(false);
  const [pendingNewCards, setPendingNewCards] = useState<CardWithNote[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [selectedGenderDrill, setSelectedGenderDrill] = useState<
    "el" | "la" | null
  >(null);
  const [voiceName, setVoiceName] = useState("es-ES-AlvaroNeural");
  const [audioSourceBadge, setAudioSourceBadge] = useState<string | null>(null);
  const [sessionReviewed, setSessionReviewed] = useState(0);
  const [sessionGoodOrEasy, setSessionGoodOrEasy] = useState(0);
  const [canLearnMore, setCanLearnMore] = useState(false);
  const [showImagePrompt, setShowImagePrompt] = useState(false);
  const [customImageUrl, setCustomImageUrl] = useState("");
  const [leechMnemonic, setLeechMnemonic] =
    useState<LeechMnemonicResult | null>(null);
  const [loadingMnemonic, setLoadingMnemonic] = useState(false);
  const [showSpeakDrawer, setShowSpeakDrawer] = useState(false);
  const [speakFeedbackBanner, setSpeakFeedbackBanner] = useState<string | null>(
    null
  );

  const cardStartTimeRef = useRef<number>(Date.now());
  const introducedNoteIdsRef = useRef<Set<string>>(new Set());

  const loadQueue = useCallback(async () => {
    if (!offlineDb) return;
    setLoading(true);
    try {
      const [notes, cards, settings, session] = await Promise.all([
        offlineDb.notes.toArray(),
        offlineDb.cards.toArray(),
        getOrInitSettings(),
        getOrInitTodaySession(),
      ]);
      setVoiceName(settings.voice);
      const wk = getStudyWeekNumber(settings.start_date);
      const built = buildDailyStudyQueue({
        notes,
        cards,
        weekNumber: wk,
        dailyMinutes: settings.daily_minutes,
        newWordsLearnedToday: session.new_count,
        extraBatchesToday: session.extra_batches,
      });

      const dueSpread = spreadSameNoteCards(built.dueCards);
      const newSpread = spreadSameNoteCards(built.newCards);

      // Deduplicate completely unseen brand-new words (1 intro card per unique unseen note)
      const unseenSet = new Set(built.unseenNoteIds);
      const seenIntroIds = new Set<string>();
      const uniqueIntros: CardWithNote[] = [];
      for (const c of built.newCards) {
        if (
          unseenSet.has(c.note_id) &&
          c.reps === 0 &&
          !introducedNoteIdsRef.current.has(c.note_id) &&
          !seenIntroIds.has(c.note_id)
        ) {
          seenIntroIds.add(c.note_id);
          uniqueIntros.push(c);
        }
      }

      if (dueSpread.length > 0) {
        // 1. Review old due words first, then introduce & practice new words
        setQueue(dueSpread);
        setPendingNewCards(newSpread);
        setIntroQueue(uniqueIntros);
        setIntroIndex(0);
        setInIntroPhase(false);
      } else if (uniqueIntros.length > 0) {
        // 2. No old due words — introduce new words first, then practice them
        setIntroQueue(uniqueIntros);
        setIntroIndex(0);
        setInIntroPhase(true);
        setQueue(newSpread);
        setPendingNewCards([]);
      } else {
        setIntroQueue([]);
        setIntroIndex(0);
        setInIntroPhase(false);
        setQueue(newSpread);
        setPendingNewCards([]);
      }

      setCurrentIndex(0);
      setRevealed(false);
      setTypedAnswer("");
      setSelectedGenderDrill(null);
      setCanLearnMore(built.canLearnTenMore && notes.length > 0);
      cardStartTimeRef.current = Date.now();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const currentIntroCard = inIntroPhase ? (introQueue[introIndex] ?? null) : null;
  const currentCard = !inIntroPhase ? (queue[currentIndex] ?? null) : null;

  const triggerWordAudio = useCallback(
    async (card: CardWithNote) => {
      const res = await playSpanishAudio({
        text: card.note.word,
        audioFilename:
          card.note.audio_word_url ?? card.note.deck_audio_word_url,
        audioSource: card.note.audio_source,
        voice: voiceName,
      });
      setAudioSourceBadge(res.sourceUsed);
    },
    [voiceName]
  );

  const triggerSentenceAudio = useCallback(
    async (card: CardWithNote) => {
      if (!card.note.example_es) return;
      const res = await playSpanishAudio({
        text: card.note.example_es,
        audioFilename:
          card.note.audio_example_url ?? card.note.deck_audio_example_url,
        audioSource: card.note.audio_source,
        voice: voiceName,
      });
      setAudioSourceBadge(res.sourceUsed);
    },
    [voiceName]
  );

  useEffect(() => {
    if (currentIntroCard) {
      void triggerWordAudio(currentIntroCard);
      return;
    }
    if (!currentCard) return;
    if (
      !revealed &&
      (currentCard.type === "recognition" || currentCard.type === "listening")
    ) {
      void triggerWordAudio(currentCard);
    } else if (
      revealed &&
      (currentCard.type === "recall" || currentCard.type === "cloze")
    ) {
      void triggerWordAudio(currentCard);
    }
  }, [currentIntroCard, currentCard, revealed, triggerWordAudio]);

  const handleFinishIntro = () => {
    for (const c of introQueue) {
      introducedNoteIdsRef.current.add(c.note_id);
    }
    setInIntroPhase(false);
    setIntroQueue([]);
    setIntroIndex(0);
    if (pendingNewCards.length > 0) {
      setQueue(pendingNewCards);
      setPendingNewCards([]);
      setCurrentIndex(0);
    }
    setRevealed(false);
    setTypedAnswer("");
    setSelectedGenderDrill(null);
    cardStartTimeRef.current = Date.now();
  };

  const handleNextIntro = () => {
    if (currentIntroCard) {
      introducedNoteIdsRef.current.add(currentIntroCard.note_id);
    }
    const nextIntroIdx = introIndex + 1;
    if (nextIntroIdx < introQueue.length) {
      setIntroIndex(nextIntroIdx);
    } else {
      handleFinishIntro();
    }
  };

  const handleReveal = () => {
    setRevealed(true);
  };

  const handleGrade = async (rating: FSRSRating) => {
    if (!currentCard) return;
    const elapsedMs = Math.max(500, Date.now() - cardStartTimeRef.current);

    await recordCardReviewOfflineFirst(currentCard, rating, elapsedMs);

    setSessionReviewed((prev) => prev + 1);
    if (rating >= 3) {
      setSessionGoodOrEasy((prev) => prev + 1);
    }

    const nextIdx = currentIndex + 1;
    if (nextIdx < queue.length) {
      setCurrentIndex(nextIdx);
      setRevealed(false);
      setTypedAnswer("");
      setSelectedGenderDrill(null);
      setShowImagePrompt(false);
      setLeechMnemonic(null);
      setShowSpeakDrawer(false);
      setSpeakFeedbackBanner(null);
      cardStartTimeRef.current = Date.now();
    } else if (introQueue.length > 0) {
      // Finished due reviews -> now introduce new words before practicing them
      setInIntroPhase(true);
      setIntroIndex(0);
      setRevealed(false);
      setTypedAnswer("");
      setSelectedGenderDrill(null);
      setShowImagePrompt(false);
      setLeechMnemonic(null);
      setShowSpeakDrawer(false);
      setSpeakFeedbackBanner(null);
      cardStartTimeRef.current = Date.now();
    } else if (pendingNewCards.length > 0) {
      setQueue(pendingNewCards);
      setPendingNewCards([]);
      setCurrentIndex(0);
      setRevealed(false);
      setTypedAnswer("");
      setSelectedGenderDrill(null);
      cardStartTimeRef.current = Date.now();
    } else {
      await loadQueue();
    }
  };

  const handleLearnTenMoreBatch = async () => {
    if (!offlineDb) return;
    const session = await getOrInitTodaySession();
    await offlineDb.sessions.put({
      ...session,
      extra_batches: session.extra_batches + 1,
    });
    await loadQueue();
  };

  const handleSaveLeechImage = async () => {
    if (!offlineDb || !currentCard || !customImageUrl.trim()) return;
    const updatedNote = {
      ...currentCard.note,
      image_url: customImageUrl.trim(),
    };
    await offlineDb.notes.put(updatedNote);
    const updatedQueue = [...queue];
    updatedQueue[currentIndex] = {
      ...currentCard,
      note: updatedNote,
    };
    setQueue(updatedQueue);
    setShowImagePrompt(false);
    setCustomImageUrl("");
  };

  const handleFetchLeechMnemonic = async () => {
    if (!currentCard || loadingMnemonic) return;
    setLoadingMnemonic(true);
    try {
      const res = await fetch("/api/tutor/mnemonic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: currentCard.note.word,
          meaning: currentCard.note.meaning,
          gender: currentCard.note.gender,
          pos: currentCard.note.pos,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as LeechMnemonicResult;
        setLeechMnemonic(data);
      }
    } finally {
      setLoadingMnemonic(false);
    }
  };

  const handleReviewSpeakScored = async (
    result: PronunciationAssessmentResult
  ) => {
    if (!currentCard) return;
    if (result.overall < 70) {
      await scheduleSpeakCardForLowPronunciation(currentCard.note, result);
      setSpeakFeedbackBanner(
        `Score ${result.overall}% (<70%) — Scheduled a Speak review card & logged to Error Notebook.`
      );
    } else if (result.overall >= 80 && offlineDb) {
      const sess = await getOrInitTodaySession();
      await offlineDb.sessions.put({
        ...sess,
        xp: sess.xp + 5,
      });
      setSpeakFeedbackBanner(
        `¡Genial! ${result.overall}% Madrid pronunciation (+5 XP).`
      );
    } else {
      setSpeakFeedbackBanner(
        `Scored ${result.overall}% — solid effort! Tap Record Again to hit 80+.`
      );
    }
  };

  if (loading) {
    return (
      <div className="rounded-[28px] bg-[#181A1F] border border-white/[0.06] p-8 text-center text-sm text-zinc-400">
        Loading FSRS queue...
      </div>
    );
  }

  // ===================== PHASE A: NEW WORD INTRO =====================
  if (currentIntroCard) {
    const introNote = currentIntroCard.note;
    const introGenderBadge = getGenderBadge(introNote.gender);
    const isLastIntro = introIndex === introQueue.length - 1;

    return (
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="w-10 h-10 rounded-2xl bg-[#181A1F] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>

          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF4F17]">
              NEW WORD INTRO
            </div>
            <div className="font-display text-xs font-bold text-zinc-300">
              {introIndex + 1} / {introQueue.length}
            </div>
          </div>

          <button
            type="button"
            onClick={handleFinishIntro}
            className="h-10 px-3 rounded-2xl bg-[#181A1F] border border-white/[0.08] text-[11px] font-bold text-zinc-400 hover:text-white transition"
          >
            Skip
          </button>
        </div>

        {/* Intro Progress Bar */}
        <div className="w-full h-1.5 bg-[#181A1F] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#FF4F17] shadow-[0_0_12px_#FF4F17] transition-all duration-300"
            style={{
              width: `${Math.min(
                100,
                ((introIndex + 1) / introQueue.length) * 100
              )}%`,
            }}
          />
        </div>

        {/* Clean Teach Card */}
        <div className="rounded-[28px] bg-[#181A1F] border border-white/[0.07] p-6 shadow-2xl space-y-5 text-center">
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span className="font-mono font-semibold">
              {introNote.freq_rank > 0 ? `RANK #${introNote.freq_rank}` : "PRIORITY WORD"}
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-[#FF4F17]/15 border border-[#FF4F17]/30 text-[#FF4F17] font-bold text-[10px] uppercase">
              Learn First
            </span>
          </div>

          <div className="space-y-1.5 pt-1">
            <h2
              className={`font-display text-4xl font-extrabold tracking-tight ${getGenderColorClass(
                introNote.gender
              )}`}
            >
              {introNote.word}
            </h2>
            <div className="font-mono text-xs font-semibold text-[#FF4F17]/90 tracking-wide">
              [{toMadridEnglishPhonetics(introNote.word)}]
            </div>
            {introGenderBadge && (
              <span
                className={`inline-block mt-1 text-[11px] font-bold px-3 py-0.5 rounded-full border ${introGenderBadge.classes}`}
              >
                {introGenderBadge.label}
              </span>
            )}
          </div>

          <div className="text-xl font-bold text-white border-t border-white/[0.06] pt-4">
            {introNote.meaning}
          </div>

          {introNote.example_es && (
            <div className="bg-[#121418] rounded-2xl p-4 border border-white/[0.05] space-y-1.5 text-left">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-100 leading-relaxed">
                  {introNote.example_es}
                </p>
                <button
                  type="button"
                  onClick={() => void triggerSentenceAudio(currentIntroCard)}
                  title="Listen to example sentence"
                  aria-label="Listen to example sentence"
                  className="shrink-0 w-7 h-7 rounded-xl bg-white/[0.07] hover:bg-[#FF4F17]/20 text-[#FF4F17] flex items-center justify-center transition"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="font-mono text-[11px] text-[#FF4F17]/80">
                [{toMadridEnglishPhonetics(introNote.example_es)}]
              </p>
              {introNote.example_tr && (
                <p className="text-xs text-zinc-400">{introNote.example_tr}</p>
              )}
            </div>
          )}

          <div className="flex items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => void triggerWordAudio(currentIntroCard)}
              title="Hear word"
              aria-label="Hear word"
              className="w-11 h-11 rounded-2xl bg-[#FF4F17]/15 hover:bg-[#FF4F17]/25 text-[#FF4F17] border border-[#FF4F17]/30 flex items-center justify-center transition"
            >
              <Volume2 className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={handleNextIntro}
              className="flex-1 h-11 rounded-2xl bg-[#FF4F17] hover:bg-[#FF6230] text-black font-extrabold text-sm flex items-center justify-center gap-2 shadow-[0_8px_24px_rgba(255,79,23,0.35)] transition active:scale-[0.99]"
            >
              <span>
                {isLastIntro ? "Start Practicing" : "Got it · Next"}
              </span>
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentCard) {
    const accuracyPct =
      sessionReviewed > 0
        ? Math.round((sessionGoodOrEasy / sessionReviewed) * 100)
        : 100;

    return (
      <div className="rounded-[28px] bg-[#181A1F] border border-white/[0.06] p-6 shadow-2xl text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-[#FF4F17] text-black flex items-center justify-center mx-auto shadow-[0_10px_25px_rgba(255,79,23,0.4)]">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-white">
            Sprint Complete!
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            {sessionReviewed > 0
              ? `Completed ${sessionReviewed} cards with ${accuracyPct}% accuracy.`
              : "All due reviews and daily new words are finished."}
          </p>
        </div>

        <button
          onClick={handleLearnTenMoreBatch}
          className="w-full rounded-full bg-[#FF4F17] hover:bg-[#FF6230] text-black font-extrabold text-sm py-2 pl-6 pr-2 flex items-center justify-between shadow-[0_10px_30px_rgba(255,79,23,0.35)] transition"
        >
          <span>Learn 10 More Words?</span>
          <span className="w-10 h-10 rounded-full bg-[#0D0E11] text-[#FF4F17] flex items-center justify-center">
            <PlusCircle className="w-5 h-5" />
          </span>
        </button>

        <Link
          href="/"
          className="block w-full py-3 px-4 rounded-full bg-[#22252C] hover:bg-[#2B2F38] text-zinc-300 font-bold text-xs transition"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const { note } = currentCard;
  const intervals = previewNextIntervals(currentCard);
  const leech = isLeechCard(currentCard);
  const genderBadge = getGenderBadge(note.gender);
  const isFifthCardSpeakPrompt = (currentIndex + 1) % 5 === 0;

  const normalizedTyped = typedAnswer.trim().toLowerCase();
  const matchesTarget = matchesSpanishTargetAnswer(
    typedAnswer,
    note.word,
    note.lemma
  );
  const clozePrompt =
    buildClozeSentence(note.cloze_es, note.example_es, note.lemma, note.word) ||
    `____ (${note.meaning})`;

  return (
    <div className="space-y-3.5">
      {/* Top Squircle Control Header — matches center phone top bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="w-10 h-10 rounded-2xl bg-[#181A1F] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>

        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF4F17]">
            {currentCard.type}
          </div>
          <div className="font-display text-xs font-bold text-zinc-300">
            {currentIndex + 1} / {queue.length}
            {audioSourceBadge && (
              <span className="text-zinc-500 ml-1.5">· {audioSourceBadge}</span>
            )}
          </div>
        </div>

        <Link
          href="/words"
          className="w-10 h-10 rounded-2xl bg-[#181A1F] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white transition"
          title="Browse deck"
        >
          <LayoutGrid className="w-4 h-4" />
        </Link>
      </div>

      {/* Glowing Blaze Orange Progress Bar */}
      <div className="w-full h-1.5 bg-[#181A1F] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#FF4F17] shadow-[0_0_12px_#FF4F17] transition-all duration-300"
          style={{
            width: `${Math.min(
              100,
              ((currentIndex + 1) / queue.length) * 100
            )}%`,
          }}
        />
      </div>

      {/* Every 5th card speak-aloud prompt OR explicit Speak card per SPEC.md */}
      {(isFifthCardSpeakPrompt || currentCard.type === "speak" || showSpeakDrawer) && (
        <div className="space-y-2">
          <div className="rounded-2xl bg-[#FF4F17]/15 border border-[#FF4F17]/35 px-3.5 py-2 flex items-center justify-between text-xs text-orange-200">
            <span className="inline-flex items-center gap-2 font-bold">
              <Mic className="w-4 h-4 text-[#FF4F17]" />
              <span>
                {currentCard.type === "speak"
                  ? "Pronunciation Review Card — Say it aloud in es-ES!"
                  : isFifthCardSpeakPrompt
                    ? "5th-Card Speak Check — Say it aloud in Madrid (es-ES)!"
                    : "Speak-the-Word Practice (es-ES)"}
              </span>
            </span>
            {!isFifthCardSpeakPrompt && currentCard.type !== "speak" && (
              <button
                type="button"
                onClick={() => setShowSpeakDrawer(false)}
                className="text-[11px] font-bold text-zinc-300 hover:text-white"
              >
                Hide
              </button>
            )}
          </div>

          <PronunciationRecorderCard
            compact
            referenceText={
              note.example_es && note.example_es.length <= 120
                ? note.example_es.split(" -- ")[0].trim()
                : note.word
            }
            englishTranslation={note.meaning}
            sourceLabel={`Speak Check · ${note.word}`}
            mode="review_speak"
            nativeAudioFilename={
              note.example_es
                ? (note.audio_example_url ?? note.deck_audio_example_url)
                : (note.audio_word_url ?? note.deck_audio_word_url)
            }
            onScored={(res) => void handleReviewSpeakScored(res)}
          />

          {speakFeedbackBanner && (
            <div className="rounded-xl bg-[#181A1F] border border-[#FF4F17]/40 px-3 py-2 text-xs font-bold text-zinc-200">
              {speakFeedbackBanner}
            </div>
          )}
        </div>
      )}

      {/* Leech warning banner if failed 6+ times */}
      {leech && (
        <div className="rounded-2xl bg-rose-500/15 border border-rose-500/35 p-3 text-xs text-rose-200 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-bold">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              Leech ({currentCard.lapses} lapses)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleFetchLeechMnemonic()}
                disabled={loadingMnemonic}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#FF4F17] text-black text-[11px] font-extrabold"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{loadingMnemonic ? "Thinking..." : "AI Mnemonic"}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowImagePrompt((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#181A1F] border border-white/10 text-rose-200 text-[11px] font-bold"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                <span>Image</span>
              </button>
            </div>
          </div>

          {leechMnemonic && (
            <div className="rounded-xl bg-[#121418] border border-white/10 p-3 space-y-2 text-zinc-200">
              <p className="text-xs font-semibold text-amber-200">
                💡 {leechMnemonic.mnemonic}
              </p>
              {leechMnemonic.examples.map((ex, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-2 text-[11px] border-t border-white/[0.06] pt-1.5"
                >
                  <div>
                    <div className="font-bold text-white">{ex.es}</div>
                    <div className="text-zinc-400">{ex.en}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void playSpanishAudio({
                        text: ex.es,
                        audioSource: "es-ES TTS",
                      })
                    }
                    className="text-[#FF4F17] font-bold shrink-0"
                  >
                    🔊
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showImagePrompt && (
        <div className="rounded-2xl bg-[#181A1F] border border-white/[0.08] p-3 flex gap-2">
          <input
            type="url"
            value={customImageUrl}
            onChange={(e) => setCustomImageUrl(e.target.value)}
            placeholder="Paste image URL for visual mnemonic..."
            className="flex-1 text-xs rounded-xl bg-[#0D0E11] border border-white/10 text-white px-3 py-2"
          />
          <button
            onClick={handleSaveLeechImage}
            className="px-4 py-2 rounded-xl bg-[#FF4F17] text-black text-xs font-extrabold"
          >
            Save
          </button>
        </div>
      )}

      {/* Main Bento Flashcard */}
      <div className="rounded-[28px] bg-[#181A1F] border border-white/[0.07] p-5 shadow-2xl min-h-[340px] flex flex-col justify-between space-y-5">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span className="font-mono">
            {note.freq_rank > 0
              ? `RANK #${note.freq_rank} · P${note.part}`
              : "PRIORITY WORD"}
          </span>
          <div className="flex items-center gap-1.5">
            {!isFifthCardSpeakPrompt &&
              currentCard.type !== "speak" &&
              !showSpeakDrawer && (
                <button
                  type="button"
                  onClick={() => setShowSpeakDrawer(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#FF4F17]/15 hover:bg-[#FF4F17]/25 text-[#FF4F17] border border-[#FF4F17]/30 font-bold text-[11px] transition"
                >
                  <Mic className="w-3 h-3" />
                  <span>Speak</span>
                </button>
              )}
            {note.pos && (
              <span className="px-2.5 py-0.5 rounded-lg bg-[#22252C] text-zinc-300 font-mono text-[11px]">
                {note.pos}
              </span>
            )}
          </div>
        </div>

        {/* Card Front Content by CardType */}
        <div className="space-y-4 my-auto text-center">
          {/* 1. RECOGNITION CARD */}
          {currentCard.type === "recognition" && (
            <>
              <div>
                <h2
                  className={`font-display text-4xl font-extrabold tracking-tight ${getGenderColorClass(
                    note.gender
                  )}`}
                >
                  {note.word}
                </h2>
                <div className="mt-1 font-mono text-xs font-semibold text-[#FF4F17]/90 tracking-wide">
                  [{toMadridEnglishPhonetics(note.word)}]
                </div>
                {genderBadge && (
                  <span
                    className={`inline-block mt-2 text-[11px] font-bold px-3 py-0.5 rounded-full border ${genderBadge.classes}`}
                  >
                    {genderBadge.label}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-center gap-2.5">
                <button
                  onClick={() => void triggerWordAudio(currentCard)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-[#FF4F17]/15 hover:bg-[#FF4F17]/25 text-[#FF4F17] border border-[#FF4F17]/30 text-xs font-bold transition"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>Word</span>
                </button>
                {note.example_es && (
                  <button
                    onClick={() => void triggerSentenceAudio(currentCard)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-[#22252C] hover:bg-[#2B2F38] text-zinc-200 border border-white/[0.06] text-xs font-bold transition"
                  >
                    <Volume2 className="w-4 h-4" />
                    <span>Sentence</span>
                  </button>
                )}
              </div>

              {note.example_es && (
                <div className="bg-[#121418] rounded-2xl p-3.5 border border-white/[0.05] space-y-1">
                  <p className="text-sm text-zinc-200">
                    &ldquo;{note.example_es}&rdquo;
                  </p>
                  <p className="font-mono text-[11px] text-[#FF4F17]/80">
                    [{toMadridEnglishPhonetics(note.example_es)}]
                  </p>
                </div>
              )}
            </>
          )}

          {/* 2. LISTENING CARD */}
          {currentCard.type === "listening" && (
            <div className="py-3 space-y-3">
              <button
                onClick={() => void triggerWordAudio(currentCard)}
                className="w-24 h-24 rounded-full bg-[#FF4F17] hover:bg-[#FF6230] text-black flex flex-col items-center justify-center mx-auto shadow-[0_0_35px_rgba(255,79,23,0.45)] transition"
              >
                <Ear className="w-9 h-9" />
                <span className="text-[10px] font-extrabold mt-1 tracking-wider">
                  LISTEN
                </span>
              </button>
              <p className="text-xs text-zinc-400">
                Tap to replay the Spain (<code className="font-mono">es-ES</code>) audio clip
              </p>
              {note.example_es && (
                <button
                  onClick={() => void triggerSentenceAudio(currentCard)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-[#22252C] hover:bg-[#2B2F38] text-zinc-300 text-xs font-semibold"
                >
                  <Volume2 className="w-3.5 h-3.5 text-[#FF4F17]" />
                  <span>Play Example Sentence</span>
                </button>
              )}
            </div>
          )}

          {/* 3. RECALL CARD */}
          {currentCard.type === "recall" && (
            <>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#FF4F17]">
                  RECALL IN SPAIN SPANISH
                </div>
                <h2 className="font-display text-3xl font-extrabold text-white mt-1">
                  {note.meaning}
                </h2>
                {note.example_tr && (
                  <p className="text-xs text-zinc-400 mt-1.5">
                    &ldquo;{note.example_tr}&rdquo;
                  </p>
                )}
              </div>

              {(note.gender === "el" || note.gender === "la") && !revealed && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-zinc-400">
                    Noun Gender Drill: Pick the article
                  </div>
                  <div className="flex items-center justify-center gap-2.5">
                    {(["el", "la"] as const).map((art) => {
                      const picked = selectedGenderDrill === art;
                      const isCorrect = note.gender === art;
                      return (
                        <button
                          key={art}
                          type="button"
                          onClick={() => setSelectedGenderDrill(art)}
                          className={`px-5 py-2 rounded-2xl font-extrabold text-xs border transition ${
                            picked
                              ? isCorrect
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
                                : "bg-rose-500/20 text-rose-300 border-rose-500/50"
                              : "bg-[#22252C] text-zinc-200 border-white/[0.08] hover:bg-[#2B2F38]"
                          }`}
                        >
                          {art}
                          {picked && (isCorrect ? " ✓" : " ✗")}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {!revealed && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleReveal();
                    }}
                    placeholder="Type Spanish word (or tap Reveal)..."
                    className="w-full rounded-2xl bg-[#101216] border border-white/10 text-white px-4 py-2.5 text-sm text-center focus:outline-none focus:border-[#FF4F17]"
                  />
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {["á", "é", "í", "ó", "ú", "ñ", "ü"].map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setTypedAnswer((prev) => prev + ch)}
                        className="w-8 h-8 rounded-xl bg-[#22252C] hover:bg-[#2B2F38] text-white font-bold text-xs border border-white/[0.06]"
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* 4. CLOZE CARD */}
          {currentCard.type === "cloze" && (
            <>
              <div className="space-y-2.5">
                <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#FF4F17]">
                  COMPLETE THE SENTENCE
                </div>
                <p className="font-display text-lg font-bold text-white bg-[#101216] border border-white/[0.08] rounded-2xl p-4">
                  {clozePrompt}
                </p>
                <p className="text-xs font-semibold text-zinc-400">
                  Meaning:{" "}
                  <span className="text-white font-bold">{note.meaning}</span>
                </p>
                {note.example_tr && (
                  <p className="text-xs text-zinc-500 italic">
                    &ldquo;{note.example_tr}&rdquo;
                  </p>
                )}
              </div>

              {!revealed && (
                <input
                  type="text"
                  value={typedAnswer}
                  onChange={(e) => setTypedAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleReveal();
                  }}
                  placeholder="Type missing Spanish word..."
                  className="w-full rounded-2xl bg-[#101216] border border-white/10 text-white px-4 py-2.5 text-sm text-center focus:outline-none focus:border-[#FF4F17]"
                />
              )}
            </>
          )}

          {/* 5. SPEAK CARD (Phase 3 Pronunciation Review) */}
          {currentCard.type === "speak" && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#FF4F17]">
                SPEAK ALOUD IN MADRID SPANISH
              </div>
              <h2
                className={`font-display text-3xl font-extrabold tracking-tight ${getGenderColorClass(
                  note.gender
                )}`}
              >
                {note.word}
              </h2>
              <div className="font-mono text-xs font-semibold text-[#FF4F17]/90">
                [{toMadridEnglishPhonetics(note.word)}]
              </div>
              <p className="text-xs text-zinc-400">{note.meaning}</p>
            </div>
          )}

          {/* REVEALED ANSWER SECTION */}
          {revealed && (
            <div className="pt-4 border-t border-white/[0.08] space-y-3 text-center">
              {currentCard.type !== "recognition" && (
                <div>
                  <h3
                    className={`font-display text-3xl font-extrabold ${getGenderColorClass(
                      note.gender
                    )}`}
                  >
                    {note.word}
                  </h3>
                  <div className="mt-1 font-mono text-xs font-semibold text-[#FF4F17]/90 tracking-wide">
                    [{toMadridEnglishPhonetics(note.word)}]
                  </div>
                  {genderBadge && (
                    <span
                      className={`inline-block mt-1 text-[11px] font-bold px-3 py-0.5 rounded-full border ${genderBadge.classes}`}
                    >
                      {genderBadge.label}
                    </span>
                  )}
                </div>
              )}

              {typedAnswer.trim().length > 0 && (
                <div
                  className={`inline-block text-xs font-bold px-3.5 py-1 rounded-full ${
                    matchesTarget
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-[#FF4F17]/20 text-orange-200 border border-[#FF4F17]/40"
                  }`}
                >
                  {matchesTarget
                    ? `Exact match: "${typedAnswer.trim()}" ✓`
                    : `You typed: "${typedAnswer.trim()}" → ${note.word}`}
                </div>
              )}

              <div className="font-display text-xl font-extrabold text-white">
                {note.meaning}
              </div>

              {note.example_es && (
                <div className="bg-[#101216] rounded-2xl p-3.5 border border-white/[0.05] space-y-1">
                  <p className="text-sm font-medium text-zinc-200">
                    {note.example_es}
                  </p>
                  <p className="font-mono text-[11px] text-[#FF4F17]/80">
                    [{toMadridEnglishPhonetics(note.example_es)}]
                  </p>
                  {note.example_tr && (
                    <p className="text-xs text-zinc-400">{note.example_tr}</p>
                  )}
                </div>
              )}

              {note.image_url && (
                <div className="pt-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={note.image_url}
                    alt={note.word}
                    className="max-h-28 rounded-2xl mx-auto object-contain border border-white/10"
                  />
                </div>
              )}

              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  onClick={() => void triggerWordAudio(currentCard)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-[#FF4F17]/15 hover:bg-[#FF4F17]/25 text-[#FF4F17] border border-[#FF4F17]/30 text-xs font-bold"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Replay Word</span>
                </button>
                {note.example_es && (
                  <button
                    onClick={() => void triggerSentenceAudio(currentCard)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-[#22252C] hover:bg-[#2B2F38] text-zinc-300 text-xs font-bold"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Replay Sentence</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Action: Signature Orange Pill vs 4 FSRS Rating Buttons */}
        <div className="pt-2">
          {!revealed ? (
            <button
              onClick={handleReveal}
              className="w-full rounded-full bg-[#FF4F17] hover:bg-[#FF6230] text-black font-extrabold text-sm py-2 pl-6 pr-2 flex items-center justify-between shadow-[0_10px_30px_rgba(255,79,23,0.35)] transition"
            >
              <span>Show Answer</span>
              <span className="w-10 h-10 rounded-full bg-[#0D0E11] text-[#FF4F17] flex items-center justify-center">
                <ChevronsRight className="w-5 h-5" />
              </span>
            </button>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => void handleGrade(1)}
                className="py-3 px-2 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 flex flex-col items-center justify-center transition"
              >
                <span className="text-xs font-extrabold">Again</span>
                <span className="text-[10px] opacity-80 mt-0.5">
                  {intervals[1]}
                </span>
              </button>

              <button
                onClick={() => void handleGrade(2)}
                className="py-3 px-2 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 flex flex-col items-center justify-center transition"
              >
                <span className="text-xs font-extrabold">Hard</span>
                <span className="text-[10px] opacity-80 mt-0.5">
                  {intervals[2]}
                </span>
              </button>

              <button
                onClick={() => void handleGrade(3)}
                className="py-3 px-2 rounded-2xl bg-[#FF4F17] hover:bg-[#FF6230] text-black flex flex-col items-center justify-center shadow-[0_6px_20px_rgba(255,79,23,0.3)] transition"
              >
                <span className="text-xs font-extrabold">Good</span>
                <span className="text-[10px] font-bold opacity-80 mt-0.5">
                  {intervals[3]}
                </span>
              </button>

              <button
                onClick={() => void handleGrade(4)}
                className="py-3 px-2 rounded-2xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-sky-300 flex flex-col items-center justify-center transition"
              >
                <span className="text-xs font-extrabold">Easy</span>
                <span className="text-[10px] opacity-80 mt-0.5">
                  {intervals[4]}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer legend */}
      <div className="flex items-center justify-between text-[11px] text-zinc-500 px-1">
        <span>
          Gender: <strong className="text-sky-400">el (blue)</strong> ·{" "}
          <strong className="text-rose-400">la (coral)</strong>
        </span>
        {canLearnMore && (
          <button
            onClick={handleLearnTenMoreBatch}
            className="text-[#FF4F17] font-bold inline-flex items-center gap-1 hover:underline"
          >
            <Sparkles className="w-3 h-3" />
            +10 more words
          </button>
        )}
      </div>
    </div>
  );
}
