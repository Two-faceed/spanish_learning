"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  FileText,
  Globe,
  Languages,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Square,
  Trash2,
  Trophy,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import { getOrInitTodaySession, offlineDb } from "@/lib/offline/db";
import {
  mineWordFromReadingOfflineFirst,
  setWordKnowledgeStatusOffline,
} from "@/lib/offline/sync-manager";
import { scheduleBackgroundProgressPush } from "@/lib/offline/backup";
import { playSpanishAudio } from "@/lib/audio/player";
import { toMadridEnglishPhonetics } from "@/lib/audio/phonetics";
import {
  lookupBuiltInSpanishWord,
  WordLookupEntry,
} from "@/lib/tutor/word-dictionary";
import {
  buildVocabularyStatusMap,
  computeComprehensionStats,
  countWordsInText,
  lookupWordStatus,
  normalizeSpanishWord,
  paginateSentences,
  splitIntoSentences,
  STARTER_MADRID_TEXTS,
  tokenizeSentence,
} from "@/lib/reading/tokenizer";
import { parseEpubFile, parseTxtFile } from "@/lib/reading/importers";
import {
  ReadingTextRecord,
  ReadingTextType,
  WordKnowledgeStatus,
} from "@/types/database";

type ReadHubTab = "library" | "generate" | "import";

interface TappedWordState {
  word: string;
  normalized: string;
  sentence: string;
  currentStatus: WordKnowledgeStatus;
}

const TRANSLATION_CACHE_KEY = "spanishx_reading_translations_v1";

function normalizeTranslationKey(sentence: string): string {
  return sentence.trim().replace(/\s+/g, " ");
}

function loadTranslationCache(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TRANSLATION_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function saveTranslationCache(cache: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    const entries = Object.entries(cache);
    const trimmed =
      entries.length > 1500
        ? Object.fromEntries(entries.slice(entries.length - 1500))
        : cache;
    window.localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore storage quota errors
  }
}

const TOPIC_SUGGESTIONS = [
  "Tech startup meeting in Madrid",
  "Tapas bar with friends in La Latina",
  "Weekend high-speed train to Valencia",
  "Football night at the stadium",
  "Opening a bank account in Spain",
  "Cooking tortilla de patatas at home",
];

function comprehensionBadgeClass(pct: number): string {
  if (pct >= 90) {
    return "bg-emerald-500/15 text-emerald-300 border-emerald-500/35";
  }
  if (pct >= 75) {
    return "bg-amber-500/15 text-amber-300 border-amber-500/35";
  }
  return "bg-sky-500/15 text-sky-300 border-sky-500/35";
}

function wordColorClass(status: WordKnowledgeStatus, selected: boolean): string {
  const ring = selected ? "ring-2 ring-[#FF4F17] rounded-md" : "";
  if (status === "new") {
    return `bg-sky-500/15 text-sky-200 border-b border-sky-400/50 rounded-[4px] px-0.5 hover:bg-sky-500/30 transition cursor-pointer ${ring}`;
  }
  if (status === "learning") {
    return `bg-amber-500/15 text-amber-200 border-b border-amber-400/50 rounded-[4px] px-0.5 hover:bg-amber-500/30 transition cursor-pointer ${ring}`;
  }
  if (status === "ignored") {
    return `text-zinc-400 hover:text-white transition cursor-pointer ${ring}`;
  }
  return `text-zinc-100 hover:bg-white/10 rounded-[4px] transition cursor-pointer ${ring}`;
}

