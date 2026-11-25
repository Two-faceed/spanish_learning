"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Flame,
  Gauge,
  GraduationCap,
  Home,
  Layers,
  Mic,
  MoreHorizontal,
  Settings,
  WifiOff,
} from "lucide-react";
import { syncPendingToServer } from "@/lib/offline/sync-manager";
import { getOrInitTodaySession, offlineDb } from "@/lib/offline/db";
import {
  pullAllCloudDataChunked,
  pushProgressToCloudFast,
  syncProgressFromCloudFast,
} from "@/lib/offline/backup";
import {
  AudioPlaybackSpeed,
  getAudioPlaybackSpeed,
  setAudioPlaybackSpeed,
} from "@/lib/audio/player";
import {
  AppThemeId,
  applyThemeToDocument,
  getAppTheme,
  subscribeAppTheme,
} from "@/lib/theme";
import { WordSelectionPopup } from "@/components/WordSelectionPopup";
import { MadridChatWidget } from "@/components/MadridChatWidget";

const SPEED_CYCLE: AudioPlaybackSpeed[] = [1.0, 0.8, 0.6];

export function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [streak, setStreak] = useState(1);
  const [xp, setXp] = useState(0);
  const [audioSpeed, setAudioSpeedState] = useState<AudioPlaybackSpeed>(1.0);
  const [theme, setThemeState] = useState<AppThemeId>("blaze");

  useEffect(() => {
    setAudioSpeedState(getAudioPlaybackSpeed());
    const initialTheme = getAppTheme();
    setThemeState(initialTheme);
    applyThemeToDocument(initialTheme);
    return subscribeAppTheme((nextTheme) => {
      setThemeState(nextTheme);
    });
  }, []);

  const handleCycleSpeed = () => {
    const idx = SPEED_CYCLE.indexOf(audioSpeed);
    const next = SPEED_CYCLE[(idx + 1) % SPEED_CYCLE.length];
    setAudioSpeedState(next);
    setAudioPlaybackSpeed(next);
  };

  useEffect(() => {
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    const refreshStatus = async () => {
      if (!offlineDb) return;
      const pending = await offlineDb.pending_reviews.count();
      setPendingSyncCount(pending);
      const sess = await getOrInitTodaySession();
      setStreak(sess.streak);
      setXp(sess.xp);
    };

    void refreshStatus();

    // Automatic cloud sync:
    // 1. Fresh device (0 notes): full chunked pull from Supabase.
    // 2. Existing device: fast <250ms progress pull (reviewed cards, XP, lessons, texts) every 45s.
    const autoSyncCloud = async () => {
      if (!offlineDb || typeof window === "undefined" || !navigator.onLine) return;
      const localNotesCount = await offlineDb.notes.count();
      if (localNotesCount === 0) {
        if (window.sessionStorage.getItem("spanishx_autopull_checked") === "1") {
          return;
        }
        window.sessionStorage.setItem("spanishx_autopull_checked", "1");
        try {
          const stats = await pullAllCloudDataChunked();
          if (stats.notes > 0 || stats.sessions > 0) {
            window.location.reload();
          }
        } catch {
          // Offline or Supabase not configured yet
        }
        return;
      }

      const lastFastPull = Number(
        window.sessionStorage.getItem("spanishx_fast_pull_ts") ?? "0"
      );
      if (Date.now() - lastFastPull < 15_000) return;
      window.sessionStorage.setItem("spanishx_fast_pull_ts", String(Date.now()));
      const updated = await syncProgressFromCloudFast();
      if (updated) {
        void refreshStatus();
        window.dispatchEvent(new Event("spanishx:cloud-synced"));
      }
    };
    void autoSyncCloud();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void autoSyncCloud();
      } else if (document.visibilityState === "hidden") {
        void pushProgressToCloudFast();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const handleOnline = () => {
      setIsOnline(true);
      void syncPendingToServer().then(() => refreshStatus());
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const interval = setInterval(() => void refreshStatus(), 4000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(interval);
    };
  }, [pathname]);

  const navItems = [
    { href: "/", label: "Today", icon: Home },
    { href: "/review", label: "Review", icon: Layers },
    { href: "/tutor", label: "Tutor", icon: GraduationCap },
    { href: "/speak", label: "Speak", icon: Mic },
    { href: "/read", label: "Read", icon: BookOpen },
    { href: "/more", label: "More", icon: MoreHorizontal },
  ];

  const isNavActive = (href: string) => {
    if (href === "/") return pathname === "/" || pathname.startsWith("/today");
    if (href === "/speak") {
      return (
        pathname.startsWith("/speak") || pathname.startsWith("/pronunciation")
      );
    }
    if (href === "/more") {
      return (
        pathname.startsWith("/more") ||
        pathname.startsWith("/practice") ||
        pathname.startsWith("/progress") ||
        pathname.startsWith("/words") ||
        pathname.startsWith("/import") ||
        pathname.startsWith("/settings")
      );
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen w-full overflow-x-clip flex flex-col bg-[#0D0E11] text-white selection:bg-[#FF4F17] selection:text-black">
      {/* Ambient top glow */}
      <div
        className={`pointer-events-none fixed inset-x-0 top-0 h-72 z-0 transition-all duration-300 ${
          theme === "violet"
            ? "bg-[radial-gradient(ellipse_at_top,rgba(168,100,255,0.26),transparent_72%)]"
            : "bg-[radial-gradient(ellipse_at_top,rgba(255,79,23,0.10),transparent_70%)]"
        }`}
      />

      {/* Minimalist Top Bar: Brand + Simple 1-Tap Voice Speed + Streak/XP + Settings */}
      <header className="sticky top-0 z-30 bg-[#0D0E11]/85 backdrop-blur-xl px-4 pt-3 pb-2.5 border-b border-white/[0.05]">
        <div className="max-w-md mx-auto flex items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FF4F17] to-[#CC3200] text-black font-extrabold text-xs flex items-center justify-center shadow-[0_0_16px_rgba(255,79,23,0.35)] shrink-0">
              ES
            </div>
            <div className="font-display font-extrabold text-sm text-white tracking-tight truncate">
              Español Fast
            </div>
          </Link>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Simple 1-tap Voice Speed cycle icon (1× -> 0.8× -> 0.6×) */}
            <button
              type="button"
              onClick={handleCycleSpeed}
              title="Tap to cycle Madrid voice speed (1× / 0.8× / 0.6×)"
              className="h-8 px-2.5 rounded-full bg-[#181A1F] hover:bg-[#22252D] border border-white/[0.07] flex items-center gap-1 text-[11px] font-extrabold text-zinc-200 hover:text-white transition cursor-pointer"
            >
              <Gauge className="w-3.5 h-3.5 text-[#FF4F17]" />
              <span>{audioSpeed === 1.0 ? "1×" : `${audioSpeed}×`}</span>
            </button>

            {/* Streak & XP Pill */}
            <div
              className="h-8 px-2.5 rounded-full bg-[#181A1F] border border-white/[0.07] flex items-center gap-1 text-xs font-bold text-white"
              title="Daily streak & XP"
            >
              <Flame className="w-3.5 h-3.5 text-[#FF4F17] fill-[#FF4F17]" />
              <span>{streak}d</span>
              <span className="text-white/25">·</span>
              <span className="text-zinc-400 font-medium">{xp}xp</span>
            </div>

            {/* Offline indicator only shown when offline */}
            {!isOnline && (
              <div
                className="w-8 h-8 rounded-full bg-[#FF4F17]/15 border border-[#FF4F17]/40 text-[#FF4F17] flex items-center justify-center"
                title={`Offline Metro Mode (${pendingSyncCount} reviews queued)`}
              >
                <WifiOff className="w-3.5 h-3.5" />
              </div>
            )}

            {/* Quick Settings Gear */}
            <Link
              href="/settings"
              title="Settings, Theme & Voice"
              className={`w-8 h-8 rounded-full border flex items-center justify-center transition ${
                pathname.startsWith("/settings")
                  ? "bg-[#FF4F17] border-[#FF4F17] text-black"
                  : "bg-[#181A1F] border-white/[0.07] text-zinc-400 hover:text-white"
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main content container (375px+ mobile-first) */}
      <main className="relative z-10 flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-32">
        {children}
      </main>

      {/* Global Word/Phrase Selection Popover */}
      <WordSelectionPopup />

      {/* Global Floating Madrid AI Chatbot Module */}
      <MadridChatWidget />

      {/* Clean 6-Tab Floating Pill Dock (Today · Review · Tutor · Speak · Read · More) */}
      <nav
        style={{ bottom: "max(12px, env(safe-area-inset-bottom))" }}
        className="fixed inset-x-3 z-40 pointer-events-none"
      >
        <div className="max-w-md mx-auto pointer-events-auto rounded-full bg-[#16181D]/95 backdrop-blur-2xl border border-white/[0.08] shadow-[0_16px_40px_rgba(0,0,0,0.65)] px-1.5 py-1.5 grid grid-cols-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center py-1.5 rounded-full transition-all ${
                  active
                    ? "bg-[#FF4F17] text-black font-extrabold shadow-[0_4px_16px_rgba(255,79,23,0.4)]"
                    : "text-zinc-400 hover:text-white font-medium"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[10px] mt-0.5 tracking-tight">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
