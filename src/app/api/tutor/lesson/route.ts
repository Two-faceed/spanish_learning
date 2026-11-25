import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildMadridTutorSystemPrompt,
  getBuiltInFallbackLesson,
  getCurriculumSpecForDay,
} from "@/lib/tutor/curriculum";
import { callGeminiFlashJson } from "@/lib/ai/gemini";
import { parseAiLessonPayloadJson } from "@/lib/ai/json-parser";
import { LessonRecord } from "@/types/database";

const LESSON_CACHE_DIR = path.join(process.cwd(), "data", "lesson-cache");

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      week?: number;
      day?: number;
      knownLemmasSample?: string[];
      recentErrors?: { category: string; wrong: string; correct: string }[];
      spanishOnlyMode?: boolean;
      forceRegenerate?: boolean;
    };

    const spec = getCurriculumSpecForDay(body.week ?? 1, body.day ?? 1);
    const spanishOnly = Boolean(body.spanishOnlyMode && spec.week >= 7);
    const cacheKey = `w${spec.week}-d${spec.day}${spanishOnly ? "-es" : ""}`;
    const cacheFilePath = path.join(LESSON_CACHE_DIR, `${cacheKey}.json`);

    if (!body.forceRegenerate) {
      try {
        const cachedRaw = await fs.readFile(cacheFilePath, "utf-8");
        const cachedLesson = JSON.parse(cachedRaw) as LessonRecord;
        return NextResponse.json({
          lesson: cachedLesson,
          cached: true,
          fallback: false,
        });
      } catch {
        // Cache miss — generate via Gemini Flash
      }
    }

    const systemPrompt = buildMadridTutorSystemPrompt({
      cefr: spec.cefr,
      topic: `${spec.dayTitle} (Week ${spec.week} — ${spec.city}: ${spec.weekFocus})`,
      knownLemmasSample: body.knownLemmasSample ?? [],
      recentErrors: body.recentErrors ?? [],
      spanishOnlyMode: spanishOnly,
    });

    const userPrompt = `Create Day ${spec.day} of Week ${spec.week} (${spec.city}, CEFR ${spec.cefr}) for Español Fast.
Topic: "${spec.dayTitle}"
${
  spec.isReviewTest
    ? "This is Day 7 — the Weekly City Boss Review Test covering all Week " +
      spec.week +
      " topics (" +
      spec.weekFocus +
      ")."
    : ""
}

Return ONLY valid JSON with this exact schema:
{
  "explanation": "Concise grammar explanation (< 120 words, ${
    spanishOnly ? "in simple Spain Spanish" : "in clear English"
  }) specifically teaching '${spec.dayTitle}' with natural Spain Spanish (es-ES) examples.",
  "examples": [
    { "es": "Madrid Spanish sentence illustrating ${spec.dayTitle}", "en": "English translation + brief grammar note" }
  ],
  "new_words": [
    {
      "word": "Spanish word (include el/la for nouns)",
      "lemma": "dictionary form",
      "meaning": "English meaning",
      "pos": "part of speech",
      "gender": "el",
      "example_es": "Spanish example sentence",
      "example_tr": "English translation"
    }
  ],
  "exercises": [
    {
      "id": "ex-1",
      "type": "fill_in",
      "prompt": "Prompt showing sentence with __ blank and clear instruction in parentheses",
      "answer": "exact expected Spanish word or phrase",
      "hint": "short grammar hint"
    },
    {
      "id": "ex-2",
      "type": "transform",
      "prompt": "Rewrite sentence following today's grammar rule",
      "answer": "expected transformed Spanish",
      "hint": "short grammar hint"
    },
    {
      "id": "ex-3",
      "type": "translate",
      "prompt": "Translate to Spain Spanish: ...",
      "answer": "...",
      "hint": "..."
    },
    {
      "id": "ex-4",
      "type": "build_sentence",
      "prompt": "Order the words to say '...'",
      "answer": "Full ordered Spanish sentence without trailing period",
      "options": ["word3", "word1", "word4", "word2"],
      "hint": "..."
    }
  ]
}

Requirements:
1. "explanation" MUST be under 120 words, focused strictly on "${spec.dayTitle}". Do not use raw Markdown asterisks (** or *).
2. "examples" MUST have 3 items specifically demonstrating "${spec.dayTitle}" in Spain Spanish (es-ES).
3. "new_words" MUST have 4 or 5 new words specifically relevant to "${spec.dayTitle}" and ${spec.city}. Avoid repeating generic words like "coche", "zumo", or "piso" across unrelated grammar days.
4. "exercises" MUST have between 8 and 10 items testing "${spec.dayTitle}", mixing "fill_in", "transform", "translate", and "build_sentence".`;

    try {
      const rawAiText = await callGeminiFlashJson({
        systemPrompt,
        userPrompt,
        temperature: 0.3,
      });

      const parsed = parseAiLessonPayloadJson(rawAiText);
      const lesson: LessonRecord = {
        id: `w${spec.week}-d${spec.day}`,
        week: spec.week,
        day: spec.day,
        city: spec.city,
        topic: spec.dayTitle,
        explanation: parsed.explanation,
        examples: parsed.examples,
        new_words: parsed.new_words,
        exercises: parsed.exercises,
        completed_at: null,
        score: null,
      };

      await fs.mkdir(LESSON_CACHE_DIR, { recursive: true });
      await fs.writeFile(
        cacheFilePath,
        JSON.stringify(lesson, null, 2),
        "utf-8"
      );

      return NextResponse.json({
        lesson,
        cached: false,
        fallback: false,
      });
    } catch (aiErr) {
      console.warn(
        "[api/tutor/lesson] Falling back to built-in lesson:",
        aiErr
      );
      const fallbackLesson = getBuiltInFallbackLesson(spec.week, spec.day);
      return NextResponse.json({
        lesson: fallbackLesson,
        cached: false,
        fallback: true,
        warning:
          aiErr instanceof Error
            ? aiErr.message
            : "Used offline built-in Madrid lesson",
      });
    }
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to generate tutor lesson",
      },
      { status: 500 }
    );
  }
}
