"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Brain,
  MessageCircle,
  RotateCcw,
  Send,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import { offlineDb } from "@/lib/offline/db";
import { recordTutorMistakeToErrorNotebookAndQueue } from "@/lib/offline/sync-manager";
import { playSpanishAudio } from "@/lib/audio/player";
import { toMadridEnglishPhonetics } from "@/lib/audio/phonetics";
import {
  FormattedTutorText,
  stripMarkdownForTts,
} from "@/components/FormattedTutorText";
import { ErrorRecord, TutorChatMessage } from "@/types/database";
import { AiCorrectionOutput } from "@/lib/ai/json-parser";

const OPEN_CHAT_WIDGET_EVENT = "espanol-fast-open-chat-widget";
export const ERRORS_UPDATED_EVENT = "espanol-fast-errors-updated";

const CHAT_HISTORY_STORAGE_KEY = "espanol_fast_chat_history_v1";
const CHAT_MEMORY_STORAGE_KEY = "espanol_fast_chat_memory_v1";
const MAX_STORED_MESSAGES = 80;
const ACTIVE_WINDOW_SIZE = 4;

export function openMadridChatWidget(initialPrompt?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<{ initialPrompt?: string }>(OPEN_CHAT_WIDGET_EVENT, {
      detail: { initialPrompt },
    })
  );
}

const SPANISH_CHARS = ["á", "é", "í", "ó", "ú", "ü", "ñ", "¿", "¡"];

const DEFAULT_WELCOME_MESSAGE: TutorChatMessage = {
  id: "welcome-msg",
  role: "tutor",
  content:
    "¡Hola! Soy tu agente de Madrid (es-ES). Ask me any grammar or vocabulary question, or write in Spanish and I'll correct you and save mistakes to your Error Notebook.",
  createdAt: new Date().toISOString(),
};

const STARTER_PROMPTS = [
  "Quiz me on ser vs estar",
  "Order un café in Madrid",
  "How to use vosotros?",
  "Explain por vs para",
];

/**
 * Packs older chat messages (outside the active 4-message window) into a compact
 * rolling memory string (<= 420 chars) so the AI remembers earlier context
 * without slowing down prompt processing.
 */
function buildPackedMemorySummary(
  allMessages: TutorChatMessage[],
  existingMemory: string
): string {
  const olderMessages = allMessages
    .filter((m) => m.id !== "welcome-msg")
    .slice(0, Math.max(0, allMessages.length - 1 - ACTIVE_WINDOW_SIZE));
  if (olderMessages.length === 0) return existingMemory;

  const userTurns = olderMessages
    .filter((m) => m.role === "user")
    .slice(-6)
    .map((m) => m.content.replace(/\s+/g, " ").trim().slice(0, 65));

  const correctionsLogged = olderMessages
    .flatMap((m) => m.corrections ?? [])
    .slice(-4)
    .map((c) => `${c.wrong}->${c.correct} (${c.category})`);

  const parts: string[] = [];
  if (userTurns.length > 0) {
    parts.push(`Earlier learner messages: ${userTurns.join(" | ")}`);
  }
  if (correctionsLogged.length > 0) {
    parts.push(`Past corrections: ${correctionsLogged.join("; ")}`);
  }

  const combined = parts.join(". ").slice(0, 440);
  return combined || existingMemory;
}

