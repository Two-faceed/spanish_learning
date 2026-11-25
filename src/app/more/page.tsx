"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Download,
  GraduationCap,
  Layers,
  Mic,
  Palette,
  PenTool,
  PhoneCall,
  Settings,
  TrendingUp,
} from "lucide-react";
import { offlineDb } from "@/lib/offline/db";
import { computeJourneyProgress } from "@/lib/journey/spain-journey";
import { SpainJourneyMap } from "@/components/SpainJourneyMap";
import { LessonRecord } from "@/types/database";
import { AppThemeId, getAppTheme, setAppTheme } from "@/lib/theme";

export default function MoreHubPage() {
  const [lessons, setLessons] = useState<LessonRecord[]>([]);
  const [wordsLearned, setWordsLearned] = useState(0);
  const [totalNotes, setTotalNotes] = useState(0);
  const [theme, setThemeState] = useState<AppThemeId>("blaze");

  useEffect(() => {
    setThemeState(getAppTheme());
    if (!offlineDb) return;
    void Promise.all([
      offlineDb.lessons.toArray(),
      offlineDb.cards.toArray(),
      offlineDb.notes.count(),
    ]).then(([allLessons, allCards, notesCount]) => {
      setLessons(allLessons);
      setTotalNotes(notesCount);
      const learnedIds = new Set(
        allCards.filter((c) => c.reps > 0).map((c) => c.note_id)
      );
      setWordsLearned(learnedIds.size);
    });
  }, []);

  const journey = computeJourneyProgress({ lessons, wordsLearned });

  const handleToggleTheme = () => {
    const next: AppThemeId = theme === "blaze" ? "violet" : "blaze";
    setThemeState(next);
    setAppTheme(next);
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="pt-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF4F17]">
          ALL MODULES &amp; JOURNEY
        </div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">
          Explore &amp; Tools
        </h1>
      </div>

      {/* Clean 2-Column Tool Grid */}
      <section className="grid grid-cols-2 gap-2.5">
        {[
          {
            href: "/practice",
            title: "Practice Lab",
            sub: "Dictation · Verbs · Journal",
            Icon: PenTool,
          },
          {
            href: "/progress",
            title: "Progress & CEFR",
            sub: "Day-90 target & 4w test",
            Icon: TrendingUp,
          },
          {
            href: "/pronunciation",
            title: "Pronunciation",
            sub: "Shadowing · Pairs · θ & rr",
            Icon: Mic,
          },
          {
            href: "/speak",
            title: "Voice Roleplay",
            sub: "9 Madrid & Boss calls",
            Icon: PhoneCall,
          },
          {
            href: "/words",
            title: "Vocab Vault",
            sub: `${totalNotes.toLocaleString()} words indexed`,
            Icon: Layers,
          },
          {
            href: "/import",
            title: "Import Deck",
            sub: "Anki .apkg & audio",
            Icon: Download,
          },
          {
            href: "/tutor",
            title: "Grammar Tutor",
            sub: "12-week lessons & errors",
            Icon: GraduationCap,
          },
          {
            href: "/read",
            title: "Reading Library",
            sub: "Books, AI Story & Mining",
            Icon: BookOpen,
          },
        ].map(({ href, title, sub, Icon }) => (
          <Link
            key={href}
            href={href}
            className="rounded-[22px] bg-[#181A1F] hover:border-[#FF4F17]/45 border border-white/[0.06] p-3.5 space-y-1.5 transition"
          >
            <div className="w-8 h-8 rounded-xl bg-[#FF4F17]/15 text-[#FF4F17] flex items-center justify-center">
              <Icon className="w-4 h-4" />
            </div>
            <div className="text-xs font-extrabold text-white">{title}</div>
            <div className="text-[10px] text-zinc-400 leading-snug">{sub}</div>
          </Link>
        ))}
      </section>

      {/* Quick Theme & Settings Card */}
      <section className="rounded-[24px] bg-[#181A1F] border border-white/[0.06] p-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleToggleTheme}
          className="flex items-center gap-2 text-xs font-extrabold text-white hover:text-[#FF4F17] transition cursor-pointer"
        >
          <Palette className="w-4 h-4 text-[#FF4F17]" />
          <span>
            Theme: {theme === "violet" ? "Future Violet" : "Carbon Blaze"}
          </span>
        </button>

        <Link
          href="/settings"
          className="px-3 py-1.5 rounded-full bg-white/[0.07] hover:bg-[#FF4F17] text-zinc-200 hover:text-black text-[11px] font-extrabold inline-flex items-center gap-1 transition"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Setup &amp; Cost »</span>
        </Link>
      </section>

      {/* 12-City Spain Journey Map */}
      <SpainJourneyMap
        cities={journey.cities}
        wordsLearned={wordsLearned}
        postcardsEarned={journey.postcardsEarned}
      />
    </div>
  );
}
