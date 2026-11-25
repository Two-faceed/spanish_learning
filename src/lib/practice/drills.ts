import { extractJsonFromAiText } from "@/lib/ai/json-parser";

export interface CharDiffSegment {
  char: string;
  status: "match" | "wrong" | "missing" | "extra";
}

export interface DictationCheckResult {
  accuracyPct: number;
  exactMatch: boolean;
  segments: CharDiffSegment[];
}

function normalizeForLooseCompare(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/**
 * Computes a clean character-level LCS diff between the target Spanish sentence
 * and what the learner typed in Listening Dictation.
 */
export function computeCharDiff(
  targetRaw: string,
  typedRaw: string
): DictationCheckResult {
  const target = normalizeForLooseCompare(targetRaw);
  const typed = normalizeForLooseCompare(typedRaw);

  const a = Array.from(target);
  const b = Array.from(typed);
  const m = a.length;
  const n = b.length;

  // LCS DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i].toLowerCase() === b[j].toLowerCase()) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const segments: CharDiffSegment[] = [];
  let i = 0;
  let j = 0;
  let matchedChars = 0;

  while (i < m && j < n) {
    if (a[i].toLowerCase() === b[j].toLowerCase()) {
      const exactCaseAccent = a[i] === b[j];
      segments.push({
        char: a[i],
        status: exactCaseAccent ? "match" : "match",
      });
      matchedChars++;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      segments.push({ char: a[i], status: "missing" });
      i++;
    } else {
      segments.push({ char: b[j], status: "extra" });
      j++;
    }
  }
  while (i < m) {
    segments.push({ char: a[i], status: "missing" });
    i++;
  }
  while (j < n) {
    segments.push({ char: b[j], status: "extra" });
    j++;
  }

  const denom = Math.max(m, n, 1);
  const accuracyPct = Math.round((matchedChars / denom) * 100);
  const exactMatch =
    target.toLowerCase() === typed.toLowerCase() && target.length > 0;

  return { accuracyPct, exactMatch, segments };
}

export interface DictationItem {
  id: string;
  es: string;
  en: string;
  source: string;
}

export const DEFAULT_MADRID_DICTATION_ITEMS: DictationItem[] = [
  {
    id: "dict-1",
    es: "Ponme un café con leche y una tostada con tomate.",
    en: "Give me a coffee with milk and toast with tomato.",
    source: "Madrid Café",
  },
  {
    id: "dict-2",
    es: "¿Vosotros vivís cerca del Parque del Retiro?",
    en: "Do you all live near Retiro Park?",
    source: "Madrid Vosotros",
  },
  {
    id: "dict-3",
    es: "Hoy he quedado con mis amigos en la estación de Atocha.",
    en: "Today I have met up with my friends at Atocha station.",
    source: "Present Perfect (Spain)",
  },
  {
    id: "dict-4",
    es: "Necesito abrir una cuenta bancaria con mi pasaporte y el NIE.",
    en: "I need to open a bank account with my passport and NIE.",
    source: "Madrid Life",
  },
  {
    id: "dict-5",
    es: "Mañana iremos en metro al centro para buscar un piso.",
    en: "Tomorrow we will go by metro to the centre to look for a flat.",
    source: "Madrid Commute",
  },
];

export type ConjugationTense =
  | "present"
  | "preterite"
  | "imperfect"
  | "present_perfect"
  | "future"
  | "subjunctive";

export const TENSE_LABELS: Record<ConjugationTense, string> = {
  present: "Present (W2–3)",
  preterite: "Preterite (W6)",
  imperfect: "Imperfect (W7)",
  present_perfect: "Present Perfect (W8)",
  future: "Future (W9)",
  subjunctive: "Subjunctive (W11)",
};

export type SpanishPerson =
  | "yo"
  | "tú"
  | "él / ella"
  | "nosotros"
  | "vosotros (Spain)"
  | "ellos / ellas";

export const SPANISH_PERSONS: SpanishPerson[] = [
  "yo",
  "tú",
  "él / ella",
  "nosotros",
  "vosotros (Spain)",
  "ellos / ellas",
];

export interface VerbEntry {
  infinitive: string;
  meaning: string;
  forms: Record<ConjugationTense, [string, string, string, string, string, string]>;
}

export const SPAIN_CONJUGATION_VERBS: VerbEntry[] = [
  {
    infinitive: "ser",
    meaning: "to be (permanent / identity)",
    forms: {
      present: ["soy", "eres", "es", "somos", "sois", "son"],
      preterite: ["fui", "fuiste", "fue", "fuimos", "fuisteis", "fueron"],
      imperfect: ["era", "eras", "era", "éramos", "erais", "eran"],
      present_perfect: ["he sido", "has sido", "ha sido", "hemos sido", "habéis sido", "han sido"],
      future: ["seré", "serás", "será", "seremos", "seréis", "serán"],
      subjunctive: ["sea", "seas", "sea", "seamos", "seáis", "sean"],
    },
  },
  {
    infinitive: "estar",
    meaning: "to be (location / state)",
    forms: {
      present: ["estoy", "estás", "está", "estamos", "estáis", "están"],
      preterite: ["estuve", "estuviste", "estuvo", "estuvimos", "estuvisteis", "estuvieron"],
      imperfect: ["estaba", "estabas", "estaba", "estábamos", "estabais", "estaban"],
      present_perfect: ["he estado", "has estado", "ha estado", "hemos estado", "habéis estado", "han estado"],
      future: ["estaré", "estarás", "estará", "estaremos", "estaréis", "estarán"],
      subjunctive: ["esté", "estés", "esté", "estemos", "estéis", "estén"],
    },
  },
  {
    infinitive: "tener",
    meaning: "to have",
    forms: {
      present: ["tengo", "tienes", "tiene", "tenemos", "tenéis", "tienen"],
      preterite: ["tuve", "tuviste", "tuvo", "tuvimos", "tuvisteis", "tuvieron"],
      imperfect: ["tenía", "tenías", "tenía", "teníamos", "teníais", "tenían"],
      present_perfect: ["he tenido", "has tenido", "ha tenido", "hemos tenido", "habéis tenido", "han tenido"],
      future: ["tendré", "tendrás", "tendrá", "tendremos", "tendréis", "tendrán"],
      subjunctive: ["tenga", "tengas", "tenga", "tengamos", "tengáis", "tengan"],
    },
  },
  {
    infinitive: "ir",
    meaning: "to go",
    forms: {
      present: ["voy", "vas", "va", "vamos", "vais", "van"],
      preterite: ["fui", "fuiste", "fue", "fuimos", "fuisteis", "fueron"],
      imperfect: ["iba", "ibas", "iba", "íbamos", "ibais", "iban"],
      present_perfect: ["he ido", "has ido", "ha ido", "hemos ido", "habéis ido", "han ido"],
      future: ["iré", "irás", "irá", "iremos", "iréis", "irán"],
      subjunctive: ["vaya", "vayas", "vaya", "vayamos", "vayáis", "vayan"],
    },
  },
  {
    infinitive: "hacer",
    meaning: "to do / to make",
    forms: {
      present: ["hago", "haces", "hace", "hacemos", "hacéis", "hacen"],
      preterite: ["hice", "hiciste", "hizo", "hicimos", "hicisteis", "hicieron"],
      imperfect: ["hacía", "hacías", "hacía", "hacíamos", "hacíais", "hacían"],
      present_perfect: ["he hecho", "has hecho", "ha hecho", "hemos hecho", "habéis hecho", "han hecho"],
      future: ["haré", "harás", "hará", "haremos", "haréis", "harán"],
      subjunctive: ["haga", "hagas", "haga", "hagamos", "hagáis", "hagan"],
    },
  },
  {
    infinitive: "hablar",
    meaning: "to speak",
    forms: {
      present: ["hablo", "hablas", "habla", "hablamos", "habláis", "hablan"],
      preterite: ["hablé", "hablaste", "habló", "hablamos", "hablasteis", "hablaron"],
      imperfect: ["hablaba", "hablabas", "hablaba", "hablábamos", "hablabais", "hablaban"],
      present_perfect: ["he hablado", "has hablado", "ha hablado", "hemos hablado", "habéis hablado", "han hablado"],
      future: ["hablaré", "hablarás", "hablará", "hablaremos", "hablaréis", "hablarán"],
      subjunctive: ["hable", "hables", "hable", "hablemos", "habléis", "hablen"],
    },
  },
  {
    infinitive: "poder",
    meaning: "to be able to / can",
    forms: {
      present: ["puedo", "puedes", "puede", "podemos", "podéis", "pueden"],
      preterite: ["pude", "pudiste", "pudo", "pudimos", "pudisteis", "pudieron"],
      imperfect: ["podía", "podías", "podía", "podíamos", "podíais", "podían"],
      present_perfect: ["he podido", "has podido", "ha podido", "hemos podido", "habéis podido", "han podido"],
      future: ["podré", "podrás", "podrá", "podremos", "podréis", "podrán"],
      subjunctive: ["pueda", "puedas", "pueda", "podamos", "podáis", "puedan"],
    },
  },
  {
    infinitive: "querer",
    meaning: "to want / to love",
    forms: {
      present: ["quiero", "quieres", "quiere", "queremos", "queréis", "quieren"],
      preterite: ["quise", "quisiste", "quiso", "quisimos", "quisisteis", "quisieron"],
      imperfect: ["quería", "querías", "quería", "queríamos", "queríais", "querían"],
      present_perfect: ["he querido", "has querido", "ha querido", "hemos querido", "habéis querido", "han querido"],
      future: ["querré", "querrás", "querrá", "querremos", "querréis", "querrán"],
      subjunctive: ["quiera", "quieras", "quiera", "queramos", "queráis", "quieran"],
    },
  },
];

export interface ConjugationQuestion {
  verb: VerbEntry;
  tense: ConjugationTense;
  personIdx: number;
  personLabel: SpanishPerson;
  answer: string;
}

export function pickRandomConjugationQuestion(
  allowedTenses: ConjugationTense[],
  includeVosotros = true
): ConjugationQuestion {
  const tenses = allowedTenses.length > 0 ? allowedTenses : (["present"] as ConjugationTense[]);
  const verb =
    SPAIN_CONJUGATION_VERBS[
      Math.floor(Math.random() * SPAIN_CONJUGATION_VERBS.length)
    ];
  const tense = tenses[Math.floor(Math.random() * tenses.length)];
  const personIndices = includeVosotros ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 5];
  const personIdx =
    personIndices[Math.floor(Math.random() * personIndices.length)];

  return {
    verb,
    tense,
    personIdx,
    personLabel: SPANISH_PERSONS[personIdx],
    answer: verb.forms[tense][personIdx],
  };
}

