"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Check, Loader2, Plus, Sparkles, Volume2, X } from "lucide-react";
import { toMadridEnglishPhonetics } from "@/lib/audio/phonetics";
import { playSpanishAudio } from "@/lib/audio/player";
import { addOrPromoteWordInDeck } from "@/lib/fsrs/scheduler";
import { offlineDb } from "@/lib/offline/db";
import {
  cleanSelectedSpanishText,
  lookupBuiltInSpanishWord,
  WordLookupEntry,
} from "@/lib/tutor/word-dictionary";

interface PopupPosition {
  x: number;
  y: number;
  placement: "above" | "below";
}

export interface TriggerWordPopupDetail {
  word: string;
  rect: DOMRect;
  contextSentence?: string;
}

const OPEN_WORD_POPUP_EVENT = "espanol-fast-open-word-popup";

export function triggerWordPopup(detail: TriggerWordPopupDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<TriggerWordPopupDetail>(OPEN_WORD_POPUP_EVENT, { detail })
  );
}

/**
 * Extracts the exact word clicked at `(clientX, clientY)` inside a text node,
 * or returns null if the click was not directly on a word character.
 */
export function extractWordAtClickPoint(
  clientX: number,
  clientY: number
): TriggerWordPopupDetail | null {
  if (typeof document === "undefined") return null;

  let textNode: Node | null = null;
  let offset = 0;

  const docWithCaret = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number
    ) => { offsetNode: Node; offset: number } | null;
  };

  if (typeof document.caretRangeFromPoint === "function") {
    const r = document.caretRangeFromPoint(clientX, clientY);
    if (r) {
      textNode = r.startContainer;
      offset = r.startOffset;
    }
  } else if (typeof docWithCaret.caretPositionFromPoint === "function") {
    const pos = docWithCaret.caretPositionFromPoint(clientX, clientY);
    if (pos) {
      textNode = pos.offsetNode;
      offset = pos.offset;
    }
  }

  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return null;
  const fullText = textNode.textContent ?? "";
  if (!fullText.trim()) return null;

  const isWordChar = (ch: string) =>
    /[a-záéíóúüñA-ZÁÉÍÓÚÜÑ-]/.test(ch);

  let idx = offset;
  if (idx >= fullText.length || !isWordChar(fullText[idx])) {
    if (idx > 0 && isWordChar(fullText[idx - 1])) {
      idx = idx - 1;
    } else {
      return null;
    }
  }

  let start = idx;
  while (start > 0 && isWordChar(fullText[start - 1])) {
    start--;
  }
  let end = idx;
  while (end < fullText.length && isWordChar(fullText[end])) {
    end++;
  }

  const word = fullText.slice(start, end).trim();
  if (!word) return null;

  const wordRange = document.createRange();
  wordRange.setStart(textNode, start);
  wordRange.setEnd(textNode, end);
  const rect = wordRange.getBoundingClientRect();

  // Verify the click point (clientX, clientY) actually landed on the word's bounding box,
  // because caretRangeFromPoint snaps across empty space to the nearest text node.
  const hitPad = 4;
  if (
    rect.width === 0 ||
    rect.height === 0 ||
    clientX < rect.left - hitPad ||
    clientX > rect.right + hitPad ||
    clientY < rect.top - hitPad ||
    clientY > rect.bottom + hitPad
  ) {
    return null;
  }

  return {
    word,
    rect,
    contextSentence: fullText.replace(/\s+/g, " ").trim().slice(0, 220),
  };
}

export function splitBilingualExample(
  rawEs: string | undefined,
  rawTr: string | undefined
): { es: string; tr: string } {
  const esClean = (rawEs ?? "").trim();
  const trClean = (rawTr ?? "").trim();
  if (!esClean) return { es: "", tr: trClean };

  if (esClean.includes(" -- ")) {
    const pairs = esClean
      .split(/(?<=[.!?])\s*(?=[A-ZÁÉÍÓÚÜÑ¡¿])/)
      .map((s) => s.trim())
      .filter(Boolean);
    const firstPair = pairs[0] ?? esClean;
    const [esPart, trPart] = firstPair.split(" -- ").map((s) => s.trim());
    return {
      es: esPart || esClean,
      tr: trPart || (trClean !== esClean ? trClean : ""),
    };
  }

  return {
    es: esClean,
    tr: trClean === esClean ? "" : trClean,
  };
}

