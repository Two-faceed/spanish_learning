/**
 * Strict JSON parser & validator for AI tutor, error correction, and lemma lookup output.
 * Handles raw JSON, ```json ... ``` markdown code fences, and leading/trailing prose.
 */

export interface AiCorrectionOutput {
  category: string;
  wrong: string;
  correct: string;
  explanation: string;
}

export interface AiExerciseItem {
  id: string;
  type: "fill_in" | "transform" | "translate" | "build_sentence";
  prompt: string;
  answer: string;
  options?: string[];
  hint?: string;
}

export interface AiLessonNewWord {
  word: string;
  lemma: string;
  meaning: string;
  pos?: string;
  gender?: "el" | "la" | "los" | "las" | "el/la" | null;
  example_es: string;
  example_tr: string;
}

export interface AiLessonPayloadOutput {
  explanation: string;
  examples: { es: string; en: string }[];
  new_words: AiLessonNewWord[];
  exercises: AiExerciseItem[];
}

export interface AiGradePayloadOutput {
  isCorrect: boolean;
  correctedSentence: string;
  ruleOneLine: string;
  error: AiCorrectionOutput | null;
}

export interface AiChatPayloadOutput {
  reply: string;
  corrections: AiCorrectionOutput[];
}

export interface AiMnemonicPayloadOutput {
  mnemonic: string;
  examples: { es: string; en: string }[];
}

export interface AiLemmaLookupOutput {
  word: string;
  lemma: string;
  pos: string;
  gender: "el" | "la" | "el/la" | null;
  meaning: string;
}

/**
 * Extracts and parses a JSON payload from an AI model text response.
 */
export function extractJsonFromAiText<T = unknown>(rawText: string): T {
  if (!rawText || !rawText.trim()) {
    throw new Error("Empty AI response");
  }

  const trimmed = rawText.trim();

  // 1. Try fenced code block ```json ... ``` or ``` ... ```
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenceMatch && fenceMatch[1]) {
    return JSON.parse(fenceMatch[1].trim()) as T;
  }

  // 2. Try direct JSON parse
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      // Fall through to bracket slicing
    }
  }

  // 3. Locate first '{' or '[' and matching last '}' or ']'
  const firstObj = trimmed.indexOf("{");
  const firstArr = trimmed.indexOf("[");
  let start = -1;
  let end = -1;

  if (firstObj !== -1 && (firstArr === -1 || firstObj < firstArr)) {
    start = firstObj;
    end = trimmed.lastIndexOf("}");
  } else if (firstArr !== -1) {
    start = firstArr;
    end = trimmed.lastIndexOf("]");
  }

  if (start !== -1 && end > start) {
    const candidate = trimmed.slice(start, end + 1);
    return JSON.parse(candidate) as T;
  }

  throw new Error("No valid JSON object or array found in AI response");
}

/**
 * Parses and validates an AI error correction JSON `{category, wrong, correct, explanation}`
 * per docs/SPEC.md ("return the error as JSON {category, wrong, correct, explanation}").
 */
export function parseAiCorrectionJson(rawText: string): AiCorrectionOutput {
  const parsed = extractJsonFromAiText<Record<string, unknown>>(rawText);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof parsed.category !== "string" ||
    typeof parsed.wrong !== "string" ||
    typeof parsed.correct !== "string" ||
    typeof parsed.explanation !== "string"
  ) {
    throw new Error(
      "Invalid AI correction JSON schema: expected {category, wrong, correct, explanation}"
    );
  }

  return {
    category: parsed.category.trim(),
    wrong: parsed.wrong.trim(),
    correct: parsed.correct.trim(),
    explanation: parsed.explanation.trim(),
  };
}

/**
 * Parses and validates an array of AI exercises.
 */
