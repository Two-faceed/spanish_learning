"use client";

import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronsRight,
  Clock,
  DollarSign,
  Palette,
  Volume2,
} from "lucide-react";
import { getOrInitSettings, offlineDb } from "@/lib/offline/db";
import { SettingsRecord } from "@/types/database";
import {
  getTtsEngine,
  playSpanishAudio,
  setPreferredTtsVoice,
  setTtsEngine,
  TtsEngineId,
} from "@/lib/audio/player";
import { syncPendingToServer } from "@/lib/offline/sync-manager";
import {
  APP_THEMES,
  AppThemeId,
  getAppTheme,
  setAppTheme,
  subscribeAppTheme,
} from "@/lib/theme";
import {
  estimateMonthlyCost,
  MonthlyCostBreakdown,
  readMonthlyVoiceMinutesFromStorage,
} from "@/lib/telemetry/cost-meter";

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsRecord | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [cachedClipsCount, setCachedClipsCount] = useState(0);
  const [costMeter, setCostMeter] = useState<MonthlyCostBreakdown | null>(null);
  const [activeTheme, setActiveTheme] = useState<AppThemeId>("blaze");
  const [ttsEngine, setTtsEngineState] = useState<TtsEngineId>(
    "gemini-3.8-flash-tts"
  );

  useEffect(() => {
    void getOrInitSettings().then((s) => {
      setSettings(s);
      setPreferredTtsVoice(s.voice);
    });
    if (offlineDb) {
      const monthPrefix = new Date().toISOString().slice(0, 7);
      void Promise.all([
        offlineDb.audio_blobs.count(),
        offlineDb.pron_attempts.toArray(),
        offlineDb.lessons.toArray(),
        offlineDb.errors.count(),
      ]).then(([clips, attempts, lessons, errCount]) => {
        setCachedClipsCount(clips);
        const pronThisMonth = attempts.filter((a) =>
          a.created_at.startsWith(monthPrefix)
        ).length;
        const lessonsThisMonth = lessons.filter(
          (l) => l.completed_at && l.completed_at.startsWith(monthPrefix)
        ).length;
        const voiceMin = readMonthlyVoiceMinutesFromStorage(monthPrefix);
        setCostMeter(
          estimateMonthlyCost({
            monthKey: monthPrefix,
            voiceMinutesThisMonth: voiceMin,
            pronAttemptsThisMonth: pronThisMonth,
            aiLessonsAndChatsThisMonth: lessonsThisMonth * 3 + errCount * 2,
          })
        );
      });
    }
    setActiveTheme(getAppTheme());
    setTtsEngineState(getTtsEngine());
    return subscribeAppTheme((t) => setActiveTheme(t));
  }, []);

  const handleSelectTtsEngine = (engine: TtsEngineId) => {
    setTtsEngineState(engine);
    setTtsEngine(engine);
  };

  const handleSelectTheme = (themeId: AppThemeId) => {
    setActiveTheme(themeId);
    setAppTheme(themeId);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offlineDb || !settings) return;
    await offlineDb.settings.put(settings);
    void syncPendingToServer();
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  if (!settings) {
    return (
      <div className="p-6 text-center text-xs text-zinc-400">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="pt-1">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#FF4F17]">
          SYSTEM · GUARDRAILS
        </div>
        <h1 className="font-display text-2xl font-extrabold text-white mt-0.5">
          Pace, Theme & Cost Control
        </h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          Visual theme style, daily time budget, new-word ramp, and Madrid (<code className="font-mono">es-ES</code>) neural voice.
        </p>
      </div>

      {/* App Theme Style Selector (Carbon Blaze vs Future Violet) */}
      <section className="rounded-[28px] bg-[#181A1F] border border-white/[0.06] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-white">
            <Palette className="w-4 h-4 text-[#FF4F17]" />
            <span>App Theme Style</span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            Instant switch
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {APP_THEMES.map((themeOpt) => {
            const isSelected = activeTheme === themeOpt.id;
            return (
              <button
                key={themeOpt.id}
                type="button"
                onClick={() => handleSelectTheme(themeOpt.id)}
                className={`text-left rounded-2xl p-3 border transition-all ${
                  isSelected
                    ? "border-[#FF4F17] bg-white/[0.06] shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
                    : "border-white/[0.07] bg-black/25 hover:border-white/20"
                }`}
              >
                {/* Mini Phone Screen Preview */}
                <div
                  className="h-16 rounded-xl p-2.5 flex flex-col justify-between border border-white/10 overflow-hidden relative"
                  style={{
                    background:
                      themeOpt.id === "violet"
                        ? "linear-gradient(145deg, #27174E 0%, #0D071B 100%)"
                        : "linear-gradient(145deg, #1E2028 0%, #0D0E11 100%)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-extrabold text-white shadow"
                      style={{
                        background:
                          themeOpt.id === "violet"
                            ? "linear-gradient(135deg, #B57BFF 0%, #7C3AED 100%)"
                            : "linear-gradient(135deg, #FF4F17 0%, #CC3200 100%)",
                      }}
                    >
                      ES
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded-full text-[8px] font-extrabold text-black"
                      style={{ backgroundColor: themeOpt.badgePreview }}
                    >
                      +4.3%
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div
                      className="h-2 flex-1 rounded-full"
                      style={{ backgroundColor: themeOpt.accentPreview }}
                    />
                    <div className="h-2 w-5 rounded-full bg-white/20" />
                  </div>
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-1">
                  <span className="font-display font-extrabold text-xs text-white">
                    {themeOpt.name}
                  </span>
                  {isSelected && (
                    <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-[#FF4F17] text-black">
                      Active
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5 leading-snug">
                  {themeOpt.subtitle}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <form
        onSubmit={(e) => void handleSave(e)}
        className="rounded-[28px] bg-[#181A1F] border border-white/[0.06] p-5 space-y-4"
      >
        {/* Daily Time Budget */}
        <div className="space-y-2">
          <label className="flex items-center gap-1.5 text-xs font-bold text-white">
            <Clock className="w-4 h-4 text-[#FF4F17]" />
            <span>Daily Study Time Budget</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {([30, 60, 90] as const).map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() =>
                  setSettings({ ...settings, daily_minutes: mins })
                }
                className={`py-3 rounded-2xl font-display font-extrabold text-xs border transition ${
                  settings.daily_minutes === mins
                    ? "bg-[#FF4F17] text-black border-[#FF4F17] shadow-[0_6px_20px_rgba(255,79,23,0.3)]"
                    : "bg-[#121418] text-zinc-300 border-white/[0.06] hover:text-white"
                }`}
              >
                {mins} min
              </button>
            ))}
          </div>
          <p className="text-[11px] text-zinc-400">
            Scales daily blocks and caps new words if due reviews exceed your budget.
          </p>
        </div>

        {/* New Word Ramp Settings */}
        <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-white/[0.06]">
          <div>
            <label className="block text-[11px] font-bold text-zinc-400 mb-1">
              Week 1 Start
            </label>
            <input
              type="number"
              min={10}
              max={50}
              value={settings.new_words_start}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  new_words_start: Math.max(10, Number(e.target.value)),
                })
              }
              className="w-full rounded-xl bg-[#121418] border border-white/10 text-white px-3 py-2 text-xs font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-zinc-400 mb-1">
              Weekly +Ramp
            </label>
            <input
              type="number"
              min={0}
              max={20}
              value={settings.weekly_increase}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  weekly_increase: Math.max(0, Number(e.target.value)),
                })
              }
              className="w-full rounded-xl bg-[#121418] border border-white/10 text-white px-3 py-2 text-xs font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-zinc-400 mb-1">
              Max / Day
            </label>
            <input
              type="number"
              min={10}
              max={100}
              value={settings.new_words_max}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  new_words_max: Math.max(10, Number(e.target.value)),
                })
              }
              className="w-full rounded-xl bg-[#121418] border border-white/10 text-white px-3 py-2 text-xs font-bold"
            />
          </div>
        </div>

        {/* Course Start Date */}
        <div className="pt-2 border-t border-white/[0.06]">
          <label className="block text-xs font-bold text-white mb-1.5">
            12-Week Course Start Date
          </label>
          <input
            type="date"
            value={settings.start_date}
            onChange={(e) =>
              setSettings({ ...settings, start_date: e.target.value })
            }
            className="w-full rounded-2xl bg-[#121418] border border-white/10 text-white px-3.5 py-2.5 text-xs font-bold"
          />
        </div>

        {/* Spain (es-ES) Neural TTS Engine Selector (Engine 1 vs Engine 4) */}
        <div className="pt-2 border-t border-white/[0.06] space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-white">
              Madrid (<code className="font-mono">es-ES</code>) Neural TTS Engine
            </label>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF4F17]">
              Instant switch
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {(
              [
                {
                  id: "gemini-3.8-flash-tts" as const,
                  title: "Engine 1: Flash 3.8 HD",
                  subtitle: "Richest Madrid studio warmth",
                },
                {
                  id: "gemini-3.8-flash-lite-tts" as const,
                  title: "Engine 4: Flash-Lite 3.8",
                  subtitle: "Fastest response (~1.5s)",
                },
              ] as const
            ).map((eng) => {
              const active = ttsEngine === eng.id;
              return (
                <button
                  key={eng.id}
                  type="button"
                  onClick={() => handleSelectTtsEngine(eng.id)}
                  className={`text-left rounded-2xl p-3 border transition ${
                    active
                      ? "bg-[#FF4F17] text-black border-[#FF4F17] shadow-[0_6px_20px_rgba(255,79,23,0.3)]"
                      : "bg-[#121418] text-zinc-200 border-white/[0.08] hover:border-white/20"
                  }`}
                >
                  <div className="font-display font-extrabold text-xs">
                    {eng.title}
                  </div>
                  <div
                    className={`text-[10px] mt-0.5 leading-snug ${
                      active ? "text-black/80 font-semibold" : "text-zinc-400"
                    }`}
                  >
                    {eng.subtitle}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Spain (es-ES) Neural Voice Selector */}
        <div className="pt-2 border-t border-white/[0.06] space-y-2">
          <label className="block text-xs font-bold text-white">
            Spain Spanish (<code className="font-mono">es-ES</code>) Neural TTS Voice
          </label>
          <div className="flex gap-2">
            <select
              value={settings.voice}
              onChange={(e) => {
                setSettings({ ...settings, voice: e.target.value });
                setPreferredTtsVoice(e.target.value);
              }}
              className="flex-1 rounded-2xl border border-white/10 bg-[#121418] text-white px-3.5 py-2.5 text-xs font-bold"
            >
              <option value="es-ES-AlvaroNeural">
                es-ES-AlvaroNeural (Madrid Male · Warm)
              </option>
              <option value="es-ES-ElviraNeural">
                es-ES-ElviraNeural (Madrid Female · Crisp)
              </option>
              <option value="es-ES-ArnauNeural">
                es-ES-ArnauNeural (Spain Male · Deep)
              </option>
              <option value="es-ES-EstrellaNeural">
                es-ES-EstrellaNeural (Spain Female · Expressive)
              </option>
            </select>
            <button
              type="button"
              onClick={() =>
                void playSpanishAudio({
                  text: "Hola, gracias por practicar cinco minutos en Madrid.",
                  audioSource: "es-ES TTS",
                  voice: settings.voice,
                  engine: ttsEngine,
                })
              }
              className="px-4 py-2.5 rounded-2xl bg-[#22252C] hover:bg-[#FF4F17] text-[#FF4F17] hover:text-black border border-white/10 text-xs font-extrabold inline-flex items-center gap-1.5 transition"
            >
              <Volume2 className="w-4 h-4" />
              <span>Test</span>
            </button>
          </div>
        </div>

        {/* Voice Minutes Cap */}
        <div className="pt-2 border-t border-white/[0.06]">
          <label className="block text-xs font-bold text-white mb-1.5">
            Daily Voice Roleplay Cap (Minutes / Day)
          </label>
          <input
            type="number"
            min={5}
            max={30}
            value={settings.voice_minutes_cap}
            onChange={(e) =>
              setSettings({
                ...settings,
                voice_minutes_cap: Math.min(
                  30,
                  Math.max(5, Number(e.target.value))
                ),
              })
            }
            className="w-full rounded-2xl bg-[#121418] border border-white/10 text-white px-3.5 py-2.5 text-xs font-bold"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-full bg-[#FF4F17] hover:bg-[#FF6230] text-black font-extrabold text-sm py-2 pl-6 pr-2 flex items-center justify-between shadow-[0_10px_30px_rgba(255,79,23,0.35)] transition"
        >
          <span>Save Configuration</span>
          <span className="w-10 h-10 rounded-full bg-[#0D0E11] text-[#FF4F17] flex items-center justify-center">
            <ChevronsRight className="w-5 h-5" />
          </span>
        </button>

        {savedNotice && (
          <div className="rounded-2xl bg-emerald-500/15 border border-emerald-500/35 p-3 text-xs text-emerald-300 font-bold flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Configuration saved!</span>
          </div>
        )}
      </form>

      {/* Monthly Cost Meter Guardrail ($30/month hard cap) */}
      <section className="rounded-[28px] bg-[#181A1F] border border-white/[0.06] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-white">
            <DollarSign className="w-4 h-4 text-[#FF4F17]" />
            <span>
              Monthly Cost Meter ({costMeter?.monthKey ?? "This Month"})
            </span>
          </div>
          <span
            className={`font-display text-sm font-extrabold ${
              costMeter?.status === "cap_reached"
                ? "text-rose-400"
                : costMeter?.status === "warning"
                  ? "text-amber-300"
                  : "text-emerald-400"
            }`}
          >
            ${(costMeter?.totalUsd ?? 0).toFixed(2)} / $30.00
          </span>
        </div>

        <div className="w-full h-2.5 bg-[#121418] rounded-full overflow-hidden border border-white/[0.05]">
          <div
            className={`h-full rounded-full transition-all ${
              costMeter?.status === "cap_reached"
                ? "bg-rose-500"
                : costMeter?.status === "warning"
                  ? "bg-amber-400"
                  : "bg-[#FF4F17]"
            }`}
            style={{ width: `${Math.max(3, costMeter?.pctOfCap ?? 3)}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
          <div className="rounded-xl bg-[#121418] p-2 border border-white/[0.05]">
            <div className="font-extrabold text-white">
              ${(costMeter?.voiceUsd ?? 0).toFixed(2)}
            </div>
            <div className="text-zinc-500">
              Voice ({costMeter?.voiceMinutesThisMonth ?? 0}m)
            </div>
          </div>
          <div className="rounded-xl bg-[#121418] p-2 border border-white/[0.05]">
            <div className="font-extrabold text-white">
              ${(costMeter?.geminiFlashUsd ?? 0).toFixed(2)}
            </div>
            <div className="text-zinc-500">Gemini Flash</div>
          </div>
          <div className="rounded-xl bg-[#121418] p-2 border border-white/[0.05]">
            <div className="font-extrabold text-emerald-400">
              ${(costMeter?.ttsUsd ?? 0).toFixed(2)}
            </div>
            <div className="text-zinc-500">
              TTS ({cachedClipsCount} cached)
            </div>
          </div>
        </div>

        <p className="text-[11px] text-zinc-400 leading-relaxed">
          Alert at <strong className="text-white">$20/mo</strong> · Hard cap{" "}
          <strong className="text-white">$30/mo</strong>. Every{" "}
          <code className="font-mono">es-ES</code> TTS clip is cached permanently
          in IndexedDB, and voice roleplay is capped at{" "}
          <strong className="text-white">{settings.voice_minutes_cap} min/day</strong>.
        </p>
      </section>
    </div>
  );
}
