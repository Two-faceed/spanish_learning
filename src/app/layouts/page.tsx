"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Flame,
  GraduationCap,
  Home,
  Layers,
  MapPin,
  MessageCircle,
  Mic,
  MoreHorizontal,
  PenTool,
  PhoneCall,
  Play,
  Send,
  Settings,
  Sparkles,
  TrendingUp,
  Volume2,
  X,
} from "lucide-react";

type ProtoTab = "today" | "review" | "speak" | "read" | "more";

const DAILY_STAGES = [
  {
    id: 1,
    title: "Remember Old Words",
    sub: "32 due FSRS cards · es-ES audio",
    mins: "12m",
    status: "done" as const,
    tab: "review" as ProtoTab,
  },
  {
    id: 2,
    title: "Learn New Words",
    sub: "10 new Madrid words + mined cards",
    mins: "10m",
    status: "current" as const,
    tab: "review" as ProtoTab,
  },
  {
    id: 3,
    title: "Madrid Grammar Lesson",
    sub: "Week 1 · Ser vs Estar · 8 exercises",
    mins: "12m",
    status: "pending" as const,
    tab: "more" as ProtoTab,
  },
  {
    id: 4,
    title: "Pronunciation Coach",
    sub: "Shadow 5 sentences · Focus θ & rr",
    mins: "8m",
    status: "pending" as const,
    tab: "speak" as ProtoTab,
  },
  {
    id: 5,
    title: "Voice Roleplay",
    sub: "Carlos · Order coffee in Malasaña",
    mins: "8m",
    status: "pending" as const,
    tab: "speak" as ProtoTab,
  },
  {
    id: 6,
    title: "Read & Listen",
    sub: "Crónicas · Resume Page 4 of 46",
    mins: "8m",
    status: "pending" as const,
    tab: "read" as ProtoTab,
  },
  {
    id: 7,
    title: "Daily Wrap-Up",
    sub: "Streak, XP ring & Spain Journey Map",
    mins: "2m",
    status: "pending" as const,
    tab: "more" as ProtoTab,
  },
];

