"use client";

import React, { useMemo, useState } from "react";
import { Check, Trophy } from "lucide-react";
import { AchievementCategory, BadgeItem } from "@/lib/journey/spain-journey";

type FilterTab = "all" | "unlocked" | AchievementCategory;

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unlocked", label: "Unlocked" },
  { id: "vocab", label: "Vocab" },
  { id: "reviews", label: "Reviews" },
  { id: "streaks", label: "Streaks" },
  { id: "grammar", label: "Grammar" },
  { id: "xp", label: "XP" },
  { id: "skills", label: "Skills" },
];

export function AchievementsWall({ badges }: { badges: BadgeItem[] }) {
  const [filter, setFilter] = useState<FilterTab>("all");

  const earnedCount = useMemo(
    () => badges.filter((b) => b.earned).length,
    [badges]
  );

  const visible = useMemo(() => {
    const filtered = badges.filter((b) => {
      if (filter === "all") return true;
      if (filter === "unlocked") return b.earned;
      return b.category === filter;
    });
    // Sort unlocked first, then closest-to-unlocking first
    return [...filtered].sort((a, b) => {
      if (a.earned !== b.earned) return a.earned ? -1 : 1;
      const pctA = a.target > 0 ? a.progress / a.target : 0;
      const pctB = b.target > 0 ? b.progress / b.target : 0;
      return pctB - pctA;
    });
  }, [badges, filter]);

  const totalPct =
    badges.length > 0 ? Math.round((earnedCount / badges.length) * 100) : 0;

  return (
    <section className="bento-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF4F17] flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5" />
          <span>Achievements</span>
        </span>
        <span className="text-[11px] font-extrabold text-white">
          {earnedCount} / {badges.length} unlocked ({totalPct}%)
        </span>
      </div>

      {/* Overall Trophy Progress */}
      <div className="h-1.5 rounded-full bg-[#101216] overflow-hidden border border-white/[0.05]">
        <div
          className="h-full rounded-full bg-[#FF4F17] transition-all duration-300"
          style={{ width: `${totalPct}%` }}
        />
      </div>

      {/* Scrollable Category Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {FILTER_TABS.map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-extrabold border transition ${
                active
                  ? "bg-[#FF4F17] text-black border-[#FF4F17]"
                  : "bg-[#121419] text-zinc-400 border-white/[0.06] hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 2-Column Achievement Cards */}
      {visible.length === 0 ? (
        <div className="rounded-2xl bg-[#121419] border border-white/[0.05] p-4 text-center text-xs text-zinc-400">
          No achievements unlocked in this filter yet — keep going!
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {visible.map((b) => {
            const pct =
              b.target > 0
                ? Math.min(100, Math.round((b.progress / b.target) * 100))
                : 0;
            return (
              <div
                key={b.key}
                className={`rounded-2xl p-2.5 border space-y-1.5 transition ${
                  b.earned
                    ? "bg-[#FF4F17]/15 border-[#FF4F17]/40 text-white"
                    : "bg-[#121419] border-white/[0.05] text-zinc-400"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-lg leading-none">{b.emoji}</span>
                  {b.earned ? (
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-zinc-500">
                      {b.progress.toLocaleString()}/{b.target.toLocaleString()}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <div
                    className={`text-[11px] font-extrabold truncate ${
                      b.earned ? "text-white" : "text-zinc-300"
                    }`}
                  >
                    {b.label}
                  </div>
                  <div className="text-[10px] text-zinc-400 leading-snug line-clamp-2">
                    {b.description}
                  </div>
                </div>

                {!b.earned && (
                  <div className="h-1 rounded-full bg-[#0C0D11] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#FF4F17]/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