export function parseAiExercisesJson(rawText: string): AiExerciseItem[] {
  const parsed = extractJsonFromAiText<unknown>(rawText);
  const items = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" &&
        parsed !== null &&
        Array.isArray((parsed as Record<string, unknown>).exercises)
      ? ((parsed as Record<string, unknown>).exercises as unknown[])
      : null;

  if (!items || items.length === 0) {
    throw new Error("Invalid AI exercises JSON: expected non-empty exercises array");
  }

  const validTypes = new Set([
    "fill_in",
    "transform",
    "translate",
    "build_sentence",
  ]);

  const normalizeExerciseType = (raw: string): AiExerciseItem["type"] => {
    const clean = raw.trim().toLowerCase().replace(/-/g, "_");
    if (validTypes.has(clean)) return clean as AiExerciseItem["type"];
    if (clean.includes("build") || clean.includes("order")) {
      return "build_sentence";
    }
    if (clean.includes("translat")) return "translate";
    if (clean.includes("transform") || clean.includes("rewrite")) {
      return "transform";
    }
    return "fill_in";
  };

  return items.map((item, idx) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`Invalid exercise item at index ${idx}`);
    }
    const obj = item as Record<string, unknown>;
    const rawType = String(obj.type ?? "fill_in");
    const type = normalizeExerciseType(rawType);
    const prompt =
      typeof obj.prompt === "string"
        ? obj.prompt.trim()
        : typeof obj.question === "string"
          ? obj.question.trim()
          : "";
    const answer =
      typeof obj.answer === "string"
        ? obj.answer.trim()
        : typeof obj.correct === "string"
          ? obj.correct.trim()
          : "";

    if (!prompt || !answer) {
      throw new Error(
        `Exercise at index ${idx} missing required valid type, prompt, or answer`
      );
    }

    const options = Array.isArray(obj.options)
      ? obj.options
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter(Boolean)
      : undefined;

    return {
      id: typeof obj.id === "string" ? obj.id : `ex-${idx + 1}`,
      type: type as AiExerciseItem["type"],
      prompt,
      answer,
      options: options && options.length > 0 ? options : undefined,
      hint: typeof obj.hint === "string" ? obj.hint.trim() : undefined,
    };
  });
}

/**
 * Parses and validates an AI Spanish lemma lookup JSON response.
 */
export function parseAiLemmaLookupJson(rawText: string): AiLemmaLookupOutput {
  const parsed = extractJsonFromAiText<Record<string, unknown>>(rawText);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof parsed.word !== "string" ||
    typeof parsed.lemma !== "string" ||
    typeof parsed.meaning !== "string"
  ) {
    throw new Error(
      "Invalid AI lemma lookup JSON: expected {word, lemma, pos, gender, meaning}"
    );
  }

  const rawGender = parsed.gender;
  const gender =
    rawGender === "el" || rawGender === "la" || rawGender === "el/la"
      ? rawGender
      : null;

  return {
    word: parsed.word.trim(),
    lemma: parsed.lemma.trim().toLowerCase(),
    pos: typeof parsed.pos === "string" ? parsed.pos.trim() : "n",
    gender,
    meaning: parsed.meaning.trim(),
  };
}

/**
 * Parses and validates a complete daily AI lesson payload:
 * `{explanation, examples, new_words (<= 5), exercises (8-12)}`
 */
export function parseAiLessonPayloadJson(rawText: string): AiLessonPayloadOutput {
  const parsed = extractJsonFromAiText<Record<string, unknown>>(rawText);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof parsed.explanation !== "string"
  ) {
    throw new Error(
      "Invalid AI lesson JSON: expected object with string explanation"
    );
  }

  const rawExamples = Array.isArray(parsed.examples) ? parsed.examples : [];
  const examples = rawExamples
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).es === "string" &&
        typeof (item as Record<string, unknown>).en === "string"
    )
    .map((item) => ({
      es: String(item.es).trim(),
      en: String(item.en).trim(),
    }));

  const rawNewWords = Array.isArray(parsed.new_words) ? parsed.new_words : [];
  const newWords: AiLessonNewWord[] = rawNewWords
    .slice(0, 5)
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).word === "string" &&
        typeof (item as Record<string, unknown>).meaning === "string"
    )
    .map((item) => {
      const word = String(item.word).trim();
      const lemma =
        typeof item.lemma === "string" && item.lemma.trim()
          ? item.lemma.trim().toLowerCase()
          : word.replace(/^(el|la|los|las)\s+/i, "").trim().toLowerCase();
      const rawGender = item.gender;
      const gender =
        rawGender === "el" ||
        rawGender === "la" ||
        rawGender === "los" ||
        rawGender === "las" ||
        rawGender === "el/la"
          ? rawGender
          : null;

      return {
        word,
        lemma,
        meaning: String(item.meaning).trim(),
        pos: typeof item.pos === "string" ? item.pos.trim() : undefined,
        gender,
        example_es:
          typeof item.example_es === "string" ? item.example_es.trim() : word,
        example_tr:
          typeof item.example_tr === "string"
            ? item.example_tr.trim()
            : String(item.meaning).trim(),
      };
    });

  const exercises = parseAiExercisesJson(
    JSON.stringify({ exercises: parsed.exercises })
  );

  return {
    explanation: parsed.explanation.trim(),
    examples,
    new_words: newWords,
    exercises,
  };
}

/**
 * Parses and validates an AI exercise grading response.
 */
