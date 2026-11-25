import {
  PronunciationAssessmentResult,
  PronunciationAttemptRecord,
  PronunciationPhonemeScore,
  PronunciationWordScore,
  SpainSoundGroup,
} from "@/types/database";
import { extractJsonFromAiText } from "@/lib/ai/json-parser";

export interface SpainSoundMeta {
  id: SpainSoundGroup;
  symbol: string;
  label: string;
  examples: string;
  tip: string;
}

export const SPAIN_SOUND_GROUPS: SpainSoundMeta[] = [
  {
    id: "rr",
    symbol: "rr",
    label: "Rolled R (Trill)",
    examples: "perro, carro, rojo",
    tip: "Relax the tip of your tongue against the ridge behind your upper teeth and push steady air so it vibrates 2–3 times.",
  },
  {
    id: "r",
    symbol: "r",
    label: "Single R (Tap)",
    examples: "pero, caro, para",
    tip: "One quick, light tap of the tongue tip — like the fast 'tt' in American English 'butter'.",
  },
  {
    id: "theta",
    symbol: "θ",
    label: "Castilian Z / Ce / Ci",
    examples: "cinco, gracias, zapato",
    tip: "Place your tongue tip gently between your front teeth like English 'th' in 'think' (signature Madrid accent).",
  },
  {
    id: "j_g",
    symbol: "j / g",
    label: "Strong Spanish J / Ge / Gi",
    examples: "jamón, gente, reloj",
    tip: "A crisp, raspy breath from the back of the throat (stronger than English 'h', like clearing mist from glasses).",
  },
  {
    id: "ll_y",
    symbol: "ll / y",
    label: "Palatal LL / Y",
    examples: "calle, yo, paella",
    tip: "Soft, clean 'y' sound in Madrid (yeísmo) — avoid hard English 'j' unless emphasizing the start of a phrase.",
  },
  {
    id: "vowels",
    symbol: "a e i o u",
    label: "Pure Spanish Vowels",
    examples: "casa, peso, piso, poco, uno",
    tip: "Keep every vowel short, crisp, and steady — never glide 'o' into 'ow' or 'e' into 'ay'.",
  },
  {
    id: "b_v",
    symbol: "b / v",
    label: "Soft B / V Between Vowels",
    examples: "saber, vivir, abajo",
    tip: "B and V are identical in Spanish. Between vowels, let your lips almost touch without fully closing.",
  },
];

export const SPAIN_SOUND_META_MAP: Record<SpainSoundGroup, SpainSoundMeta> =
  Object.fromEntries(
    SPAIN_SOUND_GROUPS.map((item) => [item.id, item])
  ) as Record<SpainSoundGroup, SpainSoundMeta>;

/**
 * Maps an IPA phoneme (Azure es-ES) or Spanish sound label to one of the 7 tracked Spain sound groups.
 */
export function mapPhonemeToSpainSoundGroup(
  phoneme: string
): SpainSoundGroup | null {
  const p = phoneme.trim().toLowerCase();
  if (!p) return null;

  if (p === "r" || p === "rr" || p === "rː") return "rr";
  if (p === "ɾ" || p === "tap") return "r";
  if (p === "θ" || p === "th" || p === "theta" || p === "z") return "theta";
  if (p === "x" || p === "χ" || p === "j" || p === "j_g") return "j_g";
  if (
    p === "ʝ" ||
    p === "ʎ" ||
    p === "ɟ" ||
    p === "dʒ" ||
    p === "ll" ||
    p === "y" ||
    p === "ll_y"
  ) {
    return "ll_y";
  }
  if (p === "β" || p === "b" || p === "v" || p === "b_v") return "b_v";
  if (/^[aeiouáéíóúɛɔɪʊ]$/.test(p) || p === "vowels") return "vowels";

  return null;
}