export default function NewLayoutPrototypePage() {
  const [activeTab, setActiveTab] = useState<ProtoTab>("today");
  const [speakSubTab, setSpeakSubTab] = useState<"pronounce" | "call">(
    "pronounce"
  );
  const [cardRevealed, setCardRevealed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="min-h-screen -mx-4 px-3 py-4 space-y-4">
      {/* Prototype Banner (Visual-Only Notice) */}
      <div className="rounded-3xl bg-[#181A1F] border border-white/10 p-4 flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF4F17]">
            VISUAL PROTOTYPE ONLY · NO LOGIC CONNECTED
          </div>
          <h1 className="font-display text-lg font-extrabold text-white">
            New Minimalist Layout (Layout 1)
          </h1>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Tap any bottom tab, daily stage, flashcard, or the floating{" "}
            <strong className="text-white">Madrid AI</strong> button to preview
            how the whole app will feel.
          </p>
        </div>
        <Link
          href="/"
          className="shrink-0 h-9 px-3 rounded-2xl bg-white/[0.07] hover:bg-white/[0.14] text-xs font-bold text-zinc-200 inline-flex items-center gap-1 transition"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>App</span>
        </Link>
      </div>

      {/* Full Interactive 375px Mobile Prototype Frame */}
      <div className="relative mx-auto w-full max-w-[390px] min-h-[760px] rounded-[40px] bg-[#0D0E11] text-white border-[6px] border-[#242731] shadow-[0_30px_90px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col">
        {/* Clean Minimalist Top Header (Only 3 elements!) */}
        <header className="px-5 pt-5 pb-3 bg-[#0D0E11]/90 backdrop-blur-xl border-b border-white/[0.05] flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("today")}
            className="flex items-center gap-2.5 text-left cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-[#FF4F17] text-black font-black text-xs flex items-center justify-center shadow-[0_0_16px_rgba(255,79,23,0.35)]">
              ES
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#FF4F17]">
                W1 · MADRID · ES-ES
              </div>
              <div className="font-display text-sm font-extrabold leading-tight">
                Español Fast
              </div>
            </div>
          </button>

          <div className="flex items-center gap-2">
            <div className="h-8 px-2.5 rounded-full bg-[#181A1F] border border-white/[0.07] text-xs font-bold inline-flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-[#FF4F17] fill-[#FF4F17]" />
              <span>12d</span>
              <span className="text-white/20">·</span>
              <span className="text-zinc-400">45xp</span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("more")}
              title="Settings, Audio Speed & Theme"
              className="w-8 h-8 rounded-full bg-[#181A1F] border border-white/[0.07] flex items-center justify-center text-zinc-400 hover:text-white transition cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* ===================== SCREEN CONTENT AREA ===================== */}
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 space-y-4">
          {/* ---------------------------------------------------------
              TAB 1: TODAY (SINGLE-FOCUS DAILY STAGES)
          --------------------------------------------------------- */}
          {activeTab === "today" && (
            <>
              {/* Hero: Current Active Stage */}
              <section className="rounded-[28px] bg-[#181A1F] border border-white/[0.07] p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#FF4F17]">
                    UP NEXT · STAGE 2 OF 7
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-white/[0.06] text-[10px] font-extrabold text-zinc-300">
                    60m Budget
                  </span>
                </div>

                <div>
                  <h2 className="font-display text-2xl font-extrabold tracking-tight text-white">
                    Learn New Words
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    10 new Madrid words in frequency order + words mined while
                    reading.
                  </p>
                </div>

                {/* 7-Stage Minimal Progress Bar */}
                <div className="grid grid-cols-7 gap-1.5">
                  {DAILY_STAGES.map((st) => (
                    <div
                      key={st.id}
                      className={`h-1.5 rounded-full transition ${
                        st.status === "done"
                          ? "bg-emerald-400"
                          : st.status === "current"
                            ? "bg-[#FF4F17]"
                            : "bg-white/10"
                      }`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab("review")}
                  className="w-full py-3.5 px-5 rounded-full bg-[#FF4F17] hover:bg-[#FF6230] text-black font-extrabold text-sm flex items-center justify-between shadow-[0_10px_28px_rgba(255,79,23,0.35)] transition cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <Play className="w-4 h-4 fill-current" />
                    Continue Stage 2 (10m)
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </section>

              {/* All 7 Daily Stages Checklist (Clean Vertical Timeline) */}
              <section className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                    Today&apos;s Path (1 / 7 Done)
                  </span>
                  <span className="text-[10px] font-bold text-zinc-500">
                    Tap any stage
                  </span>
                </div>

                <div className="rounded-[24px] bg-[#14161B] border border-white/[0.06] divide-y divide-white/[0.05] overflow-hidden">
                  {DAILY_STAGES.map((stage) => {
                    const isDone = stage.status === "done";
                    const isCurrent = stage.status === "current";
                    return (
                      <button
                        key={stage.id}
                        type="button"
                        onClick={() => setActiveTab(stage.tab)}
                        className={`w-full px-4 py-3 flex items-center justify-between gap-3 text-left transition cursor-pointer ${
                          isCurrent
                            ? "bg-[#FF4F17]/10"
                            : "hover:bg-white/[0.03]"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-extrabold ${
                              isDone
                                ? "bg-emerald-500/20 text-emerald-400"
                                : isCurrent
                                  ? "bg-[#FF4F17] text-black"
                                  : "bg-white/[0.06] text-zinc-400"
                            }`}
                          >
                            {isDone ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              stage.id
                            )}
                          </div>
                          <div className="min-w-0">
                            <div
                              className={`text-xs font-extrabold truncate ${
                                isDone
                                  ? "text-zinc-400 line-through"
                                  : isCurrent
                                    ? "text-white"
                                    : "text-zinc-200"
                              }`}
                            >
                              {stage.title}
                            </div>
                            <div className="text-[10px] text-zinc-500 truncate">
                              {stage.sub}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`text-[10px] font-extrabold ${
                              isCurrent ? "text-[#FF4F17]" : "text-zinc-500"
                            }`}
                          >
                            {stage.mins}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Compact Spain Journey Bar */}
              <button
                type="button"
                onClick={() => setActiveTab("more")}
                className="w-full rounded-2xl bg-[#181A1F] border border-white/[0.06] px-4 py-3 flex items-center justify-between text-xs hover:border-[#FF4F17]/40 transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#FF4F17]" />
                  <span className="font-extrabold text-white">
                    Madrid → Toledo
                  </span>
                  <span className="text-zinc-500">· 420 / 3,500w</span>
                </div>
                <span className="text-[11px] font-extrabold text-[#FF4F17]">
                  12 Cities »
                </span>
              </button>
            </>
          )}

          {/* ---------------------------------------------------------
              TAB 2: REVIEW (MINIMALIST FLASHCARD SCREEN)
          --------------------------------------------------------- */}
          {activeTab === "review" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17]">
                  NEW WORD · 3 / 10
                </span>
                <span className="px-2.5 py-1 rounded-full bg-[#181A1F] border border-white/[0.07] text-[10px] font-bold text-zinc-300">
                  1× Speed
                </span>
              </div>

              <div className="h-1.5 rounded-full bg-[#181A1F] overflow-hidden">
                <div className="h-full w-[30%] bg-[#FF4F17] rounded-full" />
              </div>

              {/* Clean Focused Flashcard */}
              <div className="rounded-[28px] bg-[#181A1F] border border-white/[0.07] p-6 text-center space-y-5 min-h-[330px] flex flex-col justify-between">
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                  <span>RANK #148</span>
                  <span className="px-2 py-0.5 rounded-lg bg-sky-500/15 text-sky-300 font-bold">
                    el · masc
                  </span>
                </div>

                <div className="space-y-2.5 my-auto">
                  <div className="font-display text-4xl font-extrabold tracking-tight text-sky-300">
                    el desayuno
                  </div>
                  <div className="font-mono text-xs font-bold text-[#FF4F17]">
                    [ehl deh-sah-YOO-noh]
                  </div>

                  <div className="flex justify-center gap-2 pt-2">
                    <button
                      type="button"
                      className="px-4 py-2 rounded-full bg-[#FF4F17]/15 border border-[#FF4F17]/35 text-[#FF4F17] text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>es-ES</span>
                    </button>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-full bg-white/[0.06] border border-white/[0.08] text-zinc-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Mic className="w-3.5 h-3.5 text-[#FF4F17]" />
                      <span>Speak</span>
                    </button>
                  </div>

                  {cardRevealed && (
                    <div className="mt-4 pt-4 border-t border-white/[0.08] space-y-1.5 animate-in fade-in duration-150">
                      <div className="text-lg font-extrabold text-white">
                        breakfast
                      </div>
                      <div className="text-xs text-zinc-400">
                        «El desayuno en Madrid es una tostada con tomate.»
                      </div>
                    </div>
                  )}
                </div>

                {!cardRevealed ? (
                  <button
                    type="button"
                    onClick={() => setCardRevealed(true)}
                    className="w-full py-3 rounded-full bg-[#FF4F17] text-black font-extrabold text-xs cursor-pointer"
                  >
                    Show Answer
                  </button>
                ) : (
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { l: "Again", t: "1m", c: "text-rose-300 bg-rose-500/15 border-rose-500/30" },
                      { l: "Hard", t: "1d", c: "text-amber-300 bg-amber-500/15 border-amber-500/30" },
                      { l: "Good", t: "4d", c: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30" },
                      { l: "Easy", t: "9d", c: "text-sky-300 bg-sky-500/15 border-sky-500/30" },
                    ].map((btn) => (
                      <button
                        key={btn.l}
                        type="button"
                        onClick={() => setCardRevealed(false)}
                        className={`rounded-xl py-2 border text-center cursor-pointer ${btn.c}`}
                      >
                        <div className="text-[11px] font-extrabold">{btn.l}</div>
                        <div className="text-[9px] opacity-80">{btn.t}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------
              TAB 3: SPEAK (PRONUNCIATION + VOICE ROLEPLAY TOGETHER!)
          --------------------------------------------------------- */}
          {activeTab === "speak" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-[#181A1F] p-1 border border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setSpeakSubTab("pronounce")}
                  className={`py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                    speakSubTab === "pronounce"
                      ? "bg-[#FF4F17] text-black"
                      : "text-zinc-400"
                  }`}
                >
                  Pronunciation
                </button>
                <button
                  type="button"
                  onClick={() => setSpeakSubTab("call")}
                  className={`py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                    speakSubTab === "call"
                      ? "bg-[#FF4F17] text-black"
                      : "text-zinc-400"
                  }`}
                >
                  Voice Roleplay
                </button>
              </div>

              {speakSubTab === "pronounce" ? (
                <div className="rounded-[28px] bg-[#181A1F] border border-white/[0.07] p-5 space-y-4">
                  <div className="flex items-center justify-between text-[10px] font-extrabold uppercase text-[#FF4F17]">
                    <span>SHADOWING · 1 / 5</span>
                    <span className="text-emerald-400">92% LAST</span>
                  </div>
                  <div className="space-y-1">
                    <div className="font-display text-lg font-extrabold">
                      El jamón de Madrid está delicioso.
                    </div>
                    <div className="font-mono text-[11px] text-[#FF4F17]/90">
                      [ehl khah-MOHN deh mah-DREED ehs-TAH deh-lee-THYOH-soh]
                    </div>
                  </div>
                  {/* Clean Waveform */}
                  <div className="h-14 rounded-2xl bg-[#101216] px-4 flex items-center justify-between gap-1">
                    {[18, 35, 70, 95, 55, 80, 45, 90, 60, 30, 65, 85, 40, 25, 50, 20].map(
                      (h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-full bg-emerald-400/80"
                          style={{ height: `${h}%` }}
                        />
                      )
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="h-11 rounded-2xl bg-white/[0.07] text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Volume2 className="w-4 h-4 text-[#FF4F17]" />
                      Listen
                    </button>
                    <button
                      type="button"
                      className="h-11 rounded-2xl bg-[#FF4F17] text-black text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Mic className="w-4 h-4" />
                      Record
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {[
                    { t: "Order Coffee & Tostada", tag: "W1 Boss · ✓ 85%" },
                    { t: "Open a Bank Account", tag: "W8 Boss · A2" },
                    { t: "Rent a Flat in Chamberí", tag: "W10 Boss · B1" },
                    { t: "Pitch Powerbank to Bar", tag: "W12 Boss · B1" },
                  ].map((s) => (
                    <div
                      key={s.t}
                      className="rounded-2xl bg-[#181A1F] border border-white/[0.06] p-4 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-extrabold text-white">
                          {s.t}
                        </div>
                        <div className="text-[10px] text-[#FF4F17] font-bold mt-0.5">
                          {s.tag}
                        </div>
                      </div>
                      <span className="w-9 h-9 rounded-full bg-[#FF4F17]/15 text-[#FF4F17] flex items-center justify-center">
                        <PhoneCall className="w-4 h-4" />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ---------------------------------------------------------
              TAB 4: READ (CLEAN PAGINATED READER)
          --------------------------------------------------------- */}
          {activeTab === "read" && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17]">
                    CONTINUE READING
                  </div>
                  <div className="font-display text-lg font-extrabold">
                    Crónicas de un viaje
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-extrabold text-emerald-300">
                  Page 4 / 46
                </span>
              </div>

              <div className="rounded-[26px] bg-[#181A1F] border border-white/[0.07] p-4 space-y-3">
                <p className="text-sm leading-relaxed text-zinc-100">
                  El{" "}
                  <span className="bg-sky-500/20 text-sky-200 border-b border-sky-400/50 px-1 rounded">
                    tren
                  </span>{" "}
                  de cercanías se detuvo en Atocha con un{" "}
                  <span className="bg-amber-500/20 text-amber-200 border-b border-amber-400/50 px-1 rounded">
                    suspiro
                  </span>{" "}
                  metálico bajo la bóveda de cristal.
                </p>
                <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                  <span className="text-[10px] text-zinc-400">
                    Tap any word to mine
                  </span>
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-full bg-[#FF4F17] text-black text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    Read Page
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-[#181A1F] border border-white/[0.06] p-3.5 space-y-1">
                  <Sparkles className="w-4 h-4 text-[#FF4F17]" />
                  <div className="text-xs font-extrabold">AI Story</div>
                  <div className="text-[10px] text-zinc-400">
                    By your topic &amp; vocab
                  </div>
                </div>
                <div className="rounded-2xl bg-[#181A1F] border border-white/[0.06] p-3.5 space-y-1">
                  <Download className="w-4 h-4 text-[#FF4F17]" />
                  <div className="text-xs font-extrabold">Import</div>
                  <div className="text-[10px] text-zinc-400">
                    Paste, EPUB or URL
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------
              TAB 5: MORE (ALL OTHER MODULES IN ONE CLEAN HUB)
          --------------------------------------------------------- */}
          {activeTab === "more" && (
            <div className="space-y-3">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 px-1">
                ALL TOOLS &amp; SETTINGS
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { t: "Grammar Tutor", s: "12-Week Lessons", Icon: GraduationCap },
                  { t: "Practice Lab", s: "Dictation · Verbs", Icon: PenTool },
                  { t: "Spain Journey", s: "12 Cities & Map", Icon: MapPin },
                  { t: "Progress & CEFR", s: "Day-90 & Level", Icon: TrendingUp },
                  { t: "Vocab Vault", s: "5,009 Words", Icon: Layers },
                  { t: "Import Deck", s: "Anki .apkg", Icon: Download },
                ].map(({ t, s, Icon }) => (
                  <div
                    key={t}
                    className="rounded-2xl bg-[#181A1F] border border-white/[0.06] p-3.5 space-y-1.5"
                  >
                    <Icon className="w-4 h-4 text-[#FF4F17]" />
                    <div className="text-xs font-extrabold text-white">{t}</div>
                    <div className="text-[10px] text-zinc-400">{s}</div>
                  </div>
                ))}
              </div>

              {/* Clean Quick Controls (Moved out of crowded top bar!) */}
              <div className="rounded-2xl bg-[#181A1F] border border-white/[0.06] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-zinc-300">
                    Audio Speed (es-ES)
                  </span>
                  <div className="flex gap-1">
                    {["0.6×", "0.8×", "1×"].map((spd) => (
                      <span
                        key={spd}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold ${
                          spd === "1×"
                            ? "bg-[#FF4F17] text-black"
                            : "bg-white/[0.06] text-zinc-400"
                        }`}
                      >
                        {spd}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs pt-2 border-t border-white/[0.06]">
                  <span className="font-bold text-zinc-300">
                    Theme &amp; TTS Engine
                  </span>
                  <span className="text-[11px] font-extrabold text-[#FF4F17]">
                    Settings »
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===================== FLOATING MADRID AI CHATBOT ===================== */}
        {!chatOpen && (
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="absolute bottom-[82px] right-4 z-30 h-11 px-3.5 rounded-full bg-[#FF4F17] hover:bg-[#FF6230] text-black font-display font-extrabold text-xs inline-flex items-center gap-1.5 shadow-[0_10px_28px_rgba(255,79,23,0.45)] border border-white/20 transition active:scale-95 cursor-pointer"
          >
            <MessageCircle className="w-4 h-4 fill-current" />
            <span>Madrid AI</span>
          </button>
        )}

        {chatOpen && (
          <div className="absolute inset-x-3 bottom-3 z-40 rounded-[26px] bg-[#14161B]/98 backdrop-blur-2xl border border-[#FF4F17]/40 shadow-2xl overflow-hidden flex flex-col h-[390px]">
            <div className="px-4 py-3 bg-[#181A20] border-b border-white/[0.07] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-[#FF4F17] text-black flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-extrabold">Madrid AI Tutor</div>
                  <div className="text-[10px] text-zinc-400">
                    Remembers your history · es-ES
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="w-7 h-7 rounded-xl bg-white/[0.07] text-zinc-300 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 p-3.5 space-y-2.5 overflow-y-auto text-xs">
              <div className="max-w-[85%] rounded-2xl bg-[#1C1F26] border border-white/[0.06] px-3 py-2 text-zinc-100">
                ¡Hola! Ask me anything while you study — click any word for
                translation &amp; audio.
              </div>
              <div className="ml-auto max-w-[80%] rounded-2xl bg-[#FF4F17] text-black font-bold px-3 py-2">
                How do I say &ldquo;a coffee please&rdquo; in Madrid?
              </div>
              <div className="max-w-[85%] rounded-2xl bg-[#1C1F26] border border-white/[0.06] px-3 py-2 text-zinc-100">
                In Madrid, locals say &ldquo;Ponme un café con leche, por
                favor.&rdquo;
              </div>
            </div>

            <div className="p-2.5 bg-[#181A20] border-t border-white/[0.07] flex gap-2">
              <input
                type="text"
                readOnly
                placeholder="Ask anything in Spanish or English…"
                className="flex-1 rounded-xl bg-[#101216] border border-white/10 px-3 py-2 text-xs text-zinc-400"
              />
              <button
                type="button"
                className="px-3 py-2 rounded-xl bg-[#FF4F17] text-black text-xs font-extrabold inline-flex items-center gap-1"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ===================== CLEAN 5-TAB BOTTOM PILL DOCK ===================== */}
        <nav className="absolute bottom-3 inset-x-3 z-20">
          <div className="rounded-full bg-[#16181D]/95 backdrop-blur-2xl border border-white/[0.08] shadow-[0_14px_36px_rgba(0,0,0,0.75)] p-1.5 grid grid-cols-5">
            {(
              [
                { id: "today", label: "Today", Icon: Home },
                { id: "review", label: "Review", Icon: Layers },
                { id: "speak", label: "Speak", Icon: Mic },
                { id: "read", label: "Read", Icon: BookOpen },
                { id: "more", label: "More", Icon: MoreHorizontal },
              ] as const
            ).map(({ id, label, Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`py-1.5 rounded-full flex flex-col items-center transition cursor-pointer ${
                    active
                      ? "bg-[#FF4F17] text-black font-extrabold shadow-[0_4px_14px_rgba(255,79,23,0.4)]"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-[9px] font-extrabold mt-0.5">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