export const DAILY_WRITING_PROMPTS = [
  "Describe your morning routine in Madrid in 5–8 sentences (use present tense & reflexives).",
  "Write a short WhatsApp message to a landlord asking about a flat in Chamberí (price, deposit, visit).",
  "What did you do yesterday in Spain? Write 5–8 sentences using past tense (preterite or present perfect).",
  "Write 5–8 sentences explaining your work or business project to a new friend at a tapas bar.",
];

export interface JournalCorrectionResult {
  score: number;
  correctedEs: string;
  feedbackEn: string;
  changes: {
    category: string;
    wrong: string;
    correct: string;
    explanation: string;
  }[];
}

export function parseJournalCorrectionJson(
  rawText: string,
  originalText: string
): JournalCorrectionResult {
  const parsed = extractJsonFromAiText<Record<string, unknown>>(rawText);
  const rawScore = Number(parsed.score);
  const score = Number.isFinite(rawScore)
    ? Math.max(0, Math.min(100, Math.round(rawScore)))
    : 82;

  const changes = Array.isArray(parsed.changes)
    ? (parsed.changes as Record<string, unknown>[])
        .slice(0, 6)
        .map((c) => ({
          category: String(c.category ?? "grammar").trim(),
          wrong: String(c.wrong ?? "").trim(),
          correct: String(c.correct ?? "").trim(),
          explanation: String(c.explanation ?? "").trim(),
        }))
        .filter((c) => c.wrong && c.correct)
    : [];

  return {
    score,
    correctedEs:
      typeof parsed.correctedEs === "string" && parsed.correctedEs.trim()
        ? parsed.correctedEs.trim()
        : originalText,
    feedbackEn:
      typeof parsed.feedbackEn === "string" && parsed.feedbackEn.trim()
        ? parsed.feedbackEn.trim()
        : "Good Madrid Spanish writing! Check the highlighted corrections below.",
    changes,
  };
}