function clampScore(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Aggregates per-word / per-phoneme scores into the 7 Spain sound groups.
 */
export function computeSoundGroupScoresFromWords(
  words: PronunciationWordScore[]
): Partial<Record<SpainSoundGroup, number>> {
  const buckets: Partial<Record<SpainSoundGroup, number[]>> = {};

  for (const w of words) {
    for (const ph of w.phonemes ?? []) {
      const group = ph.soundGroup ?? mapPhonemeToSpainSoundGroup(ph.phoneme);
      if (!group) continue;
      if (!buckets[group]) buckets[group] = [];
      buckets[group]!.push(clampScore(ph.accuracy));
    }
  }

  const result: Partial<Record<SpainSoundGroup, number>> = {};
  for (const [group, scores] of Object.entries(buckets) as [
    SpainSoundGroup,
    number[],
  ][]) {
    if (scores.length > 0) {
      result[group] = Math.round(
        scores.reduce((sum, s) => sum + s, 0) / scores.length
      );
    }
  }
  return result;
}

export interface SoundTrackerStat {
  group: SpainSoundGroup;
  meta: SpainSoundMeta;
  averageScore: number | null;
  attemptsCount: number;
}

/**
 * Computes rolling per-sound averages across stored pronunciation attempts
 * and returns both full stats and the 2 weakest sound groups to drive daily drills.
 */
export function computeWeakSoundTracker(
  attempts: PronunciationAttemptRecord[]
): {
  stats: SoundTrackerStat[];
  weakestTwo: SpainSoundGroup[];
} {
  const totals: Record<SpainSoundGroup, { sum: number; count: number }> = {
    rr: { sum: 0, count: 0 },
    r: { sum: 0, count: 0 },
    theta: { sum: 0, count: 0 },
    j_g: { sum: 0, count: 0 },
    ll_y: { sum: 0, count: 0 },
    vowels: { sum: 0, count: 0 },
    b_v: { sum: 0, count: 0 },
  };

  for (const attempt of attempts) {
    const scores = attempt.sound_scores ?? {};
    for (const group of Object.keys(totals) as SpainSoundGroup[]) {
      const val = scores[group];
      if (typeof val === "number" && Number.isFinite(val)) {
        totals[group].sum += val;
        totals[group].count += 1;
      }
    }
  }

  const stats: SoundTrackerStat[] = SPAIN_SOUND_GROUPS.map((meta) => {
    const t = totals[meta.id];
    return {
      group: meta.id,
      meta,
      averageScore: t.count > 0 ? Math.round(t.sum / t.count) : null,
      attemptsCount: t.count,
    };
  });

  const scoredStats = stats
    .filter((s) => s.averageScore !== null)
    .sort((a, b) => (a.averageScore ?? 100) - (b.averageScore ?? 100));

  let weakestTwo: SpainSoundGroup[] = scoredStats
    .slice(0, 2)
    .map((s) => s.group);

  // Default to the two classic Madrid signature sounds (rr & theta) before enough data is collected
  if (weakestTwo.length === 0) {
    weakestTwo = ["theta", "rr"];
  } else if (weakestTwo.length === 1) {
    weakestTwo.push(weakestTwo[0] === "theta" ? "rr" : "theta");
  }

  return { stats, weakestTwo };
}

/**
 * Parses Azure AI Speech Pronunciation Assessment REST JSON (es-ES, IPA phoneme granularity).
 */
export function parseAzurePronunciationResponse(
  raw: Record<string, unknown>,
  referenceText: string
): PronunciationAssessmentResult {
  const nBestList = Array.isArray(raw.NBest)
    ? (raw.NBest as Record<string, unknown>[])
    : [];
  const best = nBestList[0] ?? {};
  const pa =
    (best.PronunciationAssessment as Record<string, unknown> | undefined) ??
    best;

  const accuracy = clampScore(pa.AccuracyScore ?? best.AccuracyScore, 0);
  const fluency = clampScore(pa.FluencyScore ?? best.FluencyScore, accuracy);
  const completeness = clampScore(
    pa.CompletenessScore ?? best.CompletenessScore,
    accuracy
  );
  const overall = clampScore(
    pa.PronScore ?? best.PronScore,
    Math.round(accuracy * 0.5 + fluency * 0.25 + completeness * 0.25)
  );

  const rawWords = Array.isArray(best.Words)
    ? (best.Words as Record<string, unknown>[])
    : [];

  const words: PronunciationWordScore[] = rawWords.map((w) => {
    const wPa =
      (w.PronunciationAssessment as Record<string, unknown> | undefined) ?? w;
    const rawPhonemes = Array.isArray(w.Phonemes)
      ? (w.Phonemes as Record<string, unknown>[])
      : [];

    const phonemes: PronunciationPhonemeScore[] = rawPhonemes.map((ph) => {
      const phPa =
        (ph.PronunciationAssessment as Record<string, unknown> | undefined) ??
        ph;
      const symbol = String(ph.Phoneme ?? "").trim();
      return {
        phoneme: symbol,
        accuracy: clampScore(phPa.AccuracyScore ?? ph.AccuracyScore, accuracy),
        soundGroup: mapPhonemeToSpainSoundGroup(symbol),
      };
    });

    const errType = String(wPa.ErrorType ?? w.ErrorType ?? "None");
    const validErrType =
      errType === "Omission" ||
      errType === "Insertion" ||
      errType === "Mispronunciation"
        ? errType
        : "None";

    return {
      word: String(w.Word ?? "").trim(),
      accuracy: clampScore(wPa.AccuracyScore ?? w.AccuracyScore, accuracy),
      errorType: validErrType,
      phonemes,
    };
  });

  const soundScores = computeSoundGroupScoresFromWords(words);
  const lowestSound = Object.entries(soundScores).sort(
    (a, b) => (a[1] ?? 100) - (b[1] ?? 100)
  )[0];

  const rhythmTip = lowestSound
    ? `Focus on ${SPAIN_SOUND_META_MAP[lowestSound[0] as SpainSoundGroup].label}: ${SPAIN_SOUND_META_MAP[lowestSound[0] as SpainSoundGroup].tip}`
    : overall >= 85
      ? "Great Madrid flow! Keep vowels crisp and steady."
      : "Speak at a steady, even syllable rhythm — Spanish gives every syllable equal weight.";

  return {
    engine: "azure-es-ES",
    referenceText,
    recognizedText: String(
      raw.DisplayText ?? best.Display ?? best.Lexical ?? ""
    ).trim(),
    overall,
    accuracy,
    fluency,
    completeness,
    words,
    soundScores,
    rhythmTip,
  };
}

/**
 * Parses Gemini multimodal audio pronunciation assessment JSON into the exact same schema.
 */
export function parseGeminiPronunciationJson(
  rawText: string,
  referenceText: string
): PronunciationAssessmentResult {
  const parsed = extractJsonFromAiText<Record<string, unknown>>(rawText);

  const accuracy = clampScore(parsed.accuracy, 70);
  const fluency = clampScore(parsed.fluency, accuracy);
  const completeness = clampScore(parsed.completeness, accuracy);
  const overall = clampScore(
    parsed.overall,
    Math.round(accuracy * 0.5 + fluency * 0.25 + completeness * 0.25)
  );

  const rawWords = Array.isArray(parsed.words)
    ? (parsed.words as Record<string, unknown>[])
    : [];

  const words: PronunciationWordScore[] = rawWords
    .map((w) => {
      const rawPhs = Array.isArray(w.phonemes)
        ? (w.phonemes as Record<string, unknown>[])
        : [];
      const phonemes: PronunciationPhonemeScore[] = rawPhs
        .map((ph) => {
          const symbol = String(ph.phoneme ?? "").trim();
          return {
            phoneme: symbol,
            accuracy: clampScore(ph.accuracy, accuracy),
            soundGroup: mapPhonemeToSpainSoundGroup(symbol),
          };
        })
        .filter((ph) => ph.phoneme.length > 0);

      const errType = String(w.errorType ?? "None");
      const validErrType: PronunciationWordScore["errorType"] =
        errType === "Omission" ||
        errType === "Insertion" ||
        errType === "Mispronunciation"
          ? errType
          : "None";

      return {
        word: String(w.word ?? "").trim(),
        accuracy: clampScore(w.accuracy, accuracy),
        errorType: validErrType,
        phonemes,
      };
    })
    .filter((w) => w.word.length > 0);

  const derivedSoundScores = computeSoundGroupScoresFromWords(words);
  const rawSoundScores =
    parsed.soundScores && typeof parsed.soundScores === "object"
      ? (parsed.soundScores as Record<string, unknown>)
      : {};

  const soundScores: Partial<Record<SpainSoundGroup, number>> = {
    ...derivedSoundScores,
  };
  for (const meta of SPAIN_SOUND_GROUPS) {
    if (rawSoundScores[meta.id] !== undefined && rawSoundScores[meta.id] !== null) {
      soundScores[meta.id] = clampScore(rawSoundScores[meta.id]);
    }
  }

  return {
    engine: "gemini-audio-es-ES",
    referenceText,
    recognizedText: String(parsed.recognizedText ?? "").trim(),
    overall,
    accuracy,
    fluency,
    completeness,
    words,
    soundScores,
    rhythmTip:
      typeof parsed.rhythmTip === "string" && parsed.rhythmTip.trim()
        ? parsed.rhythmTip.trim()
        : "Keep every Spanish vowel pure and link words smoothly across syllables.",
  };
}
