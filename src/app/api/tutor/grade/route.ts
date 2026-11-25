import { NextRequest, NextResponse } from "next/server";
import { buildMadridTutorSystemPrompt } from "@/lib/tutor/curriculum";
import { callGeminiFlashJson } from "@/lib/ai/gemini";
import {
  AiGradePayloadOutput,
  parseAiGradePayloadJson,
} from "@/lib/ai/json-parser";
import { TutorExercise } from "@/types/database";

function normalizeForComparison(text: string): string {
  return text
    .trim()
    .replace(/^[¡¿]+|[.!?;,]+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function buildFullCorrectSentence(
  exercise: TutorExercise,
  answer: string
): string {
  if (exercise.prompt.includes("__")) {
    return exercise.prompt
      .replace(/\s*\([^)]*\)\s*$/, "")
      .replace("__", answer)
      .trim();
  }
  return answer;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      exercise: TutorExercise;
      userAnswer: string;
      topic?: string;
      cefr?: string;
      spanishOnlyMode?: boolean;
    };

    const exercise = body.exercise;
    const userAnswer = (body.userAnswer ?? "").trim();

    if (!exercise || !userAnswer) {
      return NextResponse.json(
        { error: "Missing exercise or userAnswer" },
        { status: 400 }
      );
    }

    const normUser = normalizeForComparison(userAnswer);
    const normExpected = normalizeForComparison(exercise.answer);

    // Fast path: exact match (case/punctuation-insensitive, accents preserved)
    if (normUser === normExpected) {
      const result: AiGradePayloadOutput = {
        isCorrect: true,
        correctedSentence: buildFullCorrectSentence(exercise, exercise.answer),
        ruleOneLine: exercise.hint || "¡Perfecto! Correct Spain Spanish form.",
        error: null,
      };
      return NextResponse.json(result);
    }

    // Call Gemini Flash to judge alternative valid answers or explain the mistake
    const systemPrompt = buildMadridTutorSystemPrompt({
      cefr: body.cefr ?? "A1",
      topic: body.topic ?? "Madrid Spanish Grammar",
      knownLemmasSample: [],
      recentErrors: [],
      spanishOnlyMode: body.spanishOnlyMode,
    });

    const userPrompt = `Grade the learner's exercise answer in Spain Spanish (es-ES).
Exercise type: ${exercise.type}
Prompt: "${exercise.prompt}"
Expected canonical answer: "${exercise.answer}"
Learner's answer: "${userAnswer}"

If the learner's answer is grammatically correct in Spain Spanish and fulfills the prompt, set "isCorrect": true and "error": null.
Otherwise, set "isCorrect": false, show the full corrected Spanish sentence in "correctedSentence", state the grammar rule in one short line in "ruleOneLine", and return the mistake in "error" as {"category", "wrong", "correct", "explanation"}.
Valid categories: "gender", "ser/estar", "tense choice", "agreement", "vocabulary", "spelling", "pronouns", "prepositions", "other".

Return ONLY valid JSON:
{
  "isCorrect": false,
  "correctedSentence": "Complete corrected Spanish sentence",
  "ruleOneLine": "One-line grammar rule explanation",
  "error": {
    "category": "ser/estar",
    "wrong": "${userAnswer}",
    "correct": "${exercise.answer}",
    "explanation": "Concise 1-line explanation of why '${exercise.answer}' is required instead of '${userAnswer}'"
  }
}`;

    try {
      const rawAiText = await callGeminiFlashJson({
        systemPrompt,
        userPrompt,
        temperature: 0.1,
      });
      const parsed = parseAiGradePayloadJson(rawAiText);
      if (!parsed.isCorrect && !parsed.error) {
        parsed.error = {
          category: "other",
          wrong: userAnswer,
          correct: exercise.answer,
          explanation:
            parsed.ruleOneLine ||
            exercise.hint ||
            `Expected "${exercise.answer}" for: ${exercise.prompt}`,
        };
      }
      return NextResponse.json(parsed);
    } catch {
      // Deterministic local fallback if offline or API error
      const isAccentMistake =
        stripAccents(normUser) === stripAccents(normExpected);
      const fullCorrect = buildFullCorrectSentence(exercise, exercise.answer);
      const explanation = isAccentMistake
        ? `Watch the accent mark: "${exercise.answer}" requires a written tilde in Spanish.`
        : exercise.hint ||
          `In this context, use "${exercise.answer}" instead of "${userAnswer}".`;

      const fallbackResult: AiGradePayloadOutput = {
        isCorrect: false,
        correctedSentence: fullCorrect,
        ruleOneLine: explanation,
        error: {
          category: isAccentMistake ? "spelling" : "other",
          wrong: userAnswer,
          correct: fullCorrect,
          explanation,
        },
      };
      return NextResponse.json(fallbackResult);
    }
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to grade exercise answer",
      },
      { status: 500 }
    );
  }
}