export function MadridChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<TutorChatMessage[]>([
    DEFAULT_WELCOME_MESSAGE,
  ]);
  const [memorySummary, setMemorySummary] = useState<string>("");
  const [showMemoryInspector, setShowMemoryInspector] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastFailedText, setLastFailedText] = useState<string | null>(null);
  const [knownLemmas, setKnownLemmas] = useState<string[]>([]);
  const [errors, setErrors] = useState<ErrorRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Restore persisted chat history & rolling memory on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedHistory = window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory) as TutorChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Filter out any old fallback placeholder replies
          const cleaned = parsed.filter(
            (m) => !m.content.startsWith("¡Vale! He recibido tu mensaje («")
          );
          setChatMessages(
            cleaned.length > 0
              ? cleaned.slice(-MAX_STORED_MESSAGES)
              : [DEFAULT_WELCOME_MESSAGE]
          );
        }
      }
      const savedMemory = window.localStorage.getItem(CHAT_MEMORY_STORAGE_KEY);
      if (savedMemory) {
        setMemorySummary(savedMemory);
      }
    } catch {
      // Ignore storage parse errors
    } finally {
      setHydrated(true);
    }
  }, []);

  // Persist chat history & rolling memory whenever messages change
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        CHAT_HISTORY_STORAGE_KEY,
        JSON.stringify(chatMessages.slice(-MAX_STORED_MESSAGES))
      );
      const nextMemory = buildPackedMemorySummary(chatMessages, memorySummary);
      if (nextMemory !== memorySummary) {
        setMemorySummary(nextMemory);
        window.localStorage.setItem(CHAT_MEMORY_STORAGE_KEY, nextMemory);
      }
    } catch {
      // Ignore storage quota errors
    }
  }, [chatMessages, hydrated, memorySummary]);

  const loadContextFromOfflineDb = useCallback(async () => {
    if (!offlineDb) return;
    try {
      const [allErrors, learnedCards] = await Promise.all([
        offlineDb.errors.orderBy("created_at").reverse().toArray(),
        offlineDb.cards.where("reps").above(0).limit(80).toArray(),
      ]);
      setErrors(allErrors);

      if (learnedCards.length > 0) {
        const noteIds = Array.from(
          new Set(learnedCards.map((c) => c.note_id))
        );
        const notes = await offlineDb.notes.bulkGet(noteIds.slice(0, 60));
        const lemmas = notes
          .filter((n): n is NonNullable<typeof n> => Boolean(n))
          .map((n) => n.lemma);
        setKnownLemmas(lemmas);
      }
    } catch {
      // Ignore IndexedDB errors
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      void loadContextFromOfflineDb();
      setTimeout(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
        inputRef.current?.focus();
      }, 60);
    }
  }, [isOpen, loadContextFromOfflineDb]);

  useEffect(() => {
    if (isOpen) {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, chatSending, isOpen]);

  const handleClearChat = () => {
    const packedBeforeClear = buildPackedMemorySummary(
      chatMessages,
      memorySummary
    );
    setChatMessages([DEFAULT_WELCOME_MESSAGE]);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        CHAT_HISTORY_STORAGE_KEY,
        JSON.stringify([DEFAULT_WELCOME_MESSAGE])
      );
      if (packedBeforeClear) {
        setMemorySummary(packedBeforeClear);
        window.localStorage.setItem(CHAT_MEMORY_STORAGE_KEY, packedBeforeClear);
      }
    }
  };

  const handleClearMemoryAndChat = () => {
    setChatMessages([DEFAULT_WELCOME_MESSAGE]);
    setMemorySummary("");
    setShowMemoryInspector(false);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
      window.localStorage.removeItem(CHAT_MEMORY_STORAGE_KEY);
    }
  };

  const handleSendChat = useCallback(
    async (customText?: string) => {
      const textToSend = (customText ?? chatInput).trim();
      if (!textToSend || chatSending) return;

      const userMsg: TutorChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: textToSend,
        createdAt: new Date().toISOString(),
      };

      const nextMessages = [...chatMessages, userMsg];
      setChatMessages(nextMessages);
      if (!customText) setChatInput("");
      setChatError(null);
      setLastFailedText(null);
      setChatSending(true);

      try {
        const recentErrors = errors.slice(0, 5).map((e) => ({
          category: e.category,
          wrong: e.wrong,
          correct: e.correct,
        }));

        const packedMemory = buildPackedMemorySummary(
          nextMessages,
          memorySummary
        );

        // Send only the active sliding window (last 4 messages) + packed memory summary
        const activeWindowMessages = nextMessages
          .filter((m) => m.id !== "welcome-msg")
          .slice(-ACTIVE_WINDOW_SIZE)
          .map((m) => ({
            role: m.role,
            content: m.content,
          }));

        const res = await fetch("/api/tutor/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: activeWindowMessages,
            memorySummary: packedMemory,
            cefr: "A1-A2",
            topic: "Everyday Madrid Spanish (es-ES) conversation & grammar",
            knownLemmasSample: knownLemmas.slice(0, 25),
            recentErrors,
            spanishOnlyMode: false,
          }),
        });

        const data = (await res.json()) as {
          reply?: string;
          corrections?: AiCorrectionOutput[];
          error?: string;
        };

        if (!res.ok || data.error || !data.reply) {
          setChatError(
            data.error || "Gemini is temporarily busy. Tap Retry."
          );
          setLastFailedText(textToSend);
          setChatMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
          return;
        }

        const corrections = data.corrections ?? [];
        const tutorMsg: TutorChatMessage = {
          id: `tutor-${Date.now()}`,
          role: "tutor",
          content: data.reply,
          corrections,
          createdAt: new Date().toISOString(),
        };

        setChatMessages((prev) => [...prev, tutorMsg]);

        if (corrections.length > 0) {
          for (const corr of corrections) {
            await recordTutorMistakeToErrorNotebookAndQueue({
              source: "tutor",
              category: corr.category,
              wrong: corr.wrong,
              correct: corr.correct,
              explanation: corr.explanation,
            });
          }
          await loadContextFromOfflineDb();
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent(ERRORS_UPDATED_EVENT));
          }
        }
      } catch (err) {
        console.error("Chat widget error:", err);
      } finally {
        setChatSending(false);
      }
    },
    [
      chatInput,
      chatMessages,
      chatSending,
      errors,
      knownLemmas,
      loadContextFromOfflineDb,
      memorySummary,
    ]
  );

  useEffect(() => {
    const handleOpenEvent = (e: Event) => {
      const custom = e as CustomEvent<{ initialPrompt?: string }>;
      setIsOpen(true);
      if (custom.detail?.initialPrompt) {
        void handleSendChat(custom.detail.initialPrompt);
      }
    };
    window.addEventListener(OPEN_CHAT_WIDGET_EVENT, handleOpenEvent);
    return () =>
      window.removeEventListener(OPEN_CHAT_WIDGET_EVENT, handleOpenEvent);
  }, [handleSendChat]);

  const savedTurnsCount = Math.max(0, chatMessages.length - 1);

  return (
    <>
      {/* Floating Chatbot Launcher Button (Anchored at the bottom-right) */}
      {!isOpen && (
        <div className="fixed bottom-20 sm:bottom-5 right-4 sm:right-5 z-40">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            aria-label="Open Madrid AI Chat"
            className="h-12 px-4 rounded-full bg-[#FF4F17] hover:bg-[#FF6230] text-black font-display font-extrabold text-xs flex items-center gap-2 shadow-[0_12px_32px_rgba(255,79,23,0.45)] border border-white/20 transition-all active:scale-95"
          >
            <MessageCircle className="w-4 h-4 fill-current" />
            <span>Madrid AI</span>
            {savedTurnsCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-black/25 text-black text-[10px] font-extrabold">
                {savedTurnsCount}
              </span>
            )}
            {unreadCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-black text-white text-[10px] flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Floating AI Agent Chat Window / Module (Anchored at the bottom) */}
      {isOpen && (
        <div
          data-word-clickable-zone="true"
          className="fixed bottom-4 inset-x-3 sm:left-auto sm:right-5 sm:w-[390px] z-40 max-w-md mx-auto rounded-[26px] bg-[#14161B]/98 backdrop-blur-2xl border border-white/[0.12] shadow-[0_24px_60px_rgba(0,0,0,0.88)] flex flex-col overflow-hidden h-[510px] max-h-[calc(100vh-32px)] animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          {/* Clean Uncluttered Module Header */}
          <div className="px-4 py-3 bg-[#181A20] border-b border-white/[0.07] flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#FF4F17] text-black font-extrabold text-xs flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(255,79,23,0.35)]">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-display font-extrabold text-sm text-white tracking-tight truncate">
                    Madrid AI Tutor
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-[#FF4F17]/15 text-[#FF4F17] text-[9px] font-extrabold uppercase shrink-0">
                    es-ES
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 truncate">
                  Tap any word for translation & audio
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowMemoryInspector((prev) => !prev)}
                title="View AI Memory"
                className={`w-8 h-8 rounded-xl flex items-center justify-center border transition ${
                  showMemoryInspector || memorySummary
                    ? "bg-[#FF4F17]/15 text-[#FF4F17] border-[#FF4F17]/35"
                    : "bg-white/[0.05] text-zinc-400 border-white/[0.06] hover:text-white"
                }`}
              >
                <Brain className="w-4 h-4" />
              </button>

              {savedTurnsCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearChat}
                  title="New chat (keeps memory)"
                  className="w-8 h-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.06] text-zinc-400 hover:text-white flex items-center justify-center transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close AI Agent"
                className="w-8 h-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.06] text-zinc-400 hover:text-white flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Collapsible Rolling Memory Inspector */}
          {showMemoryInspector && (
            <div className="px-4 py-2.5 bg-[#101216] border-b border-white/[0.08] text-[11px] space-y-1.5 shrink-0">
              <div className="flex items-center justify-between">
                <span className="font-extrabold uppercase tracking-wider text-[10px] text-[#FF4F17]">
                  🧠 Packed Long-Term Memory
                </span>
                <button
                  type="button"
                  onClick={handleClearMemoryAndChat}
                  className="text-[10px] font-bold text-rose-400 hover:underline"
                >
                  Reset All History
                </button>
              </div>
              <p className="text-zinc-300 leading-snug">
                {memorySummary
                  ? memorySummary
                  : "As your chat grows past 4 messages, older messages are automatically packed here so the AI remembers your past topics while keeping responses fast."}
              </p>
            </div>
          )}

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto px-3.5 py-3.5 space-y-3">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col space-y-1.5 ${
                  msg.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[#FF4F17] text-black font-bold rounded-br-md shadow-[0_4px_14px_rgba(255,79,23,0.25)]"
                      : "bg-[#1C1F26] text-zinc-100 border border-white/[0.07] rounded-bl-md"
                  }`}
                >
                  <FormattedTutorText text={msg.content} />
                  {msg.role === "tutor" && (
                    <button
                      type="button"
                      onClick={() =>
                        void playSpanishAudio({
                          text: stripMarkdownForTts(msg.content),
                          audioSource: "es-ES TTS",
                        })
                      }
                      title="Listen"
                      aria-label="Listen"
                      className="mt-2 w-7 h-7 rounded-full bg-white/[0.07] hover:bg-white/[0.14] flex items-center justify-center text-[#FF4F17] transition"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Inline Correction Cards saved to Error Notebook */}
                {msg.corrections && msg.corrections.length > 0 && (
                  <div className="w-full max-w-[88%] space-y-1.5">
                    {msg.corrections.map((c, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-2.5 text-[11px] space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold uppercase text-rose-400">
                            {c.category}
                          </span>
                          <span className="text-[10px] font-bold text-[#FF4F17]">
                            + Saved to Error Notebook
                          </span>
                        </div>
                        <div>
                          <span className="line-through text-rose-300/80 mr-2">
                            {c.wrong}
                          </span>
                          <span className="font-bold text-emerald-300">
                            → {c.correct}
                          </span>
                          <div
                            data-phonetic-guide="true"
                            className="font-mono text-[10px] text-[#FF4F17]/85 mt-0.5"
                          >
                            [{toMadridEnglishPhonetics(c.correct)}]
                          </div>
                        </div>
                        <p className="text-zinc-300">{c.explanation}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Clean 2x2 Starter Grid only when conversation is fresh (no horizontal scrollbar) */}
            {chatMessages.length <= 1 && !chatSending && (
              <div className="pt-1 grid grid-cols-2 gap-1.5">
                {STARTER_PROMPTS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => void handleSendChat(starter)}
                    className="rounded-xl bg-[#1C1F26] border border-white/[0.07] hover:border-[#FF4F17]/50 px-3 py-2 text-left text-[11px] font-semibold text-zinc-300 hover:text-white transition"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            )}

            {chatSending && (
              <div className="text-xs font-semibold text-zinc-400 animate-pulse pl-1">
                Madrid AI is replying…
              </div>
            )}
            {chatError && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-2.5 text-[11px] text-rose-300 space-y-1.5">
                <div>{chatError}</div>
                {lastFailedText && !chatSending && (
                  <button
                    type="button"
                    onClick={() => void handleSendChat(lastFailedText)}
                    className="rounded-lg bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/40 px-2.5 py-1 text-[10px] font-extrabold text-white transition"
                  >
                    ↻ Retry &ldquo;{lastFailedText.slice(0, 30)}&rdquo;
                  </button>
                )}
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Bottom Composer: Evenly spaced 9-column Spanish accent bar + Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendChat();
            }}
            className="p-3 bg-[#181A20] border-t border-white/[0.07] space-y-2 shrink-0"
          >
            <div className="grid grid-cols-9 gap-1">
              {SPANISH_CHARS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setChatInput((prev) => prev + ch)}
                  className="h-7 rounded-lg bg-[#111318] hover:bg-[#FF4F17] text-zinc-300 hover:text-black font-bold text-xs flex items-center justify-center border border-white/[0.07] transition"
                >
                  {ch}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask anything or write in Spanish…"
                className="flex-1 rounded-xl bg-[#111318] border border-white/[0.1] px-3.5 py-2.5 text-xs font-semibold text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF4F17]"
              />
              <button
                type="submit"
                disabled={chatSending || !chatInput.trim()}
                className="rounded-xl bg-[#FF4F17] hover:bg-[#FF6230] px-4 py-2.5 text-xs font-extrabold text-black flex items-center gap-1.5 disabled:opacity-40 transition shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
