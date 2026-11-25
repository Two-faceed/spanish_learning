export interface MonthlyCostBreakdown {
  monthKey: string; // YYYY-MM
  voiceMinutesThisMonth: number;
  voiceUsd: number;
  geminiFlashUsd: number;
  pronunciationUsd: number;
  ttsUsd: number;
  infraUsd: number;
  totalUsd: number;
  capUsd: number;
  alertThresholdUsd: number;
  pctOfCap: number;
  status: "safe" | "warning" | "cap_reached";
}

export interface CefrQuestion {
  id: string;
  level: "A1" | "A2" | "B1";
  prompt: string;
  options: string[];
  correctIdx: number;
  rule: string;
}

export const CEFR_LEVEL_CHECK_QUESTIONS: CefrQuestion[] = [
  {
    id: "cefr-1",
    level: "A1",
    prompt: "Madrid ___ la capital de España, y hoy ___ muy soleado.",
    options: ["es / está", "está / es", "es / es", "está / está"],
    correctIdx: 0,
    rule: "Use ser (es) for identity/definition and estar (está) for current weather/state.",
  },
  {
    id: "cefr-2",
    level: "A1",
    prompt: "¿___ vosotros de Madrid o de Valencia?",
    options: ["Son", "Sois", "Estáis", "Somos"],
    correctIdx: 1,
    rule: "Spain plural informal 'vosotros' uses 'sois' (ser).",
  },
  {
    id: "cefr-3",
    level: "A1",
    prompt: "A mí me ___ mucho las tapas de este bar.",
    options: ["gusta", "gustan", "gusto", "gustáis"],
    correctIdx: 1,
    rule: "With plural nouns ('las tapas'), gustar takes the plural form 'gustan'.",
  },
  {
    id: "cefr-4",
    level: "A2",
    prompt: "Esta mañana ___ (desayunar, yo) una tostada con tomate.",
    options: ["desayuné", "he desayunado", "desayunaba", "desayuno"],
    correctIdx: 1,
    rule: "In Spain (es-ES), use present perfect ('he desayunado') for completed events today.",
  },
  {
    id: "cefr-5",
    level: "A2",
    prompt: "Ayer ___ (ir, nosotros) al Parque del Retiro por la tarde.",
    options: ["vamos", "íbamos", "fuimos", "hemos ido"],
    correctIdx: 2,
    rule: "Completed single action yesterday uses preterite: 'fuimos'.",
  },
  {
    id: "cefr-6",
    level: "A2",
    prompt: "Estudio español ___ vivir y trabajar en Madrid.",
    options: ["por", "para", "en", "con"],
    correctIdx: 1,
    rule: "Use 'para' + infinitive to express goal or purpose ('in order to').",
  },
  {
    id: "cefr-7",
    level: "B1",
    prompt: "Espero que mañana ___ (hacer) buen tiempo en Sevilla.",
    options: ["hace", "hará", "haga", "hizo"],
    correctIdx: 2,
    rule: "'Esperar que' triggers the present subjunctive: 'haga'.",
  },
  {
    id: "cefr-8",
    level: "B1",
    prompt: "Chicos, ___ (venir, vosotros) aquí un momento, por favor.",
    options: ["venid", "vienen", "vengáis", "ven"],
    correctIdx: 0,
    rule: "Spain affirmative vosotros imperative replaces final -r with -d: venir -> venid.",
  },
];

export function estimateCefrFromScore(
  correctCount: number,
  totalCount: number
): { cefr: "Pre-A1" | "A1" | "A1+" | "A2" | "A2+" | "B1"; pct: number } {
  const pct =
    totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  if (pct >= 90) return { cefr: "B1", pct };
  if (pct >= 75) return { cefr: "A2+", pct };
  if (pct >= 62) return { cefr: "A2", pct };
  if (pct >= 45) return { cefr: "A1+", pct };
  if (pct >= 25) return { cefr: "A1", pct };
  return { cefr: "Pre-A1", pct };
}

/**
 * Estimates monthly API spend against the $30/month hard cap from docs/SPEC.md.
 */
export function estimateMonthlyCost(input: {
  monthKey?: string;
  voiceMinutesThisMonth: number;
  pronAttemptsThisMonth: number;
  aiLessonsAndChatsThisMonth: number;
}): MonthlyCostBreakdown {
  const monthKey = input.monthKey ?? new Date().toISOString().slice(0, 7);
  const capUsd = 30;
  const alertThresholdUsd = 20;

  // Rates from docs/SPEC.md:
  // - Voice roleplay: ~$0.023 / min
  // - Gemini Flash (lessons, chats, lookups): ~$0.008 / call average
  // - Pronunciation scoring: first 300 min (5h) free, then ~$1/hr ($0.0167/min)
  // - TTS: $0 under free tier (cached)
  // - Supabase + Vercel Hobby: $0
  const voiceUsd = Number((input.voiceMinutesThisMonth * 0.023).toFixed(2));
  const geminiFlashUsd = Number(
    (input.aiLessonsAndChatsThisMonth * 0.008).toFixed(2)
  );
  const pronMinutes = (input.pronAttemptsThisMonth * 8) / 60; // ~8s avg clip
  const billablePronMinutes = Math.max(0, pronMinutes - 300);
  const pronunciationUsd = Number(
    ((billablePronMinutes / 60) * 1.0).toFixed(2)
  );
  const ttsUsd = 0;
  const infraUsd = 0;

  const totalUsd = Number(
    (voiceUsd + geminiFlashUsd + pronunciationUsd + ttsUsd + infraUsd).toFixed(2)
  );
  const pctOfCap = Math.min(100, Math.round((totalUsd / capUsd) * 100));
  const status =
    totalUsd >= capUsd
      ? "cap_reached"
      : totalUsd >= alertThresholdUsd
        ? "warning"
        : "safe";

  return {
    monthKey,
    voiceMinutesThisMonth: Number(input.voiceMinutesThisMonth.toFixed(1)),
    voiceUsd,
    geminiFlashUsd,
    pronunciationUsd,
    ttsUsd,
    infraUsd,
    totalUsd,
    capUsd,
    alertThresholdUsd,
    pctOfCap,
    status,
  };
}

/**
 * Scans localStorage voice-cap keys for the current YYYY-MM month to compute total monthly voice minutes.
 */
export function readMonthlyVoiceMinutesFromStorage(
  monthPrefix: string = new Date().toISOString().slice(0, 7)
): number {
  if (typeof window === "undefined") return 0;
  let totalSec = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(`espanol_fast_voice_sec_v1_${monthPrefix}`)) {
        const val = Number(window.localStorage.getItem(key) ?? "0");
        if (Number.isFinite(val) && val > 0) totalSec += val;
      }
    }
  } catch {
    // Ignore storage errors
  }
  return totalSec / 60;
}