const LOCAL_STORAGE_CACHE_KEY = "espanol_fast_word_lookup_v2";

function loadClientLookupCache(): Record<string, WordLookupEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, WordLookupEntry>;
  } catch {
    return {};
  }
}

function saveClientLookupCache(key: string, entry: WordLookupEntry): void {
  if (typeof window === "undefined") return;
  try {
    const current = loadClientLookupCache();
    current[key.toLowerCase()] = entry;
    window.localStorage.setItem(
      LOCAL_STORAGE_CACHE_KEY,
      JSON.stringify(current)
    );
  } catch {
    // Ignore storage quota errors
  }
}

function normalizeGenderBadge(
  g: string | null | undefined
): "el" | "la" | "el/la" | null {
  if (g === "el" || g === "la" || g === "el/la") return g;
  if (g === "los") return "el";
  if (g === "las") return "la";
  return null;
}

export function WordSelectionPopup() {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [phonetics, setPhonetics] = useState<string>("");
  const [lookup, setLookup] = useState<WordLookupEntry | null>(null);
  const [deckAudioUrl, setDeckAudioUrl] = useState<string | null>(null);
  const [deckExampleAudioUrl, setDeckExampleAudioUrl] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(false);
  const [playingExampleAudio, setPlayingExampleAudio] = useState(false);
  const [addedToQueue, setAddedToQueue] = useState(false);
  const [position, setPosition] = useState<PopupPosition>({
    x: 180,
    y: 140,
    placement: "above",
  });

  const popupRef = useRef<HTMLDivElement | null>(null);
  const activeLookupWordRef = useRef<string | null>(null);

  const closePopup = useCallback(() => {
    setSelectedWord(null);
    setLookup(null);
    setDeckAudioUrl(null);
    setDeckExampleAudioUrl(null);
    setLoading(false);
    setAddedToQueue(false);
    activeLookupWordRef.current = null;
  }, []);

  // The Spanish word to pronounce with es-ES TTS and add to the FSRS queue
  const spanishTargetWord =
    lookup?.direction === "en-to-es" && lookup.word
      ? lookup.word
      : selectedWord ?? "";

  const handlePlayAudio = useCallback(
    async (wordToPlay?: string, audioUrl?: string | null) => {
      const target = (wordToPlay ?? spanishTargetWord).trim();
      if (!target) return;
      // If the Spanish word has alternatives like "el amigo / la amiga", speak the first or clean form
      const speakable = target.includes("/")
        ? target.split("/")[0].trim()
        : target;
      setPlayingAudio(true);
      try {
        await playSpanishAudio({
          text: speakable,
          audioFilename: audioUrl ?? deckAudioUrl,
        });
      } finally {
        setPlayingAudio(false);
      }
    },
    [spanishTargetWord, deckAudioUrl]
  );

  const handlePlayExampleAudio = useCallback(async () => {
    const splitEx = splitBilingualExample(
      lookup?.example_es,
      lookup?.example_tr
    );
    const exampleText = splitEx.es.trim();
    if (!exampleText) return;
    setPlayingExampleAudio(true);
    try {
      await playSpanishAudio({
        text: exampleText,
        audioFilename: deckExampleAudioUrl,
      });
    } finally {
      setPlayingExampleAudio(false);
    }
  }, [lookup?.example_es, lookup?.example_tr, deckExampleAudioUrl]);

  const resolveWordMeaning = useCallback(
    async (word: string, contextSentence: string) => {
      const lower = word.toLowerCase();
      const withoutArticle = lower
        .replace(/^(el|la|los|las|un|una|the|a|an|to)\s+/i, "")
        .trim();
      const wordCount = word.trim().split(/\s+/).length;

      setAddedToQueue(false);
      setDeckAudioUrl(null);
      setDeckExampleAudioUrl(null);
      setLookup(null);

      // 1. Check built-in bidirectional Spain dictionary + 12-week curriculum synchronously (0 ms)
      const builtIn = lookupBuiltInSpanishWord(word);
      if (builtIn) {
        setLookup(builtIn);
        setPhonetics(toMadridEnglishPhonetics(builtIn.word));
      }

      // 2. Check local IndexedDB (5,000-word Anki deck) for single words or 2-word headwords
      if (offlineDb && wordCount <= 2) {
        try {
          const allNotes = await offlineDb.notes.toArray();
          if (activeLookupWordRef.current !== word) return;

          // 2a. Exact Spanish match in 5,000-word deck
          const matchedSpanishNote = allNotes.find((n) => {
            const noteWord = n.word.trim().toLowerCase();
            const noteWordStripped = noteWord
              .replace(/^(el|la|los|las|un|una)\s+/i, "")
              .trim();
            const noteLemma = n.lemma.trim().toLowerCase();
            return (
              noteWord === lower ||
              noteWordStripped === withoutArticle ||
              noteLemma === lower ||
              noteLemma === withoutArticle
            );
          });

          if (matchedSpanishNote) {
            setDeckAudioUrl(matchedSpanishNote.audio_word_url ?? null);
            setDeckExampleAudioUrl(matchedSpanishNote.audio_example_url ?? null);
            const deckEsEntry: WordLookupEntry = {
              direction: "es-to-en",
              word,
              lemma: matchedSpanishNote.lemma || withoutArticle,
              pos: matchedSpanishNote.pos || "n",
              gender: normalizeGenderBadge(matchedSpanishNote.gender),
              meaning: matchedSpanishNote.meaning,
              example_es: matchedSpanishNote.example_es || builtIn?.example_es,
              example_tr: matchedSpanishNote.example_tr || builtIn?.example_tr,
              sourceBadge: "deck",
            };
            setLookup(deckEsEntry);
            setPhonetics(toMadridEnglishPhonetics(word));
            setLoading(false);
            return;
          }

          // 2b. Reverse English -> Spanish match in 5,000-word deck
          const singularEn =
            withoutArticle.endsWith("s") && withoutArticle.length > 3
              ? withoutArticle.slice(0, -1)
              : withoutArticle;

          const matchedEnglishNote = allNotes.find((n) => {
            const rawMeaning = n.meaning
              .toLowerCase()
              .replace(/\([^)]*\)/g, "")
              .trim();
            if (
              rawMeaning === lower ||
              rawMeaning === withoutArticle ||
              rawMeaning === `to ${withoutArticle}`
            ) {
              return true;
            }
            const glossParts = rawMeaning
              .split(/[,;/]+/)
              .map((s) => s.trim().replace(/^to\s+/i, "").trim())
              .filter(Boolean);
            return (
              glossParts.includes(lower) ||
              glossParts.includes(withoutArticle) ||
              glossParts.includes(singularEn)
            );
          });

          if (matchedEnglishNote) {
            setDeckAudioUrl(matchedEnglishNote.audio_word_url ?? null);
            setDeckExampleAudioUrl(matchedEnglishNote.audio_example_url ?? null);
            const deckEnToEsEntry: WordLookupEntry = {
              direction: "en-to-es",
              word: matchedEnglishNote.word,
              lemma: matchedEnglishNote.lemma,
              pos: matchedEnglishNote.pos || "n",
              gender: normalizeGenderBadge(matchedEnglishNote.gender),
              meaning: matchedEnglishNote.meaning,
              example_es:
                matchedEnglishNote.example_es || builtIn?.example_es,
              example_tr:
                matchedEnglishNote.example_tr || builtIn?.example_tr,
              sourceBadge: "deck",
            };
            setLookup(deckEnToEsEntry);
            setPhonetics(toMadridEnglishPhonetics(matchedEnglishNote.word));
            setLoading(false);
            return;
          }
        } catch {
          // Ignore IndexedDB read errors
        }
      }

      // If built-in dictionary already matched (either ES->EN or EN->ES), no need to call server AI
      if (builtIn) {
        setLoading(false);
        return;
      }

      // 3. Check client localStorage cache
      const clientCache = loadClientLookupCache();
      const cachedClient =
        clientCache[lower] ?? clientCache[withoutArticle] ?? null;
      if (cachedClient) {
        setLookup(cachedClient);
        setPhonetics(
          toMadridEnglishPhonetics(
            cachedClient.direction === "en-to-es" ? cachedClient.word : word
          )
        );
        setLoading(false);
        return;
      }

      // 4. Call cached server AI route (/api/tutor/word-lookup) which auto-detects ES->EN or EN->ES
      setLoading(true);
      try {
        const res = await fetch("/api/tutor/word-lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            word,
            contextSentence,
          }),
        });

        if (activeLookupWordRef.current !== word) return;

        if (res.ok) {
          const data = (await res.json()) as WordLookupEntry;
          setLookup(data);
          setPhonetics(
            toMadridEnglishPhonetics(
              data.direction === "en-to-es" ? data.word : word
            )
          );
          saveClientLookupCache(lower, data);
        } else {
          setLookup({
            direction: "es-to-en",
            word,
            lemma: withoutArticle || lower,
            pos: "word",
            gender: null,
            meaning: "Tap es-ES to hear Madrid pronunciation",
            sourceBadge: "dictionary",
          });
        }
      } catch {
        if (activeLookupWordRef.current === word) {
          setLookup({
            direction: "es-to-en",
            word,
            lemma: withoutArticle || lower,
            pos: "word",
            gender: null,
            meaning: "Offline — tap es-ES to hear pronunciation",
            sourceBadge: "dictionary",
          });
        }
      } finally {
        if (activeLookupWordRef.current === word) {
          setLoading(false);
        }
      }
    },
    []
  );

  const openPopupForSelection = useCallback(
    (rawSelected: string, rect: DOMRect, contextSentence: string) => {
      const cleaned = cleanSelectedSpanishText(rawSelected);
      if (!cleaned || cleaned.length < 1 || cleaned.length > 140) return;

      // Ignore pure numbers or symbols with no letters
      if (!/[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]/.test(cleaned)) return;

      // Allow single words and multi-word phrases/sentences up to 16 words
      const wordCount = cleaned.split(/\s+/).length;
      if (wordCount > 16) return;

      const viewportW =
        typeof window !== "undefined" ? window.innerWidth : 375;
      const viewportH =
        typeof window !== "undefined" ? window.innerHeight : 700;
      const centerX = rect.left + rect.width / 2;
      const halfPopupW = Math.min(154, (viewportW - 24) / 2);
      const clampedX = Math.max(
        12 + halfPopupW,
        Math.min(viewportW - 12 - halfPopupW, centerX)
      );

      // Prefer below if there isn't plenty of room above (~340px for full card)
      const spaceAbove = rect.top - 12;
      const spaceBelow = viewportH - rect.bottom - 12;
      const placement: "above" | "below" =
        spaceAbove >= 340 || (spaceAbove > spaceBelow && spaceBelow < 240)
          ? "above"
          : "below";

      const anchorY =
        placement === "above"
          ? Math.max(12, rect.top - 10)
          : Math.min(viewportH - 12, rect.bottom + 10);

      activeLookupWordRef.current = cleaned;
      setSelectedWord(cleaned);
      setPhonetics(toMadridEnglishPhonetics(cleaned));
      setPosition({
        x: clampedX,
        y: anchorY,
        placement,
      });

      void resolveWordMeaning(cleaned, contextSentence);
    },
    [resolveWordMeaning]
  );

  useEffect(() => {
    const checkSelectionAndOpen = (eventTarget: EventTarget | null) => {
      if (typeof window === "undefined") return;

      const el = eventTarget instanceof Element ? eventTarget : null;
      if (el) {
        if (el.closest("[data-word-popup-root='true']")) return;
        if (el.closest("input, textarea, select, [contenteditable='true']")) {
          return;
        }
      }

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

      const rawText = sel.toString();
      if (!rawText || !rawText.trim()) return;

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;

      const anchorContainer =
        range.commonAncestorContainer.nodeType === Node.TEXT_NODE
          ? range.commonAncestorContainer.parentElement
          : (range.commonAncestorContainer as Element | null);
      const contextSentence = (anchorContainer?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 220);

      openPopupForSelection(rawText, rect, contextSentence);
    };

    let selectionTimer: ReturnType<typeof setTimeout> | null = null;

    const handleSingleClick = (e: MouseEvent) => {
      if (typeof window === "undefined") return;
      const el = e.target instanceof Element ? e.target : null;
      if (!el) return;

      // Ignore clicks inside the popup itself
      if (el.closest("[data-word-popup-root='true']")) return;

      // If the user dragged to select multiple words / phrase, open the popup for the highlighted selection
      // (Check this BEFORE button/control ignore so releasing a drag over a button still opens the selection!)
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
        checkSelectionAndOpen(e.target);
        return;
      }

      // Ignore clicks on interactive controls (buttons, links, inputs, selects)
      if (
        el.closest(
          "button, a, input, textarea, select, label, [contenteditable='true'], header, nav"
        )
      ) {
        return;
      }

      // Ignore single-click inside the Reading screen where each word has its own Tap-to-Mine sheet
      if (el.closest("[data-reader-custom-tap='true']")) {
        return;
      }

      // Ignore phonetic bracket lines `[OH-lah ...]`
      if (el.closest("[data-phonetic-guide='true']")) {
        if (selectedWord) closePopup();
        return;
      }

      // Extract the exact word under the single click only if the click landed directly on word text
      if (el.closest("main, [data-word-clickable-zone='true']")) {
        const clicked = extractWordAtClickPoint(e.clientX, e.clientY);
        if (clicked && clicked.word) {
          openPopupForSelection(
            clicked.word,
            clicked.rect,
            clicked.contextSentence ?? ""
          );
          return;
        }
      }

      if (selectedWord) {
        closePopup();
      }
    };

    const handleDblClick = (e: MouseEvent) => {
      checkSelectionAndOpen(e.target);
    };

    const handleMouseUp = (e: MouseEvent) => {
      setTimeout(() => {
        if (typeof window === "undefined") return;
        const el = e.target instanceof Element ? e.target : null;
        if (el?.closest("[data-word-popup-root='true']")) return;

        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          return;
        }
        checkSelectionAndOpen(e.target);
      }, 20);
    };

    const handleSelectionChange = () => {
      if (selectionTimer) clearTimeout(selectionTimer);
      selectionTimer = setTimeout(() => {
        if (typeof window === "undefined") return;
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) return;
        const text = sel.toString().trim();
        if (!text || text.length < 2) return;
        const anchorEl =
          sel.anchorNode?.nodeType === Node.TEXT_NODE
            ? sel.anchorNode.parentElement
            : (sel.anchorNode as Element | null);
        if (anchorEl?.closest("[data-word-popup-root='true']")) return;
        if (
          anchorEl?.closest(
            "input, textarea, select, [contenteditable='true']"
          )
        ) {
          return;
        }
        checkSelectionAndOpen(anchorEl);
      }, 220);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      setTimeout(() => {
        checkSelectionAndOpen(e.target);
      }, 60);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedWord) {
        closePopup();
      }
    };

    const handleCustomOpen = (e: Event) => {
      const custom = e as CustomEvent<TriggerWordPopupDetail>;
      if (!custom.detail?.word || !custom.detail?.rect) return;
      openPopupForSelection(
        custom.detail.word,
        custom.detail.rect,
        custom.detail.contextSentence ?? ""
      );
    };

    document.addEventListener("click", handleSingleClick);
    document.addEventListener("dblclick", handleDblClick);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener(OPEN_WORD_POPUP_EVENT, handleCustomOpen);

    return () => {
      if (selectionTimer) clearTimeout(selectionTimer);
      document.removeEventListener("click", handleSingleClick);
      document.removeEventListener("dblclick", handleDblClick);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener(OPEN_WORD_POPUP_EVENT, handleCustomOpen);
    };
  }, [selectedWord, closePopup, openPopupForSelection]);

  const handleAddWordToQueue = async () => {
    if (!selectedWord || !offlineDb) return;
    const isEnToEs = lookup?.direction === "en-to-es";
    const esWord = isEnToEs && lookup?.word ? lookup.word : selectedWord;
    const enMeaning = isEnToEs
      ? lookup?.meaning || selectedWord
      : lookup?.meaning && !lookup.meaning.startsWith("Tap ")
        ? lookup.meaning
        : "Added from word selection";
    const lemma = (lookup?.lemma || esWord)
      .replace(/^(el|la|los|las)\s+/i, "")
      .trim()
      .toLowerCase();

    const [allNotes, allCards] = await Promise.all([
      offlineDb.notes.toArray(),
      offlineDb.cards.toArray(),
    ]);

    const res = addOrPromoteWordInDeck(allNotes, allCards, {
      word: esWord,
      lemma,
      meaning: enMeaning,
      example_es: lookup?.example_es || "",
      example_tr: lookup?.example_tr || "",
      gender:
        lookup?.gender === "el" ||
        lookup?.gender === "la" ||
        lookup?.gender === "el/la"
          ? lookup.gender
          : null,
      pos: lookup?.pos || "n",
      source: "manual",
    });

    await offlineDb.notes.put(res.targetNote);
    if (!res.promotedExisting) {
      const added = res.cards.filter((c) => c.note_id === res.targetNote.id);
      if (added.length > 0) {
        await offlineDb.cards.bulkPut(added);
      }
    }
    setAddedToQueue(true);
  };

  // Dynamically clamp popup inside the visible viewport after render / lookup expansion
  useLayoutEffect(() => {
    if (!selectedWord || !popupRef.current || typeof window === "undefined") {
      return;
    }
    const el = popupRef.current;
    const box = el.getBoundingClientRect();
    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let nextX = position.x;
    let nextY = position.y;
    let changed = false;

    if (box.top < margin) {
      nextY += margin - box.top;
      changed = true;
    } else if (box.bottom > vh - margin) {
      nextY -= box.bottom - (vh - margin);
      // Never push past the top edge
      if (box.top - (box.bottom - (vh - margin)) < margin) {
        nextY += margin - (box.top - (box.bottom - (vh - margin)));
      }
      changed = true;
    }

    if (box.left < margin) {
      nextX += margin - box.left;
      changed = true;
    } else if (box.right > vw - margin) {
      nextX -= box.right - (vw - margin);
      changed = true;
    }

    if (changed) {
      setPosition((prev) => ({
        ...prev,
        x: Math.round(nextX),
        y: Math.round(nextY),
      }));
    }
  }, [selectedWord, lookup, loading, position.x, position.y, position.placement]);

  if (!selectedWord) return null;

  const isEnToEs = lookup?.direction === "en-to-es";

  return (
    <div
      ref={popupRef}
      data-word-popup-root="true"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform:
          position.placement === "above"
            ? "translate(-50%, -100%)"
            : "translate(-50%, 0)",
      }}
      className="fixed z-[70] w-[308px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-y-auto rounded-3xl bg-[#16181D]/98 backdrop-blur-2xl border border-[#FF4F17]/45 shadow-[0_20px_50px_rgba(0,0,0,0.85),0_0_25px_rgba(255,79,23,0.22)] p-3.5 text-white animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Direction header when an English word was selected (Reverse EN -> ES lookup) */}
      {isEnToEs && (
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
          <span className="px-1.5 py-0.5 rounded bg-[#FF4F17]/15 text-[#FF4F17] border border-[#FF4F17]/30">
            EN → ES
          </span>
          <span className="truncate text-zinc-300">«{selectedWord}»</span>
          <ArrowRight className="w-3 h-3 text-[#FF4F17] shrink-0" />
          <span className="text-zinc-400">Spanish</span>
        </div>
      )}

      {/* Top row: Spanish Word + gender/POS badge + Audio & Close buttons */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {lookup?.gender && (
              <span
                className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border ${
                  lookup.gender === "la"
                    ? "bg-pink-500/15 text-pink-300 border-pink-500/30"
                    : "bg-sky-500/15 text-sky-300 border-sky-500/30"
                }`}
              >
                {lookup.gender}
              </span>
            )}
            <span className="font-display font-extrabold text-lg text-white tracking-tight break-words">
              {spanishTargetWord}
            </span>
            {lookup?.pos && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/[0.06] text-zinc-400">
                {lookup.pos}
              </span>
            )}
          </div>

          {/* English Phonetic Pronunciation Guide of the Spanish word (Madrid es-ES) */}
          {phonetics && (
            <div className="mt-0.5 text-xs font-mono font-bold text-[#FF4F17] tracking-wide">
              [{phonetics}]
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => void handlePlayAudio()}
            disabled={playingAudio}
            title="Listen in Madrid Spanish"
            aria-label="Listen"
            className="w-8 h-8 rounded-xl bg-[#FF4F17] hover:bg-[#FF6230] text-black flex items-center justify-center shadow-[0_4px_14px_rgba(255,79,23,0.4)] transition active:scale-95"
          >
            <Volume2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={closePopup}
            aria-label="Close word popup"
            className="w-7 h-7 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Meaning / Translation section */}
      <div className="mt-2.5 pt-2.5 border-t border-white/[0.08]">
        {loading && !lookup ? (
          <div className="flex items-center gap-2 text-xs text-zinc-400 py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF4F17]" />
            <span>Translating…</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="text-sm font-semibold text-zinc-100 leading-snug">
              {isEnToEs ? (
                <span>
                  <span className="text-zinc-400 font-normal">English: </span>
                  {lookup?.meaning || selectedWord}
                </span>
              ) : (
                lookup?.meaning || "Tap es-ES to hear pronunciation"
              )}
            </div>

            {lookup?.lemma &&
              lookup.lemma.toLowerCase() !==
                spanishTargetWord
                  .replace(/^(el|la|los|las)\s+/i, "")
                  .trim()
                  .toLowerCase() && (
                <div className="text-[11px] text-zinc-400">
                  Base form (lemma):{" "}
                  <span className="font-bold text-white">{lookup.lemma}</span>
                </div>
              )}

            {lookup?.example_es && (() => {
              const splitEx = splitBilingualExample(
                lookup.example_es,
                lookup.example_tr
              );
              return (
                <div className="rounded-xl bg-[#0D0E11] border border-white/[0.06] px-2.5 py-2 text-[11px] space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-zinc-200 font-medium leading-snug">
                      «{splitEx.es}»
                    </div>
                    <button
                      type="button"
                      onClick={() => void handlePlayExampleAudio()}
                      disabled={playingExampleAudio}
                      title="Listen to example sentence"
                      aria-label="Listen to example sentence"
                      className="shrink-0 w-7 h-7 rounded-lg bg-[#FF4F17]/15 hover:bg-[#FF4F17] text-[#FF4F17] hover:text-black border border-[#FF4F17]/35 flex items-center justify-center transition active:scale-95"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-[10px] font-mono text-[#FF4F17]/85 leading-snug">
                    [{toMadridEnglishPhonetics(splitEx.es)}]
                  </div>
                  {splitEx.tr && (
                    <div className="text-zinc-500 leading-snug">
                      {splitEx.tr}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Footer actions: source badge + Add to FSRS Queue */}
      <div className="mt-2.5 pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-[#FF4F17]" />
          {lookup?.sourceBadge === "deck"
            ? "In your deck"
            : lookup?.sourceBadge === "ai"
              ? "Madrid AI Dict"
              : "Madrid Dict"}
        </span>

        <button
          type="button"
          onClick={() => void handleAddWordToQueue()}
          disabled={addedToQueue}
          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 transition ${
            addedToQueue
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
              : "bg-white/[0.07] hover:bg-white/[0.14] text-zinc-200 border border-white/[0.08]"
          }`}
        >
          {addedToQueue ? (
            <>
              <Check className="w-3 h-3" />
              <span>In Queue</span>
            </>
          ) : (
            <>
              <Plus className="w-3 h-3 text-[#FF4F17]" />
              <span>Add to Queue</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
