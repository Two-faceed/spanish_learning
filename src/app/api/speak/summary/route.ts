import { NextRequest, NextResponse } from "next/server";
import { callGeminiFlashJson } from "@/lib/ai/gemini";
import { parseSpeakSummaryJson } from "@/lib/speak/scenarios";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      scenarioTitle?: string;
      goalEn?: string;
      cefr?: string;
      transcript?: { role: "user" | "assistant"; text: string }[];
    };

    const transcript = Array.isArray(body.transcript) ? body.transcript : [];
    const transcriptStr = transcript
      .map((t) => `${t.role === "user" ? "Learner" : "Madrid Local"}: ${t.text}`)
      .join("\n");

    const systemPrompt = `You are a Spain Spanish (es-ES, Madrid) speaking coach evaluating a completed roleplay call.
Give a fair 0-100 score based on whether the learner communicated clearly and achieved the scenario goal.
Provide up to 3 specific grammar/vocabulary corrections from the learner's lines (empty array if no mistakes) and exactly 3 useful Madrid Spanish phrases they can reuse in real life.`;

    const userPrompt = `Scenario: "${body.scenarioTitle ?? "Madrid Roleplay"}" (${body.cefr ?? "A1-A2"})
Goal: ${body.goalEn ?? "Hold a natural Spanish conversation"}

Transcript:
${transcriptStr}

Return ONLY valid JSON:
{
  "score": 84,
  "summaryEn": "2 short sentences in English praising what went well and one focus for next time.",
  "corrections": [
    {
      "category": "gender | ser/estar | tense choice | vocabulary | prepositions | other",
      "wrong": "what the learner said",
      "correct": "natural Spain Spanish (es-ES) version",
      "explanation": "one-line English rule"
    }
  ],
  "usefulPhrases": [
    { "es": "Natural Madrid Spanish phrase 1", "en": "English meaning" },
    { "es": "Natural Madrid Spanish phrase 2", "en": "English meaning" },
    { "es": "Natural Madrid Spanish phrase 3", "en": "English meaning" }
  ]
}`;

    const rawText = await callGeminiFlashJson({
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      maxOutputTokens: 1200,
    });

    try {
      const parsed = parseSpeakSummaryJson(rawText);
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json({
        score: 85,
        summaryEn:
          "¡Muy bien! You completed the Madrid roleplay mission naturally and stayed in Spanish.",
        corrections: [],
        usefulPhrases: [
          {
            es: "Ponme un café con leche, por favor.",
            en: "Give me a coffee with milk, please.",
          },
          {
            es: "¿Me cobras cuando puedas?",
            en: "Can you charge me when you can?",
          },
          {
            es: "¡Muchas gracias, igualmente!",
            en: "Thank you very much, likewise!",
          },
        ],
      });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to score roleplay" },
      { status: 500 }
    );
  }
}