export default function ReadPage() {
  const [hubTab, setHubTab] = useState<ReadHubTab>("library");
  const [loading, setLoading] = useState(true);
  const [texts, setTexts] = useState<ReadingTextRecord[]>([]);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [statusMap, setStatusMap] = useState<Map<string, WordKnowledgeStatus>>(
    () => new Map()
  );

  // Tap-to-Mine Bottom Sheet state
  const [tapped, setTapped] = useState<TappedWordState | null>(null);
  const [lookup, setLookup] = useState<WordLookupEntry | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [actionBanner, setActionBanner] = useState<string | null>(null);

  // Sentence-by-sentence Read-Aloud state
  const [readingSentenceIdx, setReadingSentenceIdx] = useState<number | null>(
    null
  );
  const [isAutoReading, setIsAutoReading] = useState(false);
  const autoReadStopRef = useRef(false);

  // Per-section & page-wide English translation state (cached in localStorage)
  const [translationCache, setTranslationCache] = useState<
    Record<string, string>
  >(() => loadTranslationCache());
  const [revealedSections, setRevealedSections] = useState<
    Record<string, boolean>
  >({});
  const [translatingKeys, setTranslatingKeys] = useState<
    Record<string, boolean>
  >({});
  const [translationError, setTranslationError] = useState<string | null>(null);

  // Step 4.2: Import state (EPUB / TXT / URL / Paste)
  const [importUrl, setImportUrl] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteContent, setPasteContent] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Step 4.3: Personalized AI Graded Reader Generator state
  const [genTopic, setGenTopic] = useState("");
  const [genLength, setGenLength] = useState<"short" | "medium" | "long">(
    "medium"
  );
  const [genStyle, setGenStyle] = useState<"story" | "article" | "dialogue">(
    "story"
  );
  const [genCefr, setGenCefr] = useState<"A1" | "A1-A2" | "A2" | "B1">("A1-A2");
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const [xpToast, setXpToast] = useState<string | null>(null);

  const loadLibraryAndVocab = useCallback(async () => {
    if (!offlineDb) {
      setTexts(STARTER_MADRID_TEXTS);
      setLoading(false);
      return;
    }

    try {
      let storedTexts = await offlineDb.texts
        .orderBy("updated_at")
        .reverse()
        .toArray();

      if (storedTexts.length === 0) {
        await offlineDb.texts.bulkPut(STARTER_MADRID_TEXTS);
        storedTexts = [...STARTER_MADRID_TEXTS];
      }

      const [notes, cards, explicitStatuses] = await Promise.all([
        offlineDb.notes.toArray(),
        offlineDb.cards.toArray(),
        offlineDb.word_status.toArray(),
      ]);

      const builtMap = buildVocabularyStatusMap(notes, cards, explicitStatuses);
      setStatusMap(builtMap);
      setTexts(storedTexts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLibraryAndVocab();
  }, [loadLibraryAndVocab]);

  useEffect(() => {
    return () => {
      autoReadStopRef.current = true;
    };
  }, []);

  const vocabBuckets = useMemo(() => {
    const known: string[] = [];
    const learning: string[] = [];
    for (const [word, st] of statusMap.entries()) {
      if (st === "known") known.push(word);
      else if (st === "learning") learning.push(word);
    }
    return { known, learning };
  }, [statusMap]);

  const activeText = useMemo(
    () => texts.find((t) => t.id === activeTextId) ?? null,
    [texts, activeTextId]
  );

  const activeSentences = useMemo(
    () => (activeText ? splitIntoSentences(activeText.content) : []),
    [activeText]
  );

  const activePages = useMemo(
    () => paginateSentences(activeSentences, 160),
    [activeSentences]
  );

  const totalPages = Math.max(1, activePages.length);
  const safePageIdx = Math.max(0, Math.min(currentPage, totalPages - 1));
  const currentPageSentences = activePages[safePageIdx] ?? [];

  const activeStats = useMemo(
    () =>
      activeText
        ? computeComprehensionStats(activeText.content, statusMap)
        : null,
    [activeText, statusMap]
  );

  const openTextFromLibrary = (text: ReadingTextRecord) => {
    setActiveTextId(text.id);
    setCurrentPage(text.current_page ?? 0);
    setTapped(null);
    setReadingSentenceIdx(null);
    setRevealedSections({});
    setTranslationError(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const persistPageProgress = useCallback(
    async (pageIndex: number) => {
      if (!activeText) return;
      const clamped = Math.max(0, Math.min(pageIndex, totalPages - 1));
      setCurrentPage(clamped);
      autoReadStopRef.current = true;
      setIsAutoReading(false);
      setReadingSentenceIdx(null);
      setTapped(null);
      setRevealedSections({});
      setTranslationError(null);

      const nextProgress = Math.round(((clamped + 1) / totalPages) * 100);
      const updated: ReadingTextRecord = {
        ...activeText,
        current_page: clamped,
        progress: Math.max(activeText.progress ?? 0, nextProgress),
        comprehension_pct:
          activeStats?.comprehensionPct ?? activeText.comprehension_pct,
        updated_at: new Date().toISOString(),
      };

      if (offlineDb) {
        await offlineDb.texts.put(updated);
        scheduleBackgroundProgressPush();
      }
      setTexts((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [activeStats?.comprehensionPct, activeText, totalPages]
  );

  const saveAndOpenText = async (input: {
    title: string;
    content: string;
    type: ReadingTextType;
    topic?: string;
    sourceUrl?: string;
    targetWords?: string[];
  }) => {
    const nowIso = new Date().toISOString();
    const stats = computeComprehensionStats(input.content, statusMap);
    const record: ReadingTextRecord = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `text-${Date.now()}`,
      title: input.title.trim() || "Untitled Spanish Text",
      type: input.type,
      content: input.content.trim(),
      source_url: input.sourceUrl ?? null,
      topic: input.topic ?? null,
      target_words: input.targetWords ?? [],
      current_page: 0,
      progress: 0,
      comprehension_pct: stats.comprehensionPct,
      word_count: countWordsInText(input.content),
      created_at: nowIso,
      updated_at: nowIso,
    };

    if (offlineDb) {
      await offlineDb.texts.put(record);
      scheduleBackgroundProgressPush();
    }
    setTexts((prev) => [record, ...prev]);
    setHubTab("library");
    setCurrentPage(0);
    setActiveTextId(record.id);
  };

  const handleDeleteText = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (offlineDb) {
      await offlineDb.texts.delete(id);
    }
    setTexts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportBusy(true);
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".epub")) {
        const res = await parseEpubFile(file);
        await saveAndOpenText({
          title: res.title,
          content: res.content,
          type: "book",
          topic: "Imported EPUB",
        });
      } else if (lower.endsWith(".txt")) {
        const res = await parseTxtFile(file);
        await saveAndOpenText({
          title: res.title,
          content: res.content,
          type: "book",
          topic: "Imported TXT",
        });
      } else {
        setImportError("Please choose an .epub or .txt file.");
      }
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Failed to import file."
      );
    } finally {
      setImportBusy(false);
      e.target.value = "";
    }
  };

  const handleImportUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim() || importBusy) return;
    setImportError(null);
    setImportBusy(true);
    try {
      const res = await fetch("/api/reading/extract-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const data = (await res.json()) as {
        title?: string;
        content?: string;
        sourceUrl?: string;
        error?: string;
      };
      if (!res.ok || data.error || !data.content) {
        throw new Error(data.error || "Could not extract article text");
      }
      setImportUrl("");
      await saveAndOpenText({
        title: data.title || "Spanish Web Article",
        content: data.content,
        type: "article",
        topic: "Web Article",
        sourceUrl: data.sourceUrl,
      });
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "URL extraction failed."
      );
    } finally {
      setImportBusy(false);
    }
  };

  const handlePasteImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteContent.trim() || importBusy) return;
    setImportError(null);
    await saveAndOpenText({
      title: pasteTitle.trim() || "Pasted Spanish Text",
      content: pasteContent.trim(),
      type: "article",
      topic: "Pasted Text",
    });
    setPasteTitle("");
    setPasteContent("");
  };

  const handleGenerateGradedReader = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genTopic.trim() || genBusy) return;
    setGenError(null);
    setGenBusy(true);
    try {
      const res = await fetch("/api/reading/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: genTopic.trim(),
          length: genLength,
          style: genStyle,
          cefr: genCefr,
          knownWords: vocabBuckets.known.slice(0, 70),
          learningWords: vocabBuckets.learning.slice(0, 25),
        }),
      });
      const data = (await res.json()) as {
        title?: string;
        content?: string;
        targetWords?: string[];
        error?: string;
      };
      if (!res.ok || data.error || !data.content) {
        throw new Error(data.error || "Failed to generate text");
      }
      await saveAndOpenText({
        title: data.title || `Lectura: ${genTopic.trim()}`,
        content: data.content,
        type: "generated",
        topic: genTopic.trim(),
        targetWords: data.targetWords ?? [],
      });
      setGenTopic("");
    } catch (err) {
      setGenError(
        err instanceof Error ? err.message : "Could not generate Spanish text."
      );
    } finally {
      setGenBusy(false);
    }
  };

  const handleTapWord = async (rawWord: string, sentence: string) => {
    const normalized = normalizeSpanishWord(rawWord);
    if (!normalized) return;
    const currentStatus = lookupWordStatus(normalized, statusMap);

    setTapped({
      word: rawWord,
      normalized,
      sentence,
      currentStatus,
    });
    setActionBanner(null);
    setLookup(null);

    const builtIn = lookupBuiltInSpanishWord(rawWord);
    if (builtIn) {
      setLookup(builtIn);
      setLookupLoading(false);
      return;
    }

    if (offlineDb) {
      const notes = await offlineDb.notes.toArray();
      const matched = notes.find((n) => {
        const stripped = n.word
          .trim()
          .toLowerCase()
          .replace(/^(el|la|los|las|un|una)\s+/i, "");
        return (
          stripped === normalized || n.lemma.trim().toLowerCase() === normalized
        );
      });
      if (matched) {
        setLookup({
          direction: "es-to-en",
          word: matched.word,
          lemma: matched.lemma || normalized,
          pos: matched.pos || "word",
          gender:
            matched.gender === "el" ||
            matched.gender === "la" ||
            matched.gender === "el/la"
              ? matched.gender
              : null,
          meaning: matched.meaning,
          example_es: matched.example_es || sentence,
          example_tr: matched.example_tr,
          sourceBadge: "deck",
        });
        setLookupLoading(false);
        return;
      }
    }

    setLookupLoading(true);
    try {
      const res = await fetch("/api/tutor/word-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: rawWord,
          contextSentence: sentence,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as WordLookupEntry;
        setLookup(data);
      }
    } catch {
      // Offline fallback
    } finally {
      setLookupLoading(false);
    }
  };

  const applyLocalStatus = (lemma: string, status: WordKnowledgeStatus) => {
    const next = new Map(statusMap);
    const norm = normalizeSpanishWord(lemma);
    if (norm) next.set(norm, status);
    if (tapped?.normalized) next.set(tapped.normalized, status);
    setStatusMap(next);
    if (tapped) {
      setTapped({ ...tapped, currentStatus: status });
    }
  };

  const handleMineToTomorrow = async () => {
    if (!tapped) return;
    const lemma = lookup?.lemma || tapped.normalized;
    const meaning = lookup?.meaning || "Mined from reading";

    const res = await mineWordFromReadingOfflineFirst({
      word: lookup?.word || tapped.word,
      lemma,
      meaning,
      sentenceEs: tapped.sentence,
      sentenceTr: lookup?.example_tr,
      pos: lookup?.pos ?? "word",
      gender:
        lookup?.gender === "el" ||
        lookup?.gender === "la" ||
        lookup?.gender === "el/la"
          ? lookup.gender
          : null,
      textId: activeText?.id ?? null,
    });

    applyLocalStatus(lemma, "learning");
    setActionBanner(
      res.promotedExisting
        ? "Promoted existing deck word to tomorrow's queue!"
        : "Added to tomorrow's FSRS queue with this sentence!"
    );
  };

  const handleMarkStatus = async (status: "known" | "ignored") => {
    if (!tapped) return;
    const lemma = lookup?.lemma || tapped.normalized;
    await setWordKnowledgeStatusOffline({
      lemma,
      status,
      textId: activeText?.id ?? null,
    });
    if (tapped.normalized !== lemma) {
      await setWordKnowledgeStatusOffline({
        lemma: tapped.normalized,
        status,
        textId: activeText?.id ?? null,
      });
    }
    applyLocalStatus(lemma, status);
    setActionBanner(
      status === "known" ? "Marked as Known ✓" : "Ignored in comprehension stats"
    );
  };

  const handleSpeakSentence = async (sentence: string, idx: number) => {
    autoReadStopRef.current = true;
    setIsAutoReading(false);
    setReadingSentenceIdx(idx);
    try {
      await playSpanishAudio({
        text: sentence,
        audioSource: "es-ES TTS",
      });
    } finally {
      setReadingSentenceIdx(null);
    }
  };

  const fetchMissingTranslations = useCallback(
    async (sentences: string[]) => {
      const missing: { key: string; text: string }[] = [];
      const seen = new Set<string>();
      for (const s of sentences) {
        const key = normalizeTranslationKey(s);
        if (!key || seen.has(key) || translationCache[key]) continue;
        seen.add(key);
        missing.push({ key, text: s });
      }
      if (missing.length === 0) return;

      setTranslationError(null);
      setTranslatingKeys((prev) => {
        const next = { ...prev };
        for (const m of missing) next[m.key] = true;
        return next;
      });

      try {
        const res = await fetch("/api/reading/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sentences: missing.map((m) => m.text) }),
        });
        const data = (await res.json()) as {
          translations?: string[];
          error?: string;
        };
        if (!res.ok || !Array.isArray(data.translations)) {
          throw new Error(data.error || "Could not translate right now.");
        }

        setTranslationCache((prev) => {
          const next = { ...prev };
          missing.forEach((m, i) => {
            const tr = data.translations?.[i]?.trim();
            if (tr) next[m.key] = tr;
          });
          saveTranslationCache(next);
          return next;
        });
      } catch (err) {
        setTranslationError(
          err instanceof Error ? err.message : "Translation failed."
        );
      } finally {
        setTranslatingKeys((prev) => {
          const next = { ...prev };
          for (const m of missing) delete next[m.key];
          return next;
        });
      }
    },
    [translationCache]
  );

  const allPageTranslationsOpen =
    currentPageSentences.length > 0 &&
    currentPageSentences.every(
      (_, idx) => revealedSections[`${safePageIdx}-${idx}`]
    );

  const handleToggleSectionTranslation = (sentence: string, idx: number) => {
    const slotKey = `${safePageIdx}-${idx}`;
    const willOpen = !revealedSections[slotKey];
    setRevealedSections((prev) => ({ ...prev, [slotKey]: willOpen }));
    if (willOpen) {
      void fetchMissingTranslations([sentence]);
    }
  };

  const handleToggleAllPageTranslations = () => {
    const willOpen = !allPageTranslationsOpen;
    const next: Record<string, boolean> = {};
    currentPageSentences.forEach((_, idx) => {
      next[`${safePageIdx}-${idx}`] = willOpen;
    });
    setRevealedSections(next);
    if (willOpen) {
      void fetchMissingTranslations(currentPageSentences);
    }
  };

  const handleToggleAutoRead = async () => {
    if (isAutoReading) {
      autoReadStopRef.current = true;
      setIsAutoReading(false);
      setReadingSentenceIdx(null);
      return;
    }

    autoReadStopRef.current = false;
    setIsAutoReading(true);
    const startIdx = readingSentenceIdx ?? 0;

    for (let i = startIdx; i < currentPageSentences.length; i++) {
      if (autoReadStopRef.current) break;
      setReadingSentenceIdx(i);
      await playSpanishAudio({
        text: currentPageSentences[i],
        audioSource: "es-ES TTS",
      });
      if (autoReadStopRef.current) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    setIsAutoReading(false);
    setReadingSentenceIdx(null);
  };

  const handleFinishText = async () => {
    if (!activeText || !offlineDb) return;
    const earnedXp = Math.max(1, Math.round(activeText.word_count / 100));
    const sess = await getOrInitTodaySession();
    await offlineDb.sessions.put({
      ...sess,
      xp: sess.xp + earnedXp,
      minutes: sess.minutes + 5,
    });

    const updated: ReadingTextRecord = {
      ...activeText,
      progress: 100,
      comprehension_pct:
        activeStats?.comprehensionPct ?? activeText.comprehension_pct,
      updated_at: new Date().toISOString(),
    };
    await offlineDb.texts.put(updated);
    setTexts((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setXpToast(`+${earnedXp} XP · Finished "${activeText.title}"!`);
    setTimeout(() => setXpToast(null), 3500);
  };

  if (loading) {
    return (
      <div className="bento-card p-8 text-center text-sm text-zinc-400">
        Loading Madrid Reading Studio...
      </div>
    );
  }

  // ===================== READER VIEW =====================
  if (activeText) {
    return (
      <div className="space-y-3.5 pb-12">
        {/* Top Reader Bar */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              autoReadStopRef.current = true;
              setIsAutoReading(false);
              setReadingSentenceIdx(null);
              setTapped(null);
              setActiveTextId(null);
            }}
            className="h-9 px-3 rounded-2xl bg-[#181A1F] border border-white/[0.08] text-xs font-bold text-zinc-200 hover:text-white flex items-center gap-1 transition"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Library</span>
          </button>

          <div className="flex items-center gap-1.5">
            {activeStats && (
              <span
                title="Estimated comprehension (recommended: 90–98%)"
                className={`px-2.5 py-1 rounded-full border text-[11px] font-extrabold ${comprehensionBadgeClass(
                  activeStats.comprehensionPct
                )}`}
              >
                {activeStats.comprehensionPct}% known
              </span>
            )}

            <button
              type="button"
              onClick={handleToggleAllPageTranslations}
              title={
                allPageTranslationsOpen
                  ? "Hide all section translations"
                  : "Show all section translations"
              }
              aria-label={
                allPageTranslationsOpen
                  ? "Hide all section translations"
                  : "Show all section translations"
              }
              className={`h-9 w-9 rounded-2xl border flex items-center justify-center transition ${
                allPageTranslationsOpen
                  ? "bg-[#FF4F17]/20 border-[#FF4F17]/60 text-[#FF4F17]"
                  : "bg-[#181A1F] border-white/[0.08] text-zinc-300 hover:text-white"
              }`}
            >
              <Languages className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => void handleToggleAutoRead()}
              className={`h-9 px-3 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                isAutoReading
                  ? "bg-rose-500 text-white"
                  : "bg-[#FF4F17] hover:bg-[#FF6230] text-black"
              }`}
            >
              {isAutoReading ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Read Aloud</span>
                </>
              )}
            </button>
          </div>
        </div>

        {xpToast && (
          <div className="rounded-2xl bg-emerald-500/15 border border-emerald-500/35 px-3.5 py-2 text-xs font-extrabold text-emerald-300 flex items-center gap-2">
            <Trophy className="w-4 h-4 shrink-0" />
            <span>{xpToast}</span>
          </div>
        )}

        {/* Title + Colour Legend + Optional Target Words */}
        <div className="bento-card p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17]">
              {activeText.topic || activeText.type} · {activeText.word_count} words
            </span>
            {activeStats && (
              <span className="text-[10px] font-bold text-zinc-400">
                {activeStats.newCount} new · {activeStats.learningCount} learning
              </span>
            )}
          </div>
          <h1 className="font-display text-xl font-extrabold text-white leading-tight">
            {activeText.title}
          </h1>

          {activeText.target_words && activeText.target_words.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {activeText.target_words.map((tw) => (
                <span
                  key={tw}
                  className="px-2 py-0.5 rounded-full bg-[#FF4F17]/15 border border-[#FF4F17]/30 text-[10px] font-extrabold text-[#FF4F17]"
                >
                  ★ {tw}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1 text-[10px] font-bold text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-sky-400/70" />
              New
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-400/70" />
              Learning
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-zinc-200/80" />
              Known
            </span>
            <span className="ml-auto text-[#FF4F17] font-extrabold">
              Page {safePageIdx + 1} / {totalPages}
            </span>
          </div>

          {/* Reading Progress Bar */}
          {totalPages > 1 && (
            <div className="space-y-1 pt-0.5">
              <div className="w-full h-1.5 rounded-full bg-[#101216] overflow-hidden border border-white/[0.05]">
                <div
                  className="h-full bg-[#FF4F17] transition-all duration-300"
                  style={{
                    width: `${Math.round(((safePageIdx + 1) / totalPages) * 100)}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-zinc-500">
                <span>
                  {Math.round(((safePageIdx + 1) / totalPages) * 100)}% through
                  book (auto-saved)
                </span>
                <span>Tap any word to mine</span>
              </div>
            </div>
          )}
        </div>

        {/* Colour-Coded Current Page Sentences with Tap-to-Repeat Audio & Section Translations */}
        <div
          data-reader-custom-tap="true"
          className="bento-card p-4 space-y-3"
        >
          {translationError && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-xs text-rose-300 flex items-center justify-between gap-2">
              <span>{translationError}</span>
              <button
                type="button"
                onClick={() => setTranslationError(null)}
                className="text-rose-200 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {currentPageSentences.map((sentence, sIdx) => {
            const tokens = tokenizeSentence(sentence);
            const isSpeaking = readingSentenceIdx === sIdx;
            const slotKey = `${safePageIdx}-${sIdx}`;
            const trKey = normalizeTranslationKey(sentence);
            const isTrOpen = Boolean(revealedSections[slotKey]);
            const trText = translationCache[trKey];
            const isTrLoading = Boolean(translatingKeys[trKey]);

            return (
              <div
                key={slotKey}
                className={`rounded-2xl p-2.5 border transition ${
                  isSpeaking
                    ? "bg-[#FF4F17]/15 border-[#FF4F17]/45"
                    : isTrOpen
                      ? "bg-[#121419]/85 border-[#FF4F17]/30"
                      : "bg-[#121419]/70 border-white/[0.04]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[15px] leading-relaxed font-medium text-zinc-100">
                    {tokens.map((tok, tIdx) => {
                      if (!tok.isWord) {
                        return (
                          <React.Fragment key={tIdx}>{tok.text}</React.Fragment>
                        );
                      }
                      const status = lookupWordStatus(tok.normalized, statusMap);
                      const isSelected =
                        tapped?.normalized === tok.normalized &&
                        tapped?.sentence === sentence;
                      return (
                        <span
                          key={tIdx}
                          onClick={() => void handleTapWord(tok.text, sentence)}
                          className={wordColorClass(status, isSelected)}
                        >
                          {tok.text}
                        </span>
                      );
                    })}
                  </p>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleSectionTranslation(sentence, sIdx)
                      }
                      title={
                        isTrOpen
                          ? "Hide translation for this section"
                          : "Show translation for this section"
                      }
                      aria-label={
                        isTrOpen
                          ? "Hide translation for this section"
                          : "Show translation for this section"
                      }
                      className={`w-7 h-7 rounded-xl flex items-center justify-center border transition ${
                        isTrOpen
                          ? "bg-[#FF4F17]/20 text-[#FF4F17] border-[#FF4F17]/55"
                          : "bg-white/[0.05] hover:bg-[#FF4F17]/15 text-zinc-400 hover:text-[#FF4F17] border-white/[0.07]"
                      }`}
                    >
                      <Languages className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleSpeakSentence(sentence, sIdx)}
                      title="Hear this sentence in Madrid Spanish (es-ES)"
                      className={`w-7 h-7 rounded-xl flex items-center justify-center border transition ${
                        isSpeaking
                          ? "bg-[#FF4F17] text-black border-[#FF4F17]"
                          : "bg-white/[0.05] hover:bg-[#FF4F17]/20 text-[#FF4F17] border-white/[0.07]"
                      }`}
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isTrOpen && (
                  <div className="mt-2 pt-2 border-t border-white/[0.07] text-xs leading-relaxed text-zinc-300">
                    {isTrLoading && !trText ? (
                      <span className="inline-flex items-center gap-1.5 text-zinc-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Translating...
                      </span>
                    ) : trText ? (
                      <span>{trText}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void fetchMissingTranslations([sentence])}
                        className="text-[#FF4F17] font-bold hover:underline"
                      >
                        Tap to retry translation
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Paginated Book Controls: Prev | Jump to Page | Next / Finish */}
          {totalPages > 1 ? (
            <div className="pt-2 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={safePageIdx === 0}
                  onClick={() => void persistPageProgress(safePageIdx - 1)}
                  className="h-10 px-3.5 rounded-2xl bg-[#1C1F26] border border-white/[0.08] text-xs font-extrabold text-zinc-200 hover:text-white flex items-center gap-1 disabled:opacity-35 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Prev</span>
                </button>

                <select
                  aria-label="Jump to page"
                  value={safePageIdx}
                  onChange={(e) =>
                    void persistPageProgress(Number(e.target.value))
                  }
                  className="h-10 rounded-2xl bg-[#101216] border border-white/10 px-3 text-xs font-extrabold text-white focus:outline-none focus:border-[#FF4F17]"
                >
                  {Array.from({ length: totalPages }, (_, idx) => (
                    <option key={idx} value={idx}>
                      Page {idx + 1} / {totalPages}
                    </option>
                  ))}
                </select>

                {safePageIdx < totalPages - 1 ? (
                  <button
                    type="button"
                    onClick={() => void persistPageProgress(safePageIdx + 1)}
                    className="h-10 px-4 rounded-2xl bg-[#FF4F17] hover:bg-[#FF6230] text-black text-xs font-extrabold flex items-center gap-1 shadow-[0_6px_18px_rgba(255,79,23,0.35)] transition"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleFinishText()}
                    className="h-10 px-3.5 rounded-2xl bg-emerald-500 text-black text-xs font-extrabold flex items-center gap-1 transition"
                  >
                    <Check className="w-4 h-4" />
                    <span>Finish</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleFinishText()}
              className="w-full rounded-full bg-[#FF4F17] hover:bg-[#FF6230] text-black font-extrabold text-xs py-3 flex items-center justify-center gap-1.5 shadow-[0_8px_24px_rgba(255,79,23,0.3)] transition"
            >
              <Check className="w-4 h-4" />
              <span>
                Mark Finished (+
                {Math.max(1, Math.round(activeText.word_count / 100))} XP)
              </span>
            </button>
          )}
        </div>

        {/* Tap-to-Mine Bottom Sheet */}
        {tapped && (
          <div className="fixed inset-x-3 bottom-20 z-40 max-w-md mx-auto rounded-[26px] bg-[#16181F]/98 backdrop-blur-2xl border border-[#FF4F17]/45 shadow-[0_24px_60px_rgba(0,0,0,0.9)] p-4 space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-150">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-display text-lg font-extrabold text-white">
                    {lookup?.word || tapped.word}
                  </span>
                  {lookup?.pos && (
                    <span className="px-1.5 py-0.5 rounded bg-white/[0.07] text-[10px] font-bold uppercase text-zinc-400">
                      {lookup.pos}
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 rounded bg-white/[0.07] text-[10px] font-bold uppercase text-sky-300">
                    {tapped.currentStatus}
                  </span>
                </div>
                <div className="font-mono text-xs font-bold text-[#FF4F17]">
                  [{toMadridEnglishPhonetics(lookup?.word || tapped.word)}]
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    void playSpanishAudio({
                      text: lookup?.word || tapped.word,
                      audioSource: "es-ES TTS",
                    })
                  }
                  title="Listen in Madrid Spanish"
                  aria-label="Listen"
                  className="w-8 h-8 rounded-xl bg-[#FF4F17] text-black flex items-center justify-center transition active:scale-95"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setTapped(null)}
                  className="w-8 h-8 rounded-xl bg-white/[0.07] text-zinc-400 hover:text-white flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {lookupLoading ? (
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF4F17]" />
                <span>Looking up contextual Madrid meaning…</span>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-sm font-bold text-zinc-100">
                  {lookup?.meaning || "Tap + Tomorrow to mine this word"}
                </div>
                {lookup?.lemma && lookup.lemma !== tapped.normalized && (
                  <div className="text-[11px] text-zinc-400">
                    Lemma:{" "}
                    <span className="font-bold text-white">{lookup.lemma}</span>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-xl bg-[#101216] border border-white/[0.06] px-2.5 py-2 text-[11px] text-zinc-300">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-0.5">
                Card Example Sentence
              </span>
              «{tapped.sentence}»
            </div>

            {actionBanner && (
              <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/35 px-3 py-1.5 text-xs font-extrabold text-emerald-300">
                {actionBanner}
              </div>
            )}

            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => void handleMineToTomorrow()}
                className="rounded-xl bg-[#FF4F17] hover:bg-[#FF6230] text-black py-2 px-2 text-[11px] font-extrabold flex items-center justify-center gap-1 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tomorrow</span>
              </button>
              <button
                type="button"
                onClick={() => void handleMarkStatus("known")}
                className="rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 py-2 px-2 text-[11px] font-extrabold flex items-center justify-center gap-1 transition"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Known</span>
              </button>
              <button
                type="button"
                onClick={() => void handleMarkStatus("ignored")}
                className="rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.08] text-zinc-300 py-2 px-2 text-[11px] font-bold flex items-center justify-center gap-1 transition"
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>Ignore</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===================== READING HUB (LIBRARY / AI STORY / IMPORT) =====================
  return (
    <div className="space-y-3.5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF4F17]">
            PHASE 4 · SENTENCE MINING (ES-ES)
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">
            Madrid Reading
          </h1>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-[#FF4F17]/15 border border-[#FF4F17]/35 flex items-center justify-center text-[#FF4F17]">
          <BookOpen className="w-5 h-5" />
        </div>
      </div>

      {/* 3-Tab Switcher: Library | AI Story | Import */}
      <div className="grid grid-cols-3 gap-1.5 rounded-[22px] bg-[#181A1F] p-1.5 border border-white/[0.06]">
        {(
          [
            { id: "library", label: `Library (${texts.length})` },
            { id: "generate", label: "✨ AI Story" },
            { id: "import", label: "Import" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setHubTab(tab.id)}
            className={`rounded-[16px] py-2 text-xs font-extrabold transition-all ${
              hubTab === tab.id
                ? "bg-[#FF4F17] text-black shadow-[0_4px_14px_rgba(255,79,23,0.35)]"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===================== TAB 1: LIBRARY (CONTINUE READING + AI STORY / IMPORT + FULL HISTORY) ===================== */}
      {hubTab === "library" && (
        <div className="space-y-3.5">
          {/* 1. Featured Continue Reading Card (Most Recently Opened Text) */}
          {texts.length > 0 && (() => {
            const recent = texts[0];
            const rStats = computeComprehensionStats(recent.content, statusMap);
            const rPages = Math.max(
              1,
              paginateSentences(splitIntoSentences(recent.content), 160).length
            );
            const rSavedPage = Math.min(rPages - 1, recent.current_page ?? 0);
            const rPct =
              recent.progress > 0 ? Math.min(100, Math.round(recent.progress)) : 0;
            return (
              <div
                onClick={() => openTextFromLibrary(recent)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    openTextFromLibrary(recent);
                  }
                }}
                className="rounded-[26px] bg-[#181A1F] border border-[#FF4F17]/35 hover:border-[#FF4F17]/60 p-4 space-y-2.5 cursor-pointer transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17]">
                    CONTINUE READING
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-[10px] font-extrabold text-emerald-300">
                    Page {rSavedPage + 1} / {rPages}
                  </span>
                </div>
                <div className="font-display text-lg font-extrabold text-white leading-snug">
                  {recent.title}
                </div>
                {rPages > 1 && (
                  <div className="h-1.5 rounded-full bg-[#101216] overflow-hidden">
                    <div
                      className="h-full bg-[#FF4F17]"
                      style={{ width: `${Math.max(4, rPct)}%` }}
                    />
                  </div>
                )}
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>
                    {rStats.comprehensionPct}% known · {rStats.totalWords} words
                  </span>
                  <span className="font-extrabold text-[#FF4F17]">
                    Resume »
                  </span>
                </div>
              </div>
            );
          })()}

          {/* 2. Quick 2-Column Action Cards: AI Story + Import */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setHubTab("generate")}
              className="rounded-[22px] bg-[#181A1F] hover:border-[#FF4F17]/45 border border-white/[0.06] p-3.5 text-left space-y-1 transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[#FF4F17]" />
              <div className="text-xs font-extrabold text-white">AI Story</div>
              <div className="text-[10px] text-zinc-400">
                By your topic &amp; vocab
              </div>
            </button>
            <button
              type="button"
              onClick={() => setHubTab("import")}
              className="rounded-[22px] bg-[#181A1F] hover:border-[#FF4F17]/45 border border-white/[0.06] p-3.5 text-left space-y-1 transition cursor-pointer"
            >
              <Upload className="w-4 h-4 text-[#FF4F17]" />
              <div className="text-xs font-extrabold text-white">Import</div>
              <div className="text-[10px] text-zinc-400">
                Paste, EPUB, TXT or URL
              </div>
            </button>
          </div>

          {/* 3. Full History of All Texts */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                All Reading History ({texts.length})
              </span>
              <span className="text-[10px] text-zinc-500">
                Blue = New · Yellow = Learning
              </span>
            </div>
            {texts.map((text) => {
              const stats = computeComprehensionStats(text.content, statusMap);
              const textPages = Math.max(
                1,
                paginateSentences(splitIntoSentences(text.content), 160).length
              );
              const savedPage = Math.min(
                textPages - 1,
                text.current_page ?? 0
              );
              const pct =
                text.progress > 0
                  ? Math.min(100, Math.round(text.progress))
                  : 0;
              return (
                <div
                  key={text.id}
                  onClick={() => openTextFromLibrary(text)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      openTextFromLibrary(text);
                    }
                  }}
                  className="w-full text-left bento-card p-4 hover:border-[#FF4F17]/45 transition space-y-2 cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17]">
                      {text.type === "starter"
                        ? "Madrid Starter"
                        : text.type === "generated"
                          ? "✨ AI Graded"
                          : text.type}{" "}
                      · {textPages} {textPages === 1 ? "page" : "pages"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[10px] font-extrabold ${comprehensionBadgeClass(
                          stats.comprehensionPct
                        )}`}
                      >
                        {stats.comprehensionPct}% known
                      </span>
                      {text.type !== "starter" && (
                        <button
                          type="button"
                          onClick={(e) => void handleDeleteText(text.id, e)}
                          title="Delete text"
                          className="w-6 h-6 rounded-lg bg-white/[0.06] hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 flex items-center justify-center transition"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="font-display text-base font-extrabold text-white">
                    {text.title}
                  </div>

                  {textPages > 1 && (
                    <div className="space-y-1">
                      <div className="w-full h-1.5 rounded-full bg-[#101216] overflow-hidden">
                        <div
                          className="h-full bg-[#FF4F17]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-zinc-400 font-semibold">
                        <span>
                          Resume Page {savedPage + 1} / {textPages}
                        </span>
                        <span>{pct}% read</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>
                      {stats.totalWords} words · {stats.newCount} new ·{" "}
                      {stats.learningCount} learning
                    </span>
                    {text.progress >= 100 && (
                      <span className="text-emerald-400 font-bold">✓ Read</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================== TAB 2: PERSONALIZED AI GRADED READER ===================== */}
      {hubTab === "generate" && (
        <form
          onSubmit={(e) => void handleGenerateGradedReader(e)}
          className="bento-card p-4 space-y-4"
        >
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17] flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              Tailored to Your Vocabulary
            </div>
            <h2 className="font-display text-base font-extrabold text-white mt-0.5">
              Generate a Custom Madrid Text
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Uses your {vocabBuckets.known.length} known &amp;{" "}
              {vocabBuckets.learning.length} learning words (~95% familiar + 5–8
              new target words in Spain Spanish).
            </p>
          </div>

          {/* Topic Input + Quick Chips */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-zinc-300 block">
              What topic are you interested in?
            </label>
            <input
              type="text"
              value={genTopic}
              onChange={(e) => setGenTopic(e.target.value)}
              placeholder="e.g. Ordering coffee in Madrid, AI startups, football..."
              className="w-full rounded-2xl bg-[#101216] border border-white/10 px-3.5 py-2.5 text-xs font-semibold text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF4F17]"
            />
            <div className="flex flex-wrap gap-1.5">
              {TOPIC_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setGenTopic(s)}
                  className="rounded-full bg-[#1C1F26] border border-white/[0.07] hover:border-[#FF4F17]/50 px-2.5 py-1 text-[10px] font-bold text-zinc-300 hover:text-white transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Length Selector */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-zinc-300">Length</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: "short", label: "Short", sub: "~120w" },
                  { id: "medium", label: "Medium", sub: "~250w" },
                  { id: "long", label: "Long", sub: "~420w" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setGenLength(opt.id)}
                  className={`rounded-xl py-2 px-2 border text-center transition ${
                    genLength === opt.id
                      ? "bg-[#FF4F17] text-black border-[#FF4F17] font-extrabold"
                      : "bg-[#121419] text-zinc-300 border-white/[0.07]"
                  }`}
                >
                  <div className="text-xs font-extrabold">{opt.label}</div>
                  <div className="text-[10px] opacity-80">{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Style + CEFR Level */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-zinc-300">Format</div>
              <div className="grid grid-cols-3 gap-1">
                {(["story", "article", "dialogue"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setGenStyle(st)}
                    className={`rounded-xl py-1.5 text-[10px] font-extrabold capitalize border transition ${
                      genStyle === st
                        ? "bg-[#FF4F17] text-black border-[#FF4F17]"
                        : "bg-[#121419] text-zinc-300 border-white/[0.07]"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-zinc-300">Level</div>
              <div className="grid grid-cols-4 gap-1">
                {(["A1", "A1-A2", "A2", "B1"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setGenCefr(lvl)}
                    className={`rounded-xl py-1.5 text-[10px] font-extrabold border transition ${
                      genCefr === lvl
                        ? "bg-[#FF4F17] text-black border-[#FF4F17]"
                        : "bg-[#121419] text-zinc-300 border-white/[0.07]"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {genError && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-300">
              {genError}
            </div>
          )}

          <button
            type="submit"
            disabled={genBusy || !genTopic.trim()}
            className="w-full rounded-full bg-[#FF4F17] hover:bg-[#FF6230] text-black font-extrabold text-xs py-3 flex items-center justify-center gap-2 shadow-[0_8px_24px_rgba(255,79,23,0.35)] disabled:opacity-45 transition"
          >
            {genBusy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Writing your Madrid text…</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Generate Personalized Text</span>
              </>
            )}
          </button>
        </form>
      )}

      {/* ===================== TAB 3: IMPORT (EPUB / TXT / URL / PASTE) ===================== */}
      {hubTab === "import" && (
        <div className="space-y-3">
          {importError && (
            <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 px-3.5 py-2.5 text-xs font-semibold text-rose-300">
              {importError}
            </div>
          )}

          {/* 1. Paste Plain Spanish Text (Primary — Right at the top!) */}
          <form
            onSubmit={(e) => void handlePasteImport(e)}
            className="bento-card p-4 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                Paste Plain Spanish Text
              </div>
              <button
                type="button"
                onClick={() => {
                  if (
                    typeof navigator !== "undefined" &&
                    navigator.clipboard?.readText
                  ) {
                    void navigator.clipboard
                      .readText()
                      .then((clip) => {
                        if (clip) setPasteContent(clip);
                      })
                      .catch(() => {
                        setImportError(
                          "Tap inside the text box and paste (Cmd+V / long-press)."
                        );
                      });
                  }
                }}
                className="rounded-full bg-[#FF4F17]/15 hover:bg-[#FF4F17]/25 border border-[#FF4F17]/35 px-2.5 py-0.5 text-[10px] font-extrabold text-[#FF4F17] transition"
              >
                📋 Paste Clipboard
              </button>
            </div>
            <input
              type="text"
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
              placeholder="Title (optional)"
              className="w-full rounded-xl bg-[#101216] border border-white/10 px-3 py-2 text-xs font-semibold text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF4F17]"
            />
            <textarea
              rows={5}
              value={pasteContent}
              onChange={(e) => setPasteContent(e.target.value)}
              placeholder="Copy & paste any plain Spanish text, article, story, or lyrics here…"
              className="w-full rounded-xl bg-[#101216] border border-white/10 px-3 py-2.5 text-xs font-semibold text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF4F17]"
            />
            <button
              type="submit"
              disabled={!pasteContent.trim()}
              className="w-full rounded-full bg-[#FF4F17] hover:bg-[#FF6230] py-2.5 text-xs font-extrabold text-black disabled:opacity-40 transition shadow-[0_6px_20px_rgba(255,79,23,0.3)]"
            >
              Add to Library &amp; Read
            </button>
          </form>

          {/* 2. File Upload (.epub / .txt) */}
          <div className="bento-card p-4 space-y-2.5">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17] flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" />
              Upload Book or File (.epub / .txt)
            </div>
            <p className="text-xs text-zinc-400">
              Parsed directly in your browser — keeps chapters and opens right
              in the colour-coded reader.
            </p>
            <label className="block w-full cursor-pointer rounded-2xl border border-dashed border-[#FF4F17]/45 bg-[#121419] hover:bg-[#191C24] py-4 px-3 text-center transition">
              <input
                type="file"
                accept=".epub,.txt"
                disabled={importBusy}
                onChange={(e) => void handleFileUpload(e)}
                className="hidden"
              />
              <span className="text-xs font-extrabold text-white">
                {importBusy ? "Importing file…" : "Choose .epub or .txt file"}
              </span>
            </label>
          </div>

          {/* 3. URL Article Extractor */}
          <form
            onSubmit={(e) => void handleImportUrl(e)}
            className="bento-card p-4 space-y-2.5"
          >
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17] flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              Import from Article URL
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://elpais.com/..."
                className="flex-1 rounded-xl bg-[#101216] border border-white/10 px-3 py-2 text-xs font-semibold text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF4F17]"
              />
              <button
                type="submit"
                disabled={importBusy || !importUrl.trim()}
                className="rounded-xl bg-[#FF4F17] hover:bg-[#FF6230] px-3.5 py-2 text-xs font-extrabold text-black disabled:opacity-40 transition"
              >
                {importBusy ? "..." : "Fetch"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
