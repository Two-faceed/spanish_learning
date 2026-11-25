import { describe, expect, it } from "vitest";
import {
  extractJsonFromAiText,
  parseAiChatPayloadJson,
  parseAiCorrectionJson,
  parseAiExercisesJson,
  parseAiGradePayloadJson,
  parseAiLemmaLookupJson,
  parseAiLessonPayloadJson,
  parseAiMnemonicPayloadJson,
} from "@/lib/ai/json-parser";
import {
  buildMadridTutorSystemPrompt,
  getBuiltInFallbackLesson,
  getCurriculumSpecForDay,
  TWELVE_WEEK_CURRICULUM,
} from "@/lib/tutor/curriculum";
import {
  toMadridEnglishPhonetics,
  wordToMadridPhonetics,
} from "@/lib/audio/phonetics";

describe("AI Output JSON Parsing & Phase 2 Madrid Tutor Schemas", () => {
  it("parses raw JSON, markdown fenced JSON, and JSON embedded in prose", () => {
    const raw = `{"category":"ser/estar","wrong":"Soy cansado","correct":"Estoy cansado","explanation":"Use estar for temporary states like tiredness."}`;
    expect(parseAiCorrectionJson(raw)).toEqual({
      category: "ser/estar",
      wrong: "Soy cansado",
      correct: "Estoy cansado",
      explanation: "Use estar for temporary states like tiredness.",
    });

    const fenced = `Here is the correction:\n\`\`\`json\n${raw}\n\`\`\`\nKeep practicing!`;
    expect(parseAiCorrectionJson(fenced).correct).toBe("Estoy cansado");

    const proseWrapped = `Sure! ${raw} Hope that helps.`;
    expect(
      extractJsonFromAiText<{ category: string }>(proseWrapped).category
    ).toBe("ser/estar");
  });

  it("validates AI exercise schemas and rejects malformed payloads", () => {
    const validExercises = `
      \`\`\`json
      {
        "exercises": [
          {
            "id": "ex-1",
            "type": "fill_in",
            "prompt": "Nosotros __ (ser) de Madrid.",
            "answer": "somos",
            "hint": "1st person plural of ser"
          },
          {
            "type": "build_sentence",
            "prompt": "Order the words:",
            "answer": "El coche es nuevo",
            "options": ["nuevo", "El", "es", "coche"]
          }
        ]
      }
      \`\`\`
    `;
    const parsed = parseAiExercisesJson(validExercises);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].answer).toBe("somos");
    expect(parsed[1].options).toEqual(["nuevo", "El", "es", "coche"]);

    expect(() => parseAiExercisesJson(`{"exercises": []}`)).toThrow();
    expect(() =>
      parseAiCorrectionJson(`{"category": "gender", "wrong": "la problema"}`)
    ).toThrow();
  });

  it("parses and normalizes Spanish lemma lookups", () => {
    const lookupJson = `{"word": "fuimos", "lemma": "IR", "pos": "v", "gender": null, "meaning": "we went"}`;
    expect(parseAiLemmaLookupJson(lookupJson)).toEqual({
      word: "fuimos",
      lemma: "ir",
      pos: "v",
      gender: null,
      meaning: "we went",
    });
  });

  it("parses full daily AI lesson payloads with <= 5 new words and exercises", () => {
    const fallback = getBuiltInFallbackLesson(1, 1);
    const raw = JSON.stringify({
      explanation: fallback.explanation,
      examples: fallback.examples,
      new_words: fallback.new_words,
      exercises: fallback.exercises,
    });

    const parsed = parseAiLessonPayloadJson(raw);
    expect(parsed.new_words.length).toBeLessThanOrEqual(5);
    expect(parsed.exercises.length).toBeGreaterThanOrEqual(8);
    expect(parsed.examples[0].es).toContain("gracias");
  });

  it("parses AI exercise grading, free chat corrections, and Leech mnemonics", () => {
    const gradeRaw = JSON.stringify({
      isCorrect: false,
      correctedSentence: "Vosotros sois de Madrid",
      ruleOneLine: "Use 'sois' with vosotros for origin.",
      error: {
        category: "ser/estar",
        wrong: "Vosotros estáis de Madrid",
        correct: "Vosotros sois de Madrid",
        explanation: "Use ser (sois) for origin.",
      },
    });
    const graded = parseAiGradePayloadJson(gradeRaw);
    expect(graded.isCorrect).toBe(false);
    expect(graded.error?.category).toBe("ser/estar");

    const chatRaw = JSON.stringify({
      reply: "¡Hola! En Madrid decimos «Soy de Madrid».",
      corrections: [
        {
          category: "ser/estar",
          wrong: "Estoy de Madrid",
          correct: "Soy de Madrid",
          explanation: "Origin always uses ser.",
        },
      ],
    });
    const chat = parseAiChatPayloadJson(chatRaw);
    expect(chat.corrections).toHaveLength(1);
    expect(chat.corrections[0].correct).toBe("Soy de Madrid");

    const mnemRaw = JSON.stringify({
      mnemonic: "Think of a COCHE (coach/car) driving through Madrid.",
      examples: [{ es: "El coche es rápido.", en: "The car is fast." }],
    });
    const mnem = parseAiMnemonicPayloadJson(mnemRaw);
    expect(mnem.mnemonic).toContain("COCHE");
    expect(mnem.examples).toHaveLength(1);
  });

  it("covers all 12 weeks x 7 days of the Spain curriculum and builds the Madrid system prompt", () => {
    expect(TWELVE_WEEK_CURRICULUM).toHaveLength(12);
    const w8d7 = getCurriculumSpecForDay(8, 7);
    expect(w8d7.city).toBe("Zaragoza");
    expect(w8d7.isReviewTest).toBe(true);

    const prompt = buildMadridTutorSystemPrompt({
      cefr: "A2",
      topic: "Present Perfect (he hecho)",
      knownLemmasSample: ["hacer", "coche", "vale"],
      recentErrors: [
        {
          category: "tense choice",
          wrong: "Hoy fui al banco",
          correct: "Hoy he ido al banco",
        },
      ],
    });
    expect(prompt).toContain("vosotros");
    expect(prompt).toContain("coche, móvil, ordenador, piso, vale");
    expect(prompt).toContain("Hoy he ido al banco");
  });

  it("generates accurate Madrid (es-ES) English phonetic respellings with stressed syllables in CAPS", () => {
    expect(wordToMadridPhonetics("gracias")).toBe("GRAH-thyahs");
    expect(wordToMadridPhonetics("coche")).toBe("KOH-cheh");
    expect(wordToMadridPhonetics("hola")).toBe("OH-lah");
    expect(wordToMadridPhonetics("español")).toBe("ehs-pah-NYOHL");
    expect(wordToMadridPhonetics("zapato")).toBe("thah-PAH-toh");
    expect(toMadridEnglishPhonetics("el ordenador")).toBe(
      "ehl ohr-deh-nah-DOHR"
    );
  });
});
