"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Check, Lock, MapPin, Volume2, X } from "lucide-react";
import { CityProgressView } from "@/lib/journey/spain-journey";
import { playSpanishAudio } from "@/lib/audio/player";
import { toMadridEnglishPhonetics } from "@/lib/audio/phonetics";

interface SpainJourneyMapProps {
  cities: CityProgressView[];
  wordsLearned: number;
  postcardsEarned: number;
}

export function SpainJourneyMap({
  cities,
  wordsLearned,
  postcardsEarned,
}: SpainJourneyMapProps) {
  const [selectedCity, setSelectedCity] = useState<CityProgressView | null>(
    null
  );

  // Snake rows per docs/SPEC.md:
  // Row 1 (L -> R): 1, 2, 3, 4
  // Row 2 (R -> L): 8, 7, 6, 5
  // Row 3 (L -> R): 9, 10, 11, 12
  const row1 = cities.slice(0, 4);
  const row2 = [...cities.slice(4, 8)].reverse();
  const row3 = cities.slice(8, 12);

  const renderNode = (city: CityProgressView) => {
    const isCurrent = city.status === "current";
    const isDone = city.status === "done";

    return (
      <button
        key={city.week}
        type="button"
        onClick={() => setSelectedCity(city)}
        className={`relative rounded-2xl p-2 border text-left transition-all flex flex-col justify-between min-h-[76px] ${
          isCurrent
            ? "bg-[#FF4F17]/18 border-[#FF4F17] shadow-[0_0_18px_rgba(255,79,23,0.3)]"
            : isDone
              ? "bg-emerald-500/12 border-emerald-500/40"
              : "bg-[#121419] border-white/[0.06] opacity-75 hover:opacity-100"
        }`}
      >
        <div className="flex items-center justify-between gap-1">
          <span
            className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md ${
              isCurrent
                ? "bg-[#FF4F17] text-black"
                : isDone
                  ? "bg-emerald-500/25 text-emerald-300"
                  : "bg-white/[0.06] text-zinc-400"
            }`}
          >
            W{city.week}
          </span>
          <span className="text-xs leading-none">
            {isDone ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : isCurrent ? (
              <MapPin className="w-3.5 h-3.5 text-[#FF4F17]" />
            ) : (
              <Lock className="w-3 h-3 text-zinc-500" />
            )}
          </span>
        </div>

        <div className="mt-1">
          <div className="text-[11px] font-extrabold text-white truncate">
            {city.shortName}
          </div>
          <div className="text-[9px] text-zinc-400 truncate">
            {isCurrent
              ? `${city.overallUnlockPct}% · Here`
              : isDone
                ? `${city.emoji} Postcard`
                : `${city.wordsTarget}w`}
          </div>
        </div>
      </button>
    );
  };

  return (
    <section className="rounded-[28px] bg-[#181A1F] border border-white/[0.06] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#FF4F17]">
            12-WEEK SPAIN JOURNEY MAP
          </div>
          <h2 className="font-display text-base font-extrabold text-white mt-0.5">
            Madrid → Spain → B1
          </h2>
        </div>
        <span className="rounded-full bg-[#22252C] border border-white/[0.08] px-2.5 py-1 text-[10px] font-extrabold text-zinc-200">
          📮 {postcardsEarned}/12 postcards
        </span>
      </div>

      {/* Snake Map Grid */}
      <div className="space-y-1.5">
        {/* Row 1: 1 -> 2 -> 3 -> 4 */}
        <div className="grid grid-cols-4 gap-1.5">{row1.map(renderNode)}</div>

        {/* Turn connector on right */}
        <div className="flex justify-end pr-8 text-[10px] font-extrabold text-[#FF4F17]/70 leading-none">
          ↓
        </div>

        {/* Row 2: 8 <- 7 <- 6 <- 5 */}
        <div className="grid grid-cols-4 gap-1.5">{row2.map(renderNode)}</div>

        {/* Turn connector on left */}
        <div className="flex justify-start pl-8 text-[10px] font-extrabold text-[#FF4F17]/70 leading-none">
          ↓
        </div>

        {/* Row 3: 9 -> 10 -> 11 -> 12 */}
        <div className="grid grid-cols-4 gap-1.5">{row3.map(renderNode)}</div>
      </div>

      {/* Finish Banner */}
      <div className="rounded-2xl bg-[#111318] border border-white/[0.06] px-3 py-2 flex items-center justify-between text-[11px]">
        <span className="font-bold text-zinc-300">
          🏁 Finish: Back in Madrid (B1)
        </span>
        <span className="font-extrabold text-[#FF4F17]">
          {wordsLearned.toLocaleString()} / 3,500w
        </span>
      </div>

      {/* City Postcard & Unlock Details Drawer */}
      {selectedCity && (
        <div className="rounded-2xl bg-[#101217] border border-[#FF4F17]/45 p-3.5 space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base">{selectedCity.emoji}</span>
                <span className="font-display text-sm font-extrabold text-white">
                  Week {selectedCity.week}: {selectedCity.city}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                    selectedCity.status === "done"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : selectedCity.status === "current"
                        ? "bg-[#FF4F17]/20 text-[#FF4F17]"
                        : "bg-white/10 text-zinc-400"
                  }`}
                >
                  {selectedCity.status === "current"
                    ? "You are here"
                    : selectedCity.status}
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Grammar: <strong className="text-zinc-200">{selectedCity.grammar}</strong>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedCity(null)}
              className="w-7 h-7 rounded-xl bg-white/[0.07] text-zinc-400 hover:text-white flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Unlock Criteria */}
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-xl bg-[#181A20] border border-white/[0.06] py-1.5 px-1">
              <div className="text-xs font-extrabold text-white">
                {selectedCity.lessonsDone}/6
              </div>
              <div className="text-[9px] text-zinc-500 uppercase font-bold">
                Lessons
              </div>
            </div>
            <div className="rounded-xl bg-[#181A20] border border-white/[0.06] py-1.5 px-1">
              <div className="text-xs font-extrabold text-white">
                {Math.min(wordsLearned, selectedCity.wordsTarget)}/
                {selectedCity.wordsTarget}
              </div>
              <div className="text-[9px] text-zinc-500 uppercase font-bold">
                Words
              </div>
            </div>
            <div className="rounded-xl bg-[#181A20] border border-white/[0.06] py-1.5 px-1">
              <div className="text-xs font-extrabold text-white">
                {selectedCity.bossScore !== null
                  ? `${selectedCity.bossScore}%`
                  : "80%+"}
              </div>
              <div className="text-[9px] text-zinc-500 uppercase font-bold">
                Boss Test
              </div>
            </div>
          </div>

          {/* Collectible Postcard Fact & Local es-ES Phrase */}
          <div className="rounded-xl bg-[#181A20] border border-white/[0.06] p-2.5 space-y-1.5 text-xs">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17]">
              📮 Local Postcard · {selectedCity.city}
            </div>
            <p className="text-[11px] text-zinc-300 leading-snug">
              {selectedCity.localFact}
            </p>
            <div className="pt-1 border-t border-white/[0.06] flex items-start justify-between gap-2">
              <div className="space-y-0.5">
                <div className="font-bold text-white text-xs">
                  «{selectedCity.localPhraseEs}»
                </div>
                <div className="font-mono text-[10px] text-[#FF4F17]/85">
                  [{toMadridEnglishPhonetics(selectedCity.localPhraseEs)}]
                </div>
                <div className="text-[10px] text-zinc-400">
                  {selectedCity.localPhraseEn}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  void playSpanishAudio({
                    text: selectedCity.localPhraseEs,
                    audioSource: "es-ES TTS",
                  })
                }
                title="Listen"
                aria-label="Listen"
                className="shrink-0 w-7 h-7 rounded-lg bg-[#FF4F17]/15 hover:bg-[#FF4F17] text-[#FF4F17] hover:text-black border border-[#FF4F17]/35 flex items-center justify-center transition"
              >
                <Volume2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-zinc-400 truncate">
              Boss: <strong className="text-zinc-200">{selectedCity.bossRoleplay}</strong>
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <Link
                href="/speak"
                className="rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-white px-2.5 py-1 font-extrabold text-[11px]"
              >
                🎙️ Boss
              </Link>
              <Link
                href="/tutor"
                className="rounded-full bg-[#FF4F17] text-black px-2.5 py-1 font-extrabold text-[11px]"
              >
                W{selectedCity.week} »
              </Link>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