export function parseAiGradePayloadJson(rawText: string): AiGradePayloadOutput {
  const parsed = extractJsonFromAiText<Record<string, unknown>>(rawText);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid AI grade JSON");
  }

  const isCorrect = Boolean(parsed.isCorrect);
  const correctedSentence =
    typeof parsed.correctedSentence === "string"
      ? parsed.correctedSentence.trim()
      : "";
  const ruleOneLine =
    typeof parsed.ruleOneLine === "string" ? parsed.ruleOneLine.trim() : "";

  let errorObj: AiCorrectionOutput | null = null;
  if (
    !isCorrect &&
    typeof parsed.error === "object" &&
    parsed.error !== null
  ) {
    const errRec = parsed.error as Record<string, unknown>;
    if (
      typeof errRec.category === "string" &&
      typeof errRec.wrong === "string" &&
      typeof errRec.correct === "string" &&
      typeof errRec.explanation === "string"
    ) {
      errorObj = {
        category: errRec.category.trim(),
        wrong: errRec.wrong.trim(),
        correct: errRec.correct.trim(),
        explanation: errRec.explanation.trim(),
      };
    }
  }

  return {
    isCorrect,
    correctedSentence,
    ruleOneLine,
    error: errorObj,
  };
}

/**
 * Parses and validates an AI free-chat response with inline corrections.
 */
export function parseAiChatPayloadJson(rawText: string): AiChatPayloadOutput {
  const parsed = extractJsonFromAiText<Record<string, unknown>>(rawText);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid AI chat JSON: expected {reply, corrections}");
  }

  let replyText =
    typeof parsed.reply === "string"
      ? parsed.reply
      : typeof parsed.response === "string"
        ? parsed.response
        : typeof parsed.message === "string"
          ? parsed.message
          : typeof parsed.text === "string"
            ? parsed.text
            : "";

  // Handle case where AI returned a direct correction object `{category, wrong, correct, explanation}`
  if (
    !replyText &&
    typeof parsed.correct === "string" &&
    typeof parsed.explanation === "string"
  ) {
    replyText = `¡Casi! En Madrid decimos: «${parsed.correct}». ${parsed.explanation}`;
  }

  // Handle case where AI returned an `{exercises: [...]}` quiz when asked to quiz the learner
  if (!replyText && Array.isArray(parsed.exercises) && parsed.exercises.length > 0) {
    const formattedQuiz = parsed.exercises
      .slice(0, 3)
      .map((ex, i) => {
        const obj = ex as Record<string, unknown>;
        return `${i + 1}. ${String(obj.prompt ?? obj.question ?? "")}`;
      })
      .join("\n");
    replyText = `¡Vale! Aquí tienes unas preguntas rápidas para practicar:\n${formattedQuiz}`;
  }

  if (!replyText) {
    throw new Error("Invalid AI chat JSON: expected {reply, corrections}");
  }

  const rawCorrections = Array.isArray(parsed.corrections)
    ? parsed.corrections
    : typeof parsed.category === "string" &&
        typeof parsed.wrong === "string" &&
        typeof parsed.correct === "string" &&
        typeof parsed.explanation === "string"
      ? [parsed]
      : [];

  const corrections: AiCorrectionOutput[] = rawCorrections
    .filter(
      (c): c is Record<string, unknown> =>
        typeof c === "object" &&
        c !== null &&
        typeof (c as Record<string, unknown>).category === "string" &&
        typeof (c as Record<string, unknown>).wrong === "string" &&
        typeof (c as Record<string, unknown>).correct === "string" &&
        typeof (c as Record<string, unknown>).explanation === "string"
    )
    .map((c) => ({
      category: String(c.category).trim(),
      wrong: String(c.wrong).trim(),
      correct: String(c.correct).trim(),
      explanation: String(c.explanation).trim(),
    }));

  return {
    reply: replyText.trim(),
    corrections,
  };
}

/**
 * Parses and validates an AI Leech mnemonic response `{mnemonic, examples}`.
 */
export function parseAiMnemonicPayloadJson(
  rawText: string
): AiMnemonicPayloadOutput {
  const parsed = extractJsonFromAiText<Record<string, unknown>>(rawText);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof parsed.mnemonic !== "string"
  ) {
    throw new Error("Invalid AI mnemonic JSON: expected {mnemonic, examples}");
  }

  const rawExamples = Array.isArray(parsed.examples) ? parsed.examples : [];
  const examples = rawExamples
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).es === "string" &&
        typeof (item as Record<string, unknown>).en === "string"
    )
    .map((item) => ({
      es: String(item.es).trim(),
      en: String(item.en).trim(),
    }));

  return {
    mnemonic: parsed.mnemonic.trim(),
    examples,
  };
}
